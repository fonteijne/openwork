import { describe, expect, test } from "bun:test";

import { dayStart, quarterKey, QUARTER_MS } from "../src/clock.ts";
import { counts, dayQuarters, score, viewQuarter, winner, type ViewContext } from "../src/quarters.ts";
import { AWAY_LABEL, type AgendaDay, type Measured, type QuarterRecord } from "../src/types.ts";

const DATE = "2026-11-02";
const at = (hour: number, minute: number) => dayStart(DATE) + (hour * 60 + minute) * 60_000;
const measured = (scores: Record<string, number>, extra: Partial<Measured> = {}): Measured => ({ scores, lastActivity: {}, chats: {}, appOpen: true, ...extra });
const record = (start: number, fields: Partial<QuarterRecord> = {}): QuarterRecord => ({ key: quarterKey(start), start, measured: null, correction: null, note: null, reference: null, ...fields });
const context: ViewContext = {
  projects: { a: { name: "Project A", bridgePost: { entityId: "<ENTITY_ID_A>", label: "Project A, ontwikkeling" } }, b: { name: "Project B", bridgePost: null } },
  name: (id) => ({ a: "Project A", b: "Project B", c: "Project C" })[id] ?? id,
  now: dayStart("2026-11-03") + 9 * 60 * 60_000,
};
const day = (records: QuarterRecord[]): AgendaDay => ({ version: 1, date: DATE, quarters: Object.fromEntries(records.map((entry) => [entry.key, entry])), undo: {} });

describe("score en winnaar", () => {
  test("aanwezigheidsminuten plus twee keer de gestarte beurten", () => {
    expect(score(3, 0)).toBe(3);
    expect(score(1, 2)).toBe(5);
  });

  test("hoogste score wint, de anderen zijn gedeeld", () => {
    expect(winner(measured({ a: 4, b: 6, c: 0 }))).toEqual({ workspaceId: "b", others: ["a"] });
  });

  test("gelijkspel: laatste activiteit in het kwartier wint", () => {
    expect(winner(measured({ a: 4, b: 4 }, { lastActivity: { a: at(10, 14), b: at(10, 3) } })).workspaceId).toBe("a");
    expect(winner(measured({ a: 4, b: 4 }, { lastActivity: { a: at(10, 3), b: at(10, 14) } })).workspaceId).toBe("b");
  });

  test("alle scores 0 of geen meting: away", () => {
    expect(winner(measured({ a: 0 })).workspaceId).toBeNull();
    expect(winner(null)).toEqual({ workspaceId: null, others: [] });
  });
});

