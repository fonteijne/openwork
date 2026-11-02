import { describe, expect, it } from "vitest";

import { dayTitle, defaultQuarter, minutesToBook, periodFor, quarterOptions, timeRange } from "./format";

describe("agenda display helpers", () => {
  it("writes times and ranges in 24 hours", () => {
    expect(timeRange(new Date(2026, 10, 2, 9, 0).getTime(), new Date(2026, 10, 2, 10, 45).getTime())).toBe("09:00–10:45");
  });

  it("names today and yesterday, other days in nl-NL", () => {
    expect(dayTitle("2026-11-02", "2026-11-02")).toBe("Vandaag");
    expect(dayTitle("2026-11-01", "2026-11-02")).toBe("Gisteren");
    expect(dayTitle("2026-10-28", "2026-11-02")).toBe("wo 28 okt");
  });

  it("chooses the periods of the export dialog", () => {
    // Thursday 2026-11-05
    expect(periodFor("today", "2026-11-05")).toEqual({ from: "2026-11-05", to: "2026-11-05" });
    expect(periodFor("yesterday", "2026-11-05")).toEqual({ from: "2026-11-04", to: "2026-11-04" });
    expect(periodFor("week", "2026-11-05")).toEqual({ from: "2026-11-02", to: "2026-11-05" });
    expect(periodFor("lastWeek", "2026-11-05")).toEqual({ from: "2026-10-26", to: "2026-11-01" });
  });

  it("lists every quarter of a day, ending at 24:00", () => {
    const options = quarterOptions("2026-11-02");
    expect(options.from).toHaveLength(96);
    expect(options.from[0]).toEqual({ value: "2026-11-02T00:00", label: "00:00" });
    expect(options.to.at(-1)).toEqual({ value: "2026-11-02T23:45", label: "24:00" });
  });

  it("starts adding at the quarter of now, or at 09:00 on another day", () => {
    expect(defaultQuarter("2026-11-02", new Date(2026, 10, 2, 14, 37).getTime())).toBe("2026-11-02T14:30");
    expect(defaultQuarter("2026-10-30", new Date(2026, 10, 2, 14, 37).getTime())).toBe("2026-10-30T09:00");
  });

  it("counts what is to be booked, never away", () => {
    expect(minutesToBook(undefined)).toBe(0);
    expect(minutesToBook({ date: "2026-11-02", now: null, quarters: [], blocks: [], totals: [{ bridgePost: null, label: "Project D", minutes: 30 }, { bridgePost: { entityId: "<ENTITY_ID_A>", label: null }, label: "Project A", minutes: 90 }], missingPosts: 2 })).toBe(120);
  });
});

describe("quarter options on a day the clock goes back", () => {
  it("names the repeated hour with its offset", () => {
    // Only meaningful in a zone with DST; CI runs in UTC, where the day simply has 96 quarters.
    const options = quarterOptions("2026-10-25");
    const repeated = options.from.filter((option) => option.value.includes("+"));
    if (Intl.DateTimeFormat().resolvedOptions().timeZone === "Europe/Amsterdam") {
      expect(options.from).toHaveLength(100);
      expect(repeated[0]?.label).toBe("02:00 (+01:00)");
    } else {
      expect(new Set(options.from.map((option) => option.value)).size).toBe(options.from.length);
    }
  });
});
