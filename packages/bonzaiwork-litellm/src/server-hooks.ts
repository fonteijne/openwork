import { randomBytes } from "node:crypto";

import {
  ALLOWED_PROVIDER_IDS,
  HIDDEN_PROVIDER_IDS,
  LITELLM_PROVIDER_ID,
  LOCAL_ROUTE_PREFIX,
  liteLLMProviderEntry,
  pickDefaultModel,
  readSettings,
  type BonzaiworkSettings,
  type LiteLLMModel,
} from "@bonzaiwork/policy";

import {
  MemoryKeyStore,
  PerUserKeyResolver,
  PerWorkspaceKeyResolver,
  registeredKeyStore,
  redactSecrets,
  type KeyResolver,
  type KeyScope,
  type KeyStore,
} from "./keys.ts";
import { createLiteLLMProxy, LiteLLMError, listLiteLLMModels, type Fetch } from "./proxy.ts";

/**
 * openwork-server hooks module (OPENWORK_SERVER_HOOKS). These types mirror
 * apps/server/src/downstream-hooks.ts structurally, so this package never
 * imports server internals; the server validates the shape at load time.
 */
type Log = (level: "info" | "warn" | "error", message: string, fields?: Record<string, unknown>) => void;

export type ServerHost = {
  port: number;
  readOnly: boolean;
  workspaces(): Array<{ id: string; path: string }>;
  workspaceForSession(sessionId: string): Promise<string | null>;
  updateEngineProviders(update: { providers: Record<string, Record<string, unknown> | null>; disabledProviders?: string[] }): Promise<boolean>;
  reloadEngineProviders(): Promise<void>;
  externalFetch: Fetch;
  log: Log;
};

export type ServerRoute = {
  method: string;
  path: string;
  auth: "none" | "client" | "host-token";
  handle(request: Request, params: Record<string, string>): Promise<Response>;
};

export type ServerHooks = {
  allowedProviderIds: readonly string[];
  routes: readonly ServerRoute[];
  start(host: ServerHost): Promise<void>;
};

export type ServerHooksOptions = {
  settings?: BonzaiworkSettings;
  keyStore?: KeyStore;
  /** Overrides the host's fetch (tests). */
  fetch?: Fetch;
  localToken?: string;
};

const KEY_BODY_LIMIT = 4096;

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

function failure(status: number, code: string, message: string): Response {
  return json({ code, message }, status);
}

async function readKey(request: Request): Promise<string | null> {
  const text = await request.text();
  if (text.length > KEY_BODY_LIMIT) return null;
  try {
    const body: unknown = JSON.parse(text);
    const key = typeof body === "object" && body !== null ? Reflect.get(body, "key") : undefined;
    return typeof key === "string" && /^\S{8,512}$/.test(key.trim()) ? key.trim() : null;
  } catch {
    return null;
  }
}

/** Last four characters only, so settings can show which key is linked without exposing it. */
function keyHint(key: string | null): string | null {
  return key ? `…${key.slice(-4)}` : null;
}

