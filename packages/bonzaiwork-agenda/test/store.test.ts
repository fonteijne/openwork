import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm, stat, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { keyStart } from "../src/clock.ts";
import { createAgendaStore } from "../src/store.ts";
import type { AgendaDay, AgendaSettings } from "../src/types.ts";

const directories: string[] = [];
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "agenda-store-"));
  directories.push(directory);
  const logs: Array<{ level: string; message: string }> = [];
  const store = createAgendaStore({ directory, log: (level, message) => logs.push({ level, message }), now: () => 1_000 });
  return { directory, store, logs };
}
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

const DAY: AgendaDay = {
  version: 1,
  date: "2026-11-02",
  quarters: {
    "2026-11-02T10:15": {
      key: "2026-11-02T10:15", start: keyStart("2026-11-02T10:15") ?? 0,
      measured: { scores: { a: 3 }, lastActivity: { a: 5 }, chats: { a: [{ id: "ses_1", title: "Prijstabel Q4" }] }, appOpen: true },
      correction: { kind: "other", label: "Meeting", bridgePost: { entityId: "<ENTITY_ID_B>", label: null }, at: 7 },
      note: "notitie", reference: "<TICKET>",
    },
  },
  undo: { u1: [{ key: "2026-11-02T10:15", before: null }] },
};

describe("store", () => {
  test("een lege map geeft standaardinstellingen en een lege dag", async () => {
    const { store } = await setup();
    expect(await store.readSettings()).toEqual({ version: 1, enabled: true, projects: {}, recentPosts: [] });
    expect(await store.readDay("2026-11-02")).toEqual({ version: 1, date: "2026-11-02", quarters: {}, undo: {} });
  });

  test("dag en instellingen heen en terug, met rechten 0600", async () => {
    const { directory, store } = await setup();
    await store.writeDay(DAY);
    const settings: AgendaSettings = { version: 1, enabled: false, projects: { a: { name: "Project A", bridgePost: { entityId: "<ENTITY_ID_A>", label: "Project A, ontwikkeling" } } }, recentPosts: [{ entityId: "<ENTITY_ID_A>", label: null }] };
    await store.writeSettings(settings);
    expect(await store.readDay("2026-11-02")).toEqual(DAY);
    expect(await store.readSettings()).toEqual(settings);
    expect((await stat(join(directory, "days", "2026-11-02.json"))).mode & 0o777).toBe(0o600);
    expect((await stat(join(directory, "settings.json"))).mode & 0o777).toBe(0o600);
  });

  test("atomisch: geen tijdelijke bestanden achter, gelijktijdige schrijfacties op volgorde", async () => {
    const { directory, store } = await setup();
    await Promise.all(Array.from({ length: 10 }, (_, index) => store.writeSettings({ version: 1, enabled: index % 2 === 0, projects: {}, recentPosts: [] })));
    expect(await readdir(directory)).toEqual(["settings.json"]);
    expect((await store.readSettings()).enabled).toBe(false);
  });

  test("corrupt bestand: lege dag, logregel, en het oude bestand blijft bewaard", async () => {
    const { directory, store, logs } = await setup();
    await mkdir(join(directory, "days"), { recursive: true });
    await writeFile(join(directory, "days", "2026-11-02.json"), "{ niet af");
    expect((await store.readDay("2026-11-02")).quarters).toEqual({});
    expect(logs).toEqual([{ level: "warn", message: "Agenda file could not be read; starting empty" }]);
    expect(await readFile(join(directory, "days", "2026-11-02.json.corrupt-1000"), "utf8")).toBe("{ niet af");
  });

  test("onverwachte inhoud wordt weggelaten, niet vertrouwd", async () => {
    const { directory, store } = await setup();
    await mkdir(join(directory, "days"), { recursive: true });
    await writeFile(join(directory, "days", "2026-11-02.json"), JSON.stringify({
      quarters: {
        x: { key: "2026-11-03T10:15" },
        y: { key: "2026-11-02T10:10" },
        z: { key: "2026-11-02T10:30", measured: { scores: { a: -1, b: "3", c: 2 }, appOpen: "ja" }, correction: { kind: "other", label: "" }, note: 5 },
      },
    }));
    const day = await store.readDay("2026-11-02");
    expect(Object.keys(day.quarters)).toEqual(["2026-11-02T10:30"]);
    expect(day.quarters["2026-11-02T10:30"]).toMatchObject({ measured: { scores: { c: 2 }, appOpen: false }, correction: null, note: null });
    await writeFile(join(directory, "settings.json"), JSON.stringify({ enabled: "nee", projects: { a: { name: 3, bridgePost: { entityId: "met spatie" } } }, recentPosts: [{ entityId: "" }, { entityId: "<ENTITY_ID_A>" }] }));
    expect(await store.readSettings()).toEqual({ version: 1, enabled: true, projects: { a: { name: null, bridgePost: null } }, recentPosts: [{ entityId: "<ENTITY_ID_A>", label: null }] });
  });

  test("een ongeldige datum komt niet in een bestandsnaam", async () => {
    const { store } = await setup();
    await expect(store.readDay("../settings")).rejects.toThrow("Invalid date");
  });
});
