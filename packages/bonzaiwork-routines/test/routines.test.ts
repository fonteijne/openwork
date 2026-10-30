import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRoutinesHooks, type RoutinesHooks, type RoutinesHost } from "../src/routines.ts";

type Call = { method: string; path: string; body: unknown };
let hooks: RoutinesHooks | null = null;
const cleanup: string[] = [];
afterEach(async () => {
  hooks?.stop();
  hooks = null;
  for (const dir of cleanup.splice(0)) await rm(dir, { recursive: true, force: true });
});

function fakeHost() {
  const calls: Call[] = [];
  const listeners = new Set<(activity: { workspaceId: string; sessionId: string; state: "running" | "idle"; outcome?: "succeeded" | "failed" | "interrupted" }) => void>();
  let sessions = 0;
  const pending: Record<string, unknown[]> = {};
  const messages: Record<string, unknown> = {};
  const host: RoutinesHost & { calls: Call[]; pending: typeof pending; messages: typeof messages; emit: (sessionId: string, outcome: "succeeded" | "failed") => void } = {
    readOnly: false,
    workspaces: () => [{ id: "ws_sales", path: "/brains/Sales" }, { id: "ws_mijn", path: "/brains/Mijn brein" }],
    engineRequest: async (workspaceId, method, path, body) => {
      calls.push({ method, path, body });
      if (path === "/api/mcp") return { status: 200, body: { data: [{ name: "breinen", status: { status: "connected" } }] } };
      if (method === "POST" && path === "/api/session") return { status: 200, body: { data: { id: `ses_${++sessions}` } } };
      const permission = /^\/api\/session\/([^/]+)\/permission$/.exec(path);
      if (permission) return { status: 200, body: { data: pending[permission[1] ?? ""] ?? [] } };
      const message = /^\/api\/session\/([^/]+)\/message/.exec(path);
      if (message) return { status: 200, body: messages[message[1] ?? ""] ?? { data: [] } };
      return { status: 200, body: { ok: true, workspaceId } };
    },
    onSessionActivity: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    log: () => {},
    calls, pending, messages,
    emit: (sessionId, outcome) => { for (const listener of listeners) listener({ workspaceId: "ws_mijn", sessionId, state: "idle", outcome }); },
  };
  return host;
}

async function call(path: string, init: { method?: string; body?: unknown } = {}) {
  const method = init.method ?? "GET";
  const route = hooks?.routes.find((candidate) => candidate.method === method && new RegExp(`^${candidate.path.replace(/:[a-zA-Z]+/g, "[^/?]+")}(\\?.*)?$`).test(path));
  if (!route) throw new Error(`no route ${method} ${path}`);
  const names = [...route.path.matchAll(/:([a-zA-Z]+)/g)].map((match) => match[1] ?? "");
  const values = new RegExp(`^${route.path.replace(/:[a-zA-Z]+/g, "([^/?]+)")}`).exec(path)?.slice(1) ?? [];
  const response = await route.handle(new Request(`http://local${path}`, { method, ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }) }), Object.fromEntries(names.map((name, index) => [name, values[index] ?? ""])));
  return { status: response.status, body: await response.json() };
}