export function createServerHooks(options: ServerHooksOptions = {}): ServerHooks {
  const settings = options.settings ?? readSettings(process.env);
  const store = options.keyStore ?? registeredKeyStore() ?? new MemoryKeyStore();
  const resolver: KeyResolver = settings.keyMode === "workspace" ? new PerWorkspaceKeyResolver(store) : new PerUserKeyResolver(store);
  const localToken = options.localToken ?? `bwk_local_${randomBytes(32).toString("base64url")}`;
  let host: ServerHost | null = null;
  let models: LiteLLMModel[] = [];
  let lastError: string | null = null;
  let refreshing: Promise<void> = Promise.resolve();

  const fetchImpl: Fetch = (input, init) => {
    if (options.fetch) return options.fetch(input, init);
    if (!host) return Promise.reject(new Error("BonzaiWork server hooks are not started."));
    return host.externalFetch(input, init);
  };
  const log: Log = (level, message, fields) => host?.log(level, message, fields);
  // A conversation never changes workspace, so its owner is looked up once.
  const sessionWorkspaces = new Map<string, string>();
  const workspaceForSession = async (sessionId: string): Promise<string | null> => {
    const known = sessionWorkspaces.get(sessionId);
    if (known) return known;
    const workspaceId = await host?.workspaceForSession(sessionId) ?? null;
    if (workspaceId) {
      if (sessionWorkspaces.size >= 1000) sessionWorkspaces.delete(sessionWorkspaces.keys().next().value ?? "");
      sessionWorkspaces.set(sessionId, workspaceId);
    }
    return workspaceId;
  };
  const proxy = createLiteLLMProxy({ litellmBaseUrl: settings.litellmBaseUrl, localToken, resolver, fetch: fetchImpl, workspaceForSession, log });

  async function linkedKeys(): Promise<string[]> {
    if (settings.keyMode === "user") {
      const key = await store.get({ kind: "user" });
      return key ? [key] : [];
    }
    const keys = await Promise.all((host?.workspaces() ?? []).map((workspace) => store.get({ kind: "workspace", workspaceId: workspace.id })));
    return [...new Set(keys.filter((key): key is string => Boolean(key)))];
  }

  /** Re-reads the model list from LiteLLM and rewrites the engine's provider entry. */
  function refresh(): Promise<void> {
    const run = refreshing.then(async () => {
      const active = host;
      if (!active) return;
      const keys = await linkedKeys();
      const seen = new Map<string, LiteLLMModel>();
      lastError = null;
      for (const key of keys) {
        try {
          for (const model of await listLiteLLMModels(settings.litellmBaseUrl, key, fetchImpl)) seen.set(model.id, model);
        } catch (error) {
          lastError = redactSecrets(error instanceof Error ? error.message : String(error), keys);
        }
      }
      models = [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
      if (active.readOnly) return;
      const changed = await active.updateEngineProviders({
        providers: { [LITELLM_PROVIDER_ID]: liteLLMProviderEntry({ port: active.port, localToken, models }) },
        disabledProviders: [...HIDDEN_PROVIDER_IDS],
      });
      if (changed) await active.reloadEngineProviders();
      active.log("info", "LiteLLM provider configured", { models: models.length, keyMode: settings.keyMode, error: lastError ?? undefined });
    });
    refreshing = run.catch(() => undefined);
    return run;
  }

  async function status(): Promise<Response> {
    const user = await store.get({ kind: "user" });
    const workspaces = await Promise.all((host?.workspaces() ?? []).map(async (workspace) => {
      const key = await store.get({ kind: "workspace", workspaceId: workspace.id });
      return { id: workspace.id, hasKey: Boolean(key), keyHint: keyHint(key) };
    }));
    return json({
      provider: LITELLM_PROVIDER_ID,
      litellmBaseUrl: settings.litellmBaseUrl,
      keyMode: settings.keyMode,
      keyStorePersistent: store.persistent,
      user: { hasKey: Boolean(user), keyHint: keyHint(user) },
      workspaces,
      models,
      defaultModel: pickDefaultModel(models, settings.defaultModel),
      lastError,
    });
  }

  async function putKey(request: Request, scope: KeyScope): Promise<Response> {
    if (host?.readOnly) return failure(403, "read_only", "This device is read-only.");
    const key = await readKey(request);
    if (!key) return failure(400, "invalid_key", "Paste a LiteLLM virtual key.");
    try {
      await listLiteLLMModels(settings.litellmBaseUrl, key, fetchImpl);
    } catch (error) {
      const status = error instanceof LiteLLMError && (error.status === 401 || error.status === 403) ? 400 : 502;
      const message = redactSecrets(error instanceof Error ? error.message : String(error), [key]);
      return failure(status, status === 400 ? "key_rejected" : "litellm_unreachable", message);
    }
    await store.set(scope, key);
    await refresh();
    return status();
  }

  async function deleteKey(scope: KeyScope): Promise<Response> {
    if (host?.readOnly) return failure(403, "read_only", "This device is read-only.");
    await store.delete(scope);
    await refresh();
    return status();
  }

  const knownWorkspace = (workspaceId: string) => host?.workspaces().some((workspace) => workspace.id === workspaceId) ?? false;

  const routes: ServerRoute[] = [
    ...["GET", "POST"].flatMap((method): ServerRoute[] => [
      { method, path: `${LOCAL_ROUTE_PREFIX}/v1/*`, auth: "none", handle: (request, params) => proxy(request, { path: params["*"] ?? "" }) },
      {
        method, path: `${LOCAL_ROUTE_PREFIX}/ws/:workspaceId/v1/*`, auth: "none",
        handle: (request, params) => proxy(request, { path: params["*"] ?? "", workspaceId: params.workspaceId }),
      },
    ]),
    { method: "GET", path: "/bonzaiwork/status", auth: "client", handle: () => status() },
    { method: "POST", path: "/bonzaiwork/models/refresh", auth: "client", handle: async () => { await refresh(); return status(); } },
    { method: "PUT", path: "/bonzaiwork/keys/user", auth: "host-token", handle: (request) => putKey(request, { kind: "user" }) },
    { method: "DELETE", path: "/bonzaiwork/keys/user", auth: "host-token", handle: () => deleteKey({ kind: "user" }) },
    {
      method: "PUT", path: "/bonzaiwork/keys/workspace/:workspaceId", auth: "host-token",
      handle: (request, params) => knownWorkspace(params.workspaceId)
        ? putKey(request, { kind: "workspace", workspaceId: params.workspaceId })
        : Promise.resolve(failure(404, "workspace_not_found", "Workspace not found.")),
    },
    {
      method: "DELETE", path: "/bonzaiwork/keys/workspace/:workspaceId", auth: "host-token",
      handle: (_request, params) => deleteKey({ kind: "workspace", workspaceId: params.workspaceId }),
    },
  ];

  return {
    allowedProviderIds: ALLOWED_PROVIDER_IDS,
    routes,
    async start(next) {
      host = next;
      if (!store.persistent) next.log("warn", "LiteLLM keys are kept in memory only; they are lost when the server stops.");
      await refresh();
    },
  };
}

export default function serverHooks(): ServerHooks {
  return createServerHooks();
}
