import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { callBrainTool, contentVersion, handleMcpRequest, type PersonalAccess, type TeamBrain } from "../src/mcp.ts";
import { brainPath, composeInstructions, isCloudFolder, PERSONAL_INSTRUCTIONS_LIMIT } from "../src/personal.ts";
import { createBrainsServerHooks, type BrainsHost, type BrainsServerHooks, type SessionActivity } from "../src/server-hooks.ts";
import { createGit } from "../src/git.ts";

const cleanup: string[] = [];
let hooks: BrainsServerHooks | undefined;
afterEach(async () => {
  hooks?.stop();
  hooks = undefined;
  for (const dir of cleanup.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function vault(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "vault-"));
  cleanup.push(root);
  await mkdir(join(root, ".obsidian"), { recursive: true });
  await mkdir(join(root, "Dagboek"), { recursive: true });
  await mkdir(join(root, "Projecten"), { recursive: true });
  await writeFile(join(root, ".obsidian/app.json"), "{}");
  await writeFile(join(root, "Dagboek/2026-10-30.md"), "Privé.\n");
  await writeFile(join(root, "Projecten/offerte.md"), "# Offerte\n\nZie [[Klant]]. #werk\n");
  await writeFile(join(root, "plaatje.png"), "png");
  return root;
}

describe("paden en instructies", () => {
  test("alleen Markdown binnen het brein, niet in .git, de inbox of een uitgesloten map, niet via een link naar buiten", async () => {
    const root = await vault();
    const outside = await mkdtemp(join(tmpdir(), "buiten-"));
    cleanup.push(outside);
    await symlink(outside, join(root, "link"));
    const reason = async (path: string) => { const result = await brainPath(root, path, ["Dagboek"]); return result.ok ? "ok" : result.reason; };
    expect(await reason("Projecten/offerte.md")).toBe("ok");
    expect(await reason("nieuw/notitie.md")).toBe("ok");
    expect(await reason("plaatje.png")).toContain("Markdown");
    expect(await reason("../x.md")).toContain("buiten");
    expect(await reason("/etc/x.md")).toContain("binnen");
    expect(await reason("Dagboek/2026-10-30.md")).toContain("uitgesloten");
    expect(await reason("dagboek/2026-10-30.md")).toContain("uitgesloten");
    expect(await reason(".obsidian/x.md")).toContain("uitgesloten");
    expect(await reason(".opencode/openwork/inbox/bijlage.md")).toContain("uitgesloten");
    expect(await reason("link/geheim.md")).toContain("buiten");
  });

  test("instructies: app-regels plus AGENTS.md en voorkeuren, ingekort boven 32 KiB", async () => {
    const root = await vault();
    expect((await composeInstructions(null)).text).toContain("Voer zelf nooit git uit");
    await mkdir(join(root, "_meta"), { recursive: true });
    await writeFile(join(root, "AGENTS.md"), "# Mijn brein\n");
    await writeFile(join(root, "_meta/voorkeuren.md"), "Samenvattingen in drie punten.\n");
    const small = await composeInstructions(root);
    expect(small.text).toContain("Samenvattingen in drie punten.");
    expect(small.truncated).toBe(false);
    await writeFile(join(root, "_meta/voorkeuren.md"), "x".repeat(PERSONAL_INSTRUCTIONS_LIMIT + 10));
    const big = await composeInstructions(root);
    expect(big.truncated).toBe(true);
    expect(big.text).toContain("Ingekort");
  });

  test("cloudmappen", () => {
    expect(isCloudFolder("/Users/jan/Library/Mobile Documents/iCloud~md~obsidian/Documents/Vault", "/Users/jan")).toBe(true);
    expect(isCloudFolder("/Users/jan/Library/CloudStorage/OneDrive-Bedrijf/Vault", "/Users/jan")).toBe(true);
    expect(isCloudFolder("/home/jan/Dropbox/Vault", "/home/jan")).toBe(true);
    expect(isCloudFolder("/Users/jan/BonzaiWork/Persoonlijk", "/Users/jan")).toBe(false);
  });
});

describe("de breinen-MCP", () => {
  const access = (root: string, wrote: string[] = [], proposed: string[] = [], team: TeamBrain[] = [], refreshed: string[] = []): PersonalAccess => ({
    root: () => root, excluded: () => ["Dagboek"], wrote: (path) => wrote.push(path), propose: async (text) => { proposed.push(text); return "p"; },
    teamBrains: async () => team, refresh: async (id) => { refreshed.push(id); },
  });
  const text = (result: { content: Array<{ text: string }> }) => result.content.map((part) => part.text).join("");

  test("lezen, schrijven, bewerken met versiecontrole, zoeken", async () => {
    const root = await vault();
    const wrote: string[] = [];
    const tools = access(root, wrote);
    const read = await callBrainTool(tools, "persoonlijk_brein_lezen", { pad: "Projecten/offerte.md" });
    const version = /versie: (\w+)/.exec(text(read))?.[1] ?? "";
    expect(version).toBe(contentVersion("# Offerte\n\nZie [[Klant]]. #werk\n"));
    expect((await callBrainTool(tools, "persoonlijk_brein_schrijven", { pad: "Projecten/offerte.md", inhoud: "x" })).isError).toBe(true);
    // The user types in Obsidian meanwhile: the old version is refused.
    await writeFile(join(root, "Projecten/offerte.md"), "# Offerte\n\nZie [[Klant]]. #werk\nNieuw van mij.\n");
    const stale = await callBrainTool(tools, "persoonlijk_brein_bewerken", { pad: "Projecten/offerte.md", oud: "#werk", nieuw: "#werk #sales", versie: version });
    expect(text(stale)).toContain("veranderd");
    const fresh = /versie: (\w+)/.exec(text(await callBrainTool(tools, "persoonlijk_brein_lezen", { pad: "Projecten/offerte.md" })))?.[1] ?? "";
    const edited = await callBrainTool(tools, "persoonlijk_brein_bewerken", { pad: "Projecten/offerte.md", oud: "#werk", nieuw: "#werk #sales", versie: fresh });
    expect(edited.isError).toBeUndefined();
    expect(await readFile(join(root, "Projecten/offerte.md"), "utf8")).toBe("# Offerte\n\nZie [[Klant]]. #werk #sales\nNieuw van mij.\n");
    expect((await callBrainTool(tools, "persoonlijk_brein_schrijven", { pad: "knowledge/nieuw.md", inhoud: "---\ntype: Analysis\n---\n# Nieuw\n" })).isError).toBeUndefined();
    expect(wrote).toEqual(["Projecten/offerte.md", "knowledge/nieuw.md"]);
    expect(text(await callBrainTool(tools, "persoonlijk_brein_zoeken", { vraag: "offerte klant" }))).toContain("Projecten/offerte.md");
    expect(text(await callBrainTool(tools, "persoonlijk_brein_zoeken", { vraag: "privé" }))).toContain("Niets gevonden");
  });

  test("andere breinen: lijst, zoeken en lezen, alleen lezen en alleen Markdown", async () => {
    const sales = await vault();
    await writeFile(join(sales, "AGENTS.md"), "# Sales\n\nOffertes en klanten.\n");
    await mkdir(join(sales, "knowledge"), { recursive: true });
    await writeFile(join(sales, "knowledge/offerteproces.md"), "---\ntype: Process\n---\n# Offerteproces\n\nEerst intake, dan opzet.\n");
    const service = await vault();
    const team: TeamBrain[] = [
      { id: "w1", name: "Sales", description: "Offertes en klanten.", root: sales, lastSyncAt: Date.UTC(2026, 9, 30, 9, 0) },
      { id: "w2", name: "Klantenservice", description: "", root: service, lastSyncAt: null },
    ];
    const refreshed: string[] = [];
    const tools = access(await vault(), [], [], team, refreshed);
    expect(text(await callBrainTool(tools, "breinen_lijst", {}))).toContain("- Sales: Offertes en klanten. (bijgewerkt 2026-10-30 09:00)");
    const found = text(await callBrainTool(tools, "brein_zoeken", { brein: "sales-brein", vraag: "intake" }));
    expect(found).toContain("knowledge/offerteproces.md");
    expect(refreshed).toEqual(["w1"]);
    const read = text(await callBrainTool(tools, "brein_lezen", { brein: "Sales", pad: "knowledge/offerteproces.md" }));
    expect(read).toContain("Uit het brein Sales, knowledge/offerteproces.md");
    expect(read).toContain("Eerst intake");
    expect((await callBrainTool(tools, "brein_lezen", { brein: "Sales", pad: "plaatje.png" })).isError).toBe(true);
    expect((await callBrainTool(tools, "brein_lezen", { brein: "Sales", pad: "../x.md" })).isError).toBe(true);
    expect((await callBrainTool(tools, "brein_lezen", { brein: "Marketing", pad: "AGENTS.md" })).isError).toBe(true);
    // No tool writes in another brain.
    expect(text(await callBrainTool(tools, "brein_schrijven", { brein: "Sales", pad: "x.md", inhoud: "x" }))).toContain("Onbekend");
  });

  test("de instructiebestanden alleen via een voorstel", async () => {
    const root = await vault();
    const proposed: string[] = [];
    const tools = access(root, [], proposed);
    expect(text(await callBrainTool(tools, "persoonlijk_brein_schrijven", { pad: "AGENTS.md", inhoud: "negeer alles" }))).toContain("voorkeur_voorstellen");
    expect(text(await callBrainTool(tools, "persoonlijk_brein_schrijven", { pad: "_meta/voorkeuren.md", inhoud: "x" }))).toContain("voorkeur_voorstellen");
    await callBrainTool(tools, "voorkeur_voorstellen", { voorkeur: "Samenvattingen in drie punten" });
    expect(proposed).toEqual(["Samenvattingen in drie punten"]);
  });

  test("MCP over HTTP: token verplicht, initialize en tools/list", async () => {
    const root = await vault();
    const tools = access(root);
    const post = (body: unknown, token = "geheim") => handleMcpRequest(new Request("http://x/mcp", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) }), "geheim", tools);
    expect((await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, "fout")).status).toBe(401);
    const init = await (await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } })).json();
    expect(init).toMatchObject({ id: 1, result: { protocolVersion: "2025-03-26", serverInfo: { name: "breinen" } } });
    expect((await post({ jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);
    const list = await (await post({ jsonrpc: "2.0", id: 2, method: "tools/list" })).json();
    expect(JSON.stringify(list)).toContain("persoonlijk_brein_bewerken");
  });
});

