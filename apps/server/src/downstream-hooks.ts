import { createHash, randomBytes } from "node:crypto";
import { lstat, mkdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { isAbsolute, join } from "node:path";

import { addRoute, type AuthMode, type Route } from "./routes/registry.js";
import { mergeRuntimeProviderUpdate, runtimeStorageDir, writeGlobalRuntimeOpencodeConfig } from "./runtime-opencode-config-store.js";
import { createV2SessionHomes } from "./opencode-v2-session-home.js";
import { externalFetch, loopbackFetch } from "./server-fetch.js";
import type { ServerConfig } from "./types.js";

/**
 * Extension point for distributions built on openwork-server.
 *
 * `OPENWORK_SERVER_HOOKS` names an ES module (file URL or absolute path)
 * whose default export returns {@link DownstreamServerHooks}. Without that
 * variable the server behaves exactly as before. The module receives no
 * server internals: only the narrow {@link DownstreamServerHost} below.
 */
export type DownstreamRouteAuth = Extract<AuthMode, "none" | "client" | "host-token">;

export type DownstreamRoute = {
  method: string;
  /** Path pattern; `:name` segments become params, `*` matches the rest of the path. */
  path: string;
  auth: DownstreamRouteAuth;
  handle(request: Request, params: Record<string, string>): Promise<Response>;
};

export type DownstreamProviderUpdate = {
  /** Provider entries to write into the engine-global runtime config; null removes one. */
  providers: Record<string, Record<string, unknown> | null>;
  /** Provider ids the engine must hide, replacing the previous list when given. */
  disabledProviders?: string[];
};

/** A turn starting or ending in a workspace (engine `session.execution.*`). */
export type DownstreamSessionActivity = {
  workspaceId: string;
  sessionId: string;
  state: "running" | "idle";
  outcome?: "succeeded" | "failed" | "interrupted";
};

export type DownstreamEnginePermission = { action: string; resource: string; effect: "allow" | "ask" | "deny" };

export type DownstreamEnginePolicy = {
  action: "provider.use" | "tool.use" | "integration.use";
  resource: string;
  effect: "allow" | "deny";
};

export type DownstreamServerHost = {
  /** The port the server actually bound. */
  port: number;
  readOnly: boolean;
  workspaces(): Array<{ id: string; path: string }>;
  /** The workspace an engine conversation belongs to (engine requests carry `x-opencode-session`). */
  workspaceForSession(sessionId: string): Promise<string | null>;
  updateEngineProviders(update: DownstreamProviderUpdate): Promise<boolean>;
  /** Pushes the current runtime config to the running engine (or defers until it runs). */
  reloadEngineProviders(): Promise<void>;
  /** Proxy-aware fetch for traffic that leaves this machine. */
  externalFetch(input: string, init?: RequestInit): Promise<Response>;
  /** Follows turns in every local workspace; returns an unsubscribe. */
  onSessionActivity(listener: (activity: DownstreamSessionActivity) => void): () => void;
  /** Conversations running in a workspace now, or null when the engine cannot say. */
  runningSessions(workspaceId: string): Promise<string[] | null>;
  /** Title and parent of an engine conversation, or null when unknown. */
  sessionInfo(sessionId: string): Promise<{ id: string; title: string | null; parentId: string | null } | null>;
  /** MCP entries in the engine-global runtime config (null removes one); every workspace gets them. */
  updateEngineMcp(servers: Record<string, Record<string, unknown> | null>): Promise<boolean>;
  /**
   * Instructions and a skills folder that count in every conversation of
   * every workspace, sub-tasks included: `AGENTS.md` and `skills/` in the
   * engine's own config folder, which the engine watches.
   */
  setEngineGlobalContext(input: { instructions: string | null; skillsDirectory: string | null }): Promise<void>;
  log(level: "info" | "warn" | "error", message: string, fields?: Record<string, unknown>): void;
};

export type DownstreamServerHooks = {
  /** When set, only these providers reach the engine, whatever an organization or project configures. */
  allowedProviderIds?: readonly string[];
  routes?: readonly DownstreamRoute[];
  /** Extra engine policies, read on every engine config write; `reloadEngineProviders()` causes one. */
  enginePolicies?(): readonly DownstreamEnginePolicy[];
  /** Extra engine permission rules (`allow`/`ask`/`deny` per tool action), written with the same config. */
  enginePermissions?(): readonly DownstreamEnginePermission[];
  start?(host: DownstreamServerHost): Promise<void>;
};

let active: DownstreamServerHooks | null = null;

export function downstreamServerHooks(): DownstreamServerHooks | null {
  return active;
}

/** Replaces the active hooks; tests and in-process hosts use this instead of the environment variable. */
export function setDownstreamServerHooks(hooks: DownstreamServerHooks | null): void {
  active = hooks;
}

/** The provider allowlist downstream hooks impose, or null when they impose none. */
export function downstreamProviderGate(): ((providerId: string) => boolean) | null {
  const allowed = active?.allowedProviderIds;
  if (!allowed) return null;
  return (providerId) => allowed.includes(providerId);
}

/**
 * Engine policies (`experimental.policies`) for the provider allowlist. The
 * mirror gate only covers providers OpenWork pushes; these also stop
 * providers the engine discovers itself, such as one a project's
 * opencode.json adds. The engine applies the last matching policy and reads
 * this global config after project config, so a project cannot re-allow one.
 */
export function downstreamEnginePolicies(): Array<{ action: string; resource: string; effect: "allow" | "deny" }> {
  const allowed = active?.allowedProviderIds;
  const extra = active?.enginePolicies?.() ?? [];
  return [
    ...(allowed ? [
      { action: "provider.use", resource: "*", effect: "deny" as const },
      ...allowed.map((id) => ({ action: "provider.use", resource: id, effect: "allow" as const })),
    ] : []),
    ...extra.filter((policy) => policy.action !== "provider.use").map((policy) => ({ ...policy })),
  ];
}

/**
 * Engine permission rules from the hooks. They go first: the engine applies
 * the last matching rule, so OpenWork's own rules (agent permissions, the
 * managed execution denials) still win.
 */
export function downstreamEnginePermissions(): DownstreamEnginePermission[] {
  return (active?.enginePermissions?.() ?? []).map((rule) => ({ ...rule }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHooksFactory(value: unknown): value is () => unknown {
  return typeof value === "function";
}

function isDownstreamRoute(value: unknown): value is DownstreamRoute {
  return isRecord(value) && typeof value.method === "string" && typeof value.path === "string"
    && (value.auth === "none" || value.auth === "client" || value.auth === "host-token")
    && typeof value.handle === "function";
}

function isDownstreamServerHooks(value: unknown): value is DownstreamServerHooks {
  if (!isRecord(value)) return false;
  const { allowedProviderIds, routes, start, enginePolicies, enginePermissions } = value;
  return (allowedProviderIds === undefined || (Array.isArray(allowedProviderIds) && allowedProviderIds.every((id) => typeof id === "string")))
    && (routes === undefined || (Array.isArray(routes) && routes.every(isDownstreamRoute)))
    && (enginePolicies === undefined || typeof enginePolicies === "function")
    && (enginePermissions === undefined || typeof enginePermissions === "function")
    && (start === undefined || typeof start === "function");
}

export async function loadDownstreamServerHooks(environment: NodeJS.ProcessEnv = process.env): Promise<DownstreamServerHooks | null> {
  const specifier = environment.OPENWORK_SERVER_HOOKS?.trim();
  if (!specifier) return active;
  const url = isAbsolute(specifier) ? pathToFileURL(specifier).href : specifier;
  const mod: unknown = await import(url);
  const factory = isRecord(mod) ? mod.default : undefined;
  if (!isHooksFactory(factory)) throw new Error("OPENWORK_SERVER_HOOKS must default-export a function returning server hooks.");
  const hooks: unknown = await factory();
  if (!isDownstreamServerHooks(hooks)) throw new Error("OPENWORK_SERVER_HOOKS returned an invalid hooks object.");
  active = hooks;
  return active;
}

/** Registers the active hooks' routes ahead of the built-in ones. */
export function addDownstreamRoutes(routes: Route[]): void {
  for (const route of active?.routes ?? []) {
    const wildcard = route.path.endsWith("/*");
    addRoute(routes, route.method, wildcard ? route.path.slice(0, -2) : route.path, route.auth, (ctx) =>
      route.handle(ctx.request, ctx.params));
    if (wildcard) {
      const registered = routes[routes.length - 1];
      // Same params, plus the remaining path as `*`.
      registered.regex = new RegExp(`${registered.regex.source.slice(0, -1)}/(.+)$`);
      registered.keys = [...registered.keys, "*"];
    }
  }
}

export type DownstreamStartInput = {
  config: ServerConfig;
  port: number;
  engine: { connection(): { url: string; password: string } | undefined; refreshProviders(): Promise<unknown> };
  markReloadPending(): void;
  logger: { log(level: "info" | "warn" | "error", message: string, attributes?: Record<string, unknown>): void };
};

/**
 * The engine's own config folder (OPENCODE_CONFIG_DIR), as managed-opencode-v2.ts
 * lays it out: `<runtime>/opencode-v2/state[/instances/<id>]/config`. The id is
 * engine-v2-preview.ts's engineInstanceId(), repeated here because that module
 * imports this one; test/downstream-hooks.test.ts keeps the two equal.
 */
export function engineConfigDirectory(config: Pick<ServerConfig, "configPath">, environment: NodeJS.ProcessEnv = process.env): string {
  const key = environment.OPENWORK_SERVER_STATE_PATH?.trim() || environment.OPENWORK_ELECTRON_APP_IDENTIFIER?.trim();
  const instance = key ? createHash("sha256").update(key).digest("hex").slice(0, 12) : null;
  return join(runtimeStorageDir(config), "opencode-v2", "state", ...(instance ? ["instances", instance] : []), "config");
}

type EngineConnection = { url: string; password: string };

function engineAuthorization(connection: EngineConnection): string {
  return `Basic ${Buffer.from(`opencode:${connection.password}`).toString("base64")}`;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * One event stream per local workspace (`/api/event`), reconnecting after an
 * engine restart and following workspaces as they come and go.
 */
function createSessionActivityFeed(
  workspaces: () => Array<{ id: string; path: string }>,
  connection: () => EngineConnection | undefined,
  log: DownstreamServerHost["log"],
) {
  const listeners = new Set<(activity: DownstreamSessionActivity) => void>();
  const streams = new Map<string, AbortController>();
  let timer: ReturnType<typeof setInterval> | undefined;

  const emit = (activity: DownstreamSessionActivity) => {
    for (const listener of listeners) {
      try { listener(activity); } catch (error) {
        log("warn", "Session activity listener failed", { error: error instanceof Error ? error.message : String(error) });
      }
    }
  };

  async function follow(workspace: { id: string; path: string }, abort: AbortController): Promise<void> {
    while (!abort.signal.aborted) {
      const engine = connection();
      if (engine) {
        try {
          const url = new URL("/api/event", engine.url);
          url.searchParams.set("location[directory]", workspace.path);
          const response = await loopbackFetch(url.toString(), { headers: { authorization: engineAuthorization(engine), accept: "text/event-stream" }, signal: abort.signal });
          if (response.ok && response.body) {
            const decoder = new TextDecoder();
            let buffer = "";
            for await (const chunk of response.body) {
              buffer += decoder.decode(chunk, { stream: true });
              for (let end = buffer.indexOf("\n\n"); end >= 0; end = buffer.indexOf("\n\n")) {
                const data = buffer.slice(0, end).split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5)).join("\n");
                buffer = buffer.slice(end + 2);
                if (!data) continue;
                let event: unknown;
                try { event = JSON.parse(data); } catch { continue; }
                if (!isRecordValue(event) || typeof event.type !== "string" || !event.type.startsWith("session.execution.")) continue;
                const sessionId = isRecordValue(event.data) && typeof event.data.sessionID === "string" ? event.data.sessionID : null;
                if (!sessionId) continue;
                const kind = event.type.slice("session.execution.".length);
                if (kind === "started") emit({ workspaceId: workspace.id, sessionId, state: "running" });
                else if (kind === "succeeded" || kind === "failed" || kind === "interrupted") {
                  emit({ workspaceId: workspace.id, sessionId, state: "idle", outcome: kind });
                }
              }
            }
          }
        } catch { /* engine restarting or stream closed */ }
      }
      if (!abort.signal.aborted) await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }

  function reconcile(): void {
    const wanted = new Map(workspaces().map((workspace) => [workspace.id, workspace]));
    for (const [id, abort] of streams) {
      if (!wanted.has(id)) { abort.abort(); streams.delete(id); }
    }
    for (const [id, workspace] of wanted) {
      if (streams.has(id)) continue;
      const abort = new AbortController();
      streams.set(id, abort);
      void follow(workspace, abort);
    }
  }

  return (listener: (activity: DownstreamSessionActivity) => void) => {
    listeners.add(listener);
    if (!timer) {
      reconcile();
      timer = setInterval(reconcile, 5_000);
      timer.unref?.();
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && timer) {
        clearInterval(timer);
        timer = undefined;
        for (const abort of streams.values()) abort.abort();
        streams.clear();
      }
    };
  };
}

async function writeFileAtomic(path: string, content: string): Promise<void> {
  const temporary = `${path}.tmp-${randomBytes(6).toString("hex")}`;
  await writeFile(temporary, content, { mode: 0o600 });
  await rename(temporary, path);
}

/** Starts the active hooks once the listener is bound. A failing hook is logged, never fatal. */
export async function startDownstreamServerHooks(input: DownstreamStartInput): Promise<void> {
  const start = active?.start;
  if (!start) return;
  const { config, engine, logger } = input;
  const log: DownstreamServerHost["log"] = (level, message, fields) => logger.log(level, message, fields);
  const localWorkspaces = () => config.workspaces
    .filter((workspace) => workspace.workspaceType === "local")
    .map((workspace) => ({ id: workspace.id, path: workspace.path }));
  const readEngine = async (path: string): Promise<unknown> => {
    const connection = engine.connection();
    if (!connection) throw new Error("The engine is not running");
    const response = await loopbackFetch(new URL(path, connection.url).toString(), { headers: { authorization: engineAuthorization(connection) }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Engine returned HTTP ${response.status}`);
    return response.json();
  };
  const host: DownstreamServerHost = {
    port: input.port,
    readOnly: config.readOnly,
    workspaces: () => config.workspaces.map((workspace) => ({ id: workspace.id, path: workspace.path })),
    workspaceForSession: async (sessionId) => {
      const connection = engine.connection();
      if (!connection || !sessionId.startsWith("ses_")) return null;
      const authorization = `Basic ${Buffer.from(`opencode:${connection.password}`).toString("base64")}`;
      const readNative = async (path: string): Promise<unknown> => {
        const response = await loopbackFetch(new URL(path, connection.url).toString(), { headers: { authorization }, signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error(`Engine returned HTTP ${response.status}`);
        return response.json();
      };
      try {
        const homes = createV2SessionHomes(config, readNative);
        const home = await homes.resolve(await readNative(`/api/session/${encodeURIComponent(sessionId)}`));
        if (!home) return null;
        for (const workspace of config.workspaces) {
          if (await homes.canonical(workspace.path) === home) return workspace.id;
        }
      } catch { /* unknown conversation: no workspace */ }
      return null;
    },
    updateEngineProviders: async (update) => {
      let changed = false;
      await writeGlobalRuntimeOpencodeConfig(config, (current) => {
        const provider = mergeRuntimeProviderUpdate(current.provider, update.providers);
        const disabled = update.disabledProviders ?? current.disabled_providers;
        changed = JSON.stringify(provider) !== JSON.stringify(current.provider)
          || JSON.stringify(disabled) !== JSON.stringify(current.disabled_providers);
        return changed ? { ...current, provider, disabled_providers: disabled } : current;
      });
      return changed;
    },
    reloadEngineProviders: async () => {
      if (engine.connection()) {
        try {
          await engine.refreshProviders();
          return;
        } catch { /* deferred below */ }
      }
      input.markReloadPending();
    },
    externalFetch,
    log,
    onSessionActivity: createSessionActivityFeed(localWorkspaces, () => engine.connection(), log),
    runningSessions: async (workspaceId) => {
      const workspace = localWorkspaces().find((candidate) => candidate.id === workspaceId);
      if (!workspace) return null;
      try {
        const payload = await readEngine(`/api/session/active?${new URLSearchParams({ "location[directory]": workspace.path })}`);
        const data = isRecordValue(payload) && isRecordValue(payload.data) ? payload.data : null;
        if (!data) return null;
        return Object.entries(data)
          .filter(([, status]) => isRecordValue(status) && ["running", "busy", "retry"].includes(String(status.type)))
          .map(([id]) => id);
      } catch {
        return null;
      }
    },
    sessionInfo: async (sessionId) => {
      if (!sessionId.startsWith("ses_")) return null;
      try {
        const payload = await readEngine(`/api/session/${encodeURIComponent(sessionId)}`);
        const session = isRecordValue(payload) && isRecordValue(payload.data) ? payload.data : payload;
        if (!isRecordValue(session)) return null;
        const parent = session.parentID ?? session.parentId;
        return { id: sessionId, title: typeof session.title === "string" ? session.title : null, parentId: typeof parent === "string" ? parent : null };
      } catch {
        return null;
      }
    },
    updateEngineMcp: async (servers) => {
      let changed = false;
      await writeGlobalRuntimeOpencodeConfig(config, (current) => {
        const mcp: Record<string, Record<string, unknown>> = { ...current.mcp };
        for (const [name, entry] of Object.entries(servers)) {
          if (entry === null) delete mcp[name];
          else mcp[name] = entry;
        }
        changed = JSON.stringify(mcp) !== JSON.stringify(current.mcp ?? {});
        const { mcp: _previous, ...rest } = current;
        return changed ? { ...rest, ...(Object.keys(mcp).length ? { mcp } : {}) } : current;
      });
      return changed;
    },
    setEngineGlobalContext: async ({ instructions, skillsDirectory }) => {
      const directory = engineConfigDirectory(config);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const agents = join(directory, "AGENTS.md");
      if (instructions === null) await rm(agents, { force: true });
      else await writeFileAtomic(agents, instructions);
      const skills = join(directory, "skills");
      const existing = await lstat(skills).catch(() => null);
      if (existing && !existing.isSymbolicLink()) {
        log("warn", "Engine skills folder is not a link; left as it is", { path: skills });
        return;
      }
      if (existing) await rm(skills, { force: true });
      // A junction needs no rights on Windows; elsewhere this is a symlink.
      if (skillsDirectory) await symlink(skillsDirectory, skills, "junction");
    },
  };
  try {
    await start(host);
  } catch (error) {
    logger.log("error", "Downstream server hooks failed to start", { error: error instanceof Error ? error.message : String(error) });
  }
}
