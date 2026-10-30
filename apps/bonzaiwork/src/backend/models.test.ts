import { describe, expect, it } from "vitest";

import { hasNoModels, newProjectModels, preferredIn, projectModels, startModel } from "./models";
import type { AppStatus } from "./types";

const status: AppStatus = {
  litellmBaseUrl: "https://llm.example.org",
  keyMode: "workspace",
  keyStorePersistent: true,
  user: { hasKey: false, keyHint: null },
  models: [
    { id: "big", name: "Big" },
    { id: "glm-5", name: "GLM 5" },
    { id: "gpt-6-luna", name: "GPT-6 Luna" },
  ],
  defaultModel: "big",
  preferredModels: ["gpt-6-luna", "missing", "glm-5"],
  readOnly: false,
};

describe("project models", () => {
  it("null allows every model of the key, [] none, a list exactly those", () => {
    expect(projectModels(status, { allowedModels: null }).map((model) => model.id)).toEqual(["big", "glm-5", "gpt-6-luna"]);
    expect(projectModels(status, { allowedModels: [] })).toEqual([]);
    expect(projectModels(status, { allowedModels: ["glm-5"] }).map((model) => model.id)).toEqual(["glm-5"]);
  });

  it("the preferred models are the ones the key offers, in the configured order", () => {
    expect(preferredIn(status)).toEqual(["gpt-6-luna", "glm-5"]);
    expect(preferredIn({ ...status, models: [{ id: "big", name: "Big" }] })).toEqual([]);
    expect(preferredIn(undefined)).toEqual([]);
  });

  it("new projects start with the preferred models, or every model when none are configured", () => {
    expect(newProjectModels(status)).toEqual(["gpt-6-luna", "missing", "glm-5"]);
    expect(newProjectModels({ ...status, preferredModels: [] })).toBeNull();
  });

  it("a new chat starts on an allowed model, never on one that is switched off", () => {
    expect(startModel(status, { allowedModels: null, defaultModel: null })).toBe("big");
    expect(startModel(status, { allowedModels: newProjectModels(status), defaultModel: null })).toBe("glm-5");
    expect(startModel(status, { allowedModels: [], defaultModel: "big" })).toBeNull();
  });

  it("chatting is blocked only when the key has models and the choice leaves none", () => {
    expect(hasNoModels(status, { allowedModels: [] })).toBe(true);
    expect(hasNoModels(status, { allowedModels: ["missing"] })).toBe(true);
    expect(hasNoModels(status, { allowedModels: ["glm-5"] })).toBe(false);
    expect(hasNoModels(status, { allowedModels: null })).toBe(false);
    expect(hasNoModels({ ...status, models: [] }, { allowedModels: [] })).toBe(false);
  });
});
