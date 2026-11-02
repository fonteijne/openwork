import { describe, expect, test } from "bun:test";

import { blocks, bridgeDuration, dayView, dutchDuration, proposal, ranges, totals } from "../src/overview.ts";
import { AWAY_LABEL } from "../src/types.ts";
import { at, EXAMPLE_DAY, MEETING_POST, views } from "./fixtures.ts";

const DATE = "2026-11-02";

describe("duur", () => {
  test("voor Bridge en voor mensen", () => {
    expect([0, 45, 60, 105, 210].map(bridgeDuration)).toEqual(["0m", "45m", "1h", "1h 45m", "3h 30m"]);
    expect([0, 30, 60, 375].map(dutchDuration)).toEqual(["0m", "30m", "1u", "6u 15m"]);
  });

  test("aaneengesloten kwartieren als tijden", () => {
    const list = views(DATE, [{ from: "09:00", to: "09:30", workspaceId: "ws_a" }, { from: "10:00", to: "10:15", workspaceId: "ws_a" }]).filter((quarter) => quarter.kind === "project");
    expect(ranges(list)).toEqual([{ from: "09:00", to: "09:30" }, { from: "10:00", to: "10:15" }]);
  });
});

describe("blokken", () => {
  test("samenvoegen bij gelijke soort, project, post, referentie en bron", () => {
    const list = blocks(views(DATE, EXAMPLE_DAY));
    expect(list.map((block) => [block.label, block.quarters, block.source])).toEqual([
      ["Project A", 7, "measured"], ["Project D", 1, "measured"], ["Meeting sprintplanning", 4, "user"], [AWAY_LABEL, 3, "measured"],
      ["Project D", 1, "measured"], [AWAY_LABEL, 2, "measured"], ["Project A", 7, "measured"], ["Meeting team", 3, "user"], ["Project C", 4, "measured"],
    ]);
    expect(list[5]).toMatchObject({ appClosed: true });
    expect(list[3]).toMatchObject({ appClosed: false });
    expect(list[6]).toMatchObject({ chats: ["Template offerte"], notes: ["staffelkorting herzien"], shared: ["Project C"] });
  });

  test("een andere referentie of post splitst", () => {
    const list = blocks(views(DATE, [
      { from: "09:00", to: "09:30", workspaceId: "ws_a" },
      { from: "09:30", to: "09:45", workspaceId: "ws_a", reference: "<TICKET>" },
      { from: "09:45", to: "10:00", correction: { kind: "other", label: "Meeting", bridgePost: MEETING_POST } },
      { from: "10:00", to: "10:15", correction: { kind: "other", label: "Meeting", bridgePost: null } },
    ]));
    expect(list.map((block) => block.quarters)).toEqual([2, 1, 1, 1]);
  });
});

describe("dag", () => {
  test("totalen per post, away telt niet, tijd zonder post apart", () => {
    const list = views(DATE, EXAMPLE_DAY);
    expect(totals(list)).toEqual([
      { bridgePost: { entityId: "<ENTITY_ID_A>", label: "Project A, ontwikkeling" }, label: "Project A, ontwikkeling", minutes: 210 },
      { bridgePost: null, label: "Project D", minutes: 30 },
      { bridgePost: MEETING_POST, label: "Intern overleg", minutes: 105 },
      { bridgePost: { entityId: "<ENTITY_ID_C>", label: "Project C" }, label: "Project C", minutes: 60 },
    ]);
    const view = dayView(DATE, list);
    expect(view.missingPosts).toBe(2);
    expect(view.now).toBeNull();
  });

  test("nu bezig: label en begin van het lopende blok", () => {
    const view = dayView(DATE, views(DATE, [{ from: "09:00", to: "10:30", workspaceId: "ws_a" }], at(DATE, 10, 20)));
    expect(view.now).toEqual({ workspaceId: "ws_a", label: "Project A", since: at(DATE, 9, 0) });
    const away = dayView(DATE, views(DATE, [{ from: "09:00", to: "09:30", workspaceId: "ws_a" }], at(DATE, 10, 20)));
    expect(away.now).toEqual({ workspaceId: null, label: AWAY_LABEL, since: at(DATE, 9, 30) });
  });
});

