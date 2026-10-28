import { describe, expect, it } from "vitest";

import { describeSchedule, missedOccurrence, nextOccurrences, resolveWallTime } from "./schedule";

const AMS = "Europe/Amsterdam";

describe("nextOccurrences", () => {
  it("runs on weekdays only for a weekday schedule", () => {
    // Friday 2026-10-30 12:00 Amsterdam (CET after the switch on 25 Oct).
    const after = Date.UTC(2026, 9, 30, 11, 0);
    const runs = nextOccurrences({ kind: "weekly", timezone: AMS, daysOfWeek: [1, 2, 3, 4, 5], hour: 9, minute: 0 }, after, 3);
    expect(runs.map((at) => new Date(at).toISOString())).toEqual([
      "2026-11-02T08:00:00.000Z",
      "2026-11-03T08:00:00.000Z",
      "2026-11-04T08:00:00.000Z",
    ]);
  });

  it("keeps the wall-clock time across the DST change", () => {
    const after = Date.UTC(2026, 9, 23, 12, 0);
    const runs = nextOccurrences({ kind: "daily", timezone: AMS, hour: 9, minute: 0 }, after, 4);
    expect(runs.map((at) => new Date(at).toISOString())).toEqual([
      "2026-10-24T07:00:00.000Z",
      "2026-10-25T08:00:00.000Z",
      "2026-10-26T08:00:00.000Z",
      "2026-10-27T08:00:00.000Z",
    ]);
  });

  it("moves a time inside the spring-forward gap to the first valid minute", () => {
    // 29 March 2026: 02:00-03:00 does not exist in Amsterdam.
    const at = resolveWallTime({ year: 2026, month: 3, day: 29 }, 2, 30, AMS);
    expect(new Date(at).toISOString()).toBe("2026-03-29T01:00:00.000Z");
  });

  it("spreads an interval over its window", () => {
    const after = Date.UTC(2026, 10, 2, 6, 0);
    const runs = nextOccurrences({ kind: "interval", timezone: AMS, everyHours: 3, startHour: 9, endHour: 18, daysOfWeek: [1, 2, 3, 4, 5] }, after, 4);
    expect(runs.map((at) => new Date(at).toISOString())).toEqual([
      "2026-11-02T08:00:00.000Z",
      "2026-11-02T11:00:00.000Z",
      "2026-11-02T14:00:00.000Z",
      "2026-11-03T08:00:00.000Z",
    ]);
  });

  it("returns a one-off only while it is in the future", () => {
    const at = Date.UTC(2026, 10, 4, 9, 0);
    expect(nextOccurrences({ kind: "once", timezone: AMS, at }, at - 1)).toEqual([at]);
    expect(nextOccurrences({ kind: "once", timezone: AMS, at }, at)).toEqual([]);
  });
});

describe("missedOccurrence", () => {
  it("reports only the latest missed run", () => {
    const schedule = { kind: "daily" as const, timezone: AMS, hour: 9, minute: 0 };
    const lastSeen = Date.UTC(2026, 9, 26, 12, 0);
    const now = Date.UTC(2026, 9, 28, 12, 0);
    expect(new Date(missedOccurrence(schedule, lastSeen, now) ?? 0).toISOString()).toBe("2026-10-28T08:00:00.000Z");
    expect(missedOccurrence(schedule, now, now + 60_000)).toBeNull();
  });
});

describe("describeSchedule", () => {
  it("says the schedule in plain Dutch", () => {
    expect(describeSchedule({ kind: "weekly", timezone: AMS, daysOfWeek: [1, 2, 3, 4, 5], hour: 9, minute: 0 }, AMS)).toBe("Elke werkdag om 09:00");
    expect(describeSchedule({ kind: "weekly", timezone: AMS, daysOfWeek: [4, 1], hour: 14, minute: 30 }, AMS)).toBe("Elke maandag en donderdag om 14:30");
    expect(describeSchedule({ kind: "daily", timezone: AMS, hour: 8, minute: 5 }, AMS)).toBe("Elke dag om 08:05");
    expect(describeSchedule({ kind: "interval", timezone: AMS, everyHours: 2, startHour: 9, endHour: 17, daysOfWeek: [1, 2, 3, 4, 5] }, AMS))
      .toBe("Elke 2 uur tussen 09:00 en 17:00 op werkdagen");
    expect(describeSchedule({ kind: "interval", timezone: AMS, everyHours: 1, startHour: 0, endHour: 24, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }, AMS)).toBe("Elk uur");
  });

  it("names a foreign zone", () => {
    expect(describeSchedule({ kind: "daily", timezone: "America/New_York", hour: 9, minute: 0 }, AMS)).toBe("Elke dag om 09:00 (America/New York)");
  });
});