test("plannen, op tijd een chat starten, uitkomst volgen, gemist als de app dicht was", async () => {
  const state = await mkdtemp(join(tmpdir(), "routines-"));
  cleanup.push(state);
  let clock = Date.UTC(2026, 9, 30, 7, 0);
  hooks = createRoutinesHooks({ stateDirectory: state, now: () => clock, tickMs: 3_600_000 });
  const host = fakeHost();
  await hooks.start(host);
  const created = await call("/bonzaiwork/routines", { method: "POST", body: { workspaceId: "ws_mijn", name: "Wat is er nieuw", prompt: "Vat samen", model: "claude", schedule: { kind: "daily", timezone: "UTC", hour: 8, minute: 0 }, brains: ["ws_sales"] } });
  expect(created.status).toBe(201);
  expect(created.body).toMatchObject({ state: "active", nextRunAt: Date.UTC(2026, 9, 30, 8, 0), brains: ["ws_sales"] });
  const id = String(created.body.id);

  clock = Date.UTC(2026, 9, 30, 8, 0, 30);
  await hooks.tick();
  expect(host.calls.find((entry) => entry.path === "/api/session")?.body).toMatchObject({ title: "Wat is er nieuw", model: { providerID: "litellm", id: "claude" }, location: { directory: "/brains/Mijn brein" } });
  expect(host.calls.find((entry) => entry.path === "/api/session/ses_1/prompt")?.body).toEqual({ text: "Vat samen", delivery: "steer" });
  host.emit("ses_1", "succeeded");
  const listed = await call("/bonzaiwork/routines?workspaceId=ws_mijn");
  expect(listed.body.items[0]).toMatchObject({ nextRunAt: Date.UTC(2026, 9, 31, 8, 0), lastRun: { status: "succeeded", chatId: "ses_1", trigger: "scheduled" } });

  // The app was closed the next morning: missed, not run late.
  clock = Date.UTC(2026, 9, 31, 11, 0);
  await hooks.tick();
  const runs = await call(`/bonzaiwork/routines/${id}/runs`);
  expect(runs.body.items[0]).toMatchObject({ status: "skipped", skippedReason: "app_closed" });
  expect(host.calls.filter((entry) => entry.path === "/api/session").length).toBe(1);

  // Saved on disk; a restart reads it back.
  hooks.stop();
  hooks = createRoutinesHooks({ stateDirectory: state, now: () => clock, tickMs: 3_600_000 });
  await hooks.start(fakeHost());
  expect((await call("/bonzaiwork/routines")).body.items).toMatchObject([{ id, name: "Wat is er nieuw", brains: ["ws_sales"] }]);
  expect((await call(`/bonzaiwork/routines/${id}`, { method: "PATCH", body: { state: "inactive" } })).body).toMatchObject({ state: "inactive", nextRunAt: null });
  expect((await call("/bonzaiwork/routines/preview", { method: "POST", body: { schedule: { kind: "weekly", timezone: "Europe/Amsterdam", daysOfWeek: [1], hour: 9, minute: 0 } } })).body.occurrences.length).toBe(5);
  expect((await call("/bonzaiwork/routines", { method: "POST", body: { workspaceId: "nope", name: "x", prompt: "y", schedule: { kind: "daily", timezone: "UTC", hour: 8, minute: 0 } } })).status).toBe(400);
});

test("een routine laat de vragen voor zijn eigen breinen beantwoorden, alleen voor zijn eigen runs", async () => {
  const state = await mkdtemp(join(tmpdir(), "routines-"));
  cleanup.push(state);
  const asked: Array<[string, string, readonly string[]]> = [];
  hooks = createRoutinesHooks({ stateDirectory: state, tickMs: 3_600_000, answerBrainReads: async (workspaceId, sessionId, allowed) => { asked.push([workspaceId, sessionId, allowed]); return 0; } });
  const host = fakeHost();
  await hooks.start(host);
  const created = await call("/bonzaiwork/routines", { method: "POST", body: { workspaceId: "ws_mijn", name: "Nieuws", prompt: "Wat is er nieuw?", schedule: { kind: "daily", timezone: "UTC", hour: 8, minute: 0 }, brains: ["ws_sales"] } });
  const plain = await call("/bonzaiwork/routines", { method: "POST", body: { workspaceId: "ws_mijn", name: "Zonder", prompt: "x", schedule: { kind: "daily", timezone: "UTC", hour: 8, minute: 0 } } });
  const run = await call(`/bonzaiwork/routines/${String(created.body.id)}/run`, { method: "POST" });
  await call(`/bonzaiwork/routines/${String(plain.body.id)}/run`, { method: "POST" });
  expect(run.body.data).toMatchObject({ status: "running", trigger: "manual", chatId: "ses_1" });
  await hooks.answerBrainQuestions();
  expect(asked).toEqual([["ws_mijn", "ses_1", ["ws_sales"]]]);
  host.emit("ses_1", "succeeded");
  await hooks.answerBrainQuestions();
  expect(asked.length).toBe(1);
});
