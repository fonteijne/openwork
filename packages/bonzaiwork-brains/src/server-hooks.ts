import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";

import { createGit, type Git } from "./git.ts";
import { handleMcpRequest, type PersonalAccess, type TeamBrain } from "./mcp.ts";
import { composeInstructions, isCloudFolder, PREFERENCES_FILE } from "./personal.ts";
import { answerBrainReads } from "./answers.ts";
import { applyTemplate } from "./template.ts";
import { listWorkflows, modelCheckPrompt, newRun, recordCheck, startStage } from "./workflows.ts";
import { remoteProblemMessage } from "./messages.ts";
import { BrainRegistry } from "./registry.ts";
import { createProposalService, type ProposalService } from "./proposals.ts";
import { parseRemote } from "./remote.ts";
import { checkConnection, ensureKnownHosts, scanHostKeys, sshCommand, trustHostKeys, type SshOptions } from "./ssh.ts";
import { BrainCloneError, BrainSync, type Author, type BrainKind, type BrainMode, type BrainRecord, type BrainStatus } from "./sync.ts";

/**
 * openwork-server hooks for brains (plan §3, §8.1). The types mirror
 * apps/server/src/downstream-hooks.ts structurally, so this package never
 * imports server internals.
 */
type Log = (level: "info" | "warn" | "error", message: string, fields?: Record<string, unknown>) => void;

export type SessionActivity = { workspaceId: string; sessionId: string; state: "running" | "idle"; outcome?: "succeeded" | "failed" | "interrupted" };
export type EnginePolicy = { action: "provider.use" | "tool.use" | "integration.use"; resource: string; effect: "allow" | "deny" };
/**
 * Reading another brain asks first (plan §5.2, N2). The engine names the action
 * `<server>_<tool>`; the resource is always `*`, so the UI reads the brain from
 * the tool call (fase 0 §4.3).
 */
export type EnginePermission = { action: string; resource: string; effect: "allow" | "deny" | "ask" };
export const ENGINE_PERMISSIONS: readonly EnginePermission[] = [
  { action: "breinen_brein_zoeken", resource: "*", effect: "ask" },
  { action: "breinen_brein_lezen", resource: "*", effect: "ask" },
];

export type BrainsHost = {
  port: number;
  readOnly: boolean;
  workspaces(): Array<{ id: string; path: string }>;
  reloadEngineProviders(): Promise<void>;
  onSessionActivity(listener: (activity: SessionActivity) => void): () => void;
  runningSessions(workspaceId: string): Promise<string[] | null>;
  sessionInfo(sessionId: string): Promise<{ id: string; title: string | null; parentId: string | null } | null>;
  updateEngineMcp(servers: Record<string, Record<string, unknown> | null>): Promise<boolean>;
  setEngineGlobalContext(input: { instructions: string | null; skillsDirectory: string | null }): Promise<void>;
  /** OPENCODE_CONFIG_DIR: the global instructions; closed to the ordinary tools like a brain. */
  engineConfigDirectory?: string;
  /** A call to a workspace's engine through the server's own proxy (downstream-hooks.ts). */
  engineRequest?(workspaceId: string, method: string, path: string, body?: unknown): Promise<{ status: number; body: unknown }>;
  log: Log;
};

/** A preference the AI proposed with voorkeur_voorstellen; the user decides on a card (plan §7.3). */
export type PreferenceProposal = { id: string; preference: string; reason: string | null; at: number };

export type BrainsRoute = {
  method: string;
  path: string;
  auth: "none" | "client" | "host-token";
  handle(request: Request, params: Record<string, string>): Promise<Response>;
};

export type BrainsHooksOptions = {
  /** userData/bonzaiwork; BONZAIWORK_STATE_DIR, else ~/.bonzaiwork (headless). */
  stateDirectory?: string;
  /** The shipped dugite-native folder; BONZAIWORK_GIT_DIRECTORY, else git from PATH. */
  gitDirectory?: string;
  environment?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  /** Quiet time after the last chat in a project stops, before sharing (plan §4.3). */
  quietMs?: number;
  /** How long a turn waits for the update before it goes on (plan §2). */
  prepareTimeoutMs?: number;
  proposals?: ProposalService;
  /** How often running chats of projects with "zonder vragen" brains are checked for questions. */
  readsEveryMs?: number;
  /** How often a pending rebuild of the engine folders checks whether all chats are quiet. */
  folderReloadEveryMs?: number;
  /** How often quiet brains look for the team's changes, so the pill can say so (fase 2). */
  fetchEveryMs?: number;
  /** Tests only. */
  allowFileProtocol?: boolean;
  ssh?: Partial<SshOptions>;
};

/** Plan §7.4, laag 1: the AI runs no git and writes nothing in .git (fase 0 §6.4). */
export const BASE_ENGINE_POLICIES: readonly EnginePolicy[] = [
  { action: "tool.use", resource: "shell:git *", effect: "deny" },
  { action: "tool.use", resource: "edit:.git/*", effect: "deny" },
  { action: "tool.use", resource: "edit:*/.git/*", effect: "deny" },
];

const BODY_LIMIT = 64 * 1024;
const MODES: readonly BrainMode[] = ["auto", "manual", "read_only", "proposal"];
const KINDS: readonly BrainKind[] = ["project", "personal"];

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

