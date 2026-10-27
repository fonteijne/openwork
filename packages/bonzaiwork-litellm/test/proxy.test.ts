import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { MemoryKeyStore, PerUserKeyResolver, PerWorkspaceKeyResolver, redactSecrets } from "../src/keys.ts";
import { createLiteLLMProxy } from "../src/proxy.ts";
import { createServerHooks, type ServerHost } from "../src/server-hooks.ts";

const USER_KEY = "sk-user-virtual-key-0001";
const WORKSPACE_KEY = "sk-workspace-virtual-key-0002";
const LOCAL = "bwk_local_test-token-value";

type Seen = { url: string; authorization: string | undefined; body: string };
const seen: Seen[] = [];
let litellm: Server;
let baseUrl = "";

beforeAll(async () => {
  litellm = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    seen.push({ url: req.url ?? "", authorization: req.headers.authorization, body });
    const key = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    if (![USER_KEY, WORKSPACE_KEY].includes(key)) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: `Authentication Error, Invalid proxy server token passed. Received API Key = ${key}` } }));
      return;
    }
    if (req.url === "/v1/models") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: key === USER_KEY ? "gpt-4o-mini" : "claude-sonnet" }] }));
      return;
    }
    if (req.url === "/v1/chat/completions") {
      res.writeHead(200, { "content-type": "text/event-stream", "x-litellm-key-spend": "0.1" });
      res.write("data: first\n\n");
      // The second chunk arrives only after the first was read by the client: proves no buffering.
      setTimeout(() => { res.write("data: second\n\n"); res.end("data: [DONE]\n\n"); }, 150);
      return;
    }
    if (req.url === "/v1/audio/transcriptions") {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: `upstream failed for key ${key}` } }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => litellm.listen(0, "127.0.0.1", resolve));
  const address: AddressInfo | string | null = litellm.address();
  if (!address || typeof address === "string") throw new Error("no port");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(() => { litellm.close(); });

async function proxyWith(store = new MemoryKeyStore(), mode: "user" | "workspace" = "user") {
  const resolver = mode === "user" ? new PerUserKeyResolver(store) : new PerWorkspaceKeyResolver(store);
  return { store, handle: createLiteLLMProxy({ litellmBaseUrl: baseUrl, localToken: LOCAL, resolver, fetch: (input, init) => fetch(input, init) }) };
}

