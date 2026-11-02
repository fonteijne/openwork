import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createAgendaHooks, type AgendaHooks } from "../src/agenda.ts";
import { dayStart } from "../src/clock.ts";
import { fakeHost } from "./fake-host.ts";

const cleanup: string[] = [];
let hooks: AgendaHooks | null = null;
afterEach(async () => {
  await hooks?.stop();
  hooks = null;
  for (const directory of cleanup.splice(0)) await rm(directory, { recursive: true, force: true });
});

const at = (date: string, hour: number, minute: number) => dayStart(date) + (hour * 60 + minute) * 60_000;

async function setup(options: { readOnly?: boolean; now?: number } = {}) {
  const stateDirectory = await mkdtemp(join(tmpdir(), "agenda-routes-"));
  const downloads = await mkdtemp(join(tmpdir(), "agenda-downloads-"));
  cleanup.push(stateDirectory, downloads);
  const clock = { now: options.now ?? at("2026-11-02", 10, 7) };
  const fake = fakeHost({ readOnly: options.readOnly });
  const current = createAgendaHooks({
    stateDirectory, now: () => clock.now, tickMs: 3_600_000, sampleMs: 3_600_000, saveDirectory: () => downloads, timeZone: () => "Europe/Amsterdam",
    presenceSource: () => ({ windowFocused: () => true, systemIdleSeconds: () => 1 }),
  });
  hooks = current;
  await current.start(fake.host);
  async function call(path: string, init: { method?: string; body?: unknown } = {}) {
    const method = init.method ?? "GET";
    const route = current.routes.find((candidate) => candidate.method === method && new RegExp(`^${candidate.path.replace(/:[a-zA-Z]+/g, "[^/?]+")}(\\?.*)?$`).test(path));
    if (!route) throw new Error(`no route ${method} ${path}`);
    const names = [...route.path.matchAll(/:([a-zA-Z]+)/g)].map((match) => match[1] ?? "");
    const values = new RegExp(`^${route.path.replace(/:[a-zA-Z]+/g, "([^/?]+)")}`).exec(path)?.slice(1) ?? [];
    const response = await route.handle(new Request(`http://local${path}`, { method, ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }) }), Object.fromEntries(names.map((name, index) => [name, decodeURIComponent(values[index] ?? "")])));
    const type = response.headers.get("content-type") ?? "";
    return { status: response.status, type, body: type.includes("json") ? await response.json() : await response.text() };
  }
  return { fake, clock, downloads, stateDirectory, hooks: current, call };
}