function failure(status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response {
  return json({ code, message, ...extra }, status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length > BODY_LIMIT) return null;
  if (!text) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const text = (body: Record<string, unknown>, key: string): string | null => typeof body[key] === "string" ? String(body[key]).trim() : null;

/** Name and e-mail from the user's own git config, as a suggestion (plan §4.1, step 6). */
function suggestedAuthor(environment: NodeJS.ProcessEnv): Author | null {
  const read = (key: string) => {
    const result = spawnSync("git", ["config", "--global", "--get", key], { env: environment, encoding: "utf8", timeout: 3_000, windowsHide: true });
    return result.status === 0 ? result.stdout.trim() : "";
  };
  const name = read("user.name");
  const email = read("user.email");
  return name && email ? { name, email } : null;
}

type Job = { state: "running" | "done" | "failed"; path: string; error: string | null; problem: string | null; sync: BrainSync | null; status: BrainStatus | null };

export function createBrainsServerHooks(options: BrainsHooksOptions = {}) {
  const environment = options.environment ?? process.env;
  const platform = options.platform ?? process.platform;
  const stateDirectory = options.stateDirectory ?? environment.BONZAIWORK_STATE_DIR?.trim() ?? join(homedir(), ".bonzaiwork");
  const gitDirectory = options.gitDirectory ?? (environment.BONZAIWORK_GIT_DIRECTORY?.trim() || undefined);
  // The two BONZAIWORK_TEST_* variables exist for e2e/brains.e2e.ts; a packaged build never sets them.
  const quietMs = options.quietMs ?? (Number(environment.BONZAIWORK_TEST_QUIET_MS) || 15_000);
  const allowFileProtocol = options.allowFileProtocol ?? environment.BONZAIWORK_TEST_FILE_REMOTES === "1";
  const prepareTimeoutMs = options.prepareTimeoutMs ?? 5_000;
  const sshOptions: SshOptions = { knownHostsFile: join(stateDirectory, "known_hosts"), platform, environment, ...options.ssh };
  const registry = new BrainRegistry(join(stateDirectory, "brains.json"));

  let host: BrainsHost | null = null;
  let git: Git | null = null;
  const syncs = new Map<string, BrainSync>();
  const jobs = new Map<string, Job>();
  const running = new Map<string, Set<string>>();
  const lastChat = new Map<string, string>();
  const quietTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let policySignature = "";
  /** The closed folders the open engine folders were built with; null until the first write. */
  let appliedFolders: string | null = null;
  let folderReloadTimer: ReturnType<typeof setInterval> | null = null;
  let readsTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * A folder the engine has open keeps the policies it was built with. When the closed folders
   * change (a brain added or removed), the loaded folders are rebuilt with
   * `/api/location/reload`, but only when no chat runs: the rebuild cancels open questions.
   */
  async function reloadFoldersWhenQuiet(): Promise<void> {
    if (!host?.engineRequest || appliedFolders === JSON.stringify(closedFolders())) return;
    const workspaces = host.workspaces();
    for (const workspace of workspaces) {
      const running = await host.runningSessions(workspace.id);
      if (running === null || running.length) return;
    }
    const target = workspaces[0];
    if (!target) return;
    const wanted = JSON.stringify(closedFolders());
    const reloaded = await host.engineRequest(target.id, "POST", "/api/location/reload").catch(() => null);
    if (reloaded && reloaded.status < 300) {
      appliedFolders = wanted;
      log("info", "engine folders rebuilt for the closed brain folders", {});
    }
  }
  let stopActivity: (() => void) | null = null;
  let reconcileTimer: ReturnType<typeof setInterval> | null = null;
  let fetchTimer: ReturnType<typeof setInterval> | null = null;
  const fetchEveryMs = options.fetchEveryMs ?? 10 * 60_000;
  // "Via voorstel": GitLab through push options, GitHub through the user's own gh (plan §4.4).
  const proposalService = options.proposals ?? createProposalService({ environment, platform });

  /** Periodic fetch: only looks, never changes the folder; a brain with a running chat waits. */
  async function fetchQuietBrains(): Promise<void> {
    for (const [id, sync] of syncs) {
      if (!sync.snapshot.remote || (await host?.runningSessions(id))?.length) continue;
      await sync.fetchOnly().catch((error: unknown) => log("warn", "periodic brain fetch failed", { brain: id, error: String(error) }));
    }
  }
  const mcpToken = `bwb_${randomBytes(32).toString("base64url")}`;
  let personalDirty = false;
  let globalContext = "";
  let personalWarning: string | null = null;
  const proposalsFile = join(stateDirectory, "proposals.json");
  let proposals: PreferenceProposal[] = [];

  let markStarted = () => {};
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  const whenStarted = (handle: BrainsRoute["handle"]): BrainsRoute["handle"] => async (request, params) => {
    const ready = await Promise.race([started.then(() => true), new Promise<false>((resolve) => setTimeout(resolve, 30_000, false))]);
    return ready && git ? handle(request, params) : failure(503, "starting", "BonzaiWork is still starting.");
  };
  const log: Log = (level, message, fields) => host?.log(level, message, fields);

  const author = (): Author => registry.author ?? suggestedAuthor(environment) ?? { name: "BonzaiWork", email: "bonzaiwork@localhost" };

  function syncFor(record: BrainRecord): BrainSync {
    if (!git) throw new Error("brains not started");
    return new BrainSync({ git, record, author, save: (next) => registry.upsert(next), log, platform, proposals: proposalService });
  }

  const personal = (): BrainSync | undefined => [...syncs.values()].find((sync) => sync.snapshot.kind === "personal");

  /**
   * Other brains only through the brains MCP (plan §5.2, fase 0 §6.6): without a rule the AI reads
   * and writes any folder outside its project with read/write/edit. Every brain folder, the personal
   * brain and the engine's config folder get a deny with the absolute path; inside a folder the
   * engine uses relative paths, so the chats in that brain itself are not touched. A guard rail:
   * grep with the path and the shell still get past.
   */
  function closedFolders(): string[] {
    const folders = [...[...syncs.values()].map((sync) => sync.snapshot.path), ...(host?.engineConfigDirectory ? [host.engineConfigDirectory] : [])];
    return [...new Set(folders.flatMap((folder) => {
      const clean = folder.replace(/[*?]/g, "").replace(/[\\/]+$/, "");
      // Windows paths can reach the engine with either separator.
      return clean.includes("\\") ? [`${clean}\\*`, `${clean.replace(/\\/g, "/")}/*`] : [`${clean}/*`];
    }))].sort();
  }

  function enginePolicies(): EnginePolicy[] {
    const mcp = [...new Set([...syncs.values()].flatMap((sync) => sync.untrustedMcpServers))].sort();
    // Excluded folders and the preferences file (plan §5.1.1, §7.3). Paths are relative to the
    // project folder and count in every project (fase 0 §6.4); grep and bash still get past.
    const own = personal();
    const folders = own ? own.snapshot.excluded : [];
    const escape = (path: string) => path.replace(/[*?]/g, "");
    return [
      ...BASE_ENGINE_POLICIES,
      ...(own ? [{ action: "tool.use", resource: `edit:${PREFERENCES_FILE}`, effect: "deny" } satisfies EnginePolicy] : []),
      ...closedFolders().flatMap((folder): EnginePolicy[] => [
        { action: "tool.use", resource: `read:${folder}`, effect: "deny" },
        { action: "tool.use", resource: `edit:${folder}`, effect: "deny" },
      ]),
      ...folders.flatMap((folder): EnginePolicy[] => [
        { action: "tool.use", resource: `read:${escape(folder)}/*`, effect: "deny" },
        { action: "tool.use", resource: `edit:${escape(folder)}/*`, effect: "deny" },
      ]),
      ...mcp.map((name): EnginePolicy => ({ action: "integration.use", resource: `mcp:${name}`, effect: "deny" })),
    ];
  }

  /**
   * Instructions and skills in every chat (plan §5.1; fase 0 §5): app rules
   * plus the personal AGENTS.md and preferences, and the personal skills.
   * Returns whether the engine got something new.
   */
  async function refreshGlobalContext(): Promise<boolean> {
    if (!host) return false;
    const own = personal();
    const root = own?.snapshot.path ?? null;
    const instructions = await composeInstructions(root);
    personalWarning = instructions.truncated ? "Je persoonlijke instructies zijn groter dan 32 KiB en worden ingekort meegestuurd. Maak ze korter." : null;
    const skills = root && (await stat(join(root, ".opencode", "skills")).catch(() => null))?.isDirectory() ? join(root, ".opencode", "skills") : null;
    const signature = JSON.stringify([instructions.text, skills]);
    if (signature === globalContext) return false;
    await host.setEngineGlobalContext({ instructions: instructions.text, skillsDirectory: skills });
    globalContext = signature;
    return true;
  }

  async function saveProposals(): Promise<void> {
    await mkdir(dirname(proposalsFile), { recursive: true });
    const temporary = `${proposalsFile}.tmp-${randomBytes(6).toString("hex")}`;
    await writeFile(temporary, `${JSON.stringify(proposals, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, proposalsFile);
  }

  async function loadProposals(): Promise<void> {
    const raw = await readFile(proposalsFile, "utf8").catch(() => "[]");
    try {
      const parsed: unknown = JSON.parse(raw);
      proposals = Array.isArray(parsed) ? parsed.flatMap((item: unknown): PreferenceProposal[] => {
        if (typeof item !== "object" || item === null) return [];
        const id: unknown = Reflect.get(item, "id");
        const preference: unknown = Reflect.get(item, "preference");
        const reason: unknown = Reflect.get(item, "reason");
        const at: unknown = Reflect.get(item, "at");
        return typeof id === "string" && typeof preference === "string"
          ? [{ id, preference, reason: typeof reason === "string" ? reason : null, at: typeof at === "number" ? at : Date.now() }] : [];
      }) : [];
    } catch {
      proposals = [];
    }
  }

  /** Name and first paragraph from a brain's AGENTS.md (the template writes both). */
  async function describeBrain(sync: BrainSync): Promise<TeamBrain> {
    const { id, path, lastSyncAt } = sync.snapshot;
    const agents = await readFile(join(path, "AGENTS.md"), "utf8").catch(() => "");
    const title = /^#\s+(.+)$/m.exec(agents)?.[1]?.trim();
    const description = agents.replace(/^#\s+.+$/m, "").trim().split(/\n\s*\n/)[0]?.replace(/\s+/g, " ").trim() ?? "";
    const folder = path.split(/[\\/]/).filter(Boolean).at(-1) ?? id;
    return { id, name: title && !title.includes("{{") ? title : folder, description: description.startsWith("#") || description.startsWith("|") ? "" : description.slice(0, 300), root: path, lastSyncAt };
  }

  const access: PersonalAccess = {
    teamBrains: () => Promise.all([...syncs.values()].filter((sync) => sync.snapshot.kind === "project").map(describeBrain)),
    refresh: async (id) => {
      const sync = syncs.get(id);
      if (!sync || (await host?.runningSessions(id))?.length) return;
      await Promise.race([sync.prepareTurn(), new Promise((resolve) => setTimeout(resolve, 3_000))]);
    },
    root: () => personal()?.snapshot.path ?? null,
    excluded: () => personal()?.snapshot.excluded ?? [],
    wrote: () => { personalDirty = true; },
    propose: async (preference, reason) => {
      const proposal = { id: `pref_${randomBytes(6).toString("hex")}`, preference, reason, at: Date.now() };
      proposals = [...proposals, proposal];
      await saveProposals();
      return proposal.id;
    },
  };

  /** Accepted: the preference goes into _meta/voorkeuren.md and counts from the next turn. */
  async function decide(id: string, decision: "accept" | "reject", edited: string | null): Promise<Response> {
    const proposal = proposals.find((item) => item.id === id);
    if (!proposal) return failure(404, "proposal_not_found", "Proposal not found.");
    proposals = proposals.filter((item) => item.id !== id);
    await saveProposals();
    const own = personal();
    if (decision === "accept" && own) {
      const file = join(own.snapshot.path, PREFERENCES_FILE);
      const current = await readFile(file, "utf8").catch(() => "# Mijn voorkeuren\n");
      const line = `- ${(edited ?? proposal.preference).replace(/\s+/g, " ").trim()}`;
      const next = /^## Geleerd\s*$/m.test(current)
        ? current.replace(/^## Geleerd\s*$/m, (heading) => `${heading}\n\n${line}`).replace(/\n\n\n+/g, "\n\n")
        : `${current.trimEnd()}\n\n## Geleerd\n\n${line}\n`;
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, next);
      await own.share();
      await refreshGlobalContext();
    }
    return json({ ok: true, proposals });
  }

  /** Writes the engine config again when the policies changed (untrusted MCPs come and go). */
  async function refreshPolicies(): Promise<void> {
    const signature = JSON.stringify(enginePolicies());
    if (signature === policySignature || !host) return;
    policySignature = signature;
    await host.reloadEngineProviders().catch((error: unknown) => log("warn", "Engine policies not reloaded", { error: String(error) }));
    // The first write is what every folder opens with; later changes need a rebuild of open ones.
    if (appliedFolders === null) appliedFolders = JSON.stringify(closedFolders());
    else void reloadFoldersWhenQuiet();
  }

  async function activate(record: BrainRecord, path: string): Promise<BrainSync> {
    const sync = syncFor({ ...record, path });
    syncs.set(record.id, sync);
    await sync.open().catch((error: unknown) => log("warn", "Brain could not be opened", { brain: record.id, error: String(error) }));
    return sync;
  }

  /** Brains follow their workspace: one that is gone stops, one that (re)appears starts. */
  async function reconcile(): Promise<void> {
    if (!host) return;
    const workspaces = new Map(host.workspaces().map((workspace) => [workspace.id, workspace.path]));
    for (const [id, sync] of syncs) {
      if (!workspaces.has(id)) { sync.dispose(); syncs.delete(id); }
    }
    for (const record of registry.brains) {
      const path = workspaces.get(record.id);
      if (path && !syncs.has(record.id)) await activate(record, path);
    }
    await refreshPolicies();
  }

  // --- the Stop hook (plan §3.3) ---------------------------------------------

  async function chatTitle(sessionId: string): Promise<string> {
    const info = await host?.sessionInfo(sessionId);
    if (info?.parentId) return chatTitle(info.parentId);
    return info?.title ?? "Chat";
  }

  function onActivity(activity: SessionActivity): void {
    // Every project counts: a chat anywhere may write in the personal brain.
    if (!syncs.has(activity.workspaceId) && !personal() && !registry.reads(activity.workspaceId).length) return;
    const set = running.get(activity.workspaceId) ?? new Set<string>();
    running.set(activity.workspaceId, set);
    const timer = quietTimers.get(activity.workspaceId);
    if (timer) { clearTimeout(timer); quietTimers.delete(activity.workspaceId); }
    if (activity.state === "running") {
      set.add(activity.sessionId);
      return;
    }
    set.delete(activity.sessionId);
    lastChat.set(activity.workspaceId, activity.sessionId);
    if (set.size > 0) return;
    const quiet = setTimeout(() => {
      quietTimers.delete(activity.workspaceId);
      void finish(activity.workspaceId);
    }, quietMs);
    quiet.unref?.();
    quietTimers.set(activity.workspaceId, quiet);
  }

  async function finish(workspaceId: string): Promise<void> {
    const sync = syncs.get(workspaceId);
    const chatId = lastChat.get(workspaceId);
    if (!chatId) return;
    // The engine may know of a run the event stream missed.
    const busy = await host?.runningSessions(workspaceId);
    if (busy && busy.length > 0) return;
    const title = await chatTitle(chatId);
    try {
      if (sync) await sync.finishTurn({ title, chatId });
      // What a chat elsewhere wrote in the personal brain is recorded under that chat too.
      const own = personal();
      if (own && own !== sync && personalDirty) {
        personalDirty = false;
        await own.finishTurn({ title, chatId });
      }
      if (sync?.snapshot.kind === "personal") personalDirty = false;
      await refreshPolicies();
      await refreshGlobalContext();
    } catch (error) {
      log("error", "Brain could not record a turn", { brain: workspaceId, error: String(error) });
    }
  }

  // --- routes ----------------------------------------------------------------

  const known = (workspaceId: string) => syncs.get(workspaceId);
  const notABrain = () => failure(404, "brain_not_found", "This project is not a brain.");

  async function checkRemote(request: Request): Promise<Response> {
    const body = await readBody(request);
    const url = body ? text(body, "url") : null;
    const parsed = parseRemote(url ?? "");
    if (!parsed.ok) return failure(400, `link_${parsed.reason}`, "This is not a repository link.");
    if (!git) return failure(503, "starting", "BonzaiWork is still starting.");
    const check = await checkConnection(git, parsed.link, { ...sshOptions, cwd: stateDirectory });
    if (check.ok) return json({ ok: true, sshUrl: parsed.link.sshUrl, name: parsed.link.name, defaultBranch: check.defaultBranch, empty: check.empty });
    log("info", "Brain connection check failed", { problem: check.problem, detail: check.detail });
    return json({
      ok: false, sshUrl: parsed.link.sshUrl, name: parsed.link.name, problem: check.problem, message: remoteProblemMessage(check.problem, platform),
      ...(check.host ? { host: { name: parsed.link.host, port: parsed.link.port, fingerprints: check.host.fingerprints } } : {}),
    });
  }

  /** Stores a host key only if a fresh scan shows the fingerprints the user confirmed. */
  async function trustHost(request: Request): Promise<Response> {
    const body = await readBody(request);
    const url = body ? text(body, "url") : null;
    const confirmed = body && Array.isArray(body.fingerprints) ? body.fingerprints.filter((value): value is string => typeof value === "string") : [];
    const parsed = parseRemote(url ?? "");
    if (!parsed.ok || confirmed.length === 0) return failure(400, "invalid_body", "Send the link and the fingerprints that were shown.");
    const scan = await scanHostKeys(parsed.link, sshOptions);
    if (!scan || scan.fingerprints.join("\n") !== confirmed.join("\n")) {
      return failure(409, "host_key_mismatch", "The server now shows a different key than the one confirmed.");
    }
    await trustHostKeys(sshOptions.knownHostsFile, scan.lines);
    return json({ ok: true });
  }

  async function clone(request: Request): Promise<Response> {
    if (host?.readOnly) return failure(403, "read_only", "This device is read-only.");
    const body = await readBody(request);
    const url = body ? text(body, "url") : null;
    const folderPath = body ? text(body, "folderPath") : null;
    const local = allowFileProtocol && url?.startsWith("file://") ? url : null;
    const parsed = parseRemote(url ?? "");
    if (!local && !parsed.ok) return failure(400, `link_${parsed.ok ? "invalid" : parsed.reason}`, "This is not a repository link.");
    if (!folderPath || !isAbsolute(folderPath)) return failure(400, "invalid_folder", "Choose a folder.");
    const remote = local ?? (parsed.ok ? parsed.link.sshUrl : "");
    const id = `job_${randomBytes(8).toString("hex")}`;
    const job: Job = { state: "running", path: folderPath, error: null, problem: null, sync: null, status: null };
    jobs.set(id, job);
    void (async () => {
      try {
        if (!git) throw new Error("not started");
        const sync = await BrainSync.clone({ git, id, kind: "project", mode: "auto", remote, path: folderPath, author, save: async () => {}, log, platform });
        job.sync = sync;
        job.status = await sync.open();
        job.state = "done";
      } catch (error) {
        job.state = "failed";
        job.problem = error instanceof BrainCloneError ? error.problem : "unknown";
        job.error = error instanceof BrainCloneError ? error.message : remoteProblemMessage("unknown", platform);
      }
    })();
    return json({ jobId: id, sshUrl: remote }, 202);
  }

  function jobView(id: string, job: Job) {
    return { jobId: id, state: job.state, path: job.path, error: job.error, problem: job.problem, status: job.status };
  }

  async function register(request: Request, workspaceId: string): Promise<Response> {
    if (host?.readOnly) return failure(403, "read_only", "This device is read-only.");
    const body = await readBody(request);
    if (!body) return failure(400, "invalid_body", "Expected a JSON object.");
    const workspace = host?.workspaces().find((candidate) => candidate.id === workspaceId);
    if (!workspace) return failure(404, "workspace_not_found", "Workspace not found.");
    const mode = MODES.find((candidate) => candidate === body.mode) ?? "auto";
    const kind = KINDS.find((candidate) => candidate === body.kind) ?? "project";
    const trusted = Array.isArray(body.trusted) ? body.trusted.filter((value): value is string => typeof value === "string") : [];
    const jobId = text(body, "jobId");
    let sync = known(workspaceId);
    if (jobId) {
      const job = jobs.get(jobId);
      if (!job || job.state !== "done" || !job.sync) return failure(409, "clone_not_ready", "The brain is not cloned yet.");
      if (job.path !== workspace.path) return failure(409, "folder_mismatch", "The workspace is not the cloned folder.");
      sync?.dispose();
      job.sync.dispose();
      if (kind === "personal" && personal()) return failure(409, "personal_exists", "There is a personal brain already.");
      const record: BrainRecord = { ...job.sync.snapshot, id: workspaceId, kind, mode };
      await registry.upsert(record);
      jobs.delete(jobId);
      sync = await activate(record, workspace.path);
    } else if (!sync && kind === "personal") {
      if (personal()) return failure(409, "personal_exists", "There is a personal brain already.");
      if (!git) return failure(503, "starting", "BonzaiWork is still starting.");
      const excluded = Array.isArray(body.excluded) ? body.excluded.filter((value): value is string => typeof value === "string") : [];
      const created = await BrainSync.initLocal({
        git, id: workspaceId, path: workspace.path, gitDir: join(stateDirectory, "history", `${workspaceId}.git`), excluded,
        author, save: (next) => registry.upsert(next), log, platform,
      });
      await applyTemplate(workspace.path, { kind: "personal", name: text(body, "name") || "Mijn brein", description: "", now: new Date() });
      await registry.upsert(created.snapshot);
      created.dispose();
      sync = await activate(created.snapshot, workspace.path);
      await sync.share();
      await refreshGlobalContext();
    } else if (!sync) {
      return failure(400, "invalid_body", "Send the jobId of a clone, or kind personal.");
    } else if (sync.snapshot.mode !== mode) {
      await sync.setMode(mode);
    }
    const status = trusted.length ? await sync.trust(trusted) : await sync.status();
    await refreshPolicies();
    if (kind === "personal") await refreshGlobalContext();
    return json({ workspaceId, status });
  }

  /** What a project that is not a brain yet can become (projectinstellingen → Brein). */
  async function candidate(workspaceId: string): Promise<Response> {
    const workspace = host?.workspaces().find((entry) => entry.id === workspaceId);
    if (!workspace || !git) return failure(404, "workspace_not_found", "Workspace not found.");
    const base = { cwd: workspace.path };
    const inside = await git.run(["rev-parse", "--git-dir"], base);
    if (inside.exitCode !== 0 || inside.stdout.trim() !== ".git") return json({ repository: null });
    const remote = (await git.run(["remote", "get-url", "origin"], base)).stdout.trim() || null;
    const branch = (await git.run(["symbolic-ref", "--short", "-q", "HEAD"], base)).stdout.trim() || null;
    return json({ repository: { remote, branch, ssh: remote !== null && /^(git@|ssh:\/\/)/.test(remote) } });
  }

  /** "Als brein synchroniseren" and "Deel als nieuw brein" (plan §4.1, fase 2). */
  async function become(request: Request, workspaceId: string, how: "adopt" | "publish"): Promise<Response> {
    if (host?.readOnly) return failure(403, "read_only", "This device is read-only.");
    const workspace = host?.workspaces().find((entry) => entry.id === workspaceId);
    if (!workspace) return failure(404, "workspace_not_found", "Workspace not found.");
    if (known(workspaceId)) return failure(409, "already_brain", "This project is a brain already.");
    if (!git) return failure(503, "starting", "BonzaiWork is still starting.");
    const body = (await readBody(request)) ?? {};
    const options = { git, id: workspaceId, path: workspace.path, author, save: (next: BrainRecord) => registry.upsert(next), log, platform };
    let made: BrainSync;
    try {
      if (how === "adopt") {
        made = await BrainSync.adopt({ ...options, mode: MODES.find((candidate) => candidate === body.mode) ?? "auto", allowFileProtocol });
      } else {
        const parsed = parseRemote(text(body, "url") ?? "");
        const local = allowFileProtocol && text(body, "url")?.startsWith("file://") ? text(body, "url") : null;
        if (!local && !parsed.ok) return failure(400, "link_invalid", "This is not a repository link.");
        made = await BrainSync.publish({ ...options, remote: local ?? (parsed.ok ? parsed.link.sshUrl : "") });
      }
    } catch (error) {
      if (error instanceof BrainCloneError) return failure(409, error.problem, error.message);
      throw error;
    }
    await registry.upsert(made.snapshot);
    made.dispose();
    const sync = await activate(made.snapshot, workspace.path);
    const status = how === "publish"
      ? await sync.firstShare({ name: text(body, "name") || workspace.path.split(/[\\/]/).filter(Boolean).at(-1) || "Brein", description: text(body, "description") ?? "" })
      : await sync.prepareTurn();
    await refreshPolicies();
    return json({ workspaceId, status });
  }

  /** Workflows run in any project folder that has them (plan §6.5); status comes from disk. */
  async function workflows(request: Request, params: Record<string, string>, action: "list" | "run" | "start" | "check"): Promise<Response> {
    const workspace = host?.workspaces().find((entry) => entry.id === params.workspaceId);
    if (!workspace) return failure(404, "workspace_not_found", "Workspace not found.");
    const root = workspace.path;
    const name = params.name ?? "";
    const stage = params.stage ?? "";
    if (action === "list") return json({ workflows: await listWorkflows(root) });
    if (host?.readOnly) return failure(403, "read_only", "This device is read-only.");
    const body = (await readBody(request)) ?? {};
    if (action === "run") {
      const run = await newRun(root, name, text(body, "subject") ?? "", new Date());
      return json({ run, workflows: await listWorkflows(root) });
    }
    if (action === "start") {
      const started = await startStage(root, name, stage);
      if (!started.ok) return json({ code: started.reason, message: started.reason === "missing_input" ? `Deze invoer ontbreekt of is leeg: ${started.missing.join(", ")}` : "Deze stap kan nog niet starten.", missing: started.missing }, 409);
      return json(started);
    }
    if (body.model === true) {
      const prompt = await modelCheckPrompt(root, name, stage);
      return prompt ? json({ prompt, title: `Controle: ${stage.replace(/^\d{2}_/, "")}` }) : failure(404, "stage_not_found", "Stage not found.");
    }
    const verdict = body.verdict === "pass" || body.verdict === "fail" ? body.verdict : null;
    if (!verdict) return failure(400, "invalid_verdict", "Send verdict pass or fail.");
    const checked = await recordCheck(root, name, stage, { verdict, reason: text(body, "reason") ?? null, by: author().name, at: new Date() });
    return checked ? json({ stage: checked }) : failure(404, "stage_not_found", "Stage not found.");
  }

  /** "Breinen die dit project zonder vragen mag raadplegen" (plan §5.2, §8.2). */
  async function reads(request: Request, workspaceId: string): Promise<Response> {
    if (!host?.workspaces().some((entry) => entry.id === workspaceId)) return failure(404, "workspace_not_found", "Workspace not found.");
    if (request.method === "PUT") {
      if (host.readOnly) return failure(403, "read_only", "This device is read-only.");
      const body = await readBody(request);
      const brains = Array.isArray(body?.brains) ? body.brains.filter((entry): entry is string => typeof entry === "string") : null;
      if (!brains) return failure(400, "invalid_body", "Send brains: workspace ids.");
      await registry.setReads(workspaceId, brains.filter((id) => syncs.get(id)?.snapshot.kind === "project"));
    }
    return json({ brains: registry.reads(workspaceId) });
  }

  /** Answers brain-read questions in running chats of projects that may consult those brains. */
  async function answerProjectReads(): Promise<void> {
    if (!host?.engineRequest) return;
    for (const [workspaceId, allowed] of Object.entries(registry.allReads)) {
      for (const sessionId of running.get(workspaceId) ?? []) {
        await answerBrainReads({ request: host.engineRequest, workspaceId, sessionId, allowed, brains: access.teamBrains, log: (message, fields) => log("info", message, fields) })
          .catch((error: unknown) => log("warn", "brain read question not answered", { error: String(error) }));
      }
    }
  }

  async function unregister(workspaceId: string): Promise<Response> {
    const sync = known(workspaceId);
    sync?.dispose();
    syncs.delete(workspaceId);
    await registry.remove(workspaceId);
    await refreshPolicies();
    return json({ ok: true });
  }

  async function list(): Promise<Response> {
    const brains = await Promise.all([...syncs.entries()].map(async ([workspaceId, sync]) => ({ workspaceId, path: sync.snapshot.path, status: await sync.status() })));
    return json({ brains });
  }

  /** UserPromptSubmit (plan §2): waits at most ~5 s, then the turn goes on. */
  async function pull(request: Request, workspaceId: string): Promise<Response> {
    const sync = known(workspaceId);
    const own = personal();
    if (!sync && !own) return notABrain();
    const body = (await readBody(request)) ?? {};
    const sessionId = text(body, "sessionId");
    const others = (await host?.runningSessions(workspaceId))?.filter((id) => id !== sessionId) ?? [];
    // Never update while another chat in this project runs (plan §4.2); fetching is fine.
    const work = sync ? (others.length ? sync.fetchOnly() : sync.prepareTurn()) : Promise.resolve(null);
    const personalWork = own && own !== sync ? own.prepareTurn() : Promise.resolve(null);
    const both = Promise.all([work, personalWork]);
    const timeout = new Promise<null>((resolve) => setTimeout(resolve, prepareTimeoutMs, null));
    const done = await Promise.race([both, timeout]);
    void both.then(() => refreshPolicies()).catch(() => undefined);
    // Also when updating failed or took too long: the local version of the preferences counts (plan §5.1).
    if (await refreshGlobalContext()) await new Promise((resolve) => setTimeout(resolve, 500));
    return json({
      status: sync ? (done?.[0] ?? await sync.status()) : null,
      personal: own ? (own === sync ? null : done?.[1] ?? await own.status()) : null,
      warning: personalWarning,
      waited: done === null ? "timeout" : others.length ? "fetched" : "updated",
    });
  }

  async function act(workspaceId: string, run: (sync: BrainSync) => Promise<unknown>): Promise<Response> {
    const sync = known(workspaceId);
    if (!sync) return notABrain();
    const result = await run(sync);
    await refreshPolicies();
    return json(result);
  }

  async function settings(request: Request): Promise<Response> {
    if (request.method === "PUT") {
      const body = await readBody(request);
      const name = body ? text(body, "name") : null;
      const email = body ? text(body, "email") : null;
      if (!name || !email || !/^[^\s@]+@[^\s@]+$/.test(email)) return failure(400, "invalid_author", "Fill in a name and an e-mail address.");
      await registry.setAuthor({ name, email });
    }
    return json({ author: registry.author, suggested: registry.author ? null : suggestedAuthor(environment) });
  }

  const mcpRoutes = ["POST", "GET", "DELETE"].map((method): BrainsRoute => ({
    method, path: "/bonzaiwork/brains/mcp", auth: "none", handle: (request) => handleMcpRequest(request, mcpToken, access),
  }));

  const routes: BrainsRoute[] = ([
    { method: "GET", path: "/bonzaiwork/brains/proposals", auth: "client", handle: async () => json({ proposals }) },
    {
      method: "POST", path: "/bonzaiwork/brains/proposals/:proposalId", auth: "client",
      handle: async (request, params) => {
        const body = (await readBody(request)) ?? {};
        const decision = body.decision === "accept" ? "accept" : body.decision === "reject" ? "reject" : null;
        if (!decision) return failure(400, "invalid_decision", "Send accept or reject.");
        return decide(params.proposalId, decision, text(body, "text") || null);
      },
    },
    { method: "POST", path: "/bonzaiwork/brains/check-remote", auth: "host-token", handle: (request) => checkRemote(request) },
    { method: "POST", path: "/bonzaiwork/brains/trust-host", auth: "host-token", handle: (request) => trustHost(request) },
    { method: "POST", path: "/bonzaiwork/brains/clone", auth: "host-token", handle: (request) => clone(request) },
    {
      method: "GET", path: "/bonzaiwork/brains/jobs/:jobId", auth: "host-token",
      handle: async (_request, params) => {
        const job = jobs.get(params.jobId);
        return job ? json(jobView(params.jobId, job)) : failure(404, "job_not_found", "Job not found.");
      },
    },
    { method: "GET", path: "/bonzaiwork/brains/settings", auth: "client", handle: (request) => settings(request) },
    { method: "PUT", path: "/bonzaiwork/brains/settings", auth: "host-token", handle: (request) => settings(request) },
    { method: "GET", path: "/bonzaiwork/brains", auth: "client", handle: () => list() },
    { method: "PUT", path: "/bonzaiwork/brains/:workspaceId", auth: "host-token", handle: (request, params) => register(request, params.workspaceId) },
    { method: "DELETE", path: "/bonzaiwork/brains/:workspaceId", auth: "host-token", handle: (_request, params) => unregister(params.workspaceId) },
    { method: "GET", path: "/bonzaiwork/brains/:workspaceId/status", auth: "client", handle: (_request, params) => act(params.workspaceId, (sync) => sync.status()) },
    { method: "POST", path: "/bonzaiwork/brains/:workspaceId/pull", auth: "client", handle: (request, params) => pull(request, params.workspaceId) },
    { method: "POST", path: "/bonzaiwork/brains/:workspaceId/sync", auth: "client", handle: (_request, params) => act(params.workspaceId, (sync) => sync.share()) },
    { method: "GET", path: "/bonzaiwork/brains/:workspaceId/history", auth: "client", handle: (_request, params) => act(params.workspaceId, async (sync) => ({ entries: await sync.history() })) },
    {
      method: "POST", path: "/bonzaiwork/brains/:workspaceId/resolve", auth: "client",
      handle: async (request, params) => {
        const body = await readBody(request);
        // "ai": both versions go into the notes; the app starts a chat with `prompt` (plan §4.5).
        if (body?.strategy === "ai") return act(params.workspaceId, (sync) => sync.startAiMerge());
        if (body?.strategy !== "keep-mine-apart") return failure(400, "unsupported_strategy", "Use keep-mine-apart or ai.");
        return act(params.workspaceId, (sync) => sync.keepMineApart());
      },
    },
    {
      method: "POST", path: "/bonzaiwork/brains/:workspaceId/trust", auth: "host-token",
      handle: async (request, params) => {
        const body = await readBody(request);
        const paths = body && Array.isArray(body.paths) ? body.paths.filter((value): value is string => typeof value === "string") : [];
        return act(params.workspaceId, (sync) => sync.trust(paths));
      },
    },
    { method: "POST", path: "/bonzaiwork/brains/:workspaceId/repair", auth: "host-token", handle: (_request, params) => act(params.workspaceId, (sync) => sync.repair()) },
    {
      method: "PUT", path: "/bonzaiwork/brains/:workspaceId/excluded", auth: "host-token",
      handle: async (request, params) => {
        const body = (await readBody(request)) ?? {};
        const folders = Array.isArray(body.folders) ? body.folders.filter((value): value is string => typeof value === "string") : [];
        return act(params.workspaceId, (sync) => sync.setExcluded(folders));
      },
    },
    {
      method: "POST", path: "/bonzaiwork/brains/:workspaceId/remote", auth: "host-token",
      handle: async (request, params) => {
        const sync = known(params.workspaceId);
        if (!sync) return notABrain();
        if (isCloudFolder(sync.snapshot.path)) return failure(409, "cloud_folder", "This folder is synced by a cloud service already.");
        const body = (await readBody(request)) ?? {};
        const parsed = parseRemote(text(body, "url") ?? "");
        const local = allowFileProtocol && text(body, "url")?.startsWith("file://") ? text(body, "url") : null;
        if (!local && !parsed.ok) return failure(400, "link_invalid", "This is not a repository link.");
        return act(params.workspaceId, (brain) => brain.attachRemote(local ?? (parsed.ok ? parsed.link.sshUrl : "")));
      },
    },
    {
      method: "POST", path: "/bonzaiwork/brains/:workspaceId/restore", auth: "client",
      handle: async (request, params) => {
        const body = (await readBody(request)) ?? {};
        const commit = text(body, "commit") ?? "";
        const path = text(body, "path");
        return act(params.workspaceId, async (sync) => {
          const status = path ? await sync.restoreFile(commit, path) : await sync.revertCommit(commit);
          await refreshGlobalContext();
          return status;
        });
      },
    },
    {
      method: "GET", path: "/bonzaiwork/brains/:workspaceId/workflows", auth: "client",
      handle: (request, params) => workflows(request, params, "list"),
    },
    { method: "POST", path: "/bonzaiwork/brains/:workspaceId/workflows/:name/runs", auth: "client", handle: (request, params) => workflows(request, params, "run") },
    { method: "POST", path: "/bonzaiwork/brains/:workspaceId/workflows/:name/stages/:stage/start", auth: "client", handle: (request, params) => workflows(request, params, "start") },
    { method: "POST", path: "/bonzaiwork/brains/:workspaceId/workflows/:name/stages/:stage/check", auth: "client", handle: (request, params) => workflows(request, params, "check") },
    {
      method: "GET", path: "/bonzaiwork/brains/:workspaceId/reads", auth: "client",
      handle: (request, params) => reads(request, params.workspaceId),
    },
    { method: "PUT", path: "/bonzaiwork/brains/:workspaceId/reads", auth: "host-token", handle: (request, params) => reads(request, params.workspaceId) },
    {
      method: "GET", path: "/bonzaiwork/brains/:workspaceId/candidate", auth: "host-token",
      handle: (_request, params) => candidate(params.workspaceId),
    },
    { method: "POST", path: "/bonzaiwork/brains/:workspaceId/adopt", auth: "host-token", handle: (request, params) => become(request, params.workspaceId, "adopt") },
    { method: "POST", path: "/bonzaiwork/brains/:workspaceId/publish", auth: "host-token", handle: (request, params) => become(request, params.workspaceId, "publish") },
    {
      method: "POST", path: "/bonzaiwork/brains/:workspaceId/setup", auth: "host-token",
      handle: async (request, params) => {
        const body = (await readBody(request)) ?? {};
        return act(params.workspaceId, (sync) => sync.setUp({ name: text(body, "name") ?? "", description: text(body, "description") ?? "" }));
      },
    },
    {
      method: "GET", path: "/bonzaiwork/brains/:workspaceId/concept", auth: "client",
      handle: async (request, params) => {
        const path = new URL(request.url).searchParams.get("path") ?? "";
        return act(params.workspaceId, async (sync) => ({ concept: await sync.concept(path) }));
      },
    },
    {
      method: "POST", path: "/bonzaiwork/brains/:workspaceId/verify", auth: "client",
      handle: async (request, params) => {
        const body = (await readBody(request)) ?? {};
        return act(params.workspaceId, (sync) => sync.verify(text(body, "path") ?? ""));
      },
    },
  ] satisfies BrainsRoute[]).map((route) => ({ ...route, handle: whenStarted(route.handle) }));
  // The MCP routes first: `/bonzaiwork/brains/mcp` must never match `/bonzaiwork/brains/:workspaceId`.
  routes.unshift(...mcpRoutes.map((route) => ({ ...route, handle: whenStarted(route.handle) })));

  return {
    routes,
    enginePolicies,
    enginePermissions: () => ENGINE_PERMISSIONS,
    /** Routines: answer a run's brain-read questions for the brains it names. */
    answerBrainReads: async (workspaceId: string, sessionId: string, allowed: readonly string[]) => {
      if (!host?.engineRequest) return 0;
      return answerBrainReads({ request: host.engineRequest, workspaceId, sessionId, allowed, brains: access.teamBrains, log: (message, fields) => log("info", message, fields) });
    },
    /** Tests: the tools without the engine. */
    personalAccess: access,
    async start(next: BrainsHost) {
      host = next;
      try {
        git = await createGit({
          gitDirectory, stateDirectory: join(stateDirectory, "git"), environment, platform,
          sshCommand: sshCommand(sshOptions), allowFileProtocol,
        });
        await ensureKnownHosts(sshOptions.knownHostsFile);
        await registry.load();
        await loadProposals();
        await reconcile();
        await refreshGlobalContext();
        // The engine reaches the brain tools in every project through this one entry (plan §5.2).
        await next.updateEngineMcp({
          breinen: { type: "remote", url: `http://127.0.0.1:${next.port}/bonzaiwork/brains/mcp`, headers: { authorization: `Bearer ${mcpToken}` }, codemode: false },
        });
        stopActivity = next.onSessionActivity(onActivity);
        reconcileTimer = setInterval(() => { void reconcile().catch(() => undefined); }, 10_000);
        reconcileTimer.unref?.();
        readsTimer = setInterval(() => { void answerProjectReads(); }, options.readsEveryMs ?? 1_500);
        readsTimer.unref?.();
        folderReloadTimer = setInterval(() => { void reloadFoldersWhenQuiet().catch(() => undefined); }, options.folderReloadEveryMs ?? 5_000);
        folderReloadTimer.unref?.();
        fetchTimer = setInterval(() => { void fetchQuietBrains(); }, fetchEveryMs);
        fetchTimer.unref?.();
      } catch (error) {
        next.log("error", "Brains failed to start", { error: error instanceof Error ? error.message : String(error) });
      } finally {
        markStarted();
      }
    },
    /** Tests: stop timers and streams. */
    stop() {
      stopActivity?.();
      if (reconcileTimer) clearInterval(reconcileTimer);
      if (fetchTimer) clearInterval(fetchTimer);
      if (folderReloadTimer) clearInterval(folderReloadTimer);
      if (readsTimer) clearInterval(readsTimer);
      for (const timer of quietTimers.values()) clearTimeout(timer);
      for (const sync of syncs.values()) sync.dispose();
    },
  };
}

export type BrainsServerHooks = ReturnType<typeof createBrainsServerHooks>;
