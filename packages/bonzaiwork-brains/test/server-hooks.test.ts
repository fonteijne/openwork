import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createBrainsServerHooks, type BrainsHost, type BrainsServerHooks, type SessionActivity } from "../src/server-hooks.ts";
import { createWorld, type World } from "./world.ts";

let world: World;
let hooks: BrainsServerHooks;
afterEach(async () => {
  hooks?.stop();
  await world?.dispose();
});

type FakeHost = BrainsHost & {
  emit(activity: SessionActivity): void; reloads: number; running: string[]; workspaceList: Array<{ id: string; path: string }>;
  mcp: Record<string, Record<string, unknown> | null>; context: { instructions: string | null; skillsDirectory: string | null } | null;
};

function fakeHost(): FakeHost {
  const listeners = new Set<(activity: SessionActivity) => void>();
  const host: FakeHost = {
    port: 4242,
    readOnly: false,
    mcp: {},
    context: null,
    updateEngineMcp: async (servers) => { Object.assign(host.mcp, servers); return true; },
    setEngineGlobalContext: async (input) => { host.context = input; },
    reloads: 0,
    running: [],
    workspaceList: [],
    workspaces: () => host.workspaceList,
    reloadEngineProviders: async () => { host.reloads += 1; },
    onSessionActivity: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    runningSessions: async () => host.running,
    sessionInfo: async (id) => ({ id, title: id === "ses_child" ? "Sub" : "Offerte maken", parentId: id === "ses_child" ? "ses_1" : null }),
    log: () => {},
    emit: (activity) => { for (const listener of listeners) listener(activity); },
  };
  return host;
}

async function call(path: string, init: { method?: string; body?: unknown } = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  const method = init.method ?? "GET";
  const route = hooks.routes.find((candidate) => {
    if (candidate.method !== method) return false;
    const pattern = new RegExp(`^${candidate.path.replace(/:[a-zA-Z]+/g, "[^/]+")}$`);
    return pattern.test(path);
  });
  if (!route) throw new Error(`no route ${method} ${path}`);
  const names = [...route.path.matchAll(/:([a-zA-Z]+)/g)].map((match) => match[1]);
  const values = new RegExp(`^${route.path.replace(/:[a-zA-Z]+/g, "([^/]+)")}$`).exec(path)?.slice(1) ?? [];
  const params = Object.fromEntries(names.map((name, index) => [name, values[index]]));
  const request = new Request(`http://local${path}`, { method, ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }) });
  const response = await route.handle(request, params);
  return { status: response.status, body: await response.json() };
}

const until = async (check: () => Promise<boolean> | boolean, label: string) => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await check()) return;
    await Bun.sleep(20);
  }
  throw new Error(`timed out: ${label}`);
};

