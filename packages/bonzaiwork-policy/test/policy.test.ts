import { describe, expect, test } from "bun:test";
import { isAllowedProvider, liteLLMProviderEntry, pickDefaultModel, readSettings } from "../src/index.ts";

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

  test("settings require HTTPS except for a loopback LiteLLM", () => {
    expect(readSettings({ BONZAIWORK_LITELLM_BASE_URL: "https://llm.example.org/v1/" }).litellmBaseUrl).toBe("https://llm.example.org");
    expect(readSettings({ BONZAIWORK_LITELLM_BASE_URL: "http://127.0.0.1:4000" }).litellmBaseUrl).toBe("http://127.0.0.1:4000");
    expect(() => readSettings({ BONZAIWORK_LITELLM_BASE_URL: "http://llm.example.org" })).toThrow();
    expect(() => readSettings({ BONZAIWORK_LITELLM_BASE_URL: "https://user:pw@llm.example.org" })).toThrow();
    expect(() => readSettings({})).toThrow();
    expect(readSettings({ BONZAIWORK_LITELLM_BASE_URL: "https://x.org", BONZAIWORK_KEY_MODE: "workspace" }).keyMode).toBe("workspace");
  });

  test("default model falls back to the first listed model", () => {
    expect(pickDefaultModel([{ id: "a" }, { id: "b" }], "b")).toBe("b");
    expect(pickDefaultModel([{ id: "a" }], "missing")).toBe("a");
    expect(pickDefaultModel([], null)).toBeNull();
  });
});