describe("routes", () => {
  test("auth: lezen met client, wijzigen met host-token, presence met client", async () => {
    const { hooks } = await setup();
    expect(Object.fromEntries(hooks.routes.map((route) => [`${route.method} ${route.path}`, route.auth]))).toEqual({
      "GET /bonzaiwork/agenda/settings": "client",
      "PATCH /bonzaiwork/agenda/settings": "host-token",
      "PUT /bonzaiwork/agenda/projects/:workspaceId": "host-token",
      "GET /bonzaiwork/agenda/day": "client",
      "PUT /bonzaiwork/agenda/quarters": "host-token",
      "POST /bonzaiwork/agenda/undo/:undoId": "host-token",
      "POST /bonzaiwork/agenda/presence": "client",
      "GET /bonzaiwork/agenda/booking-doc": "client",
      "POST /bonzaiwork/agenda/booking-doc/save": "host-token",
    });
  });

  test("alleen-lezen apparaat: wijzigen geeft 403 read_only, lezen werkt", async () => {
    const { call } = await setup({ readOnly: true });
    for (const [method, path, body] of [
      ["PATCH", "/bonzaiwork/agenda/settings", { enabled: false }],
      ["PUT", "/bonzaiwork/agenda/projects/ws_a", { bridgePost: null }],
      ["PUT", "/bonzaiwork/agenda/quarters", { date: "2026-11-02", from: "2026-11-02T09:00", to: "2026-11-02T09:00", correction: { kind: "away" } }],
      ["POST", "/bonzaiwork/agenda/undo/u-2026-11-02-abc", undefined],
      ["POST", "/bonzaiwork/agenda/booking-doc/save", { from: "2026-11-02", to: "2026-11-02" }],
    ] as const) {
      const response = await call(path, { method, body });
      expect([path, response.status, response.body.code]).toEqual([path, 403, "read_only"]);
    }
    expect((await call("/bonzaiwork/agenda/settings")).status).toBe(200);
    expect((await call("/bonzaiwork/agenda/day")).status).toBe(200);
  });

  test("instellingen: projecten met naam en post, meting aan/uit", async () => {
    const { call } = await setup();
    expect((await call("/bonzaiwork/agenda/settings")).body).toEqual({
      enabled: true,
      projects: [{ workspaceId: "ws_a", name: "Project A", bridgePost: null }, { workspaceId: "ws_b", name: "Project B", bridgePost: null }],
      recentPosts: [],
    });
    expect((await call("/bonzaiwork/agenda/settings", { method: "PATCH", body: { enabled: "nee" } })).status).toBe(400);
    expect((await call("/bonzaiwork/agenda/settings", { method: "PATCH", body: { enabled: false } })).body.enabled).toBe(false);
  });

  test("Bridge-post per project: geldig, ongeldig, onbekend project, wissen", async () => {
    const { call } = await setup();
    const post = { entityId: " <ENTITY_ID_A> ", label: "Project A, ontwikkeling" };
    expect((await call("/bonzaiwork/agenda/projects/ws_a", { method: "PUT", body: { bridgePost: post } })).body).toEqual({ workspaceId: "ws_a", name: "Project A", bridgePost: { entityId: "<ENTITY_ID_A>", label: "Project A, ontwikkeling" } });
    expect((await call("/bonzaiwork/agenda/projects/ws_a", { method: "PUT", body: { bridgePost: { entityId: "met spatie" } } })).status).toBe(400);
    expect((await call("/bonzaiwork/agenda/projects/ws_a", { method: "PUT", body: {} })).status).toBe(400);
    expect((await call("/bonzaiwork/agenda/projects/ws_x", { method: "PUT", body: { bridgePost: null } })).status).toBe(404);
    const settings = (await call("/bonzaiwork/agenda/settings")).body;
    expect(settings.recentPosts).toEqual([{ entityId: "<ENTITY_ID_A>", label: "Project A, ontwikkeling" }]);
    expect((await call("/bonzaiwork/agenda/projects/ws_a", { method: "PUT", body: { bridgePost: null } })).body.bridgePost).toBeNull();
  });

  test("dag: ongeldige datum, standaard vandaag", async () => {
    const { call } = await setup();
    expect((await call("/bonzaiwork/agenda/day?date=2026-02-30")).status).toBe(400);
    expect((await call("/bonzaiwork/agenda/day")).body).toMatchObject({ date: "2026-11-02", quarters: [], blocks: [], totals: [], missingPosts: 0, now: null });
  });

  test("presence: onbekend project geweigerd, naam onthouden, minuut telt live mee", async () => {
    const { call, hooks } = await setup();
    expect((await call("/bonzaiwork/agenda/presence", { method: "POST", body: { workspaceId: "ws_x" } })).status).toBe(400);
    expect((await call("/bonzaiwork/agenda/presence", { method: "POST", body: { workspaceId: "ws_a", name: "Project A (nieuw)" } })).status).toBe(200);
    hooks.sample();
    const day = (await call("/bonzaiwork/agenda/day")).body;
    expect(day.now).toMatchObject({ workspaceId: "ws_a", label: "Project A (nieuw)" });
    expect(day.quarters).toHaveLength(1);
    expect((await call("/bonzaiwork/agenda/presence", { method: "POST", body: { workspaceId: null } })).status).toBe(200);
  });

  test("kwartieren corrigeren, terug naar de meting en ongedaan maken", async () => {
    const { call, clock, hooks } = await setup({ now: at("2026-11-02", 9, 0) });
    await call("/bonzaiwork/agenda/presence", { method: "POST", body: { workspaceId: "ws_a" } });
    hooks.sample();
    // De app staat open: de klok tikt in elk kwartier.
    for (const minute of [20, 35, 50]) { clock.now = at("2026-11-02", 9, minute); await hooks.tick(); }
    const meeting = { kind: "other", label: "Meeting sprintplanning", bridgePost: { entityId: "<ENTITY_ID_B>", label: "Intern overleg" } };
    const set = await call("/bonzaiwork/agenda/quarters", { method: "PUT", body: { date: "2026-11-02", from: "2026-11-02T08:00", to: "2026-11-02T08:45", correction: meeting, note: "  planning  ", reference: "<TICKET>" } });
    expect(set.status).toBe(200);
    let day = (await call("/bonzaiwork/agenda/day?date=2026-11-02")).body;
    expect(day.blocks.map((block: { label: string; quarters: number }) => [block.label, block.quarters])).toEqual([["Meeting sprintplanning", 4], ["Project A", 1], ["Away from BonzaiWork", 3]]);
    expect(day.blocks[0]).toMatchObject({ notes: ["planning"], reference: "<TICKET>", source: "user", bridgePost: { entityId: "<ENTITY_ID_B>" } });
    expect((await call("/bonzaiwork/agenda/settings")).body.recentPosts).toEqual([{ entityId: "<ENTITY_ID_B>", label: "Intern overleg" }]);

    // Het gemeten kwartier toch weg; dan terug naar de meting.
    const away = await call("/bonzaiwork/agenda/quarters", { method: "PUT", body: { date: "2026-11-02", from: "2026-11-02T09:00", to: "2026-11-02T09:00", correction: { kind: "away" } } });
    expect((await call("/bonzaiwork/agenda/day?date=2026-11-02")).body.quarters[4]).toMatchObject({ kind: "away", source: "user" });
    await call("/bonzaiwork/agenda/quarters", { method: "PUT", body: { date: "2026-11-02", from: "2026-11-02T09:00", to: "2026-11-02T09:00", correction: null } });
    expect((await call("/bonzaiwork/agenda/day?date=2026-11-02")).body.quarters[4]).toMatchObject({ kind: "project", source: "measured" });

    // Ongedaan maken herstelt wat er vóór die wijziging stond, en kan één keer.
    expect((await call(`/bonzaiwork/agenda/undo/${set.body.undoId}`, { method: "POST" })).status).toBe(200);
    day = (await call("/bonzaiwork/agenda/day?date=2026-11-02")).body;
    expect(day.quarters[0]).toMatchObject({ key: "2026-11-02T09:00", kind: "project" });
    expect((await call(`/bonzaiwork/agenda/undo/${set.body.undoId}`, { method: "POST" })).status).toBe(404);
    expect((await call(`/bonzaiwork/agenda/undo/${away.body.undoId}`, { method: "POST" })).status).toBe(200);
    expect((await call("/bonzaiwork/agenda/undo/onzin", { method: "POST" })).status).toBe(404);
    // Correctie op een ander project; geen lege kwartieren achter na terugzetten.
    await call("/bonzaiwork/agenda/quarters", { method: "PUT", body: { date: "2026-11-02", from: "2026-11-02T11:00", to: "2026-11-02T11:00", correction: { kind: "project", workspaceId: "ws_b" } } });
    await call("/bonzaiwork/agenda/quarters", { method: "PUT", body: { date: "2026-11-02", from: "2026-11-02T11:00", to: "2026-11-02T11:00", correction: null } });
    expect(Object.keys((await hooks.readDay("2026-11-02")).quarters)).toEqual(["2026-11-02T09:00", "2026-11-02T09:15", "2026-11-02T09:30"]);
  });

  test("ongedaan maken onthoudt de laatste twintig wijzigingen", async () => {
    const { call, hooks } = await setup();
    const ids: string[] = [];
    for (let index = 0; index < 22; index++) {
      ids.push((await call("/bonzaiwork/agenda/quarters", { method: "PUT", body: { date: "2026-11-02", from: "2026-11-02T09:00", to: "2026-11-02T09:00", correction: { kind: "away" }, note: `n${index}` } })).body.undoId);
    }
    expect(Object.keys((await hooks.readDay("2026-11-02")).undo)).toEqual(ids.slice(2));
    expect((await call(`/bonzaiwork/agenda/undo/${ids[0]}`, { method: "POST" })).status).toBe(404);
  });

  test("ongeldige correcties", async () => {
    const { call } = await setup();
    const base = { date: "2026-11-02", from: "2026-11-02T09:00", to: "2026-11-02T09:15" };
    for (const body of [
      { ...base, date: "2026-11-31", correction: { kind: "away" } },
      { ...base, from: "2026-11-03T09:00", correction: { kind: "away" } },
      { ...base, from: "2026-11-02T09:10", correction: { kind: "away" } },
      { ...base, from: "2026-11-02T10:00", correction: { kind: "away" } },
      { ...base },
      { ...base, correction: { kind: "lunch" } },
      { ...base, correction: { kind: "project", workspaceId: "ws_x" } },
      { ...base, correction: { kind: "other", label: "" } },
      { ...base, correction: { kind: "other", label: "Meeting", bridgePost: { entityId: "" } } },
      { ...base, correction: { kind: "away" }, note: "x".repeat(501) },
      { ...base, correction: { kind: "away" }, reference: "x".repeat(121) },
    ]) {
      expect((await call("/bonzaiwork/agenda/quarters", { method: "PUT", body })).status).toBe(400);
    }
  });

  test("boekdocument: Markdown, maximale periode, opslaan zonder te overschrijven", async () => {
    const { call, downloads } = await setup();
    await call("/bonzaiwork/agenda/quarters", { method: "PUT", body: { date: "2026-11-02", from: "2026-11-02T09:00", to: "2026-11-02T09:45", correction: { kind: "other", label: "Meeting", bridgePost: { entityId: "<ENTITY_ID_B>", label: null } } } });
    const doc = await call("/bonzaiwork/agenda/booking-doc?from=2026-11-02&to=2026-11-02");
    expect(doc.status).toBe(200);
    expect(doc.type).toBe("text/markdown; charset=utf-8");
    expect(doc.body).toContain("| bw-2026-11-02-1 | 2026-11-02 | `<ENTITY_ID_B>` | 1h | 60 | 09:00–10:00 | Meeting | – |");
    expect((await call("/bonzaiwork/agenda/booking-doc")).body).toContain("# Uren uit BonzaiWork: 2026-11-02\n");
    expect((await call("/bonzaiwork/agenda/booking-doc?from=2026-10-01&to=2026-10-31")).status).toBe(200);
    expect((await call("/bonzaiwork/agenda/booking-doc?from=2026-10-01&to=2026-11-01")).body.code).toBe("period_too_long");
    expect((await call("/bonzaiwork/agenda/booking-doc?from=2026-11-02&to=2026-11-01")).body.code).toBe("invalid_period");
    expect((await call("/bonzaiwork/agenda/booking-doc?from=gisteren")).status).toBe(400);

    const first = await call("/bonzaiwork/agenda/booking-doc/save", { method: "POST", body: { from: "2026-11-02", to: "2026-11-02" } });
    const second = await call("/bonzaiwork/agenda/booking-doc/save", { method: "POST", body: { from: "2026-11-02", to: "2026-11-02" } });
    const week = await call("/bonzaiwork/agenda/booking-doc/save", { method: "POST", body: { from: "2026-11-02", to: "2026-11-08" } });
    expect([first.body.path, second.body.path, week.body.path]).toEqual([join(downloads, "bonzaiwork-uren-2026-11-02.md"), join(downloads, "bonzaiwork-uren-2026-11-02-2.md"), join(downloads, "bonzaiwork-uren-2026-11-02_2026-11-08.md")]);
    expect(await readFile(first.body.path, "utf8")).toBe(doc.body);
    expect((await stat(first.body.path)).mode & 0o777).toBe(0o600);
    expect((await readdir(downloads)).length).toBe(3);
    expect((await call("/bonzaiwork/agenda/booking-doc/save", { method: "POST", body: { from: "2026-10-01", to: "2026-11-01" } })).status).toBe(400);
  });
});
