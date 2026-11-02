import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { bookingDocument, cell, INSTRUCTIONS } from "../src/booking-doc.ts";
import { dayView } from "../src/overview.ts";
import { at, EXAMPLE_DAY, MEETING_POST, PROJECTS, views } from "./fixtures.ts";

const MONDAY = "2026-11-02";
const WEDNESDAY = "2026-11-04";
const NOW = at(MONDAY, 17, 31);
const dayDoc = () => bookingDocument({ from: MONDAY, to: MONDAY, days: [dayView(MONDAY, views(MONDAY, EXAMPLE_DAY))], now: NOW, timeZone: "Europe/Amsterdam" });
const weekDoc = () => bookingDocument({
  from: MONDAY,
  to: "2026-11-08",
  days: [
    dayView(MONDAY, views(MONDAY, EXAMPLE_DAY)),
    dayView(WEDNESDAY, views(WEDNESDAY, [
      { from: "08:30", to: "09:00", correction: { kind: "other", label: "Meeting | weekstart", bridgePost: MEETING_POST }, note: "agenda\ndoorgenomen" },
      { from: "09:00", to: "10:00", workspaceId: "ws_c", chats: ["Exportfout `CSV`"], reference: "<TICKET>" },
      { from: "10:00", to: "10:30", correction: { kind: "other", label: "Overleg", bridgePost: null } },
      { from: "10:30", to: "11:00", scores: { ws_c: 4, ws_a: 2, ws_d: 1 } },
    ])),
  ],
  now: at("2026-11-08", 16, 0),
  timeZone: "Europe/Amsterdam",
});

function jsonBlock(doc: string) {
  const match = /```json\n([\s\S]*?)\n```/.exec(doc);
  if (!match?.[1]) throw new Error("no JSON block");
  const parsed: unknown = JSON.parse(match[1]);
  return parsed;
}

/** Rows of the table under a heading, split on unescaped pipes. */
function tableRows(doc: string, heading: string): string[][] {
  const lines = doc.slice(doc.indexOf(heading)).split("\n");
  const first = lines.findIndex((line) => line.startsWith("|"));
  if (first < 0) return [];
  const rows: string[][] = [];
  for (const line of lines.slice(first + 2)) {
    if (!line.startsWith("|")) break;
    rows.push(line.slice(1, -1).split(/(?<!\\)\|/).map((value) => value.trim()));
  }
  return rows;
}

describe("boekdocument", () => {
  test("snapshot voor een dag", () => {
    expect(dayDoc()).toMatchSnapshot();
  });

  test("snapshot voor een week", () => {
    expect(weekDoc()).toMatchSnapshot();
  });

  test("de instructietekst staat er letterlijk in, gelijk aan plan §6.2", async () => {
    const plan = await readFile(join(import.meta.dir, "..", "..", "..", "docs", "bonzaiwork", "agenda-manager-plan.md"), "utf8");
    const start = plan.indexOf("```markdown\n## Instructies voor de assistent");
    const text = plan.slice(start + "```markdown\n".length, plan.indexOf("\n```", start + 12));
    expect(INSTRUCTIONS).toBe(text);
    expect(dayDoc()).toContain(`\n\n${INSTRUCTIONS}\n\n## Boekvoorstel`);
  });

  test("het JSON-blok is geldige JSON en gelijk aan de tabellen", () => {
    for (const doc of [dayDoc(), weekDoc()]) {
      const data = jsonBlock(doc);
      expect(data).toMatchObject({ bron: "bonzaiwork-agenda", versie: 1, tijdzone: "Europe/Amsterdam", eenheid_minuten: 15 });
      if (typeof data !== "object" || data === null || !("boekingen" in data) || !Array.isArray(data.boekingen) || !("tijdlijn" in data) || !Array.isArray(data.tijdlijn)) throw new Error("shape");
      const bookingRows = tableRows(doc, "## Boekvoorstel");
      expect(bookingRows).toHaveLength(data.boekingen.length);
      data.boekingen.forEach((booking: Record<string, unknown>, index: number) => {
        const row = bookingRows[index] ?? [];
        const post = booking.bridge_post;
        const times = Array.isArray(booking.tijden) ? booking.tijden.map((time: Record<string, string>) => `${time.van}–${time.tot}`).join(", ") : "";
        expect(row.slice(0, 2)).toEqual([String(booking.id), String(booking.datum)]);
        expect(row[2]?.startsWith(`\`${typeof post === "object" && post !== null && "entity_id" in post ? String(post.entity_id) : ""}\``)).toBe(true);
        expect(row.slice(3, 6)).toEqual([String(booking.duur), String(booking.minuten), times]);
        expect(row[7]).toBe(booking.referentie === null ? "–" : `\`${String(booking.referentie)}\``);
      });
      const timelineRows = doc.slice(doc.indexOf("## Tijdlijn"), doc.indexOf("## Gegevens")).split("\n").filter((line) => /^\| \d\d:\d\d/.test(line));
      expect(timelineRows).toHaveLength(data.tijdlijn.length);
      data.tijdlijn.forEach((entry: Record<string, unknown>, index: number) => {
        expect(timelineRows[index]?.startsWith(`| ${String(entry.van)} | ${String(entry.tot)} | ${String(entry.soort)} |`)).toBe(true);
      });
      const total = data.boekingen.reduce((sum: number, booking: Record<string, unknown>) => sum + Number(booking.minuten), 0);
      expect(total % 15).toBe(0);
    }
  });

  test("tabelcellen ontsnapt: pipe, regeleinde, backtick", () => {
    expect(cell("a | b\nc `d`")).toBe("a \\| b c \\`d\\`");
    const doc = weekDoc();
    expect(doc).toContain("Meeting \\| weekstart");
    expect(doc).toContain("agenda doorgenomen");
    expect(doc).toContain("Exportfout \\`CSV\\`");
    for (const row of tableRows(doc, "## Boekvoorstel")) expect(row).toHaveLength(8);
    for (const line of doc.split("\n").filter((entry) => /^\| \d\d:\d\d/.test(entry))) expect(line.slice(1, -1).split(/(?<!\\)\|/)).toHaveLength(9);
  });

  test("een periode zonder activiteit", () => {
    const doc = bookingDocument({ from: MONDAY, to: MONDAY, days: [], now: NOW, timeZone: "Europe/Amsterdam" });
    expect(doc).toContain("Te boeken: 0m · Zonder Bridge-post: 0m · Away from BonzaiWork: 0m");
    expect(doc).toContain("Geen boekingen met een Bridge-post in deze periode.");
    expect(doc).toContain("Geen activiteit in deze periode.");
    expect(jsonBlock(doc)).toMatchObject({ boekingen: [], zonder_post: [], away: [], tijdlijn: [] });
  });

  test("fixtures gebruiken alleen placeholders", () => {
    const posts = [MEETING_POST, ...Object.values(PROJECTS).flatMap((project) => (project.bridgePost ? [project.bridgePost] : []))];
    for (const post of posts) expect(post.entityId).toMatch(/^<[A-Z_]+>$/);
    for (const project of Object.values(PROJECTS)) expect(project.name).toMatch(/^Project [A-Z]$/);
  });
});
