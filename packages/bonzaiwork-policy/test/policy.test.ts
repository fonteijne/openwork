import { describe, expect, test } from "bun:test";
import { isAllowedProvider, liteLLMProviderEntry, pickDefaultModel, readSettings, SERVER_ENVIRONMENT_DEFAULTS, trimTrailingSlashes } from "../src/index.ts";

describe("provider policy", () => {
  test("only litellm is allowed", () => {
    expect(isAllowedProvider("litellm")).toBe(true);
    for (const id of ["anthropic", "openai", "opencode", "openwork", "openwork-free", "lpr_x", "rogue"]) {
      expect(isAllowedProvider(id)).toBe(false);
    }
  });

  test("provider entry points at the loopback route and never carries a LiteLLM key", () => {
    const entry = liteLLMProviderEntry({ port: 8787, localToken: "bwk_local_abc", models: [{ id: "gpt-4o-mini" }] });
    expect(entry).toEqual({
      npm: "@ai-sdk/openai-compatible",
      name: "LiteLLM",
      options: { baseURL: "http://127.0.0.1:8787/bonzaiwork/litellm/v1", apiKey: "bwk_local_abc" },
      models: { "gpt-4o-mini": { name: "gpt-4o-mini" } },
    });
  });

  test("the engines' model catalog stays on this machine", () => {
    expect(SERVER_ENVIRONMENT_DEFAULTS.OPENCODE_DISABLE_MODELS_FETCH).toBe("1");
    expect(new URL(SERVER_ENVIRONMENT_DEFAULTS.OPENCODE_MODELS_URL ?? "").hostname).toBe("127.0.0.1");
  });

  test("settings require HTTPS except for a loopback LiteLLM", () => {
    expect(readSettings({ BONZAIWORK_LITELLM_BASE_URL: "https://llm.example.org/v1/" }).litellmBaseUrl).toBe("https://llm.example.org");
    expect(readSettings({ BONZAIWORK_LITELLM_BASE_URL: "http://127.0.0.1:4000" }).litellmBaseUrl).toBe("http://127.0.0.1:4000");
    expect(() => readSettings({ BONZAIWORK_LITELLM_BASE_URL: "http://llm.example.org" })).toThrow();
    expect(() => readSettings({ BONZAIWORK_LITELLM_BASE_URL: "https://user:pw@llm.example.org" })).toThrow();
    expect(() => readSettings({})).toThrow();
    expect(readSettings({ BONZAIWORK_LITELLM_BASE_URL: "https://x.org", BONZAIWORK_KEY_MODE: "workspace" }).keyMode).toBe("workspace");
  });

  test("trailing slashes are trimmed in linear time", () => {
    expect(trimTrailingSlashes("https://x.org///")).toBe("https://x.org");
    expect(trimTrailingSlashes("///")).toBe("");
    expect(trimTrailingSlashes("https://x.org/v1")).toBe("https://x.org/v1");
    // The input shape that makes /\/+$/ backtrack quadratically.
    const hostile = `${"/".repeat(200_000)}x`;
    const started = performance.now();
    expect(trimTrailingSlashes(hostile)).toBe(hostile);
    expect(performance.now() - started).toBeLessThan(100);
  });

  test("default model falls back to the first listed model", () => {
    expect(pickDefaultModel([{ id: "a" }, { id: "b" }], "b")).toBe("b");
    expect(pickDefaultModel([{ id: "a" }], "missing")).toBe("a");
    expect(pickDefaultModel([], null)).toBeNull();
  });
});
