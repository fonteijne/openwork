import { pathToFileURL } from "node:url";
import { isAbsolute } from "node:path";

import { addRoute, type AuthMode, type Route } from "./routes/registry.js";
import { mergeRuntimeProviderUpdate, writeGlobalRuntimeOpencodeConfig } from "./runtime-opencode-config-store.js";
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
  log(level: "info" | "warn" | "error", message: string, fields?: Record<string, unknown>): void;
};

export type DownstreamServerHooks = {
  /** When set, only these providers reach the engine, whatever an organization or project configures. */
  allowedProviderIds?: readonly string[];
  routes?: readonly DownstreamRoute[];
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
  if (!allowed) return [];
  return [
    { action: "provider.use", resource: "*", effect: "deny" },
    ...allowed.map((id) => ({ action: "provider.use", resource: id, effect: "allow" as const })),
  ];
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
  const { allowedProviderIds, routes, start } = value;
  return (allowedProviderIds === undefined || (Array.isArray(allowedProviderIds) && allowedProviderIds.every((id) => typeof id === "string")))
    && (routes === undefined || (Array.isArray(routes) && routes.every(isDownstreamRoute)))
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

/** Starts the active hooks once the listener is bound. A failing hook is logged, never fatal. */
export async function startDownstreamServerHooks(input: DownstreamStartInput): Promise<void> {
  const start = active?.start;
  if (!start) return;
  const { config, engine, logger } = input;
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
    log: (level, message, fields) => logger.log(level, message, fields),
  };
  try {
    await start(host);
  } catch (error) {
    logger.log("error", "Downstream server hooks failed to start", { error: error instanceof Error ? error.message : String(error) });
  }
}
