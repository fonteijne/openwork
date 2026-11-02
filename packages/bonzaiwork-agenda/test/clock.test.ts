import { describe, expect, test } from "bun:test";

import { addDays, dateOf, datesBetween, dayStart, isDate, isoLocal, keyStart, quarterKey, quarterStart, quartersOfDay, QUARTER_MS, timeOf, timeZoneName, weekday, weekOf } from "../src/clock.ts";

const local = (year: number, month: number, day: number, hour: number, minute: number, second = 0) => new Date(year, month - 1, day, hour, minute, second).getTime();

describe("kwartieren", () => {
  test("grenzen op :00, :15, :30 en :45 in lokale tijd", () => {
    expect(quarterStart(local(2026, 11, 2, 10, 29, 59))).toBe(local(2026, 11, 2, 10, 15));
    expect(quarterStart(local(2026, 11, 2, 10, 30))).toBe(local(2026, 11, 2, 10, 30));
    expect(quarterKey(local(2026, 11, 2, 10, 44, 59))).toBe("2026-11-02T10:30");
    expect(timeOf(local(2026, 11, 2, 9, 5))).toBe("09:05");
  });

  test("sleutel heen en terug", () => {
    for (const start of quartersOfDay("2026-11-02")) expect(keyStart(quarterKey(start))).toBe(start);
    expect(keyStart("2026-11-02T10:15")).toBe(local(2026, 11, 2, 10, 15));
  });

  test("ongeldige sleutels", () => {
    expect(keyStart("2026-11-02T10:10")).toBeNull();
    expect(keyStart("2026-13-02T10:15")).toBeNull();
    expect(keyStart("gisteren")).toBeNull();
    // Bestaat niet: de klok sprong van 02:00 naar 03:00.
    expect(keyStart("2026-03-29T02:15")).toBeNull();
  });

  test("middernacht: 23:45–00:00 hoort bij de dag ervoor", () => {
    const last = local(2026, 11, 2, 23, 45);
    expect(quarterKey(last)).toBe("2026-11-02T23:45");
    expect(dateOf(last)).toBe("2026-11-02");
    expect(dateOf(last + QUARTER_MS)).toBe("2026-11-03");
    expect(quartersOfDay("2026-11-02")).toHaveLength(96);
    expect(quartersOfDay("2026-11-02")[0]).toBe(dayStart("2026-11-02"));
  });

  test("zomertijd: 92 kwartieren, 02:00–03:00 bestaat niet", () => {
    const keys = quartersOfDay("2026-03-29").map(quarterKey);
    expect(keys).toHaveLength(92);
    expect(keys).toContain("2026-03-29T01:45");
    expect(keys).not.toContain("2026-03-29T02:00");
    expect(keys[keys.indexOf("2026-03-29T01:45") + 1]).toBe("2026-03-29T03:00");
  });

  test("wintertijd: 100 kwartieren, het herhaalde uur krijgt de offset in de sleutel", () => {
    const starts = quartersOfDay("2026-10-25");
    const keys = starts.map(quarterKey);
    expect(keys).toHaveLength(100);
    expect(new Set(keys).size).toBe(100);
    expect(keys).toContain("2026-10-25T02:15");
    expect(keys).toContain("2026-10-25T02:15+01:00");
    expect(keys.indexOf("2026-10-25T02:15+01:00") - keys.indexOf("2026-10-25T02:15")).toBe(4);
    for (const start of starts) expect(keyStart(quarterKey(start))).toBe(start);
    expect(isoLocal(keyStart("2026-10-25T02:15+01:00") ?? 0)).toBe("2026-10-25T02:15:00+01:00");
    expect(isoLocal(keyStart("2026-10-25T02:15") ?? 0)).toBe("2026-10-25T02:15:00+02:00");
  });
});

describe("datums en weken", () => {
  test("geldige datums", () => {
    expect(isDate("2026-11-02")).toBe(true);
    expect(isDate("2026-02-30")).toBe(false);
    expect(isDate("2026-11-2")).toBe(false);
  });

  test("rekenen over maand, jaar en klokwissel heen", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(datesBetween("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(datesBetween("2026-11-02", "2026-11-01")).toEqual([]);
  });

  test("week van maandag tot en met zondag", () => {
    expect(weekday("2026-11-02")).toBe(0);
    expect(weekday("2026-11-08")).toBe(6);
    expect(weekOf("2026-11-05")).toEqual({ from: "2026-11-02", to: "2026-11-08" });
    expect(weekOf("2026-11-02")).toEqual({ from: "2026-11-02", to: "2026-11-08" });
    expect(weekOf("2026-11-01")).toEqual({ from: "2026-10-26", to: "2026-11-01" });
  });

  test("tijdzone en offset voor het document", () => {
    expect(timeZoneName()).toBe("Europe/Amsterdam");
    expect(isoLocal(local(2026, 11, 2, 17, 31))).toBe("2026-11-02T17:31:00+01:00");
    expect(isoLocal(local(2026, 7, 1, 9, 0))).toBe("2026-07-01T09:00:00+02:00");
  });
});
