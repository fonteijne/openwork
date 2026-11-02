import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createAgendaHooks, type AgendaHooks } from "../src/agenda.ts";
import { dayStart } from "../src/clock.ts";
import { chatTitle } from "../src/tracker.ts";
import { fakeHost } from "./fake-host.ts";

const cleanup: string[] = [];
let hooks: AgendaHooks | null = null;
afterEach(async () => {
  await hooks?.stop();
  hooks = null;
  for (const directory of cleanup.splice(0)) await rm(directory, { recursive: true, force: true });
});

const at = (date: string, hour: number, minute: number, second = 0) => dayStart(date) + ((hour * 60 + minute) * 60 + second) * 1000;

async function setup(options: { routineChats?: string[]; start?: number } = {}) {
  const stateDirectory = await mkdtemp(join(tmpdir(), "agenda-tracker-"));
  cleanup.push(stateDirectory);
  const clock = { now: options.start ?? at("2026-11-02", 9, 0) };
  const fake = fakeHost();
  hooks = createAgendaHooks({ stateDirectory, now: () => clock.now, tickMs: 3_600_000, isRoutineChat: (id) => (options.routineChats ?? []).includes(id) });
  await hooks.start(fake.host);
  const current = hooks;
  return {
    fake, clock, stateDirectory, hooks: current,
    async turn(workspaceId: string, sessionId: string, time: number) {
      clock.now = time;
      fake.emit(workspaceId, sessionId, "running");
      await current.settled();
    },
    async day(date: string) {
      await current.tick();
      return current.readDay(date);
    },
  };
}