test("clone, registreren, een beurt en delen na de stille periode", async () => {
  world = await createWorld();
  await world.seed({ "opencode.json": JSON.stringify({ mcp: { rogue: { type: "local", command: ["x"] } } }) });
  hooks = createBrainsServerHooks({ stateDirectory: join(world.root, "state-app"), allowFileProtocol: true, quietMs: 50, prepareTimeoutMs: 2_000, environment: { PATH: process.env.PATH ?? "", HOME: world.root } });
  const host = fakeHost();
  await hooks.start(host);
  expect(hooks.enginePolicies().map((policy) => policy.resource)).toEqual(["shell:git *", "edit:.git/*", "edit:*/.git/*"]);

  expect((await call("/bonzaiwork/brains/settings", { method: "PUT", body: { name: "Anna", email: "anna@example.invalid" } })).status).toBe(200);
  const folder = join(world.root, "BonzaiWork", "Sales");
  const cloned = await call("/bonzaiwork/brains/clone", { method: "POST", body: { url: world.url, folderPath: folder } });
  expect(cloned.status).toBe(202);
  const jobId = String(cloned.body.jobId);
  await until(async () => (await call(`/bonzaiwork/brains/jobs/${jobId}`)).body.state !== "running", "clone");
  const job = await call(`/bonzaiwork/brains/jobs/${jobId}`);
  expect(job.body.state).toBe("done");
  expect(existsSync(join(folder, "AGENTS.md"))).toBe(true);
  expect(existsSync(join(folder, "opencode.json"))).toBe(false);

  host.workspaceList = [{ id: "ws_sales", path: folder }];
  const registered = await call("/bonzaiwork/brains/ws_sales", { method: "PUT", body: { jobId, mode: "auto" } });
  expect(registered.status).toBe(200);
  expect(hooks.enginePolicies().at(-1)).toEqual({ action: "integration.use", resource: "mcp:rogue", effect: "deny" });
  expect(host.reloads).toBeGreaterThan(0);

  // UserPromptSubmit, then a turn with a sub-task, then quiet.
  const pulled = await call("/bonzaiwork/brains/ws_sales/pull", { method: "POST", body: { sessionId: "ses_1" } });
  expect(pulled.body.waited).toBe("updated");
  host.emit({ workspaceId: "ws_sales", sessionId: "ses_1", state: "running" });
  host.emit({ workspaceId: "ws_sales", sessionId: "ses_child", state: "running" });
  await mkdir(join(folder, "knowledge"), { recursive: true });
  await writeFile(join(folder, "knowledge/offerte.md"), "Offerte\n");
  host.emit({ workspaceId: "ws_sales", sessionId: "ses_1", state: "idle", outcome: "succeeded" });
  await Bun.sleep(150);
  expect((await world.git.run(["show", "main:knowledge/offerte.md"], { cwd: world.bare })).exitCode).not.toBe(0);
  host.emit({ workspaceId: "ws_sales", sessionId: "ses_child", state: "idle", outcome: "succeeded" });
  await until(async () => (await world.git.run(["show", "main:knowledge/offerte.md"], { cwd: world.bare })).exitCode === 0, "shared");
  const head = await world.git.ok(["log", "-1", "--format=%an|%s|%(trailers:key=BonzaiWork-Chat,valueonly)", "main"], { cwd: world.bare });
  expect(head.trim()).toBe("Anna|Offerte maken|ses_child");

  const history = await call("/bonzaiwork/brains/ws_sales/history");
  const entries = history.body.entries;
  expect(Array.isArray(entries) && entries[0]).toMatchObject({ author: "Anna", title: "Offerte maken", files: ["knowledge/offerte.md"] });

  // Trusting the config lets the MCP load and lifts its engine deny.
  const trusted = await call("/bonzaiwork/brains/ws_sales/trust", { method: "POST", body: { paths: ["opencode.json"] } });
  expect(trusted.status).toBe(200);
  expect(existsSync(join(folder, "opencode.json"))).toBe(true);
  expect(hooks.enginePolicies().some((policy) => policy.resource === "mcp:rogue")).toBe(false);

  const listed = await call("/bonzaiwork/brains");
  expect(Array.isArray(listed.body.brains) && listed.body.brains.length).toBe(1);
});

test("bijwerken wacht niet op een andere lopende chat, en een onbekend project is geen brein", async () => {
  world = await createWorld();
  hooks = createBrainsServerHooks({ stateDirectory: join(world.root, "state-app"), allowFileProtocol: true, environment: { PATH: process.env.PATH ?? "", HOME: world.root } });
  const host = fakeHost();
  await hooks.start(host);
  const folder = join(world.root, "Sales");
  const cloned = await call("/bonzaiwork/brains/clone", { method: "POST", body: { url: world.url, folderPath: folder } });
  const jobId = String(cloned.body.jobId);
  await until(async () => (await call(`/bonzaiwork/brains/jobs/${jobId}`)).body.state === "done", "clone");
  host.workspaceList = [{ id: "ws", path: folder }];
  await call("/bonzaiwork/brains/ws", { method: "PUT", body: { jobId } });
  await world.seed({ "knowledge/nieuw.md": "nieuw\n" });
  host.running = ["ses_other"];
  const pulled = await call("/bonzaiwork/brains/ws/pull", { method: "POST", body: { sessionId: "ses_mine" } });
  expect(pulled.body.waited).toBe("fetched");
  expect(existsSync(join(folder, "knowledge/nieuw.md"))).toBe(false);
  expect(pulled.body.status).toMatchObject({ behind: 1 });
  expect((await call("/bonzaiwork/brains/other/status")).status).toBe(404);
  expect((await call("/bonzaiwork/brains/check-remote", { method: "POST", body: { url: "https://gitlab.com/x" } })).body.code).toBe("link_invalid");
});

