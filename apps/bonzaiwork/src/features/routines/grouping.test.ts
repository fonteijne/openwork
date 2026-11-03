import { describe, expect, it } from "vitest";

import type { Chat, Routine, RoutineRun } from "~/backend/types";

import { groupRoutines, routineGroup, runOutcome, suggestName, whenPhrase } from "./grouping";

const AMS = "Europe/Amsterdam";
// Tuesday 3 Nov 2026 10:00 local.
const now = new Date(2026, 10, 3, 10, 0).getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function run(partial: Partial<RoutineRun>): RoutineRun {
  return { id: "run", routineId: "r", trigger: "scheduled", status: "succeeded", skippedReason: null, chatId: "c", scheduledAt: now - HOUR, startedAt: now - HOUR, finishedAt: now - HOUR + 60_000, error: null, ...partial };
}

function routine(partial: Partial<Routine>): Routine {
  return {
    id: "r",
    projectId: "p",
    name: "Routine",
    prompt: "Doe iets",
    model: null,
    schedule: { kind: "daily", timezone: AMS, hour: 9, minute: 0 },
    state: "active",
    needsAttentionReason: null,
    nextRunAt: now + DAY,
    lastRun: null,
    createdAt: now - 10 * DAY,
    updatedAt: now - DAY,
    brains: [],
    ...partial,
  };
}

function chat(partial: Partial<Chat>): Chat {
  return { id: "c", projectId: "p", title: "Weekoverzicht, week 44", untitled: false, createdAt: now, updatedAt: now, model: null, parentId: null, groupId: null, pinned: false, archived: false, note: null, status: "idle", revertMessageId: null, routineId: "r", preview: null, ...partial };
}

describe("routineGroup", () => {
  it("puts what needs a fix first, then what was missed, then today, later and paused", () => {
    expect(routineGroup(routine({ state: "needs_attention", needsAttentionReason: "Model weg" }), now)).toBe("attention");
    expect(routineGroup(routine({ lastRun: run({ status: "failed", error: "Mislukt" }) }), now)).toBe("attention");
    expect(routineGroup(routine({ lastRun: run({ status: "skipped", skippedReason: "app_closed", chatId: null }) }), now)).toBe("missed");
    expect(routineGroup(routine({ nextRunAt: now + 2 * HOUR }), now)).toBe("today");
    expect(routineGroup(routine({ nextRunAt: now + DAY }), now)).toBe("later");
    expect(routineGroup(routine({ state: "inactive", nextRunAt: null }), now)).toBe("paused");
    expect(routineGroup(routine({ state: "archived", nextRunAt: null }), now)).toBeNull();
  });

  it("does not call a paused routine missed", () => {
    expect(routineGroup(routine({ state: "inactive", lastRun: run({ status: "skipped", skippedReason: "app_closed", chatId: null }) }), now)).toBe("paused");
  });
});

describe("groupRoutines", () => {
  it("keeps brief order, drops empty groups and sorts today by next run", () => {
    const groups = groupRoutines(
      [
        routine({ id: "later", name: "B", nextRunAt: now + 3 * DAY }),
        routine({ id: "today-late", name: "Z", nextRunAt: now + 5 * HOUR }),
        routine({ id: "today-soon", name: "A", nextRunAt: now + HOUR }),
        routine({ id: "fix", state: "needs_attention" }),
        routine({ id: "gone", state: "archived" }),
      ],
      now,
    );
    expect(groups.map((group) => group.key)).toEqual(["attention", "today", "later"]);
    expect(groups[1]?.routines.map((entry) => entry.id)).toEqual(["today-soon", "today-late"]);
  });
});

describe("runOutcome", () => {
  it("reads as the chat's result and says when the chat waits on the person", () => {
    expect(runOutcome(run({}), chat({ preview: "4 offertes verstuurd, 1 akkoord" }))).toEqual({ status: "done", sentence: "4 offertes verstuurd, 1 akkoord", error: null });
    expect(runOutcome(run({}), chat({})).sentence).toBe("Weekoverzicht, week 44");
    expect(runOutcome(run({}), chat({ untitled: true, title: "Nieuwe chat" })).sentence).toBeNull();
    expect(runOutcome(run({ status: "running", finishedAt: null }), chat({ status: "waiting" })).status).toBe("waiting");
    expect(runOutcome(run({ status: "skipped", skippedReason: "app_closed", chatId: null }), null).status).toBe("missed");
    expect(runOutcome(run({ status: "failed", error: "Model weg", chatId: null }), null)).toEqual({ status: "failed", sentence: null, error: "Model weg" });
    expect(runOutcome(run({ status: "running", finishedAt: null }), chat({ status: "running" })).status).toBe("running");
  });
});

describe("whenPhrase", () => {
  it("says today, yesterday and tomorrow with the time", () => {
    expect(whenPhrase(now - HOUR, now)).toBe("vandaag om 09:00");
    expect(whenPhrase(now - DAY, now)).toBe("gisteren om 10:00");
    expect(whenPhrase(now + DAY, now)).toBe("morgen om 10:00");
    expect(whenPhrase(now - 3 * DAY, now)).toBe("za 31 okt om 10:00");
  });
});

describe("suggestName", () => {
  it("takes the first words of the first sentence", () => {
    expect(suggestName("Maak een overzicht van alle offertes die deze week zijn verstuurd, met bedrag en status. Haal de status uit HubSpot.")).toBe("Maak een overzicht van alle offertes die deze");
    expect(suggestName("Vat de nieuwe tickets samen.\nDaarna…")).toBe("Vat de nieuwe tickets samen");
    expect(suggestName("   ")).toBe("");
  });
});
