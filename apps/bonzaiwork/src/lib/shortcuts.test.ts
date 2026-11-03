import { describe, expect, it } from "vitest";

import { chord, matchShortcut, SHORTCUTS } from "./shortcuts";

const press = (code: string, extra: Partial<Parameters<typeof matchShortcut>[0]> = {}) =>
  matchShortcut({ metaKey: false, ctrlKey: true, altKey: false, shiftKey: false, code, key: "", ...extra });

describe("shortcuts table (brief §4)", () => {
  it("has one entry per chord", () => {
    const seen = new Set(SHORTCUTS.map((entry) => `${entry.code}${entry.shift ? "+shift" : ""}`));
    expect(seen.size).toBe(SHORTCUTS.length);
  });

  it("matches the platform modifier and the physical key", () => {
    expect(press("KeyK")?.id).toBe("search");
    expect(press("KeyN")?.id).toBe("newChat");
    expect(press("KeyN", { shiftKey: true })?.id).toBe("newProject");
    expect(press("Slash")?.id).toBe("sidebar");
    expect(press("Slash", { shiftKey: true })?.id).toBe("shortcuts");
    expect(press("BracketLeft")?.id).toBe("back");
    expect(press("Digit3")?.id).toBe("project3");
    expect(press("Digit0")?.id).toBe("home");
  });

  it("ignores alt and the wrong modifier", () => {
    expect(press("KeyK", { altKey: true })).toBeNull();
    expect(press("KeyK", { ctrlKey: false, metaKey: true })).toBeNull();
    expect(press("KeyK", { ctrlKey: false })).toBeNull();
  });

  it("falls back to the key when the code is unknown", () => {
    expect(press("", { key: "k" })?.id).toBe("search");
  });

  it("formats chords for the platform", () => {
    expect(chord("search")).toBe("Ctrl+K");
    expect(chord("newProject")).toBe("Ctrl+Shift+N");
  });
});
