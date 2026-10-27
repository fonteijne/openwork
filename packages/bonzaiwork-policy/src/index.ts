/**
 * BonzaiWork provider policy (requirement E4): LiteLLM is the default and
 * only model provider. Pure data and functions; the server hooks and the
 * Electron entry apply them.
 */

export const LITELLM_PROVIDER_ID = "litellm";

/** The only providers that may reach the engine. */
export const ALLOWED_PROVIDER_IDS: readonly string[] = [LITELLM_PROVIDER_ID];

/** Built-in OpenWork/OpenCode providers hidden from the engine catalog as well. */
export const HIDDEN_PROVIDER_IDS: readonly string[] = ["openwork", "opencode", "openwork-free"];

/** Loopback route on openwork-server through which the engine reaches LiteLLM. */
export const LOCAL_ROUTE_PREFIX = "/bonzaiwork/litellm";

/** Server environment that turns off OpenWork's hosted and free models (see apps/server/src/free-auto/settings.ts). */
export const SERVER_ENVIRONMENT_DEFAULTS: Readonly<Record<string, string>> = {
  OPENWORK_DISABLE_FREE_INFERENCE: "1",
  OPENWORK_DISABLE_HOSTED_MODELS: "1",
  VITE_DISABLE_OPENWORK_MODELS: "1",
};

/** Drops trailing slashes without a regex, which backtracks quadratically on long runs of "/" (CodeQL js/polynomial-redos). */
export function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) end -= 1;
  return value.slice(0, end);
}

export function isAllowedProvider(providerId: string): boolean {
  return ALLOWED_PROVIDER_IDS.includes(providerId);
}

export type KeyMode = "user" | "workspace";

export type BonzaiworkSettings = {
  /** LiteLLM origin plus optional path prefix, without `/v1`. Baked into the build (O3). */
  litellmBaseUrl: string;
  /** Model id within LiteLLM that new chats use; null picks the first listed model. */
  defaultModel: string | null;
  /** Which virtual key a request uses (O1): one per user or one per workspace. */
  keyMode: KeyMode;
};

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Reads the settings the build bakes into the app's environment. Plain HTTP
 * is accepted only for a loopback LiteLLM (local development).
 */
export function readSettings(environment: Record<string, string | undefined>): BonzaiworkSettings {
  const raw = environment.BONZAIWORK_LITELLM_BASE_URL?.trim();
  if (!raw) throw new Error("BONZAIWORK_LITELLM_BASE_URL is not set; it is baked into the build.");
  const url = new URL(raw);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("BONZAIWORK_LITELLM_BASE_URL must not contain credentials, a query or a fragment.");
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname))) {
    throw new Error("BONZAIWORK_LITELLM_BASE_URL must use HTTPS (plain HTTP only for a loopback LiteLLM).");
  }
  const trimmed = trimTrailingSlashes(url.href);
  const litellmBaseUrl = trimmed.endsWith("/v1") ? trimmed.slice(0, -3) : trimmed;
  const keyMode = environment.BONZAIWORK_KEY_MODE?.trim() === "workspace" ? "workspace" : "user";
  return { litellmBaseUrl, defaultModel: environment.BONZAIWORK_DEFAULT_MODEL?.trim() || null, keyMode };
}

export type LiteLLMModel = { id: string; name?: string };

/**
 * The engine-global runtime provider entry (workstream B1). Its apiKey is the
 * server's per-start local token, never a LiteLLM key: the loopback route
 * swaps it for the workspace's virtual key.
 */
export function liteLLMProviderEntry(input: { port: number; localToken: string; models: readonly LiteLLMModel[] }): Record<string, unknown> {
  return {
    npm: "@ai-sdk/openai-compatible",
    name: "LiteLLM",
    options: {
      baseURL: `http://127.0.0.1:${input.port}${LOCAL_ROUTE_PREFIX}/v1`,
      apiKey: input.localToken,
    },
    models: Object.fromEntries(input.models.map((model) => [model.id, { name: model.name ?? model.id }])),
  };
}

/** Picks the configured default when LiteLLM offers it, else the first model. */
export function pickDefaultModel(models: readonly LiteLLMModel[], preferred: string | null): string | null {
  if (preferred && models.some((model) => model.id === preferred)) return preferred;
  return models[0]?.id ?? null;
}