test("rustige breinen kijken af en toe naar het team; een lopende chat wacht", async () => {
  world = await createWorld();
  hooks = createBrainsServerHooks({ stateDirectory: join(world.root, "state-app"), allowFileProtocol: true, fetchEveryMs: 60, environment: { PATH: process.env.PATH ?? "", HOME: world.root } });
  const host = fakeHost();
  await hooks.start(host);
  const folder = join(world.root, "Sales");
  const cloned = await call("/bonzaiwork/brains/clone", { method: "POST", body: { url: world.url, folderPath: folder } });
  const jobId = String(cloned.body.jobId);
  await until(async () => (await call(`/bonzaiwork/brains/jobs/${jobId}`)).body.state === "done", "clone");
  host.workspaceList = [{ id: "ws", path: folder }];
  await call("/bonzaiwork/brains/ws", { method: "PUT", body: { jobId } });

  host.running = ["ses_busy"];
  await world.seed({ "knowledge/nieuw.md": "nieuw\n" });
  await Bun.sleep(250);
  expect((await call("/bonzaiwork/brains/ws/status")).body).toMatchObject({ behind: 0 });
  host.running = [];
  await until(async () => (await call("/bonzaiwork/brains/ws/status")).body.behind === 1, "periodic fetch");
  // Only looked: the folder changes before the next turn, not now.
  expect(existsSync(join(folder, "knowledge/nieuw.md"))).toBe(false);

  expect((await call("/bonzaiwork/brains/ws/resolve", { method: "POST", body: { strategy: "ai" } })).body).toMatchObject({ prompt: null, files: [] });
  expect((await call("/bonzaiwork/brains/ws/resolve", { method: "POST", body: { strategy: "other" } })).status).toBe(400);
});

test("een bestaand project wordt een brein: een eigen repo, of delen in een lege repo", async () => {
  world = await createWorld();
  hooks = createBrainsServerHooks({ stateDirectory: join(world.root, "state-app"), allowFileProtocol: true, environment: { PATH: process.env.PATH ?? "", HOME: world.root } });
  const host = fakeHost();
  await hooks.start(host);
  await call("/bonzaiwork/brains/settings", { method: "PUT", body: { name: "Anna", email: "anna@example.invalid" } });

  // A plain folder with notes and a plugin of the user's own, shared into an empty repository.
  const plain = join(world.root, "Marketing");
  await mkdir(join(plain, ".opencode", "plugins"), { recursive: true });
  await writeFile(join(plain, "campagne.md"), "# Campagne\n");
  await writeFile(join(plain, ".opencode", "plugins", "mijn.js"), "export default {}\n");
  const empty = join(world.root, "marketing.git");
  await world.git.ok(["init", "-q", "--bare", "-b", "main", empty], { cwd: world.root });
  host.workspaceList = [{ id: "ws_m", path: plain }, { id: "ws_s", path: join(world.root, "Sales") }];
  expect((await call("/bonzaiwork/brains/ws_m/candidate")).body).toEqual({ repository: null });
  expect((await call("/bonzaiwork/brains/ws_m/publish", { method: "POST", body: { url: world.url } })).body.code).toBe("remote_not_empty");
  const published = await call("/bonzaiwork/brains/ws_m/publish", { method: "POST", body: { url: `file://${empty}`, name: "Marketing" } });
  expect(published.status).toBe(200);
  expect(published.body.status).toMatchObject({ state: "synced", remote: `file://${empty}` });
  expect(await world.git.ok(["show", "main:campagne.md"], { cwd: empty })).toBe("# Campagne\n");
  expect((await world.git.ok(["show", "main:AGENTS.md"], { cwd: empty }))).toContain("# Marketing");
  // The user's own plugin stays in the folder and is not shared by itself.
  expect(existsSync(join(plain, ".opencode", "plugins", "mijn.js"))).toBe(true);
  expect((await world.git.run(["show", "main:.opencode/plugins/mijn.js"], { cwd: empty })).exitCode).not.toBe(0);
  expect((await call("/bonzaiwork/brains/ws_m/publish", { method: "POST", body: { url: `file://${empty}` } })).body.code).toBe("already_brain");

  // A folder that is a clone already becomes a brain as it is.
  await world.seed({ "knowledge/a.md": "a\n" });
  const repo = join(world.root, "Sales");
  await world.git.ok(["clone", "-q", world.url, repo], { cwd: world.root });
  const seen = await call("/bonzaiwork/brains/ws_s/candidate");
  expect(seen.body).toEqual({ repository: { remote: world.url, branch: "main", ssh: false } });
  const adopted = await call("/bonzaiwork/brains/ws_s/adopt", { method: "POST", body: {} });
  expect(adopted.status).toBe(200);
  expect(adopted.body.status).toMatchObject({ state: "synced", branch: "main", pendingTrust: [] });
  await writeFile(join(repo, "knowledge/b.md"), "b\n");
  expect((await call("/bonzaiwork/brains/ws_s/sync", { method: "POST" })).body).toMatchObject({ state: "synced" });
  expect(await world.git.ok(["show", "main:knowledge/b.md"], { cwd: world.bare })).toBe("b\n");
});

