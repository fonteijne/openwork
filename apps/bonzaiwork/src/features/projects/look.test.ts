import { describe, expect, it } from "vitest";

import { PROJECT_COLORS } from "~/backend/types";

import { DEFAULT_LOOK, suggestLook } from "./look";
import { STARTERS, starterById } from "./starters";

describe("suggestLook", () => {
  it("recognises the four starters and their relatives", () => {
    expect(suggestLook("Offertes 2026")).toEqual({ icon: "briefcase", color: "jade" });
    expect(suggestLook("Marketing Q4")).toEqual({ icon: "megaphone", color: "violet" });
    expect(suggestLook("Klantenservice")).toEqual({ icon: "users", color: "blue" });
    expect(suggestLook("Financiën en administratie")).toEqual({ icon: "chart", color: "amber" });
    expect(suggestLook("Website-teksten")).toEqual({ icon: "file-text", color: "pink" });
  });

  it("gives a nameless project the default look", () => {
    expect(suggestLook("")).toEqual(DEFAULT_LOOK);
    expect(suggestLook("   ")).toEqual(DEFAULT_LOOK);
  });

  it("keeps the same folder color for the same unrecognised name, never sage", () => {
    const first = suggestLook("Zomerplannen");
    expect(first.icon).toBe("folder");
    expect(first).toEqual(suggestLook("zomerplannen"));
    expect(first.color).not.toBe("sage");
    expect(PROJECT_COLORS).toContain(first.color);
  });

  it("starters carry the look their name would get", () => {
    for (const starter of STARTERS) expect(suggestLook(starter.name)).toEqual(starter.look);
    expect(starterById("marketing")?.name).toBe("Marketing");
    expect(starterById(null)).toBeNull();
    expect(starterById("nope")).toBeNull();
  });
});