describe("boekvoorstel", () => {
  test("per datum × post, gesplitst per referentie, away nooit", () => {
    const result = proposal([dayView(DATE, views(DATE, EXAMPLE_DAY))]);
    expect(result.bookings.map((booking) => [booking.id, booking.bridgePost.entityId, booking.minutes, booking.duration, booking.times.map((time) => `${time.from}–${time.to}`).join(", "), booking.reference])).toEqual([
      ["bw-2026-11-02-1", "<ENTITY_ID_A>", 210, "3h 30m", "09:00–10:45, 13:30–15:15", null],
      ["bw-2026-11-02-2", "<ENTITY_ID_B>", 105, "1h 45m", "11:00–12:00, 15:15–16:00", null],
      ["bw-2026-11-02-3", "<ENTITY_ID_C>", 60, "1h", "16:00–17:00", "<TICKET>"],
    ]);
    expect(result.bookings[0]?.material).toEqual({ projects: ["Project A"], labels: [], chats: ["Prijstabel Q4", "Template offerte"], notes: ["staffelkorting herzien"] });
    expect(result.bookings[0]?.sharedWith).toEqual(["Project C"]);
    expect(result.bookings[1]?.material.labels).toEqual(["Meeting sprintplanning", "Meeting team"]);
    expect(result.missing).toEqual([{ date: DATE, label: "Project D", kind: "project", minutes: 30, times: [{ from: "10:45", to: "11:00" }, { from: "12:45", to: "13:00" }] }]);
    expect(result.away).toEqual([
      { date: DATE, from: "12:00", to: "12:45", minutes: 45, appClosed: false },
      { date: DATE, from: "13:00", to: "13:30", minutes: 30, appClosed: true },
    ]);
    expect(result.shared).toEqual([{ date: DATE, from: "14:00", to: "14:15", minutes: 15, label: "Project A", sharedWith: ["Project C"] }]);
    expect(result.minutes).toEqual({ book: 375, missing: 30, away: 75 });
    for (const booking of result.bookings) expect(booking.minutes % 15).toBe(0);
  });

  test("verschillende referenties binnen een post: één boeking per referentie", () => {
    const result = proposal([dayView(DATE, views(DATE, [
      { from: "09:00", to: "09:30", workspaceId: "ws_c", reference: "<TICKET_1>" },
      { from: "09:30", to: "10:00", workspaceId: "ws_c", reference: "<TICKET_2>" },
      { from: "10:00", to: "10:15", workspaceId: "ws_c", reference: "<TICKET_1>" },
    ]))]);
    expect(result.bookings.map((booking) => [booking.reference, booking.minutes])).toEqual([["<TICKET_1>", 45], ["<TICKET_2>", 30]]);
  });

  test("materiaal ontdubbeld en afgekapt", () => {
    const chats = Array.from({ length: 14 }, (_, index) => `Chat ${index % 12} ${"x".repeat(index === 0 ? 130 : 0)}`.trim());
    const result = proposal([dayView(DATE, views(DATE, [{ from: "09:00", to: "09:15", workspaceId: "ws_a", chats }]))]);
    const material = result.bookings[0]?.material.chats ?? [];
    expect(material).toHaveLength(10);
    expect(material[0]).toHaveLength(120);
    expect(material[0]?.endsWith("…")).toBe(true);
  });

  test("een week: ids per datum, dagen op volgorde", () => {
    const result = proposal([
      dayView("2026-11-03", views("2026-11-03", [{ from: "09:00", to: "09:30", workspaceId: "ws_c" }])),
      dayView(DATE, views(DATE, [{ from: "09:00", to: "09:15", workspaceId: "ws_a" }])),
    ]);
    expect(result.bookings.map((booking) => booking.id)).toEqual(["bw-2026-11-02-1", "bw-2026-11-03-1"]);
  });
});
