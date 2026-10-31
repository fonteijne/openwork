import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { nextAutomationOccurrence, previewAutomationSchedule } from "@openwork/types/automation-schedule";
import { automationScheduleSchema, type AutomationSchedule } from "@openwork/types/automations";

/**
 * Routines (frontend-contract §5.6, §7.4): in project X, on schedule Y, send
 * prompt Z as a new chat. The planner runs in the server process, so only
 * while the app is open; a run that fell while it was closed is recorded as
 * missed, not caught up (R1). A routine may name brains it reads without a
 * click (brains plan §5.2): the planner answers the engine's question for
 * those brains, and only for its own runs.
 */
export type RoutineSchedule = Exclude<AutomationSchedule, { kind: "calendar" }>;
export type RoutineState = "active" | "inactive" | "needs_attention" | "archived";
export type RoutineRun = {
  id: string;
  routineId: string;
  trigger: "scheduled" | "manual" | "recovery";
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "skipped";
  skippedReason: "app_closed" | null;
  chatId: string | null;
  scheduledAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
};
export type Routine = {
  id: string;
  workspaceId: string;
  name: string;
  prompt: string;
  model: string | null;
  schedule: RoutineSchedule;
  state: RoutineState;
  needsAttentionReason: string | null;
  nextRunAt: number | null;
  lastRun: RoutineRun | null;
  createdAt: number;
  updatedAt: number;
  /** Brains (workspace ids) this routine reads without asking. */
  brains: string[];
};

type Activity = { workspaceId: string; sessionId: string; state: "running" | "idle"; outcome?: "succeeded" | "failed" | "interrupted" };

/** What the routines need from apps/server/src/downstream-hooks.ts, structurally. */
export type RoutinesHost = {
  readOnly: boolean;
  workspaces(): Array<{ id: string; path: string }>;
  engineRequest(workspaceId: string, method: string, path: string, body?: unknown): Promise<{ status: number; body: unknown }>;
  onSessionActivity(listener: (activity: Activity) => void): () => void;
  /** Chats running in a workspace now, or null when the engine cannot say. */
  runningSessions?(workspaceId: string): Promise<string[] | null>;
  log(level: "info" | "warn" | "error", message: string, fields?: Record<string, unknown>): void;
};

export type RoutinesOptions = {
  stateDirectory?: string;
  environment?: NodeJS.ProcessEnv;
  now?: () => number;
  /** How often the planner looks at the clock. */
  tickMs?: number;
  /** How long a run waits for the brain tools in a folder the engine just opened. */
  mcpWaitMs?: number;
  /** How often a running routine's open questions are checked. */
  permissionPollMs?: number;
  /** The provider routines run on (the only one the engine has, plan B). */
  providerId?: string;
  /** Answers a run's brain-read questions for the brains it names (from the brains hooks). */
  answerBrainReads?: (workspaceId: string, sessionId: string, allowed: readonly string[]) => Promise<number>;
};

type Route = { method: string; path: string; auth: "client" | "host-token"; handle: (request: Request, params: Record<string, string>) => Promise<Response> };

const STATES: readonly RoutineState[] = ["active", "inactive", "needs_attention", "archived"];
const SETTABLE: readonly RoutineState[] = ["active", "inactive", "archived"];
const RUN_STATUSES: readonly RoutineRun["status"][] = ["queued", "running", "succeeded", "failed", "cancelled", "skipped"];
const TRIGGERS: readonly RoutineRun["trigger"][] = ["scheduled", "manual", "recovery"];
const MISSED_AFTER_MS = 10 * 60_000;
const RUNS_KEPT = 50;

type Json = Record<string, unknown>;
const record = (value: unknown): Json | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null);
const text = (value: unknown, key: string): string | null => {
  const found = record(value)?.[key];
  return typeof found === "string" ? found : null;
};
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "cache-control": "no-store" } });
const failure = (status: number, code: string, message: string) => json({ code, message }, status);

