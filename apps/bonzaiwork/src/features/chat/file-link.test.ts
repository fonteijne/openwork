import { describe, expect, it } from "vitest";

import { fileParamOf, withFileParam } from "./file-link";

describe("the open file in the hash (brief §6)", () => {
  it("reads ?bestand= and leaves the route alone", () => {
    expect(fileParamOf("#/p/p-offertes/c/c-vandijk?bestand=offertes/2026-031.md")).toBe("offertes/2026-031.md");
    expect(fileParamOf("#/p/p-offertes/c/c-vandijk")).toBeNull();
    expect(fileParamOf("#/p/p-offertes?bestand=")).toBeNull();
    expect(fileParamOf("#/p/p-offertes?bestand=knowledge%2Fofferte%20x.md")).toBe("knowledge/offerte x.md");
  });

  it("writes the path with readable slashes and removes it again", () => {
    expect(withFileParam("#/p/p-offertes/c/c-week", "offertes/2026-031 kopie.md")).toBe("#/p/p-offertes/c/c-week?bestand=offertes/2026-031%20kopie.md");
    expect(withFileParam("#/p/p-offertes/c/c-week?bestand=a.md", "b.md")).toBe("#/p/p-offertes/c/c-week?bestand=b.md");
    expect(withFileParam("#/p/p-offertes/c/c-week?bestand=a.md", null)).toBe("#/p/p-offertes/c/c-week");
    expect(withFileParam("#/p/p-offertes?x=1&bestand=a.md", null)).toBe("#/p/p-offertes?x=1");
  });
});
