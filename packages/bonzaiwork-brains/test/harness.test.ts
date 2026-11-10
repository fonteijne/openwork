import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { HARNESS_VERSION, harnessItems, itemFingerprint, readStamp, stampedFiles } from "@bonzaiwork/harness";

import { composeHarness, outdatedItems, personalItems, readTeamHarness, unifiedDiff, updateItems } from "../src/harness.ts";
import { BRAIN_TOOLS, callBrainTool, type Conversation, type ConversationQuery, type PersonalAccess } from "../src/mcp.ts";
import { createBrainsServerHooks, type BrainsHost, type BrainsServerHooks, type EngineGlobalContext, type SessionActivity } from "../src/server-hooks.ts";
import { createGit } from "../src/git.ts";
import { createWorld, type World } from "./world.ts";

/**
 * Brein-harnas-plan fase 1: the harness in the engine's config folder, outdated
 * copies in a project brain (H3), the user's own skills (§1.4) and the
 * migration of the old personal brain (H5).
 */
let world: World | undefined;
let hooks: BrainsServerHooks | undefined;
const cleanup: string[] = [];
afterEach(async () => {
  hooks?.stop();
  hooks = undefined;
  await world?.dispose();
  world = undefined;
  for (const dir of cleanup.splice(0)) await rm(dir, { recursive: true, force: true });
});

const okfQuery = () => {
  const item = harnessItems().find((entry) => entry.kind === "skill" && entry.name === "okf-query");
  if (!item) throw new Error("okf-query ontbreekt in het harnas");
  return item;
};

type FakeHost = BrainsHost & { context: EngineGlobalContext | null; workspaceList: Array<{ id: string; path: string }>; listeners: Set<(activity: SessionActivity) => void> };
function fakeHost(): FakeHost {
  const host: FakeHost = {
    port: 4242, readOnly: false, context: null, workspaceList: [], listeners: new Set(),
    workspaces: () => host.workspaceList,
    reloadEngineProviders: async () => {},
    onSessionActivity: (listener) => { host.listeners.add(listener); return () => host.listeners.delete(listener); },
    runningSessions: async () => [],
    sessionInfo: async (id) => ({ id, title: "Chat", parentId: null }),
    updateEngineMcp: async () => true,
    setEngineGlobalContext: async (input) => { host.context = input; },
    log: () => {},
  };
  return host;
}