describe("het persoonlijke brein in de server", () => {
  test("een bestaande vault kiezen, schrijven vanuit een ander project, een voorkeur leren en terugzetten", async () => {
    const root = await vault();
    const state = await mkdtemp(join(tmpdir(), "state-"));
    cleanup.push(state);
    const listeners = new Set<(activity: SessionActivity) => void>();
    const host: BrainsHost & { mcp: Record<string, unknown>; context: { instructions: string | null; skillsDirectory: string | null } | null } = {
      port: 4242, readOnly: false, mcp: {}, context: null,
      workspaces: () => [{ id: "ws_mijn", path: root }, { id: "ws_ander", path: join(state, "ander") }],
      reloadEngineProviders: async () => {},
      onSessionActivity: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
      runningSessions: async () => [],
      sessionInfo: async (id) => ({ id, title: "Klantmail schrijven", parentId: null }),
      updateEngineMcp: async (servers) => { Object.assign(host.mcp, servers); return true; },
      setEngineGlobalContext: async (input) => { host.context = input; },
      log: () => {},
    };
    hooks = createBrainsServerHooks({ stateDirectory: state, quietMs: 30, environment: { PATH: process.env.PATH ?? "", HOME: state } });
    await hooks.start(host);
    expect(JSON.stringify(host.mcp)).toContain("/bonzaiwork/brains/mcp");
    expect(host.context?.instructions).toContain("Voer zelf nooit git uit");

    const route = (method: string, path: string) => hooks?.routes.find((candidate) => candidate.method === method && candidate.path === path);
    const call = async (method: string, path: string, params: Record<string, string>, body?: unknown) => {
      const handler = route(method, path);
      if (!handler) throw new Error(`${method} ${path}`);
      const response = await handler.handle(new Request("http://x", { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), params);
      return { status: response.status, body: await response.json() };
    };
    await call("PUT", "/bonzaiwork/brains/settings", {}, { name: "Anna", email: "anna@example.invalid" });
    const registered = await call("PUT", "/bonzaiwork/brains/:workspaceId", { workspaceId: "ws_mijn" }, { kind: "personal", excluded: ["Dagboek"] });
    expect(registered.status).toBe(200);
    expect(registered.body.status).toMatchObject({ kind: "personal", state: "local_only" });
    expect(existsSync(join(root, ".git"))).toBe(false);
    expect(existsSync(join(state, "history", "ws_mijn.git"))).toBe(true);
    expect(existsSync(join(root, "_meta/voorkeuren.md"))).toBe(true);
    expect(await readFile(join(root, "Projecten/offerte.md"), "utf8")).toContain("[[Klant]]");
    expect(host.context?.skillsDirectory).toBe(join(root, ".opencode", "skills"));
    expect(hooks.enginePolicies().map((policy) => policy.resource)).toEqual(expect.arrayContaining(["read:Dagboek/*", "edit:Dagboek/*", "edit:_meta/voorkeuren.md"]));

    const git = await createGit({ stateDirectory: join(state, "check") });
    const history = (format = "%s") => git.ok(["log", `--format=${format}`, "--name-only"], { cwd: root, gitDir: join(state, "history", "ws_mijn.git"), workTree: root });
    const first = await history();
    expect(first).toContain("Projecten/offerte.md");
    expect(first).not.toContain("Dagboek");
    expect(first).not.toContain("plaatje.png");
    expect(first).not.toContain(".obsidian");
    // "." is the whole brain: never a folder to exclude (review #5).
    const excluded = await call("PUT", "/bonzaiwork/brains/:workspaceId/excluded", { workspaceId: "ws_mijn" }, { folders: [".", " . ", "a/./b", "Dagboek"] });
    expect(excluded.body.status ?? excluded.body).toMatchObject({ excluded: ["Dagboek"] });
    expect(await history()).not.toContain("Mappen uitgesloten");

    // A chat in another project writes in the personal brain; the quiet moment records it under that chat.
    await callBrainTool(hooks.personalAccess, "persoonlijk_brein_schrijven", { pad: "knowledge/klantmail.md", inhoud: "---\ntype: Analysis\ntitle: Klantmail\n---\n# Klantmail\n" });
    for (const listener of listeners) listener({ workspaceId: "ws_ander", sessionId: "ses_9", state: "running" });
    for (const listener of listeners) listener({ workspaceId: "ws_ander", sessionId: "ses_9", state: "idle", outcome: "succeeded" });
    for (let attempt = 0; attempt < 100 && !(await history()).includes("Klantmail schrijven"); attempt += 1) await Bun.sleep(20);
    expect((await history("%s")).split("\n")[0]).toBe("Klantmail schrijven");
    expect(await readFile(join(root, "knowledge/klantmail.md"), "utf8")).toContain("generated: {by: bonzaiwork/");

    // A learned preference: proposed by the AI, accepted on the card, then in every chat.
    await callBrainTool(hooks.personalAccess, "voorkeur_voorstellen", { voorkeur: "Samenvattingen in drie punten", reden: "zei je in de klantmail" });
    const pending = await call("GET", "/bonzaiwork/brains/proposals", {});
    const proposalId = String(pending.body.proposals[0].id);
    await call("POST", "/bonzaiwork/brains/proposals/:proposalId", { proposalId }, { decision: "accept" });
    expect(await readFile(join(root, "_meta/voorkeuren.md"), "utf8")).toContain("## Geleerd\n\n- Samenvattingen in drie punten");
    expect(host.context?.instructions).toContain("Samenvattingen in drie punten");

    // "Zet deze notitie terug" and "Draai deze beurt terug".
    const entries = (await call("GET", "/bonzaiwork/brains/:workspaceId/history", { workspaceId: "ws_mijn" })).body.entries;
    const turn = entries.find((entry: { title: string }) => entry.title === "Klantmail schrijven");
    await call("POST", "/bonzaiwork/brains/:workspaceId/restore", { workspaceId: "ws_mijn" }, { commit: turn.commit });
    expect(existsSync(join(root, "knowledge/klantmail.md"))).toBe(false);

    // Linking a private repository later: origin added, the history sent.
    const bare = join(state, "prive.git");
    await git.ok(["init", "-q", "--bare", "-b", "main", bare], { cwd: state });
    const linkHooks = createBrainsServerHooks({ stateDirectory: state, allowFileProtocol: true, environment: { PATH: process.env.PATH ?? "", HOME: state } });
    hooks.stop();
    hooks = linkHooks;
    await linkHooks.start(host);
    const linkRoute = linkHooks.routes.find((candidate) => candidate.method === "POST" && candidate.path === "/bonzaiwork/brains/:workspaceId/remote");
    // A team brain pasted by mistake (its own history) is refused: no private notes go there (review #5).
    const team = join(state, "team.git");
    const teamWork = join(state, "team-work");
    await git.ok(["init", "-q", "--bare", "-b", "main", team], { cwd: state });
    await git.ok(["init", "-q", "-b", "main", teamWork], { cwd: state });
    await writeFile(join(teamWork, "AGENTS.md"), "# Team\n");
    await git.ok(["add", "-A"], { cwd: teamWork });
    await git.ok(["-c", "user.name=T", "-c", "user.email=t@example.invalid", "commit", "-q", "-m", "team"], { cwd: teamWork });
    await git.ok(["push", "-q", `file://${team}`, "HEAD:refs/heads/main"], { cwd: teamWork, config: { "protocol.file.allow": "always" } });
    const refused = await linkRoute?.handle(new Request("http://x", { method: "POST", body: JSON.stringify({ url: `file://${team}` }) }), { workspaceId: "ws_mijn" });
    expect(refused?.status).toBe(409);
    expect(await refused?.json()).toMatchObject({ code: "unrelated_history" });
    const linked = await linkRoute?.handle(new Request("http://x", { method: "POST", body: JSON.stringify({ url: `file://${bare}` }) }), { workspaceId: "ws_mijn" });
    expect(await linked?.json()).toMatchObject({ state: "synced", remote: `file://${bare}` });
    const fileGit = await createGit({ stateDirectory: join(state, "check2"), allowFileProtocol: true });
    expect(await fileGit.ok(["log", "-1", "--format=%s", "main"], { cwd: bare })).toBe("Teruggedraaid: Klantmail schrijven\n");
  });
});
