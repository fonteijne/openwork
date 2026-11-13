import { describe, expect, it } from "vitest";

import type { AttentionItem, DayItem, Meeting, UpcomingRow } from "~/backend/types";

import { FOCUS_BLOCK_MINUTES, focusMinutes, formatDay, groupUpcoming, meetingTime, minutesUntil, upcomingNow, withWorld } from "./model";

const meeting: Meeting = { id: "m", title: "Overleg", start: new Date(2026, 10, 13, 10, 20).getTime(), end: new Date(2026, 10, 13, 11, 20).getTime(), allDay: false, location: null, organizer: null, link: null };
const message: DayItem = { kind: "message", key: "mail:1", source: "mail", title: "T", from: "F", why: "W", draft: null, link: null, reply: null, at: 5 };
const promise: DayItem = { kind: "commitment", key: "belofte:1", source: "mail", text: "X", who: "mine", person: null, due: null, brainId: null, link: null, at: 9 };
const soon: DayItem = { kind: "meeting", key: "meeting:m", meeting, prep: null, at: 1 };

describe("de kaarten van de wereld in Voor jou", () => {
  it("staan na wat een agent stilzet en vóór mislukte chats; de afspraak eerst, dan berichten, dan beloftes", () => {
    const items: AttentionItem[] = [
      { kind: "proposal", proposal: { id: "p", preference: "x", reason: null, at: 1 }, at: 1 },
      { kind: "chat_failed", projectId: "a", chatId: "c", chatTitle: "Chat", error: { kind: "unknown", detail: null }, at: 99 },
      { kind: "brain", projectId: "a", state: "conflict", at: 3 },
    ];
    const merged = withWorld(items, [promise, message, soon]);
    expect(merged.map((item) => (item.kind === "world" ? `world:${item.item.kind}` : item.kind))).toEqual(["world:meeting", "world:message", "world:commitment", "chat_failed", "brain", "proposal"]);
  });

  it("zonder kaarten van de wereld verandert de lijst niet", () => {
    const items: AttentionItem[] = [{ kind: "brain", projectId: "a", state: "error", at: 3 }];
    expect(withWorld(items, [])).toEqual(items);
  });
});

describe("de focusregel", () => {
  it("telt hele minuten en begint bij nul, ook als de klok terugloopt", () => {
    expect(focusMinutes(1_000, 1_000 + 59_000)).toBe(0);
    expect(focusMinutes(1_000, 1_000 + 25 * 60_000 + 5)).toBe(FOCUS_BLOCK_MINUTES);
    expect(focusMinutes(5_000, 1_000)).toBe(0);
  });
});

describe("Komt eraan", () => {
  it("groepeert in de volgorde van de server en slaat lege groepen over", () => {
    const row = (key: string, bucket: UpcomingRow["bucket"]): UpcomingRow => ({ kind: "meeting", key, bucket, date: "2026-11-13", meeting });
    expect(groupUpcoming([row("a", "late"), row("b", "late"), row("c", "week")]).map((group) => `${group.bucket}:${group.rows.length}`)).toEqual(["late:2", "week:1"]);
    expect(groupUpcoming([])).toEqual([]);
  });

  it("toont in één kolom alleen wat te laat of vandaag is, hooguit drie", () => {
    const row = (key: string, bucket: UpcomingRow["bucket"]): UpcomingRow => ({ kind: "meeting", key, bucket, date: "2026-11-13", meeting });
    expect(upcomingNow([row("a", "late"), row("b", "today"), row("c", "today"), row("d", "today"), row("e", "week")]).map((entry) => entry.key)).toEqual(["a", "b", "c"]);
    expect(upcomingNow([row("e", "week"), row("f", "later")])).toEqual([]);
  });

  it("leest een datum en een afspraak zoals een mens ze zegt", () => {
    expect(formatDay("2026-11-16")).toBe("ma 16 nov");
    expect(formatDay("geen datum")).toBe("geen datum");
    expect(meetingTime(meeting)).toBe("10:20–11:20");
    expect(meetingTime({ ...meeting, allDay: true })).toBeNull();
    expect(minutesUntil(meeting.start, meeting.start - 19.5 * 60_000)).toBe(20);
  });
});