function caller(current: BrainsServerHooks) {
  return async (method: string, path: string, body?: unknown): Promise<{ status: number; body: Record<string, unknown> }> => {
    const pathname = path.split("?")[0];
    const route = current.routes.find((candidate) => candidate.method === method && new RegExp(`^${candidate.path.replace(/:[a-zA-Z]+/g, "[^/]+")}$`).test(pathname));
    if (!route) throw new Error(`no route ${method} ${path}`);
    const names = [...route.path.matchAll(/:([a-zA-Z]+)/g)].map((match) => match[1]);
    const values = new RegExp(`^${route.path.replace(/:[a-zA-Z]+/g, "([^/]+)")}$`).exec(pathname)?.slice(1) ?? [];
    const response = await route.handle(new Request(`http://local${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), Object.fromEntries(names.map((name, index) => [name, values[index]])));
    return { status: response.status, body: await response.json() };
  };
}

describe("het harnas in de config-map", () => {
  test("meegeleverd plus eigen skills, eigen wint bij dezelfde naam; commando's en agent als tekst", async () => {
    const state = await mkdtemp(join(tmpdir(), "harnas-state-"));
    const personal = await mkdtemp(join(tmpdir(), "harnas-personal-"));
    cleanup.push(state, personal);
    await mkdir(join(personal, ".opencode/skills/okf-query"), { recursive: true });
    await writeFile(join(personal, ".opencode/skills/okf-query/SKILL.md"), "---\nname: okf-query\ndescription: Mijn eigen versie\n---\n# Eigen\n");
    await mkdir(join(personal, ".opencode/skills/mijn-samenvatting"), { recursive: true });
    await writeFile(join(personal, ".opencode/skills/mijn-samenvatting/SKILL.md"), "---\nname: mijn-samenvatting\ndescription: Samenvatten zoals ik het wil\n---\n# Samenvatting\n");
    await mkdir(join(personal, ".opencode/commands"), { recursive: true });
    await writeFile(join(personal, ".opencode/commands/dagstart.md"), "---\ndescription: Mijn dagstart\n---\nDAGSTART\n");
    const composed = await composeHarness({ stateDirectory: state, personalRoot: personal });
    expect(composed.version).toBe(HARNESS_VERSION);
    expect(composed.skills["okf-query"]).toBe(join(personal, ".opencode/skills/okf-query"));
    expect(composed.skills["mijn-samenvatting"]).toBe(join(personal, ".opencode/skills/mijn-samenvatting"));
    expect(composed.skills["brein-mensen"]).toBe(join(state, "harness", HARNESS_VERSION, "skills", "brein-mensen"));
    expect(existsSync(join(composed.skills["icm-architect"], "assets/templates/CONTEXT.md"))).toBe(true);
    expect(composed.commands.onthoud).toContain("$ARGUMENTS");
    expect(composed.commands.dagstart).toBe("---\ndescription: Mijn dagstart\n---\nDAGSTART\n");
    expect(composed.agents.brein).toContain("mode: primary");
    const views = composed.items.map((item) => `${item.kind}:${item.name}:${item.source}`);
    expect(views).toContain("skill:okf-query:personal");
    expect(views).not.toContain("skill:okf-query:bundled");
    expect(views).toContain("skill:okf-ingest:bundled");
    expect(views).toContain("command:dagstart:personal");
    expect(views).toContain("agent:brein:bundled");
    expect((await personalItems(personal)).map((item) => item.description)).toContain("Samenvatten zoals ik het wil");
    // An older materialized version is cleaned up.
    await mkdir(join(state, "harness", "0.0.1"), { recursive: true });
    await composeHarness({ stateDirectory: state, personalRoot: null });
    expect(existsSync(join(state, "harness", "0.0.1"))).toBe(false);
  });

  test("verouderde kopieën: aangepast met stempel telt, zonder stempel niet, actueel niet; diff leesbaar", async () => {
    const root = await mkdtemp(join(tmpdir(), "harnas-brain-"));
    cleanup.push(root);
    const item = okfQuery();
    // Current copy, as the template writes it.
    await mkdir(join(root, ".opencode/skills/okf-query"), { recursive: true });
    await writeFile(join(root, ".opencode/skills/okf-query/SKILL.md"), stampedFiles(item).get("SKILL.md") ?? "");
    // A copy the team changed, stamped with an older version.
    await mkdir(join(root, ".opencode/skills/okf-lint"), { recursive: true });
    await writeFile(join(root, ".opencode/skills/okf-lint/SKILL.md"), "---\nname: okf-lint\ndescription: Onze eigen controle\nharness: okf-lint@0.9.0\n---\n# Onze controle\n");
    // A skill of the team's own with a harness name but no stamp: not ours.
    await mkdir(join(root, ".opencode/skills/brein-mensen"), { recursive: true });
    await writeFile(join(root, ".opencode/skills/brein-mensen/SKILL.md"), "---\nname: brein-mensen\ndescription: Van het team\n---\nEigen.\n");
    // A command the team changed, stamped older.
    await mkdir(join(root, ".opencode/commands"), { recursive: true });
    await writeFile(join(root, ".opencode/commands/verwerk.md"), "---\ndescription: Verwerk\nharness: verwerk@0.9.0\n---\nAnders.\n");
    const outdated = await outdatedItems(root);
    expect(outdated).toEqual([
      { kind: "command", name: "verwerk", from: "0.9.0", to: HARNESS_VERSION, modified: true },
      { kind: "skill", name: "okf-lint", from: "0.9.0", to: HARNESS_VERSION, modified: true },
    ]);
    expect(await outdatedItems(root, { "skill:okf-lint": HARNESS_VERSION })).toEqual([{ kind: "command", name: "verwerk", from: "0.9.0", to: HARNESS_VERSION, modified: true }]);
    const diff = unifiedDiff(new Map([["SKILL.md", "a\nb\nc\n"]]), new Map([["SKILL.md", "a\nB\nc\nd\n"]]));
    expect(diff).toBe("--- a/SKILL.md\n+++ b/SKILL.md\n a\n-b\n+B\n c\n+d\n ");
  });
});

describe("verouderde kopieën in een gedeeld brein (H3)", () => {
  test("bijwerken geeft één commit die de ander na bijwerken ziet; uit het project halen; zo laten", async () => {
    world = await createWorld();
    const item = okfQuery();
    // The team's copy: changed by them, from an older harness.
    await world.seed({ ".opencode/skills/okf-query/SKILL.md": "---\nname: okf-query\ndescription: Onze versie\nharness: okf-query@0.9.0\n---\n# Onze versie\n", ".opencode/commands/onderhoud.md": "---\ndescription: Onderhoud\nharness: onderhoud@0.9.0\n---\nOns onderhoud.\n" });
    hooks = createBrainsServerHooks({ stateDirectory: join(world.root, "state-a"), allowFileProtocol: true, quietMs: 50, environment: { PATH: process.env.PATH ?? "", HOME: world.root } });
    const host = fakeHost();
    await hooks.start(host);
    const call = caller(hooks);
    const folder = join(world.root, "A");
    const cloned = await call("POST", "/bonzaiwork/brains/clone", { url: world.url, folderPath: folder });
    const jobId = String(cloned.body.jobId);
    for (let attempt = 0; attempt < 200 && (await call("GET", `/bonzaiwork/brains/jobs/${jobId}`)).body.state === "running"; attempt += 1) await Bun.sleep(20);
    host.workspaceList = [{ id: "ws_a", path: folder }];
    const registered = await call("PUT", "/bonzaiwork/brains/ws_a", { jobId, mode: "auto" });
    expect(registered.status).toBe(200);
    const status = registered.body.status;
    expect(status).toMatchObject({ kind: "project" });
    expect((status as { outdated: unknown[] }).outdated).toEqual([
      { kind: "command", name: "onderhoud", from: "0.9.0", to: HARNESS_VERSION, modified: true },
      { kind: "skill", name: "okf-query", from: "0.9.0", to: HARNESS_VERSION, modified: true },
    ]);

    // "Verschillen bekijken".
    const diff = await call("GET", "/bonzaiwork/brains/ws_a/harness/diff?kind=skill&name=okf-query");
    expect(diff.status).toBe(200);
    expect(String(diff.body.diff)).toContain("-# Onze versie");
    expect(String(diff.body.diff)).toContain(`+harness: okf-query@${HARNESS_VERSION}`);

    // "Zo laten" hides the command for this harness version only.
    const dismissed = await call("POST", "/bonzaiwork/brains/ws_a/harness/dismiss", { items: [{ kind: "command", name: "onderhoud" }] });
    expect((dismissed.body.status as { outdated: unknown[] }).outdated).toEqual([{ kind: "skill", name: "okf-query", from: "0.9.0", to: HARNESS_VERSION, modified: true }]);

    // "Harnasversie overnemen": one commit, shared; the other user sees it after an update.
    const updated = await call("POST", "/bonzaiwork/brains/ws_a/harness/update", { items: [{ kind: "skill", name: "okf-query" }] });
    expect(updated.status).toBe(200);
    expect(updated.body.changed).toEqual([".opencode/skills/okf-query/SKILL.md"]);
    expect((updated.body.status as { outdated: unknown[] }).outdated).toEqual([]);
    const copy = await readFile(join(folder, ".opencode/skills/okf-query/SKILL.md"), "utf8");
    expect(copy).toBe(stampedFiles(item).get("SKILL.md") ?? "");
    expect(readStamp(copy)).toEqual({ name: "okf-query", version: HARNESS_VERSION });
    expect(await world.git.ok(["log", "-1", "--format=%s", "main"], { cwd: world.bare })).toBe(`BonzaiWork-onderdelen bijgewerkt naar ${HARNESS_VERSION}\n`);
    const other = await world.user("B");
    await other.sync.prepareTurn();
    expect(await readFile(join(other.path, ".opencode/skills/okf-query/SKILL.md"), "utf8")).toBe(copy);
    expect((await other.sync.status()).outdated).toEqual([]);
    // The team's version is in the history: "Zet deze notitie terug" still reaches it.
    const history = await call("GET", "/bonzaiwork/brains/ws_a/history");
    const entries = history.body.entries;
    expect(Array.isArray(entries) && entries[0]).toMatchObject({ files: [".opencode/skills/okf-query/SKILL.md"] });

    // "Uit het project halen": the copy goes, the harness provides it; one commit.
    const removed = await call("POST", "/bonzaiwork/brains/ws_a/harness/remove", { items: [{ kind: "command", name: "onderhoud" }] });
    expect(removed.body.changed).toEqual([".opencode/commands/onderhoud.md"]);
    expect(existsSync(join(folder, ".opencode/commands/onderhoud.md"))).toBe(false);
    expect(await world.git.ok(["log", "-1", "--format=%s", "main"], { cwd: world.bare })).toBe("BonzaiWork-onderdelen uit het project gehaald; BonzaiWork levert ze\n");
    await other.sync.prepareTurn();
    expect(existsSync(join(other.path, ".opencode/commands/onderhoud.md"))).toBe(false);
  });
});

describe("eigen skills en de migratie van het oude brein", () => {
  test("een skill uit een project gaat naar Jouw brein met zijn script, telt in elk project en staat in de geschiedenis", async () => {
    const state = await mkdtemp(join(tmpdir(), "harnas-state-"));
    const personal = join(state, "Mijn brein");
    const project = join(state, "Offertes");
    cleanup.push(state);
    await mkdir(join(project, ".opencode/skills/offerte-check"), { recursive: true });
    await writeFile(join(project, ".opencode/skills/offerte-check/SKILL.md"), "---\nname: offerte-check\ndescription: Een offerte controleren\n---\n# Controle\n");
    await writeFile(join(project, ".opencode/skills/offerte-check/check.py"), "print('ok')\n");
    await writeFile(join(project, ".opencode/skills/offerte-check/logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]));
    hooks = createBrainsServerHooks({ stateDirectory: state, quietMs: 30, environment: { PATH: process.env.PATH ?? "", HOME: state } });
    const host = fakeHost();
    host.workspaceList = [{ id: "ws_mijn", path: personal }, { id: "ws_offertes", path: project }];
    await hooks.start(host);
    const call = caller(hooks);
    await mkdir(personal, { recursive: true });
    expect((await call("PUT", "/bonzaiwork/brains/ws_mijn", { kind: "personal" })).status).toBe(200);
    // The harness route: what counts now, and no previous brain (a fresh install).
    const listed = await call("GET", "/bonzaiwork/harness");
    expect(listed.body).toMatchObject({ version: HARNESS_VERSION, personal: "ws_mijn", previous: null });
    expect((listed.body.items as Array<{ name: string }>).map((item) => item.name)).toContain("brein-mensen");

    // "Overal gebruiken" with move.
    const adopted = await call("POST", "/bonzaiwork/brains/ws_mijn/skills/adopt", { fromWorkspaceId: "ws_offertes", name: "offerte-check", move: true });
    expect(adopted.status).toBe(200);
    expect(existsSync(join(personal, ".opencode/skills/offerte-check/check.py"))).toBe(true);
    expect(existsSync(join(personal, ".opencode/skills/offerte-check/logo.png"))).toBe(false);
    expect(existsSync(join(project, ".opencode/skills/offerte-check"))).toBe(false);
    expect(host.context?.skills["offerte-check"]).toBe(join(personal, ".opencode/skills/offerte-check"));
    const git = await createGit({ stateDirectory: join(state, "check") });
    const history = () => git.ok(["log", "--format=%s", "--name-only"], { cwd: personal, gitDir: join(state, "history", "ws_mijn.git"), workTree: personal });
    expect(await history()).toContain(".opencode/skills/offerte-check/check.py");
    expect(await history()).toContain(".opencode/skills/offerte-check/SKILL.md");

    // A new skill from Jouw brein, then removed.
    const saved = await call("PUT", "/bonzaiwork/brains/ws_mijn/skills/mijn-samenvatting", { description: "Samenvatten zoals ik het wil", content: "# Samenvatting\n\n1. Drie punten.\n" });
    expect(saved.status).toBe(200);
    expect(await readFile(join(personal, ".opencode/skills/mijn-samenvatting/SKILL.md"), "utf8")).toBe("---\nname: mijn-samenvatting\ndescription: Samenvatten zoals ik het wil\n---\n\n# Samenvatting\n\n1. Drie punten.\n");
    expect(Object.keys(host.context?.skills ?? {})).toContain("mijn-samenvatting");
    expect((await call("PUT", "/bonzaiwork/brains/ws_mijn/skills/Fout Naam", { content: "x" })).status).toBe(400);
    expect((await call("PUT", "/bonzaiwork/brains/ws_offertes/skills/x", { content: "x" })).status).toBe(404);
    expect((await call("DELETE", "/bonzaiwork/brains/ws_mijn/skills/mijn-samenvatting")).status).toBe(200);
    expect(existsSync(join(personal, ".opencode/skills/mijn-samenvatting"))).toBe(false);
    expect(Object.keys(host.context?.skills ?? {})).not.toContain("mijn-samenvatting");
    // The personal brain's own template has no harness copies: the harness provides them.
    expect(existsSync(join(personal, ".opencode/skills/okf-query"))).toBe(false);
    expect(existsSync(join(personal, ".opencode/commands/verwerk.md"))).toBe(false);
  });

  test("het persoonlijke brein van vóór het harnas wordt een project met zijn geschiedenis; Jouw brein begint leeg", async () => {
    const state = await mkdtemp(join(tmpdir(), "harnas-state-"));
    const personal = join(state, "Mijn brein");
    cleanup.push(state);
    const host = fakeHost();
    host.workspaceList = [{ id: "ws_oud", path: personal }];
    // Before: the app without the harness made a personal brain and recorded a turn.
    const before = createBrainsServerHooks({ stateDirectory: state, quietMs: 30, harness: false, environment: { PATH: process.env.PATH ?? "", HOME: state } });
    hooks = before;
    await before.start(host);
    const call = caller(before);
    await mkdir(personal, { recursive: true });
    expect((await call("PUT", "/bonzaiwork/brains/ws_oud", { kind: "personal" })).status).toBe(200);
    expect((await call("GET", "/bonzaiwork/harness")).status).toBe(404);
    await writeFile(join(personal, "_meta/voorkeuren.md"), "# Mijn voorkeuren\n\n- Drie punten.\n");
    await writeFile(join(personal, "knowledge/notitie.md"), "---\ntype: Analysis\ntitle: Notitie\n---\n# Notitie\n");
    for (const listener of host.listeners) listener({ workspaceId: "ws_oud", sessionId: "ses_1", state: "running" });
    for (const listener of host.listeners) listener({ workspaceId: "ws_oud", sessionId: "ses_1", state: "idle", outcome: "succeeded" });
    // The quiet moment records the turn and then refreshes the global instructions: wait for the latter.
    for (let attempt = 0; attempt < 150 && !host.context?.instructions?.includes("Drie punten"); attempt += 1) await Bun.sleep(20);
    expect(host.context?.instructions).toContain("Drie punten");
    before.stop();

    // After the upgrade: the old brain is a project brain (same folder, history, local only); Jouw brein is empty.
    const after = createBrainsServerHooks({ stateDirectory: state, quietMs: 30, environment: { PATH: process.env.PATH ?? "", HOME: state } });
    hooks = after;
    await after.start(host);
    const callAfter = caller(after);
    const listed = await callAfter("GET", "/bonzaiwork/brains");
    expect(listed.body.brains).toMatchObject([{ workspaceId: "ws_oud", status: { kind: "project", state: "local_only" } }]);
    const harness = await callAfter("GET", "/bonzaiwork/harness");
    expect(harness.body.personal).toBeNull();
    expect(harness.body.previous).toMatchObject({ workspaceId: "ws_oud" });
    expect(host.context?.instructions).not.toContain("Drie punten");
    const history = await callAfter("GET", "/bonzaiwork/brains/ws_oud/history");
    expect((history.body.entries as unknown[]).length).toBeGreaterThan(1);
    // A second start does not migrate again: a new personal brain stays personal.
    const fresh = join(state, "Nieuw brein");
    await mkdir(fresh, { recursive: true });
    host.workspaceList = [{ id: "ws_oud", path: personal }, { id: "ws_nieuw", path: fresh }];
    expect((await callAfter("PUT", "/bonzaiwork/brains/ws_nieuw", { kind: "personal" })).status).toBe(200);
    after.stop();
    const again = createBrainsServerHooks({ stateDirectory: state, quietMs: 30, environment: { PATH: process.env.PATH ?? "", HOME: state } });
    hooks = again;
    await again.start(host);
    const brains = (await caller(again)("GET", "/bonzaiwork/brains")).body.brains as Array<{ workspaceId: string; status: { kind: string } }>;
    expect(brains.find((brain) => brain.workspaceId === "ws_nieuw")?.status.kind).toBe("personal");
    expect(brains.find((brain) => brain.workspaceId === "ws_oud")?.status.kind).toBe("project");
  });
});

describe("skills van je team (fase 2) en de dagelijkse verwerking", () => {
  test("een teamrepo levert skills in elk project, een agent pas na Toestaan, een nieuwe versie na bijwerken, en verouderde kopieën kennen de teamversie", async () => {
    world = await createWorld({ empty: true });
    const skill = (name: string, description: string) => `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n`;
    const manifest = (version: string, items: Record<string, Map<string, string>>) => JSON.stringify({ version, items: Object.fromEntries(Object.entries(items).map(([key, files]) => [key, { versions: { [version]: itemFingerprint(files) } }])) });
    const offerteCheck = new Map([["SKILL.md", skill("offerte-check", "Een offerte controleren op ons beleid")]]);
    const okfOwn = new Map([["SKILL.md", skill("okf-query", "Onze eigen manier van vragen beantwoorden")]]);
    await world.seed({
      "harness.json": manifest("2.0.0", { "skill:offerte-check": offerteCheck, "skill:okf-query": okfOwn }),
      "skills/offerte-check/SKILL.md": offerteCheck.get("SKILL.md") ?? "",
      "skills/okf-query/SKILL.md": okfOwn.get("SKILL.md") ?? "",
      "agents/verkoop.md": "---\ndescription: Verkoopagent\nmode: primary\n---\nVERKOOP\n",
      "commands/offerte.md": "---\ndescription: Offerte\n---\nMaak een offerte. $ARGUMENTS\n",
    }, "team 2.0.0");
    const state = join(world.root, "state");
    hooks = createBrainsServerHooks({ stateDirectory: state, allowFileProtocol: true, quietMs: 50, environment: { PATH: process.env.PATH ?? "", HOME: world.root } });
    const host = fakeHost();
    const project = join(world.root, "Offertes");
    await mkdir(join(project, ".opencode/skills/offerte-check"), { recursive: true });
    host.workspaceList = [{ id: "ws_offertes", path: project }];
    await hooks.start(host);
    const call = caller(hooks);
    expect((await call("GET", "/bonzaiwork/harness")).body.repo).toBeNull();

    // Link: skills and the command count at once; the agent waits for trust.
    const linked = await call("PUT", "/bonzaiwork/harness/repo", { url: world.url });
    expect(linked.status).toBe(200);
    const repo = linked.body.repo as { remote: string; version: string; status: { state: string; pendingTrust: Array<{ path: string; kind: string }> } };
    expect(repo.version).toBe("2.0.0");
    expect(repo.status.pendingTrust.map((item) => `${item.kind}:${item.path}`)).toEqual(["agent:agents/verkoop.md"]);
    expect(host.context?.skills["offerte-check"]).toBe(join(state, "harness-repo", "skills", "offerte-check"));
    expect(host.context?.skills["okf-query"]).toBe(join(state, "harness-repo", "skills", "okf-query"));
    expect(host.context?.commands.offerte).toContain("Maak een offerte.");
    expect(host.context?.agents.verkoop).toBeUndefined();
    const items = (await call("GET", "/bonzaiwork/harness")).body.items as Array<{ kind: string; name: string; source: string; version: string | null }>;
    expect(items.find((item) => item.name === "offerte-check")).toMatchObject({ source: "repo", version: "2.0.0" });
    expect(items.find((item) => item.name === "okf-query")).toMatchObject({ source: "repo" });
    expect(items.find((item) => item.name === "okf-ingest")).toMatchObject({ source: "bundled" });
    expect(hooks.enginePolicies().map((policy) => policy.resource)).toContain(`read:${join(state, "harness-repo")}/*`);

    // Trust the agent: it is in the engine's config now.
    const trusted = await call("POST", "/bonzaiwork/harness/repo/trust", { paths: ["agents/verkoop.md"] });
    expect((trusted.body.repo as { status: { pendingTrust: unknown[] } }).status.pendingTrust).toEqual([]);
    expect(host.context?.agents.verkoop).toContain("VERKOOP");

    // The team ships 2.1.0: after an update every project has it; the project's old copy is outdated against the team version.
    const offerteCheck2 = new Map([["SKILL.md", skill("offerte-check", "Een offerte controleren op ons beleid, ook de korting")]]);
    await writeFile(join(project, ".opencode/skills/offerte-check/SKILL.md"), stampedFiles({ kind: "skill", name: "offerte-check", files: offerteCheck, description: "" }, "2.0.0").get("SKILL.md") ?? "");
    // The manifest keeps every version's fingerprint (scripts/manifest.mjs --root does the same), so an old copy is still recognised.
    const manifest21 = JSON.parse(manifest("2.1.0", { "skill:offerte-check": offerteCheck2, "skill:okf-query": okfOwn })) as { items: Record<string, { versions: Record<string, string> }> };
    manifest21.items["skill:offerte-check"].versions["2.0.0"] = itemFingerprint(offerteCheck);
    await world.seed({ "harness.json": JSON.stringify(manifest21), "skills/offerte-check/SKILL.md": offerteCheck2.get("SKILL.md") ?? "" }, "team 2.1.0");
    const updated = await call("POST", "/bonzaiwork/harness/repo/update");
    expect((updated.body.repo as { version: string }).version).toBe("2.1.0");
    expect(await readFile(join(state, "harness-repo", "skills", "offerte-check", "SKILL.md"), "utf8")).toContain("ook de korting");
    const outdated = await outdatedItems(project, {}, await readTeamHarness(join(state, "harness-repo")));
    expect(outdated).toEqual([{ kind: "skill", name: "offerte-check", from: "2.0.0", to: "2.1.0", modified: false }]);
    expect(await updateItems(project, [{ kind: "skill", name: "offerte-check" }], await readTeamHarness(join(state, "harness-repo")))).toEqual([".opencode/skills/offerte-check/SKILL.md"]);
    expect(readStamp(await readFile(join(project, ".opencode/skills/offerte-check/SKILL.md"), "utf8"))).toEqual({ name: "offerte-check", version: "2.1.0" });

    // Unlink: the bundle's okf-query is back, the folder is gone.
    expect((await call("DELETE", "/bonzaiwork/harness/repo")).body.repo).toBeNull();
    expect(host.context?.skills["okf-query"]).toBe(join(state, "harness", HARNESS_VERSION, "skills", "okf-query"));
    expect(host.context?.skills["offerte-check"]).toBeUndefined();
    expect(existsSync(join(state, "harness-repo"))).toBe(false);
  });

  test("gesprekken_lezen: periode, project, routinechats weg, tekst voor het model", async () => {
    const now = Date.parse("2026-11-10T17:30:00Z");
    const seen: ConversationQuery[] = [];
    const chats: Conversation[] = [
      { id: "ses_a", project: "Offertes", title: "Offerte Van Dijk", updatedAt: now - 3_600_000, messages: [{ role: "user", text: "Wie is Jan de Vries ook alweer?" }, { role: "assistant", text: "Jan de Vries is de inkoper bij Van Dijk." }] },
      { id: "ses_b", project: "Sales", title: "Prijslijst", updatedAt: now - 7_200_000, messages: [{ role: "user", text: "x".repeat(5_000) }] },
    ];
    const access: PersonalAccess = {
      root: () => "/brein", excluded: () => [], wrote: () => undefined, propose: async () => "p", teamBrains: async () => [], refresh: async () => undefined,
      conversations: async (query) => { seen.push(query); return chats.filter((chat) => chat.updatedAt >= query.since && (!query.project || chat.project === query.project)); },
    };
    const text = (result: { content: Array<{ text: string }> }) => result.content[0]?.text ?? "";
    expect(text(await callBrainTool(access, "gesprekken_lezen", { sinds: "nonsens" }))).toContain("Geef sinds");
    const all = text(await callBrainTool(access, "gesprekken_lezen", { sinds: "24h" }));
    expect(all).toContain("## Offerte Van Dijk · Offertes ·");
    expect(all).toContain("bonzaiwork://chat/ses_a");
    expect(all).toContain("Gebruiker: Wie is Jan de Vries ook alweer?");
    expect(all).toContain("Agent: Jan de Vries is de inkoper");
    expect(all).toContain("[… ingekort]");
    expect(seen[0]?.project).toBeNull();
    expect(Math.abs((seen[0]?.since ?? 0) - (Date.now() - 86_400_000))).toBeLessThan(5_000);
    const one = text(await callBrainTool(access, "gesprekken_lezen", { sinds: "2026-11-10T16:00:00Z", project: "Offertes" }));
    expect(one).toContain("Offerte Van Dijk");
    expect(one).not.toContain("Prijslijst");
    expect(seen[1]).toMatchObject({ since: Date.parse("2026-11-10T16:00:00Z"), project: "Offertes" });
    expect(text(await callBrainTool(access, "gesprekken_lezen", { sinds: "2030-01-01T00:00:00Z" }))).toBe("Geen gesprekken in deze periode.");
    expect(BRAIN_TOOLS.some((tool) => tool.name === "gesprekken_lezen")).toBe(true);
  });
});