test("werkwijzen via de routes: lijst, invoer ontbreekt, controle door een persoon", async () => {
  world = await createWorld();
  hooks = createBrainsServerHooks({ stateDirectory: join(world.root, "state-app"), allowFileProtocol: true, environment: { PATH: process.env.PATH ?? "", HOME: world.root } });
  const host = fakeHost();
  await hooks.start(host);
  const folder = join(world.root, "Sales");
  const contract = "# 01_intake - aanvraag tot brief\n\n## Inputs\n- Working (deze run): `../../../_inbox/aanvraag.md`\n\n## Process\n1. Lees.\n\n## Outputs\n- `brief.md` -> `output/`\n\n## Check\nDe gebruiker leest de brief na.\n";
  await mkdir(join(folder, "workflows", "offerte", "01_intake"), { recursive: true });
  await writeFile(join(folder, "workflows", "offerte", "CONTEXT.md"), "# Offerte - van aanvraag naar offerte\n");
  await writeFile(join(folder, "workflows", "offerte", "01_intake", "CONTEXT.md"), contract);
  host.workspaceList = [{ id: "ws", path: folder }];
  const listed = await call("/bonzaiwork/brains/ws/workflows");
  expect(listed.body.workflows).toMatchObject([{ name: "offerte", title: "Offerte", stages: [{ id: "01_intake", state: "waiting" }] }]);
  const blocked = await call("/bonzaiwork/brains/ws/workflows/offerte/stages/01_intake/start", { method: "POST", body: {} });
  expect(blocked.status).toBe(409);
  expect(blocked.body).toMatchObject({ code: "missing_input", missing: ["../../../_inbox/aanvraag.md"] });
  await mkdir(join(folder, "workflows", "offerte", "01_intake", "output"), { recursive: true });
  await writeFile(join(folder, "workflows", "offerte", "01_intake", "output", "brief.md"), "Brief\n");
  const checked = await call("/bonzaiwork/brains/ws/workflows/offerte/stages/01_intake/check", { method: "POST", body: { verdict: "pass" } });
  expect(checked.body.stage).toMatchObject({ state: "done" });
  expect((await call("/bonzaiwork/brains/ws/workflows/offerte/stages/01_intake/check", { method: "POST", body: { model: true } })).body.prompt).toContain("check.md");
});
