import { describe, expect, it } from "vitest";
import { dayView, quarterKey, QUARTER_MS, type QuarterView } from "@bonzaiwork/agenda/model";

import { awayMinutes, dayCardRows, displayLabel, keyRanges, weekDates } from "./day-model";

const POST = { entityId: "POST_A", label: "Project A, ontwikkeling" };

function quarter(start: number, input: Partial<QuarterView>): QuarterView {
  return {
    key: quarterKey(start),
    start,
    end: start + QUARTER_MS,
    kind: "project",
    workspaceId: "p-1",
    projectName: "Offertes",
    label: "Offertes",
    bridgePost: null,
    source: "measured",
    shared: [],
    chats: [],
    note: null,
    reference: null,
    appClosed: false,
    current: false,
    ...input,
  };
}

const at = (hour: number, minute = 0) => new Date(2026, 10, 2, hour, minute).getTime();

describe("day card rows", () => {
  const quarters = [
    quarter(at(9), { bridgePost: POST }),
    quarter(at(9, 15), { bridgePost: POST }),
    quarter(at(9, 30), { workspaceId: "p-2", projectName: "Service", label: "Service" }),
    quarter(at(9, 45), { kind: "away", workspaceId: null, projectName: null, label: "Away from BonzaiWork" }),
    quarter(at(10), { workspaceId: "p-2", projectName: "Service", label: "Service" }),
    quarter(at(10, 30), { kind: "other", workspaceId: null, projectName: null, label: "Meeting" }),
  ];
  const day = dayView("2026-11-02", quarters);

  it("groups per post, then per label, and skips away", () => {
    const rows = dayCardRows(day);
    expect(rows.map((row) => [row.label, row.minutes, row.kind, row.workspaceId])).toEqual([
      ["Project A, ontwikkeling", 30, null, "p-1"],
      ["Service", 30, "project", "p-2"],
      ["Meeting", 15, "other", null],
    ]);
    expect(rows.map((row) => row.minutes)).toEqual(day.totals.map((total) => total.minutes));
  });

  it("counts away as not booked", () => {
    expect(awayMinutes(day)).toBe(15);
  });

  it("splits non-contiguous quarters into ranges for setQuarters", () => {
    const service = dayCardRows(day).find((row) => row.label === "Service");
    expect(keyRanges(service?.quarters ?? [])).toEqual([
      { from: "2026-11-02T09:30", to: "2026-11-02T09:30" },
      { from: "2026-11-02T10:00", to: "2026-11-02T10:00" },
    ]);
    expect(keyRanges(quarters.slice(0, 2))).toEqual([{ from: "2026-11-02T09:00", to: "2026-11-02T09:15" }]);
  });
});

describe("week dates and labels", () => {
  it("lists Monday to Sunday around a date", () => {
    expect(weekDates("2026-11-05")).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
    expect(weekDates("2026-11-08")[0]).toBe("2026-11-02");
  });

  it("shows away in Dutch while the data keeps the English label", () => {
    expect(displayLabel({ kind: "away", label: "Away from BonzaiWork", source: "measured" })).toBe("Niet in BonzaiWork");
    expect(displayLabel({ kind: "away", label: "Away from BonzaiWork", source: "user" })).toBe("Niet boeken");
    expect(displayLabel({ kind: "other", label: "Meeting", source: "user" })).toBe("Meeting");
  });
});
