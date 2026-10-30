import { describe, expect, it } from "vitest";

import { EMPTY_META, readMeta } from "./meta";

describe("readMeta", () => {
  it("keeps an empty model choice apart from every model", () => {
    expect(readMeta({ ...EMPTY_META, allowedModels: [] }).allowedModels).toEqual([]);
    expect(readMeta({ ...EMPTY_META, allowedModels: null }).allowedModels).toBeNull();
    expect(readMeta({ ...EMPTY_META, allowedModels: ["glm-5", 7] }).allowedModels).toEqual(["glm-5"]);
  });
});
