import { describe, expect, it } from "vitest";

import { dayFromWord, decisionsLead, dueLabel, freeTime, parseCapture, runsInProgress, startOfDay, todaysTodos } from "./model";
import type { Run, Todo } from "~/backend/cockpit";

// Thursday 5 November 2026, 08:52 local time.
const NOW = new Date(2026, 10, 5, 8, 52).getTime();
const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).getTime();

const todo = (fields: Partial<Todo>): Todo => ({
  id: "t",
  title: "To-do",
  projectId: null,
  origin: null,
  external: false,
  due: null,
  done: false,
  doneAt: null,
  today: true,
  rolledOver: 0,
  runId: null,
  createdAt: 0,
  ...fields,
});

describe("decisionsLead", () => {
  it("names each kind once, joined with en", () => {
    expect(decisionsLead([{ kind: "review" }, { kind: "question" }, { kind: "approval" }])).toBe(
      "Eén stap staat klaar om te controleren, een run heeft een vraag en één wijziging wacht op je goedkeuring.",
    );
    expect(decisionsLead([{ kind: "question" }, { kind: "question" }])).toBe("2 runs hebben een vraag.");
  });

  it("is calm without decisions", () => {
    expect(decisionsLead([])).toContain("geen beslissing");
  });
});

describe("dueLabel", () => {
  it("marks overdue, today, deadlines and no date", () => {
    expect(dueLabel(todo({ due: { kind: "due", at: at(4, 17) } }), NOW)).toEqual({ text: "Te laat · wo 4 nov", tone: "overdue" });
    expect(dueLabel(todo({ due: { kind: "due", at: at(5, 17) } }), NOW).text).toBe("Uiterlijk vandaag");
    expect(dueLabel(todo({ due: { kind: "deadline", at: at(9, 17) } }), NOW).text).toBe("Deadline ma 9 nov");
    expect(dueLabel(todo({}), NOW).text).toBe("Geen datum");
  });
});

describe("todaysTodos", () => {
  it("keeps open to-dos for today and anything due, overdue first", () => {
    const list = todaysTodos(
      [
        todo({ id: "a", due: null }),
        todo({ id: "b", due: { kind: "due", at: at(4, 17) } }),
        todo({ id: "c", done: true }),
        todo({ id: "d", today: false, due: { kind: "due", at: at(5, 12) } }),
        todo({ id: "e", today: false }),
      ],
      NOW,
    );
    expect(list.map((entry) => entry.id)).toEqual(["b", "d", "a"]);
  });
});

describe("freeTime", () => {
  it("counts open time until 18:00 outside the meetings ahead", () => {
    const events = [
      { id: "1", start: at(5, 9, 30), end: at(5, 9, 45), title: "Stand-up", proposed: false },
      { id: "2", start: at(5, 11), end: at(5, 12), title: "Gesprek", proposed: false },
      { id: "3", start: at(5, 13), end: at(5, 14), title: "Blok", proposed: true },
    ];
    expect(freeTime(events, NOW)).toEqual({ minutes: 9 * 60 + 8 - 75, meetings: 2 });
  });
});

describe("runsInProgress", () => {
  it("keeps working runs and those finished in the last day", () => {
    const run = (id: string, status: Run["status"], updatedAt: number) => ({ id, status, updatedAt });
    const runs = [run("old", "done", NOW - 2 * 86_400_000), run("done", "done", NOW - 3_600_000), run("work", "working", NOW - 60_000), run("q", "question", NOW)];
    // Only the fields the filter reads matter here.
    const ids = runsInProgress(runs.map((entry) => ({ ...sampleRun, ...entry })), NOW).map((entry) => entry.id);
    expect(ids).toEqual(["work", "done"]);
  });
});

const sampleRun: Run = {
  id: "r",
  title: "Run",
  projectId: null,
  werkwijzeId: null,
  werkwijzeName: "",
  status: "working",
  progress: "",
  waitingOn: "",
  waitingDetail: null,
  due: null,
  updatedAt: 0,
  startedAt: 0,
  chatRef: null,
  origin: null,
  stages: [],
  review: null,
  question: null,
  interruption: null,
  grants: [],
  budget: null,
  after: [],
  toolCalls: 0,
  queued: [],
};

describe("parseCapture", () => {
  const projects = [
    { id: "p-offertes", name: "Offertes 2026" },
    { id: "p-service", name: "Klantenservice" },
  ];
  it("reads a project tag, a day word and a waiting-for", () => {
    const parsed = parseCapture("Vraag Ruben om de testomgeving #offertes vrijdag", { projects, people: ["Ruben de Boer"], now: NOW });
    expect(parsed.tokens).toEqual([
      { kind: "project", token: "#offertes", projectId: "p-offertes", name: "Offertes 2026" },
      { kind: "date", token: "vrijdag", at: startOfDay(at(6, 12)) },
    ]);
    expect(parsed.waitingName).toBe("Ruben de Boer");
  });

  it("skips tokens turned back into text", () => {
    const parsed = parseCapture("Bel de klant morgen #klant", { projects, people: [], now: NOW, ignored: new Set(["morgen"]) });
    expect(parsed.tokens.map((token) => token.kind)).toEqual(["project"]);
    expect(parsed.waitingName).toBeNull();
  });

  it("never picks today for a weekday word", () => {
    expect(dayFromWord("donderdag", NOW)).toBe(startOfDay(at(12, 12)));
    expect(dayFromWord("morgen", NOW)).toBe(startOfDay(at(6, 12)));
  });
});