function parseSchedule(value: unknown): RoutineSchedule | null {
  const parsed = automationScheduleSchema.safeParse(value);
  return parsed.success && parsed.data.kind !== "calendar" ? parsed.data : null;
}

async function readBody(request: Request): Promise<Json | null> {
  try { return record(await request.json()); } catch { return null; }
}

export function createRoutinesHooks(options: RoutinesOptions = {}) {
  const environment = options.environment ?? process.env;
  const stateDirectory = options.stateDirectory ?? environment.BONZAIWORK_STATE_DIR ?? join(homedir(), ".bonzaiwork");
  const file = join(stateDirectory, "routines.json");
  const now = options.now ?? Date.now;
  const providerId = options.providerId ?? "litellm";
  let host: RoutinesHost | null = null;
  let routines: Routine[] = [];
  let runs: RoutineRun[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;
  let permissionTimer: ReturnType<typeof setInterval> | null = null;
  let stopActivity: (() => void) | null = null;
  const live = new Map<string, { run: RoutineRun; routine: Routine }>();
  let ticking = false;
  let saving: Promise<void> = Promise.resolve();

  async function load(): Promise<void> {
    const stored = record(JSON.parse(await readFile(file, "utf8").catch(() => "{}")));
    const list = (key: string) => (Array.isArray(stored?.[key]) ? stored[key] : []);
    routines = list("routines").flatMap((item): Routine[] => {
      const value = record(item);
      const schedule = parseSchedule(value?.schedule);
      const id = text(value, "id");
      const workspaceId = text(value, "workspaceId");
      if (!value || !schedule || !id || !workspaceId) return [];
      const brains = Array.isArray(value.brains) ? value.brains.filter((entry): entry is string => typeof entry === "string") : [];
      const state = STATES.find((entry) => entry === value.state) ?? "inactive";
      return [{
        id, workspaceId, schedule, state, brains,
        name: text(value, "name") ?? "", prompt: text(value, "prompt") ?? "", model: text(value, "model"),
        needsAttentionReason: text(value, "needsAttentionReason"),
        nextRunAt: typeof value.nextRunAt === "number" ? value.nextRunAt : null, lastRun: null,
        createdAt: typeof value.createdAt === "number" ? value.createdAt : now(), updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : now(),
      }];
    });
    runs = list("runs").flatMap((item): RoutineRun[] => {
      const value = record(item);
      const id = text(value, "id");
      const routineId = text(value, "routineId");
      if (!value || !id || !routineId) return [];
      const status = RUN_STATUSES.find((entry) => entry === value.status) ?? "failed";
      const trigger = TRIGGERS.find((entry) => entry === value.trigger) ?? "scheduled";
      const number = (key: string) => (typeof value[key] === "number" ? Number(value[key]) : null);
      // A run that was running when the app closed did not finish here.
      const interrupted = status === "running" || status === "queued";
      return [{
        id, routineId, trigger, status: interrupted ? "cancelled" : status, skippedReason: value.skippedReason === "app_closed" ? "app_closed" : null,
        chatId: text(value, "chatId"), scheduledAt: number("scheduledAt") ?? 0, startedAt: number("startedAt"), finishedAt: number("finishedAt") ?? (interrupted ? now() : null),
        error: interrupted ? "De app werd gesloten tijdens deze run." : text(value, "error"),
      }];
    });
  }

  function save(): Promise<void> {
    saving = saving.then(async () => {
      await mkdir(dirname(file), { recursive: true });
      const temporary = `${file}.tmp-${randomBytes(4).toString("hex")}`;
      await writeFile(temporary, `${JSON.stringify({ version: 1, routines: routines.map(({ lastRun: _lastRun, ...rest }) => rest), runs }, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, file);
    }).catch((error: unknown) => host?.log("error", "Routines could not be saved", { error: String(error) }));
    return saving;
  }

  const view = (routine: Routine): Routine => ({ ...routine, lastRun: runs.filter((run) => run.routineId === routine.id).at(-1) ?? null });

  function addRun(run: RoutineRun): void {
    runs.push(run);
    const own = runs.filter((entry) => entry.routineId === run.routineId);
    if (own.length > RUNS_KEPT) {
      const drop = new Set(own.slice(0, own.length - RUNS_KEPT).map((entry) => entry.id));
      runs = runs.filter((entry) => !drop.has(entry.id));
    }
  }

  function schedule(routine: Routine, after: number): void {
    routine.nextRunAt = routine.state === "active" ? nextAutomationOccurrence(routine.schedule, after) : null;
    if (routine.state === "active" && routine.nextRunAt === null && routine.schedule.kind === "once") routine.state = "inactive";
  }

  /**
   * The engine connects its MCPs per folder, after the first request there. A routine is often the
   * first chat in a project after the app starts: wait until the brain tools are there (at most ~20 s).
   */
  async function brainToolsReady(workspaceId: string): Promise<void> {
    const deadline = now() + (options.mcpWaitMs ?? 20_000);
    while (host && now() < deadline) {
      const listed = await host.engineRequest(workspaceId, "GET", "/api/mcp").catch(() => null);
      const data = record(listed?.body)?.data ?? listed?.body;
      const entries: unknown[] = Array.isArray(data) ? data : [];
      if (entries.some((entry) => text(entry, "name") === "breinen" && text(record(entry)?.status, "status") === "connected")) return;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  const sessionIdOf = (body: unknown) => text(body, "id") ?? text(record(body)?.data, "id");

  /** A run is a new chat in the project with the routine's name, then its prompt (contract §5.6). */
  async function start(routine: Routine, trigger: RoutineRun["trigger"], scheduledAt: number): Promise<RoutineRun> {
    const run: RoutineRun = { id: `run_${randomBytes(6).toString("hex")}`, routineId: routine.id, trigger, status: "running", skippedReason: null, chatId: null, scheduledAt, startedAt: now(), finishedAt: null, error: null };
    addRun(run);
    const fail = (error: string) => { run.status = "failed"; run.finishedAt = now(); run.error = error; };
    const workspace = host?.workspaces().find((entry) => entry.id === routine.workspaceId);
    if (!host || !workspace) {
      fail("Het project van deze routine bestaat niet meer.");
      routine.state = "needs_attention";
      routine.needsAttentionReason = run.error;
    } else {
      try {
        const created = await host.engineRequest(routine.workspaceId, "POST", "/api/session", {
          ...(routine.model ? { model: { providerID: providerId, id: routine.model } } : {}), title: routine.name, location: { directory: workspace.path },
        });
        const sessionId = created.status < 400 ? sessionIdOf(created.body) : null;
        if (!sessionId) throw new Error(`De chat kon niet starten (HTTP ${created.status}).`);
        run.chatId = sessionId;
        live.set(sessionId, { run, routine });
        if (routine.brains.length) await brainToolsReady(routine.workspaceId);
        const sent = await host.engineRequest(routine.workspaceId, "POST", `/api/session/${encodeURIComponent(sessionId)}/prompt`, { text: routine.prompt, delivery: "steer" });
        if (sent.status >= 400) throw new Error(`De opdracht kwam niet aan (HTTP ${sent.status}).`);
      } catch (error) {
        if (run.chatId) live.delete(run.chatId);
        fail(error instanceof Error ? error.message : String(error));
        host.log("warn", "Routine run failed to start", { routine: routine.id, error: run.error });
      }
    }
    await save();
    return run;
  }

  /** A run whose end event was missed (engine restart) is closed, so it never counts as running for good. */
  async function pruneLive(): Promise<void> {
    for (const [sessionId, entry] of live) {
      if (!host?.runningSessions || (entry.run.startedAt ?? 0) > now() - 60_000) continue;
      const running = await host.runningSessions(entry.routine.workspaceId).catch(() => null);
      if (!running || running.includes(sessionId)) continue;
      live.delete(sessionId);
      entry.run.status = "failed";
      entry.run.finishedAt = now();
      entry.run.error = "Het einde van deze run kwam niet binnen; open de chat om te zien hoe ver hij kwam.";
    }
  }

  /** The clock: due routines run; one that fell while the app was closed is recorded as missed. */
  async function tick(): Promise<void> {
    // One tick at a time, and the next time is set before a run starts: a slow engine never makes
    // the next tick start the same routine again (review #5).
    if (ticking) return;
    ticking = true;
    try {
      await pruneLive();
      const at = now();
      for (const routine of routines) {
        if (routine.state !== "active" || routine.nextRunAt === null || routine.nextRunAt > at) continue;
        const due = routine.nextRunAt;
        schedule(routine, Math.max(at, due));
        if (at - due > MISSED_AFTER_MS) {
          addRun({ id: `run_${randomBytes(6).toString("hex")}`, routineId: routine.id, trigger: "scheduled", status: "skipped", skippedReason: "app_closed", chatId: null, scheduledAt: due, startedAt: null, finishedAt: null, error: null });
        } else {
          void start(routine, "scheduled", due);
        }
      }
      await save();
    } finally {
      ticking = false;
    }
  }

  function onActivity(activity: Activity): void {
    if (activity.state !== "idle") return;
    const entry = live.get(activity.sessionId);
    if (!entry || !activity.outcome) return;
    live.delete(activity.sessionId);
    entry.run.status = activity.outcome === "succeeded" ? "succeeded" : activity.outcome === "interrupted" ? "cancelled" : "failed";
    entry.run.finishedAt = now();
    void save();
  }

  /** Reads of brains the routine names are allowed once each; anything else waits for the user. */
  async function answerBrainQuestions(): Promise<void> {
    for (const [sessionId, { routine }] of live) {
      if (!routine.brains.length || !options.answerBrainReads) continue;
      await options.answerBrainReads(routine.workspaceId, sessionId, routine.brains)
        .catch((error: unknown) => host?.log("warn", "Routine permission check failed", { routine: routine.id, error: String(error) }));
    }
  }

  function input(body: Json, current: Routine | null): { ok: true; value: Omit<Routine, "id" | "createdAt" | "updatedAt" | "lastRun" | "nextRunAt" | "needsAttentionReason"> } | { ok: false; response: Response } {
    const workspaceId = text(body, "workspaceId") ?? current?.workspaceId ?? null;
    if (!workspaceId || !host?.workspaces().some((entry) => entry.id === workspaceId)) return { ok: false, response: failure(400, "invalid_workspace", "Choose a project.") };
    const schedule = body.schedule === undefined && current ? current.schedule : parseSchedule(body.schedule);
    if (!schedule) return { ok: false, response: failure(400, "invalid_schedule", "Invalid schedule.") };
    const name = (text(body, "name") ?? current?.name ?? "").trim();
    const prompt = (text(body, "prompt") ?? current?.prompt ?? "").trim();
    if (!name || !prompt) return { ok: false, response: failure(400, "invalid_routine", "A routine needs a name and a prompt.") };
    const state = SETTABLE.find((entry) => entry === body.state) ?? (current?.state === "needs_attention" ? "active" : current?.state ?? "active");
    const brains = Array.isArray(body.brains) ? [...new Set(body.brains.filter((entry): entry is string => typeof entry === "string"))] : current?.brains ?? [];
    const model = "model" in body ? text(body, "model") : current?.model ?? null;
    return { ok: true, value: { workspaceId, name: name.slice(0, 120), prompt: prompt.slice(0, 20_000), model, schedule, state, brains } };
  }

  const find = (id: string) => routines.find((routine) => routine.id === id) ?? null;

  // Changing routines needs the host token (the desktop app), never a viewer token, and nothing
  // changes on a read-only device (review #5). The preview only computes.
  const writable = (route: Route): Route => (route.method === "GET" || route.path.endsWith("/preview") ? route : {
    ...route,
    handle: (request, params) => (host?.readOnly ? Promise.resolve(failure(403, "read_only", "This device is read-only.")) : route.handle(request, params)),
  });

  const routes: Route[] = [
    {
      method: "GET", path: "/bonzaiwork/routines", auth: "client",
      handle: async (request) => {
        const workspaceId = new URL(request.url).searchParams.get("workspaceId");
        return json({ items: routines.filter((routine) => !workspaceId || routine.workspaceId === workspaceId).map(view) });
      },
    },
    {
      method: "POST", path: "/bonzaiwork/routines", auth: "host-token",
      handle: async (request) => {
        if (host?.readOnly) return failure(403, "read_only", "This device is read-only.");
        const parsed = input((await readBody(request)) ?? {}, null);
        if (!parsed.ok) return parsed.response;
        const routine: Routine = { ...parsed.value, id: `rtn_${randomBytes(6).toString("hex")}`, needsAttentionReason: null, nextRunAt: null, lastRun: null, createdAt: now(), updatedAt: now() };
        schedule(routine, now());
        routines.push(routine);
        await save();
        return json(view(routine), 201);
      },
    },
    {
      method: "POST", path: "/bonzaiwork/routines/preview", auth: "client",
      handle: async (request) => {
        const scheduleValue = parseSchedule((await readBody(request))?.schedule);
        return scheduleValue ? json(previewAutomationSchedule(scheduleValue, { generatedAt: now() })) : failure(400, "invalid_schedule", "Invalid schedule.");
      },
    },
    {
      method: "PATCH", path: "/bonzaiwork/routines/:routineId", auth: "host-token",
      handle: async (request, params) => {
        const routine = find(params.routineId ?? "");
        if (!routine) return failure(404, "routine_not_found", "Routine not found.");
        const parsed = input((await readBody(request)) ?? {}, routine);
        if (!parsed.ok) return parsed.response;
        Object.assign(routine, parsed.value, { needsAttentionReason: null, updatedAt: now() });
        schedule(routine, now());
        await save();
        return json(view(routine));
      },
    },
    {
      method: "DELETE", path: "/bonzaiwork/routines/:routineId", auth: "host-token",
      handle: async (_request, params) => {
        routines = routines.filter((routine) => routine.id !== params.routineId);
        runs = runs.filter((run) => run.routineId !== params.routineId);
        await save();
        return json({ ok: true });
      },
    },
    {
      method: "POST", path: "/bonzaiwork/routines/:routineId/run", auth: "host-token",
      handle: async (_request, params) => {
        const routine = find(params.routineId ?? "");
        if (!routine) return failure(404, "routine_not_found", "Routine not found.");
        return json({ data: await start(routine, "manual", now()) });
      },
    },
    {
      method: "GET", path: "/bonzaiwork/routines/:routineId/runs", auth: "client",
      handle: async (_request, params) => json({ items: runs.filter((run) => run.routineId === params.routineId).slice().reverse() }),
    },
  ];

  return {
    routes: routes.map(writable),
    /** Tests: one turn of the clock and of the question check. */
    tick,
    answerBrainQuestions,
    async start(next: RoutinesHost) {
      host = next;
      await load();
      // Missed while closed: recorded at the next tick, never run late (R1).
      for (const routine of routines) if (routine.state === "active" && routine.nextRunAt === null) schedule(routine, now());
      stopActivity = next.onSessionActivity(onActivity);
      timer = setInterval(() => { void tick(); }, options.tickMs ?? 30_000);
      timer.unref?.();
      permissionTimer = setInterval(() => { void answerBrainQuestions(); }, options.permissionPollMs ?? 1_500);
      permissionTimer.unref?.();
      await tick();
    },
    stop() {
      stopActivity?.();
      if (timer) clearInterval(timer);
      if (permissionTimer) clearInterval(permissionTimer);
    },
  };
}

export type RoutinesHooks = ReturnType<typeof createRoutinesHooks>;
