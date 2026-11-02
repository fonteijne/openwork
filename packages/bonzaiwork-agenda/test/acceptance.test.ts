import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createAgendaHooks, type AgendaHooks } from "../src/agenda.ts";
import { AWAY_LABEL } from "../src/types.ts";
import { fakeHost } from "./fake-host.ts";

/**
 * Plan §8, fase 1: with a fake host and a fake clock, a day with turns, presence, routine runs,
 * sub-tasks, summer time and midnight gives the right assignment per quarter.
 */
const cleanup: string[] = [];
let hooks: AgendaHooks | null = null;
afterEach(async () => {
  await hooks?.stop();
  for (const directory of cleanup.splice(0)) await rm(directory, { recursive: true, force: true });
});

test("een nacht over middernacht en de zomertijd heen", async () => {
  const stateDirectory = await mkdtemp(join(tmpdir(), "agenda-acceptance-"));
  cleanup.push(stateDirectory);
  // Zaterdag 28 maart 2026 23:30 tot zondag 29 maart 03:30; om 02:00 springt de klok naar 03:00.
  const local = (date: string, hour: number, minute: number) => new Date(`${date}T00:00:00`).getTime() + ((hour * 60 + minute) * 60_000) - (date === "2026-03-29" && hour >= 3 ? 60 * 60_000 : 0);
  const clock = { now: local("2026-03-28", 23, 30) };
  const desktop = { focused: true };
  const fake = fakeHost();
  hooks = createAgendaHooks({
    stateDirectory, now: () => clock.now, tickMs: 3_600_000, sampleMs: 3_600_000, timeZone: () => "Europe/Amsterdam",
    presenceSource: () => ({ windowFocused: () => desktop.focused, systemIdleSeconds: () => 3 }),
    isRoutineChat: (id) => id === "ses_routine",
  });
  const agenda = hooks;
  await agenda.start(fake.host);
  fake.session("ses_b", "Exportfout CSV");
  fake.session("ses_a", "Prijstabel Q4");
  fake.session("ses_routine", "Wat is er nieuw");
  fake.session("ses_child", "Subagent", "ses_b");

  const present = async (workspaceId: string | null, time: number) => {
    clock.now = time;
    agenda.reportPresence({ workspaceId });
    agenda.sample();
    await agenda.tick();
  };
  const turn = async (workspaceId: string, sessionId: string, time: number) => {
    clock.now = time;
    fake.emit(workspaceId, sessionId, "running");
    await agenda.settled();
    fake.emit(workspaceId, sessionId, "idle");
    await agenda.tick();
  };

  expect(new Date(local("2026-03-29", 3, 0)).getHours()).toBe(3);
  expect(local("2026-03-29", 3, 0) - local("2026-03-29", 1, 45)).toBe(15 * 60_000);

  await present("ws_a", local("2026-03-28", 23, 31));
  await present("ws_a", local("2026-03-28", 23, 32));
  // 23:45: een beurt in B (2) wint van één minuut in A (1); A staat erbij als gedeeld.
  await turn("ws_b", "ses_b", local("2026-03-28", 23, 46));
  await present("ws_a", local("2026-03-28", 23, 47));
  // Na middernacht: één minuut in A.
  await present("ws_a", local("2026-03-29", 0, 1));
  // 00:15: weg van de computer; een routine-run en een subtaak tellen niet.
  desktop.focused = false;
  await present("ws_a", local("2026-03-29", 0, 16));
  await turn("ws_a", "ses_routine", local("2026-03-29", 0, 17));
  await turn("ws_b", "ses_child", local("2026-03-29", 0, 18));
  desktop.focused = true;
  // Startscherm: aanwezig, maar geen project.
  await present(null, local("2026-03-29", 1, 0));
  await present("ws_a", local("2026-03-29", 1, 50));
  // Na de sprong naar 03:00.
  await turn("ws_a", "ses_a", local("2026-03-29", 3, 5));
  // 03:15: gelijkspel A (2 minuten) en B (1 beurt); B had de laatste activiteit.
  await present("ws_a", local("2026-03-29", 3, 16));
  await present("ws_a", local("2026-03-29", 3, 17));
  await turn("ws_b", "ses_b", local("2026-03-29", 3, 20));
  // De volgende ochtend kijken we terug (op de dag zelf loopt het venster door tot nu).
  clock.now = local("2026-03-30", 9, 0);
  await agenda.tick();

  const saturday = await agenda.dayView("2026-03-28");
  expect(saturday.quarters.map((quarter) => [quarter.key, quarter.label, quarter.shared])).toEqual([
    ["2026-03-28T23:30", "Project A", []],
    ["2026-03-28T23:45", "Project B", ["Project A"]],
  ]);
  expect(saturday.quarters[1]?.chats).toEqual(["Exportfout CSV"]);

  const sunday = await agenda.dayView("2026-03-29");
  expect(sunday.quarters.map((quarter) => [quarter.key.slice(11), quarter.label])).toEqual([
    ["00:00", "Project A"],
    ["00:15", AWAY_LABEL],
    ["00:30", AWAY_LABEL],
    ["00:45", AWAY_LABEL],
    ["01:00", AWAY_LABEL],
    ["01:15", AWAY_LABEL],
    ["01:30", AWAY_LABEL],
    ["01:45", "Project A"],
    ["03:00", "Project A"],
    ["03:15", "Project B"],
  ]);
  expect(sunday.quarters[1]).toMatchObject({ appClosed: false, chats: [] });
  expect(sunday.quarters[2]).toMatchObject({ appClosed: true });
  expect(sunday.quarters[8]?.chats).toEqual(["Prijstabel Q4"]);
  expect(sunday.quarters[9]?.shared).toEqual(["Project A"]);
  expect(sunday.totals).toEqual([{ bridgePost: null, label: "Project A", minutes: 45 }, { bridgePost: null, label: "Project B", minutes: 15 }]);
});