describe("weergave van een kwartier", () => {
  test("gemeten project met post, chattitels ontdubbeld en gedeeld", () => {
    const view = viewQuarter(at(10, 0), record(at(10, 0), { measured: measured({ a: 5, c: 1 }, { chats: { a: [{ id: "s1", title: "Prijstabel Q4" }, { id: "s1", title: "Prijstabel Q4" }, { id: "s2", title: null }] } }) }), context);
    expect(view).toMatchObject({ kind: "project", workspaceId: "a", label: "Project A", bridgePost: { entityId: "<ENTITY_ID_A>" }, source: "measured", shared: ["Project C"], chats: ["Prijstabel Q4"], appClosed: false, current: false, end: at(10, 15) });
  });

  test("away: met de app open of dicht", () => {
    expect(viewQuarter(at(12, 0), record(at(12, 0), { measured: measured({}) }), context)).toMatchObject({ kind: "away", label: AWAY_LABEL, appClosed: false });
    expect(viewQuarter(at(12, 0), undefined, context)).toMatchObject({ kind: "away", label: AWAY_LABEL, appClosed: true });
    // Het huidige kwartier is nog niet weggeschreven: niet "de app was dicht".
    expect(viewQuarter(at(18, 0), undefined, { ...context, now: at(18, 7) })).toMatchObject({ kind: "away", appClosed: false, current: true });
  });

  test("correctie gaat voor de meting", () => {
    const measuredA = measured({ a: 9 });
    expect(viewQuarter(at(10, 0), record(at(10, 0), { measured: measuredA, correction: { kind: "project", workspaceId: "b", at: 1 } }), context))
      .toMatchObject({ kind: "project", workspaceId: "b", label: "Project B", bridgePost: null, source: "user", shared: [] });
    expect(viewQuarter(at(10, 0), record(at(10, 0), { measured: measuredA, correction: { kind: "away", at: 1 } }), context))
      .toMatchObject({ kind: "away", source: "user", appClosed: false });
    expect(viewQuarter(at(10, 0), record(at(10, 0), { measured: measuredA, correction: { kind: "other", label: "Meeting sprintplanning", bridgePost: { entityId: "<ENTITY_ID_B>", label: null }, at: 1 }, note: "notitie", reference: "<TICKET>" }), context))
      .toMatchObject({ kind: "other", label: "Meeting sprintplanning", bridgePost: { entityId: "<ENTITY_ID_B>" }, source: "user", note: "notitie", reference: "<TICKET>" });
  });

  test("wat telt voor het dagvenster", () => {
    expect(counts(undefined)).toBe(false);
    expect(counts(record(at(9, 0), { measured: measured({ a: 0 }) }))).toBe(false);
    expect(counts(record(at(9, 0), { measured: measured({ a: 1 }) }))).toBe(true);
    expect(counts(record(at(9, 0), { correction: { kind: "away", at: 1 } }))).toBe(true);
    expect(counts(record(at(9, 0), { note: "x" }))).toBe(true);
  });
});

describe("dagvenster", () => {
  test("van het eerste tot het laatste actieve kwartier, away ertussen", () => {
    const quarters = dayQuarters(DATE, day([
      record(at(8, 0), { measured: measured({}) }),
      record(at(9, 0), { measured: measured({ a: 3 }) }),
      record(at(9, 30), { measured: measured({ b: 2 }) }),
      record(at(11, 0), { measured: measured({}) }),
    ]), context);
    expect(quarters.map((quarter) => quarter.key)).toEqual(["2026-11-02T09:00", "2026-11-02T09:15", "2026-11-02T09:30"]);
    expect(quarters[1]).toMatchObject({ kind: "away", appClosed: true });
  });

  test("een correctie buiten het venster vergroot het", () => {
    const quarters = dayQuarters(DATE, day([
      record(at(8, 0), { correction: { kind: "other", label: "Meeting", bridgePost: null, at: 1 } }),
      record(at(9, 0), { measured: measured({ a: 3 }) }),
    ]), context);
    expect(quarters).toHaveLength(5);
    expect(quarters[0]?.label).toBe("Meeting");
  });

  test("op de dag zelf tot nu", () => {
    const quarters = dayQuarters(DATE, day([record(at(9, 0), { measured: measured({ a: 3 }) })]), { ...context, now: at(10, 7) });
    expect(quarters.map((quarter) => quarter.key).at(-1)).toBe("2026-11-02T10:00");
    expect(quarters.at(-1)?.current).toBe(true);
  });

  test("een dag zonder activiteit is leeg", () => {
    expect(dayQuarters(DATE, day([record(at(9, 0), { measured: measured({}) })]), context)).toEqual([]);
  });

  test("een kwartier duurt altijd 15 minuten", () => {
    for (const quarter of dayQuarters("2026-10-25", { version: 1, date: "2026-10-25", quarters: { "2026-10-25T00:00": record(dayStart("2026-10-25"), { note: "x" }), "2026-10-25T23:45": record(dayStart("2026-10-26") - QUARTER_MS, { note: "y" }) }, undo: {} }, context)) {
      expect(quarter.end - quarter.start).toBe(QUARTER_MS);
    }
    expect(dayQuarters("2026-10-25", { version: 1, date: "2026-10-25", quarters: { "2026-10-25T00:00": record(dayStart("2026-10-25"), { note: "x" }), "2026-10-25T23:45": record(dayStart("2026-10-26") - QUARTER_MS, { note: "y" }) }, undo: {} }, context)).toHaveLength(100);
  });
});
