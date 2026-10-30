import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

import { createGit, type Git } from "./git.ts";
import { remoteProblemMessage } from "./messages.ts";
import { BrainRegistry } from "./registry.ts";
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

export type BrainsHost = {
  readOnly: boolean;
  workspaces(): Array<{ id: string; path: string }>;
  reloadEngineProviders(): Promise<void>;
  onSessionActivity(listener: (activity: SessionActivity) => void): () => void;
  runningSessions(workspaceId: string): Promise<string[] | null>;
  sessionInfo(sessionId: string): Promise<{ id: string; title: string | null; parentId: string | null } | null>;
  log: Log;
};

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
const MODES: readonly BrainMode[] = ["auto", "manual", "read_only"];
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
  let stopActivity: (() => void) | null = null;
  let reconcileTimer: ReturnType<typeof setInterval> | null = null;

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
    return new BrainSync({ git, record, author, save: (next) => registry.upsert(next), log, platform });
  }

  function enginePolicies(): EnginePolicy[] {
    const mcp = [...new Set([...syncs.values()].flatMap((sync) => sync.untrustedMcpServers))].sort();
    return [...BASE_ENGINE_POLICIES, ...mcp.map((name): EnginePolicy => ({ action: "integration.use", resource: `mcp:${name}`, effect: "deny" }))];
  }

  /** Writes the engine config again when the policies changed (untrusted MCPs come and go). */
  async function refreshPolicies(): Promise<void> {
    const signature = JSON.stringify(enginePolicies());
    if (signature === policySignature || !host) return;
    policySignature = signature;
    await host.reloadEngineProviders().catch((error: unknown) => log("warn", "Engine policies not reloaded", { error: String(error) }));
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
    const sync = syncs.get(activity.workspaceId);
    if (!sync) return;
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
    if (!sync || !chatId) return;
    // The engine may know of a run the event stream missed.
    const busy = await host?.runningSessions(workspaceId);
    if (busy && busy.length > 0) return;
    try {
      await sync.finishTurn({ title: await chatTitle(chatId), chatId });
      await refreshPolicies();
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
      const record: BrainRecord = { ...job.sync.snapshot, id: workspaceId, kind, mode };
      await registry.upsert(record);
      jobs.delete(jobId);
      sync = await activate(record, workspace.path);
    } else if (!sync) {
      return failure(400, "invalid_body", "Send the jobId of a clone.");
    } else if (sync.snapshot.mode !== mode) {
      await sync.setMode(mode);
    }
    const status = trusted.length ? await sync.trust(trusted) : await sync.status();
    await refreshPolicies();
    return json({ workspaceId, status });
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
    if (!sync) return notABrain();
    const body = (await readBody(request)) ?? {};
    const sessionId = text(body, "sessionId");
    const others = (await host?.runningSessions(workspaceId))?.filter((id) => id !== sessionId) ?? [];
    // Never update while another chat in this project runs (plan §4.2); fetching is fine.
    const work = others.length ? sync.fetchOnly() : sync.prepareTurn();
    const timeout = new Promise<null>((resolve) => setTimeout(resolve, prepareTimeoutMs, null));
    const status = await Promise.race([work, timeout]);
    void work.then(() => refreshPolicies()).catch(() => undefined);
    return json({ status: status ?? await sync.status(), waited: status === null ? "timeout" : others.length ? "fetched" : "updated" });
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

  const routes: BrainsRoute[] = ([
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
        if (body?.strategy !== "keep-mine-apart") return failure(400, "unsupported_strategy", "Only keep-mine-apart is available.");
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
  ] satisfies BrainsRoute[]).map((route) => ({ ...route, handle: whenStarted(route.handle) }));

  return {
    routes,
    enginePolicies,
    async start(next: BrainsHost) {
      host = next;
      try {
        git = await createGit({
          gitDirectory, stateDirectory: join(stateDirectory, "git"), environment, platform,
          sshCommand: sshCommand(sshOptions), allowFileProtocol,
        });
        await ensureKnownHosts(sshOptions.knownHostsFile);
        await registry.load();
        await reconcile();
        stopActivity = next.onSessionActivity(onActivity);
        reconcileTimer = setInterval(() => { void reconcile().catch(() => undefined); }, 10_000);
        reconcileTimer.unref?.();
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
      for (const timer of quietTimers.values()) clearTimeout(timer);
      for (const sync of syncs.values()) sync.dispose();
    },
  };
}

export type BrainsServerHooks = ReturnType<typeof createBrainsServerHooks>;
