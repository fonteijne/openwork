import { timingSafeEqual } from "node:crypto";

import { redactSecrets, type KeyResolver } from "./keys.ts";

/**
 * The loopback route between the engine and LiteLLM (workstream B3). The
 * engine authenticates with the server's local token; the route swaps it for
 * the workspace's virtual key and streams the exchange without buffering.
 */

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export type ProxyOptions = {
  litellmBaseUrl: string;
  localToken: string;
  resolver: KeyResolver;
  fetch: Fetch;
  userId?: string;
  /** Maps the engine's `x-opencode-session` header to the workspace that owns the conversation. */
  workspaceForSession?: (sessionId: string) => Promise<string | null>;
  log?: (level: "info" | "warn" | "error", message: string, fields?: Record<string, unknown>) => void;
};

/** OpenAI-compatible endpoints the engine (and later the meeting transcriber) may reach. */
const FORWARDED_PATH = /^(?:models|chat\/completions|completions|responses|embeddings|audio\/transcriptions|audio\/translations)$/;
const REQUEST_HEADERS = ["content-type", "accept", "accept-encoding", "openai-beta", "x-stainless-retry-count"];
const RESPONSE_HEADERS = ["content-type", "cache-control", "retry-after", "x-request-id", "openai-processing-ms"];
const ERROR_BODY_LIMIT = 64 * 1024;
export const SESSION_HEADER = "x-opencode-session";
export const DEFAULT_WORKSPACE_ID = "default";

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { message, type: "bonzaiwork_litellm_error", code } }, { status, headers: { "cache-control": "no-store" } });
}

function bearer(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

function sameToken(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readBounded(response: Response, limit: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (length < limit) {
    const chunk = await reader.read();
    if (chunk.done) break;
    chunks.push(chunk.value);
    length += chunk.value.byteLength;
  }
  void reader.cancel().catch(() => undefined);
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, limit));
}

/** LiteLLM's error, with every key removed, in the OpenAI error shape the engine understands. */
async function sanitizedFailure(upstream: Response, secrets: readonly string[]): Promise<Response> {
  const text = redactSecrets(await readBounded(upstream, ERROR_BODY_LIMIT), secrets);
  let message = text.trim() || `LiteLLM returned HTTP ${upstream.status}`;
  try {
    const parsed: unknown = JSON.parse(text);
    const error = typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "error") : undefined;
    const inner = typeof error === "object" && error !== null ? Reflect.get(error, "message") : error;
    if (typeof inner === "string" && inner.trim()) message = inner.trim();
  } catch { /* not JSON: keep the redacted text */ }
  const headers = new Headers({ "cache-control": "no-store" });
  const retryAfter = upstream.headers.get("retry-after");
  if (retryAfter) headers.set("retry-after", retryAfter);
  return Response.json({ error: { message: redactSecrets(message, secrets), type: "litellm_error", code: String(upstream.status) } },
    { status: upstream.status, headers });
}

export function createLiteLLMProxy(options: ProxyOptions) {
  const base = options.litellmBaseUrl.replace(/\/+$/, "");
  const userId = options.userId ?? "local";

  return async function handle(request: Request, input: { path: string; workspaceId?: string }): Promise<Response> {
    if (!sameToken(bearer(request), options.localToken)) {
      return errorResponse(401, "invalid_local_token", "This route only serves the local engine.");
    }
    if (!FORWARDED_PATH.test(input.path)) {
      return errorResponse(404, "unsupported_endpoint", "This LiteLLM endpoint is not available through BonzaiWork.");
    }
    const sessionId = request.headers.get(SESSION_HEADER)?.trim();
    const workspaceId = input.workspaceId?.trim()
      || (sessionId && options.workspaceForSession ? await options.workspaceForSession(sessionId) : null)
      || DEFAULT_WORKSPACE_ID;
    const key = await options.resolver.resolve({ workspaceId, userId });
    if (!key) {
      return errorResponse(401, "litellm_key_missing", "No LiteLLM key is linked to this workspace. Add one in BonzaiWork settings.");
    }
    const secrets = [key, options.localToken];
    const headers = new Headers();
    for (const name of REQUEST_HEADERS) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    headers.set("authorization", `Bearer ${key}`);
    const search = new URL(request.url).search;
    const hasBody = request.method !== "GET" && request.method !== "HEAD" && request.body !== null;
    let upstream: Response;
    try {
      upstream = await options.fetch(`${base}/v1/${input.path}${search}`, {
        method: request.method,
        headers,
        ...(hasBody ? { body: request.body, duplex: "half" } : {}),
        signal: request.signal,
        redirect: "error",
      });
    } catch (error) {
      const reason = redactSecrets(error instanceof Error ? error.message : String(error), secrets);
      options.log?.("warn", "LiteLLM request failed", { path: input.path, workspaceId, reason });
      return errorResponse(502, "litellm_unreachable", "LiteLLM could not be reached.");
    }
    if (!upstream.ok) {
      options.log?.("warn", "LiteLLM rejected a request", { path: input.path, workspaceId, status: upstream.status });
      return sanitizedFailure(upstream, secrets);
    }
    const responseHeaders = new Headers();
    for (const name of RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    // Pass the body stream through untouched: SSE chunks reach the engine as LiteLLM sends them.
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  };
}

export type LiteLLMModelList = { id: string }[];

/** GET /v1/models with one key (workstream B5). Throws a key-free error on failure. */
export async function listLiteLLMModels(litellmBaseUrl: string, key: string, fetch: Fetch, signal?: AbortSignal): Promise<LiteLLMModelList> {
  const response = await fetch(`${litellmBaseUrl.replace(/\/+$/, "")}/v1/models`, {
    headers: { authorization: `Bearer ${key}`, accept: "application/json" },
    redirect: "error",
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    const failure = await sanitizedFailure(response, [key]);
    const payload: unknown = await failure.json();
    const error = typeof payload === "object" && payload !== null ? Reflect.get(payload, "error") : undefined;
    const message = typeof error === "object" && error !== null ? Reflect.get(error, "message") : undefined;
    throw new LiteLLMError(response.status, typeof message === "string" ? message : `LiteLLM returned HTTP ${response.status}`);
  }
  const payload: unknown = await response.json();
  const data = typeof payload === "object" && payload !== null ? Reflect.get(payload, "data") : undefined;
  if (!Array.isArray(data)) return [];
  return data.flatMap((item: unknown) => {
    const id = typeof item === "object" && item !== null ? Reflect.get(item, "id") : undefined;
    return typeof id === "string" && id.trim() ? [{ id }] : [];
  });
}

export class LiteLLMError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
