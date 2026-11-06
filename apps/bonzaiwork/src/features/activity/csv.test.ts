import { describe, expect, it } from "vitest";

import { csvFileName, toCsv } from "./csv";

describe("toCsv", () => {
  it("quotes cells with commas, quotes and line breaks, and starts with a BOM", () => {
    const csv = toCsv([
      ["Wie", "Wat"],
      ["Jij", 'Wees af: "Te lang, maak er 3 punten van"'],
      ["De app", "regel 1\nregel 2"],
    ]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe('﻿Wie,Wat\r\nJij,"Wees af: ""Te lang, maak er 3 punten van"""\r\nDe app,"regel 1\nregel 2"\r\n');
  });

  it("names the file after the view and the day", () => {
    expect(csvFileName("verzonden", new Date(2026, 10, 5))).toBe("verzonden-2026-11-05.csv");
  });
});