function engineRequest(path: string, init: RequestInit = {}, token = LOCAL) {
  return new Request(`http://127.0.0.1/bonzaiwork/litellm/v1/${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers } });
}

describe("LiteLLM proxy", () => {
  test("rejects requests without the local token", async () => {
    const { store, handle } = await proxyWith();
    await store.set({ kind: "user" }, USER_KEY);
    const response = await handle(engineRequest("models", {}, "wrong"), { path: "models" });
    expect(response.status).toBe(401);
  });

  test("only forwards known OpenAI-compatible endpoints", async () => {
    const { store, handle } = await proxyWith();
    await store.set({ kind: "user" }, USER_KEY);
    expect((await handle(engineRequest("key/generate", { method: "POST", body: "{}" }), { path: "key/generate" })).status).toBe(404);
  });

  test("swaps the local token for the user's virtual key", async () => {
    const { store, handle } = await proxyWith();
    await store.set({ kind: "user" }, USER_KEY);
    const response = await handle(engineRequest("models"), { path: "models" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [{ id: "gpt-4o-mini" }] });
    expect(seen.at(-1)?.authorization).toBe(`Bearer ${USER_KEY}`);
  });

  test("per-workspace keys: each workspace reaches LiteLLM with its own key", async () => {
    const { store, handle } = await proxyWith(new MemoryKeyStore(), "workspace");
    await store.set({ kind: "workspace", workspaceId: "ws_a" }, USER_KEY);
    await store.set({ kind: "workspace", workspaceId: "ws_b" }, WORKSPACE_KEY);
    await handle(engineRequest("models"), { path: "models", workspaceId: "ws_a" });
    expect(seen.at(-1)?.authorization).toBe(`Bearer ${USER_KEY}`);
    await handle(engineRequest("models"), { path: "models", workspaceId: "ws_b" });
    expect(seen.at(-1)?.authorization).toBe(`Bearer ${WORKSPACE_KEY}`);
    const missing = await handle(engineRequest("models"), { path: "models", workspaceId: "ws_c" });
    // Engine requests name the conversation; the proxy maps it to its workspace.
    const viaSession = createLiteLLMProxy({
      litellmBaseUrl: baseUrl, localToken: LOCAL, resolver: new PerWorkspaceKeyResolver(store), fetch: (input, init) => fetch(input, init),
      workspaceForSession: async (sessionId) => (sessionId === "ses_b" ? "ws_b" : null),
    });
    await viaSession(engineRequest("models", { headers: { "x-opencode-session": "ses_b" } }), { path: "models" });
    expect(seen.at(-1)?.authorization).toBe(`Bearer ${WORKSPACE_KEY}`);
    expect(missing.status).toBe(401);
    expect((await missing.json()).error.code).toBe("litellm_key_missing");
  });

  test("streams SSE without buffering and drops LiteLLM's key headers", async () => {
    const { store, handle } = await proxyWith();
    await store.set({ kind: "user" }, USER_KEY);
    const response = await handle(engineRequest("chat/completions", { method: "POST", body: JSON.stringify({ stream: true }) }), { path: "chat/completions" });
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("x-litellm-key-spend")).toBeNull();
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toBe("data: first\n\n");
    let rest = "";
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) rest += new TextDecoder().decode(chunk.value);
    expect(rest).toContain("data: second");
    expect(seen.at(-1)?.body).toBe(JSON.stringify({ stream: true }));
  });

  test("LiteLLM errors reach the engine without the key", async () => {
    const { store, handle } = await proxyWith();
    await store.set({ kind: "user" }, USER_KEY);
    const response = await handle(engineRequest("audio/transcriptions", { method: "POST", body: "audio" }), { path: "audio/transcriptions" });
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain(USER_KEY);
    expect(text).toContain("[redacted]");
  });
});

describe("redactSecrets", () => {
  test("removes given secrets and key-shaped strings", () => {
    expect(redactSecrets("a secret-value b", ["secret-value"])).toBe("a [redacted] b");
    expect(redactSecrets("key sk-abcdef123456 used", [])).toBe("key [redacted] used");
  });
});

describe("server hooks", () => {
  function fakeHost(updates: unknown[]): ServerHost {
    return {
      port: 9999,
      readOnly: false,
      workspaces: () => [{ id: "ws_a", path: "/tmp/a" }],
      workspaceForSession: async () => "ws_a",
      updateEngineProviders: async (update) => { updates.push(update); return true; },
      reloadEngineProviders: async () => {},
      externalFetch: (input, init) => fetch(input, init),
      log: () => {},
    };
  }

  test("allows only litellm and writes the provider entry with LiteLLM's models", async () => {
    const updates: unknown[] = [];
    const store = new MemoryKeyStore();
    const hooks = createServerHooks({ settings: { litellmBaseUrl: baseUrl, defaultModel: null, keyMode: "user" }, keyStore: store, localToken: LOCAL });
    expect(hooks.allowedProviderIds).toEqual(["litellm"]);
    await hooks.start(fakeHost(updates));
    const putKey = hooks.routes.find((route) => route.method === "PUT" && route.path === "/bonzaiwork/keys/user")!;

    const rejected = await putKey.handle(new Request("http://x", { method: "PUT", body: JSON.stringify({ key: "sk-not-a-real-key-999" }) }), {});
    expect(rejected.status).toBe(400);
    expect(await rejected.text()).not.toContain("sk-not-a-real-key-999");

    const accepted = await putKey.handle(new Request("http://x", { method: "PUT", body: JSON.stringify({ key: USER_KEY }) }), {});
    expect(accepted.status).toBe(200);
    const status = await accepted.json();
    expect(JSON.stringify(status)).not.toContain(USER_KEY);
    expect(status.user).toEqual({ hasKey: true, keyHint: "…0001" });
    expect(status.defaultModel).toBe("gpt-4o-mini");
    expect(updates.at(-1)).toEqual({
      providers: { litellm: { npm: "@ai-sdk/openai-compatible", name: "LiteLLM", options: { baseURL: "http://127.0.0.1:9999/bonzaiwork/litellm/v1", apiKey: LOCAL }, models: { "gpt-4o-mini": { name: "gpt-4o-mini" } } } },
      disabledProviders: ["openwork", "opencode", "openwork-free"],
    });
    expect(JSON.stringify(updates)).not.toContain(USER_KEY);
  });
});