describe("tracker", () => {
  test("een beurt telt één keer, in het kwartier waarin hij begon", async () => {
    const { fake, clock, turn, day } = await setup();
    fake.session("ses_1", "Prijstabel Q4");
    await turn("ws_a", "ses_1", at("2026-11-02", 9, 5));
    // Dezelfde beurt nog eens gemeld (stream opnieuw verbonden): telt niet opnieuw.
    await turn("ws_a", "ses_1", at("2026-11-02", 9, 6));
    // De beurt loopt door in het volgende kwartier: telt daar niet.
    clock.now = at("2026-11-02", 9, 40);
    const stored = await day("2026-11-02");
    expect(stored.quarters["2026-11-02T09:00"]?.measured).toMatchObject({ scores: { ws_a: 2 }, chats: { ws_a: [{ id: "ses_1", title: "Prijstabel Q4" }] }, appOpen: true });
    expect(stored.quarters["2026-11-02T09:15"]).toBeUndefined();
    // Na het einde telt een nieuwe beurt in dezelfde chat weer.
    fake.emit("ws_a", "ses_1", "idle");
    await turn("ws_a", "ses_1", at("2026-11-02", 9, 41));
    clock.now = at("2026-11-02", 10, 0);
    expect((await day("2026-11-02")).quarters["2026-11-02T09:30"]?.measured?.scores).toEqual({ ws_a: 2 });
  });

  test("routine-runs en subtaken tellen niet", async () => {
    const { fake, clock, turn, day } = await setup({ routineChats: ["ses_routine"] });
    fake.session("ses_parent", "Opzet rapport");
    fake.session("ses_child", "Subagent", "ses_parent");
    fake.session("ses_routine", "Wat is er nieuw");
    await turn("ws_a", "ses_routine", at("2026-11-02", 9, 1));
    await turn("ws_a", "ses_child", at("2026-11-02", 9, 2));
    await turn("ws_b", "ses_parent", at("2026-11-02", 9, 3));
    fake.emit("ws_a", "ses_child", "idle");
    const calls = fake.infoCalls;
    // Een bekende subtaak wordt niet opnieuw opgezocht.
    await turn("ws_a", "ses_child", at("2026-11-02", 9, 4));
    expect(fake.infoCalls).toBe(calls);
    clock.now = at("2026-11-02", 9, 15);
    expect((await day("2026-11-02")).quarters["2026-11-02T09:00"]?.measured?.scores).toEqual({ ws_b: 2 });
  });

  test("chattitels komen mee en worden bij het afsluiten bijgewerkt", async () => {
    const { fake, clock, turn, day } = await setup();
    fake.session("ses_new", "New session - 2026-11-02T09:00:00.000Z");
    fake.session("ses_none", null);
    await turn("ws_a", "ses_new", at("2026-11-02", 9, 1));
    await turn("ws_a", "ses_none", at("2026-11-02", 9, 2));
    fake.session("ses_new", "Template offerte");
    clock.now = at("2026-11-02", 9, 15);
    expect((await day("2026-11-02")).quarters["2026-11-02T09:00"]?.measured?.chats).toEqual({ ws_a: [{ id: "ses_new", title: "Template offerte" }, { id: "ses_none", title: null }] });
    expect(chatTitle("  Prijstabel\n Q4 ")).toBe("Prijstabel Q4");
  });

  test("een gemist einde wordt opgeruimd, daarna telt de chat weer", async () => {
    const { fake, clock, turn, hooks, day } = await setup();
    fake.session("ses_1", "Exportfout CSV");
    await turn("ws_a", "ses_1", at("2026-11-02", 9, 1));
    fake.setRunning("ws_a", ["ses_1"]);
    clock.now = at("2026-11-02", 9, 5);
    await hooks.tick();
    // Nog bezig volgens de engine: blijft één beurt.
    await turn("ws_a", "ses_1", at("2026-11-02", 9, 6));
    fake.setRunning("ws_a", []);
    clock.now = at("2026-11-02", 9, 7);
    await hooks.tick();
    await turn("ws_a", "ses_1", at("2026-11-02", 9, 8));
    clock.now = at("2026-11-02", 9, 15);
    expect((await day("2026-11-02")).quarters["2026-11-02T09:00"]?.measured?.scores).toEqual({ ws_a: 4 });
  });

  test("middernacht en wintertijd: elk kwartier in zijn eigen dag en sleutel", async () => {
    const { fake, clock, turn, day } = await setup({ start: at("2026-10-24", 23, 40) });
    fake.session("ses_1", "Nachtwerk");
    await turn("ws_a", "ses_1", at("2026-10-24", 23, 50));
    fake.emit("ws_a", "ses_1", "idle");
    await turn("ws_a", "ses_1", at("2026-10-25", 0, 5));
    fake.emit("ws_a", "ses_1", "idle");
    // 02:20 in het herhaalde uur: een uur na de eerste 02:20.
    await turn("ws_b", "ses_1", at("2026-10-25", 2, 20) + 60 * 60_000);
    clock.now = at("2026-10-25", 4, 0);
    expect(Object.keys((await day("2026-10-24")).quarters)).toEqual(["2026-10-24T23:30", "2026-10-24T23:45"]);
    const sunday = await day("2026-10-25");
    expect(sunday.quarters["2026-10-25T00:00"]?.measured?.scores).toEqual({ ws_a: 2 });
    expect(sunday.quarters["2026-10-25T02:15+01:00"]?.measured?.scores).toEqual({ ws_b: 2 });
    expect(sunday.quarters["2026-10-25T02:15"]).toBeUndefined();
  });

  test("meting uit: niets geteld", async () => {
    const { fake, clock, turn, hooks, stateDirectory } = await setup();
    await hooks.stop();
    await Bun.write(join(stateDirectory, "agenda", "settings.json"), JSON.stringify({ version: 1, enabled: false, projects: {}, recentPosts: [] }));
    await hooks.start(fake.host);
    fake.session("ses_1", "Prijstabel Q4");
    await turn("ws_a", "ses_1", at("2026-11-02", 9, 20));
    clock.now = at("2026-11-02", 9, 45);
    await hooks.tick();
    expect((await hooks.readDay("2026-11-02")).quarters["2026-11-02T09:15"]).toBeUndefined();
  });

  test("herstart binnen een kwartier: de meting telt op", async () => {
    const { fake, clock, turn, hooks } = await setup();
    fake.session("ses_1", "Prijstabel Q4");
    fake.session("ses_2", "Template offerte");
    await turn("ws_a", "ses_1", at("2026-11-02", 9, 1));
    await hooks.stop();
    expect(fake.listeners).toBe(0);
    clock.now = at("2026-11-02", 9, 5);
    await hooks.start(fake.host);
    await turn("ws_a", "ses_2", at("2026-11-02", 9, 6));
    clock.now = at("2026-11-02", 9, 15);
    await hooks.tick();
    expect((await hooks.readDay("2026-11-02")).quarters["2026-11-02T09:00"]?.measured).toMatchObject({ scores: { ws_a: 4 }, chats: { ws_a: [{ id: "ses_1" }, { id: "ses_2" }] }, appOpen: true });
  });

  test("de app open zonder activiteit: away, niet 'de app was dicht'", async () => {
    const { clock, day } = await setup();
    clock.now = at("2026-11-02", 9, 20);
    expect((await day("2026-11-02")).quarters["2026-11-02T09:00"]?.measured).toEqual({ scores: {}, lastActivity: {}, chats: {}, appOpen: true });
  });
});
