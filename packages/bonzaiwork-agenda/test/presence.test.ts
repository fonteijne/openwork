import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createAgendaHooks, type AgendaHooks } from "../src/agenda.ts";
import { dayStart } from "../src/clock.ts";
import { createPresence, registeredPresenceSource, registerPresenceSource, PRESENCE_SOURCE_GLOBAL, type PresenceSource } from "../src/presence.ts";
import { fakeHost } from "./fake-host.ts";

const at = (hour: number, minute: number, second = 0) => dayStart("2026-11-02") + ((hour * 60 + minute) * 60 + second) * 1000;

function sampler(desktop: PresenceSource | null, enabled = true) {
  const clock = { now: at(9, 0) };
  const minutes: Array<{ workspaceId: string; at: number }> = [];
  const presence = createPresence({ now: () => clock.now, enabled: () => enabled, source: () => desktop, addPresence: (workspaceId, time) => minutes.push({ workspaceId, at: time }) });
  return { clock, minutes, presence };
}

describe("aanwezigheid", () => {
  test("desktop: focus en minder dan 60 s idle in een open project", () => {
    const desktop = { focused: true, idle: 5 };
    const { presence, minutes } = sampler({ windowFocused: () => desktop.focused, systemIdleSeconds: () => desktop.idle });
    presence.report({ workspaceId: "ws_a" });
    expect(presence.sample()).toBe("ws_a");
    desktop.idle = 59;
    expect(presence.sample()).toBe("ws_a");
    desktop.idle = 60;
    expect(presence.sample()).toBeNull();
    desktop.idle = 0;
    desktop.focused = false;
    expect(presence.sample()).toBeNull();
    expect(minutes).toHaveLength(2);
  });

  test("geen open project (startscherm, app-instellingen) telt niet", () => {
    const { presence } = sampler({ windowFocused: () => true, systemIdleSeconds: () => 0 });
    expect(presence.sample()).toBeNull();
    presence.report({ workspaceId: "ws_a" });
    presence.report({ workspaceId: null });
    expect(presence.sample()).toBeNull();
  });

  test("een bron die faalt telt niet", () => {
    const { presence } = sampler({ windowFocused: () => { throw new Error("weg"); }, systemIdleSeconds: () => 0 });
    presence.report({ workspaceId: "ws_a" });
    expect(presence.sample()).toBeNull();
  });

  test("browser: terugval op het UI-signaal, zolang het vers is", () => {
    const { presence, clock } = sampler(null);
    presence.report({ workspaceId: "ws_a" });
    // Alleen het project, geen focus of invoer bekend.
    expect(presence.sample()).toBeNull();
    presence.report({ workspaceId: "ws_a", focused: true, lastInputAt: at(8, 59, 30) });
    expect(presence.sample()).toBe("ws_a");
    clock.now = at(9, 0, 31);
    expect(presence.sample()).toBeNull();
    presence.report({ workspaceId: "ws_a", focused: false, lastInputAt: at(9, 0, 30) });
    expect(presence.sample()).toBeNull();
    presence.report({ workspaceId: "ws_a", focused: true });
    expect(presence.sample()).toBe("ws_a");
    // Het signaal stopt (tab dicht): na 2,5 minuut telt het niet meer.
    clock.now = at(9, 3, 30);
    expect(presence.sample()).toBeNull();
  });

  test("meting uit: niets", () => {
    const { presence } = sampler({ windowFocused: () => true, systemIdleSeconds: () => 0 }, false);
    presence.report({ workspaceId: "ws_a" });
    expect(presence.sample()).toBeNull();
  });

  test("registratie op een globaal symbool, alleen een geldige bron", () => {
    const before: unknown = Reflect.get(globalThis, PRESENCE_SOURCE_GLOBAL);
    Reflect.set(globalThis, PRESENCE_SOURCE_GLOBAL, { windowFocused: true });
    expect(registeredPresenceSource()).toBeNull();
    const source = { windowFocused: () => true, systemIdleSeconds: () => 0 };
    registerPresenceSource(source);
    expect(registeredPresenceSource()).toBe(source);
    Reflect.set(globalThis, PRESENCE_SOURCE_GLOBAL, before);
  });
});

describe("aanwezigheid in de agenda", () => {
  const cleanup: string[] = [];
  let hooks: AgendaHooks | null = null;
  afterEach(async () => {
    await hooks?.stop();
    for (const directory of cleanup.splice(0)) await rm(directory, { recursive: true, force: true });
  });

  test("minuten en beurten samen in de score van het kwartier", async () => {
    const stateDirectory = await mkdtemp(join(tmpdir(), "agenda-presence-"));
    cleanup.push(stateDirectory);
    const clock = { now: at(10, 0) };
    const desktop = { focused: true };
    const fake = fakeHost();
    hooks = createAgendaHooks({ stateDirectory, now: () => clock.now, tickMs: 3_600_000, sampleMs: 3_600_000, presenceSource: () => ({ windowFocused: () => desktop.focused, systemIdleSeconds: () => 1 }) });
    await hooks.start(fake.host);
    hooks.reportPresence({ workspaceId: "ws_a" });
    for (const minute of [1, 2, 3]) { clock.now = at(10, minute); hooks.sample(); }
    fake.session("ses_b", "Exportfout CSV");
    clock.now = at(10, 4);
    fake.emit("ws_b", "ses_b", "running");
    await hooks.settled();
    // Weg van de computer: de beurt in B loopt door, maar telt niet als aanwezigheid.
    desktop.focused = false;
    for (const minute of [5, 6, 7, 8]) { clock.now = at(10, minute); hooks.sample(); }
    clock.now = at(10, 15);
    await hooks.tick();
    expect((await hooks.readDay("2026-11-02")).quarters["2026-11-02T10:00"]?.measured).toMatchObject({ scores: { ws_a: 3, ws_b: 2 }, lastActivity: { ws_a: at(10, 3), ws_b: at(10, 4) } });
  });
});
