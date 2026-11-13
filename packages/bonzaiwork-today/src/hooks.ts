import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

import { AGENT_PREFIX, roundSpecs, type RoundSpec } from "./agent.ts";
import { createMs365, createSlackCli, type Ms365, type SlackCli } from "./connectors.ts";
import { ASKING_TOOLS, handleTodayMcp, MCP_SERVER_NAME } from "./mcp.ts";
import type { BrainFolder } from "./scan.ts";
import { createTodayService, TodayError, type Author, type TodayService } from "./service.ts";
import { TodayStore } from "./store.ts";
import type { AgentRound, BrainKind } from "./types.ts";

/**
 * openwork-server hooks for Vandaag (docs/bonzaiwork/persoonlijke-agent-plan.md). The host type
 * mirrors apps/server/src/downstream-hooks.ts structurally; brains and routines are handed in by
 * the combined hooks, so this package imports neither.
 */
export type TodayHost = {
  port: number;
  readOnly: boolean;
  workspaces(): Array<{ id: string; path: string }>;
  updateEngineMcp(servers: Record<string, Record<string, unknown> | null>): Promise<boolean>;
  engineRequest?(workspaceId: string, method: string, path: string, body?: unknown): Promise<{ status: number; body: unknown }>;
  log(level: "info" | "warn" | "error", message: string, fields?: Record<string, unknown>): void;
};

export type TodayRoute = { method: string; path: string; auth: "none" | "client" | "host-token"; handle: (request: Request, params: Record<string, string>) => Promise<Response> };
export type TodayPermission = { action: string; resource: string; effect: "allow" | "deny" | "ask" };

/** What Vandaag needs from the brains hooks. */
export type TodayBrains = {
  brains(): Promise<Array<{ id: string; name: string; root: string; kind: BrainKind; excluded: readonly string[]; readOnly: boolean }>>;
  author(): Author | null;
  changed(brainId: string): Promise<void>;
};

type RoutineView = { system: string | null; name: string; state: AgentRound["state"]; nextRunAt: number | null; model: string | null; lastRun: { status: string; finishedAt: number | null; startedAt: number | null } | null };

/** What Vandaag needs from the routines hooks. */
export type TodayRoutines = {
  ensureSystem(spec: RoundSpec & { workspaceId: string; model: string | null; brains: string[] }): Promise<unknown>;
  removeSystem(prefix: string): Promise<void>;
  setSystemModel(prefix: string, model: string | null): Promise<void>;
  runSystem(system: string): Promise<unknown>;
  systemRoutines(prefix: string): RoutineView[];
  liveSystemRuns(): Array<{ sessionId: string; workspaceId: string; system: string }>;
};

export type TodayOptions = {
  stateDirectory?: string;
  environment?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  now?: () => number;
  brains?: TodayBrains;
  routines?: TodayRoutines;
  /** Tests: the connections without a real MS365 server or Slack script. */
  ms365?: Ms365;
  slack?: SlackCli;
  /** How often the rounds are brought in line with the brains on this laptop. */
  reconcileEveryMs?: number;
  /** How often a running round's open questions are checked. */
  permissionPollMs?: number;
  timezone?: string;
};

type Json = Record<string, unknown>;
const record = (value: unknown): Json | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null);
const text = (value: unknown, key: string): string | null => {
  const found = record(value)?.[key];
  return typeof found === "string" ? found : null;
};
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "cache-control": "no-store" } });
const failure = (status: number, code: string, message: string) => json({ code, message, userMessage: message }, status);
const BODY_LIMIT = 64 * 1024;

async function readBody(request: Request): Promise<Json> {
  const raw = await request.text().catch(() => "");
  if (!raw || raw.length > BODY_LIMIT) return {};
  try { return record(JSON.parse(raw)) ?? {}; } catch { return {}; }
}

const listOf = (value: unknown): unknown[] => {
  const data = record(value)?.data ?? value;
  return Array.isArray(data) ? data : [];
};

/** The engine names an MCP tool `<server>_<tool>`. */
const permissionAction = (tool: string) => `${MCP_SERVER_NAME}_${tool}`;
const OWN_READS = new Set(ASKING_TOOLS.map(permissionAction));

export function createTodayHooks(options: TodayOptions = {}) {
  const environment = options.environment ?? process.env;
  const stateDirectory = options.stateDirectory ?? environment.BONZAIWORK_STATE_DIR?.trim() ?? join(homedir(), ".bonzaiwork");
  const now = options.now ?? Date.now;
  const timezone = options.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Europe/Amsterdam";
  const mcpToken = `bwt_${randomBytes(32).toString("base64url")}`;
  let host: TodayHost | null = null;
  let reconcileTimer: ReturnType<typeof setInterval> | null = null;
  let permissionTimer: ReturnType<typeof setInterval> | null = null;
  let registered: boolean | null = null;
  let roundsSignature = "";

  const log: TodayHost["log"] = (level, message, fields) => host?.log(level, message, fields);
  const store = new TodayStore(join(stateDirectory, "today.json"), (message, fields) => log("error", message, fields));
  const command = (key: "ms365Command" | "slackCommand") => () => store.state.settings[key];
  const ms365 = options.ms365 ?? createMs365({ command: command("ms365Command"), environment, platform: options.platform });
  const slack = options.slack ?? createSlackCli({ command: command("slackCommand"), environment, platform: options.platform });

  async function brainFolders(): Promise<BrainFolder[]> {
    return (await options.brains?.brains() ?? []).map((brain) => ({ id: brain.id, name: brain.name, kind: brain.kind, root: brain.root, excluded: brain.excluded, readOnly: brain.readOnly }));
  }

  function rounds(): AgentRound[] {
    return (options.routines?.systemRoutines(AGENT_PREFIX) ?? []).map((routine) => ({
      system: routine.system ?? "", name: routine.name, state: routine.state, nextRunAt: routine.nextRunAt, model: routine.model,
      lastRunAt: routine.lastRun?.finishedAt ?? routine.lastRun?.startedAt ?? null, lastStatus: routine.lastRun?.status ?? null,
    }));
  }

  const service: TodayService = createTodayService({
    store, brains: brainFolders, author: () => options.brains?.author() ?? null,
    changed: async (id) => { await options.brains?.changed(id); },
    ms365, slack, now, killed: environment.BONZAIWORK_TODAY === "0", rounds, log,
  });

  /**
   * Brings the engine and the routines in line with the settings: on, the agent's tools are in
   * every chat and its three rounds exist in the personal brain's project; off, both are gone.
   */
  async function reconcile(): Promise<void> {
    if (!host) return;
    const on = service.enabled();
    if (registered !== on) {
      const entry = on ? { type: "remote", url: `http://127.0.0.1:${host.port}/bonzaiwork/today/mcp`, headers: { authorization: `Bearer ${mcpToken}` }, codemode: false } : null;
      const done = await host.updateEngineMcp({ [MCP_SERVER_NAME]: entry }).catch(() => false);
      if (done) registered = on;
    }
    const routines = options.routines;
    if (!routines || host.readOnly) return;
    const brains = on ? await brainFolders() : [];
    const personal = brains.find((brain) => brain.kind === "personal");
    if (!on) {
      if (roundsSignature !== "off") await routines.removeSystem(AGENT_PREFIX);
      roundsSignature = "off";
      return;
    }
    // No personal brain (yet, or the brains are still starting): what exists stays as it is.
    if (!personal) return;
    const settings = service.settings();
    const shared = brains.filter((brain) => brain.kind === "project").map((brain) => brain.id).sort();
    const specs = roundSpecs(settings, timezone);
    const signature = JSON.stringify([personal.id, shared, specs.map((spec) => spec.prompt)]);
    // A round the person deleted on the Routines page comes back: turning the agent off is the way to stop it.
    if (signature === roundsSignature && routines.systemRoutines(AGENT_PREFIX).length === specs.length) return;
    for (const spec of specs) await routines.ensureSystem({ ...spec, workspaceId: personal.id, model: settings.model, brains: shared });
    roundsSignature = signature;
  }

  /**
   * A round reads the person's mail, calendar and Slack without a click (T7: reading is free for
   * the agent's own rounds). In any other chat the same tools wait for the person's answer.
   */
  async function answerOwnReads(): Promise<void> {
    const request = host?.engineRequest;
    if (!request || !options.routines) return;
    for (const run of options.routines.liveSystemRuns()) {
      if (!run.system.startsWith(AGENT_PREFIX)) continue;
      const session = encodeURIComponent(run.sessionId);
      const pending = await request(run.workspaceId, "GET", `/api/session/${session}/permission`).catch(() => null);
      for (const question of listOf(pending?.body)) {
        const id = text(question, "id");
        const action = text(question, "action") ?? text(question, "permission");
        if (!id || !action || !OWN_READS.has(action)) continue;
        await request(run.workspaceId, "POST", `/api/session/${session}/permission/${encodeURIComponent(id)}/reply`, { decision: "once", reply: "once" })
          .catch((error: unknown) => log("warn", "Round question not answered", { error: String(error) }));
      }
    }
  }

  const guarded = (handle: TodayRoute["handle"]): TodayRoute["handle"] => async (request, params) => {
    try {
      return await handle(request, params);
    } catch (error) {
      if (error instanceof TodayError) return failure(error.status, error.code, error.message);
      log("error", "Vandaag route failed", { error: error instanceof Error ? error.message : String(error) });
      return failure(500, "today_failed", "Dat lukte niet. Probeer het opnieuw.");
    }
  };
  const needsOn = () => { if (!service.enabled()) throw new TodayError(409, "today_off", "De persoonlijke agent staat uit."); };
  const key = (body: Json) => { const found = text(body, "key"); if (!found) throw new TodayError(400, "invalid_body", "Stuur de sleutel van de kaart mee."); return found; };

  const routes: TodayRoute[] = ([
    { method: "GET", path: "/bonzaiwork/today", auth: "client", handle: async () => json(await service.view()) },
    { method: "GET", path: "/bonzaiwork/today/settings", auth: "client", handle: async () => json({ settings: service.settings(), killed: environment.BONZAIWORK_TODAY === "0" }) },
    {
      method: "PUT", path: "/bonzaiwork/today/settings", auth: "host-token",
      handle: async (request) => {
        const before = service.settings();
        const settings = await service.setSettings(await readBody(request));
        if (before.model !== settings.model) await options.routines?.setSystemModel(AGENT_PREFIX, settings.model);
        roundsSignature = "";
        await reconcile();
        return json({ settings, killed: environment.BONZAIWORK_TODAY === "0" });
      },
    },
    { method: "POST", path: "/bonzaiwork/today/connectors/check", auth: "host-token", handle: async () => { needsOn(); return json({ connectors: await service.checkConnectors() }); } },
    { method: "GET", path: "/bonzaiwork/today/todos", auth: "client", handle: async () => { needsOn(); return json({ items: (await service.scan()).todos }); } },
    {
      method: "POST", path: "/bonzaiwork/today/todos", auth: "host-token",
      handle: async (request) => {
        needsOn();
        const body = await readBody(request);
        return json({ todo: await service.add({ text: text(body, "text") ?? "", brain: text(body, "brainId"), owner: text(body, "owner"), due: text(body, "due"), dueKind: body.waiting === true ? "waiting" : "deadline" }) }, 201);
      },
    },
    {
      method: "POST", path: "/bonzaiwork/today/todos/:todoId/done", auth: "host-token",
      handle: async (request, params) => { needsOn(); return json({ todo: await service.setDone(params.todoId ?? "", (await readBody(request)).done !== false) }); },
    },
    { method: "POST", path: "/bonzaiwork/today/todos/:todoId/skip", auth: "host-token", handle: async (_request, params) => { needsOn(); await service.skip(params.todoId ?? ""); return json({ ok: true }); } },
    { method: "POST", path: "/bonzaiwork/today/park", auth: "host-token", handle: async (request) => { needsOn(); return json({ entry: await service.park(text(await readBody(request), "text") ?? "") }, 201); } },
    {
      method: "POST", path: "/bonzaiwork/today/focus", auth: "host-token",
      handle: async (request) => {
        needsOn();
        const body = await readBody(request);
        return json(await service.startFocus(text(body, "todoId") ?? "", text(body, "chatId")));
      },
    },
    { method: "DELETE", path: "/bonzaiwork/today/focus", auth: "host-token", handle: async () => { await service.stopFocus(); return json({ ok: true }); } },
    {
      method: "POST", path: "/bonzaiwork/today/items/send", auth: "host-token",
      handle: async (request) => { needsOn(); const body = await readBody(request); await service.send(key(body), text(body, "text")); return json({ ok: true }); },
    },
    { method: "POST", path: "/bonzaiwork/today/items/dismiss", auth: "host-token", handle: async (request) => { await service.dismiss(key(await readBody(request))); return json({ ok: true }); } },
    { method: "POST", path: "/bonzaiwork/today/items/later", auth: "host-token", handle: async (request) => { await service.later(key(await readBody(request))); return json({ ok: true }); } },
    { method: "POST", path: "/bonzaiwork/today/items/accept", auth: "host-token", handle: async (request) => { needsOn(); return json({ todo: await service.acceptCommitment(key(await readBody(request))) }); } },
    {
      method: "POST", path: "/bonzaiwork/today/plan", auth: "host-token",
      handle: async (request) => {
        if ((await readBody(request)).decision === "drop") await service.dropPlan();
        else await service.approvePlan();
        return json({ ok: true });
      },
    },
    { method: "POST", path: "/bonzaiwork/today/close", auth: "host-token", handle: async (request) => { needsOn(); await service.closeDay(text(await readBody(request), "todoId")); return json({ ok: true }); } },
    { method: "POST", path: "/bonzaiwork/today/cleanup", auth: "host-token", handle: async (request) => { needsOn(); return json(await service.cleanupStart(text(await readBody(request), "brainId") ?? "")); } },
    {
      method: "POST", path: "/bonzaiwork/today/rounds/run", auth: "host-token",
      handle: async (request) => {
        needsOn();
        const system = text(await readBody(request), "system") ?? "";
        if (!system.startsWith(AGENT_PREFIX) || !(await options.routines?.runSystem(system))) throw new TodayError(404, "round_not_found", "Deze ronde bestaat niet.");
        return json({ ok: true });
      },
    },
  ] satisfies TodayRoute[]).map((route) => ({
    ...route,
    handle: guarded(route.method === "GET" ? route.handle : (request, params) => (host?.readOnly ? Promise.resolve(failure(403, "read_only", "Dit apparaat is alleen-lezen.")) : route.handle(request, params))),
  }));
  for (const method of ["POST", "GET", "DELETE"]) {
    routes.unshift({ method, path: "/bonzaiwork/today/mcp", auth: "none", handle: (request) => handleTodayMcp(request, mcpToken, service) });
  }

  return {
    routes,
    /** The tools that read mail, the calendar or Slack ask first; a round's own questions are answered here. */
    enginePermissions: (): TodayPermission[] => ASKING_TOOLS.map((tool) => ({ action: permissionAction(tool), resource: "*", effect: "ask" })),
    /** Tests: the logic without HTTP. */
    service,
    reconcile,
    answerOwnReads,
    async start(next: TodayHost) {
      host = next;
      await store.load();
      await reconcile().catch((error: unknown) => log("warn", "Vandaag not reconciled", { error: String(error) }));
      // Brains come and go (a project is added, the personal brain is made): the rounds follow.
      reconcileTimer = setInterval(() => { void reconcile().catch(() => undefined); }, options.reconcileEveryMs ?? 30_000);
      reconcileTimer.unref?.();
      // The brains start alongside: look again once they are up.
      setTimeout(() => { void reconcile().catch(() => undefined); }, 5_000).unref?.();
      permissionTimer = setInterval(() => { void answerOwnReads().catch(() => undefined); }, options.permissionPollMs ?? 1_500);
      permissionTimer.unref?.();
    },
    stop() {
      if (reconcileTimer) clearInterval(reconcileTimer);
      if (permissionTimer) clearInterval(permissionTimer);
      ms365.dispose();
    },
  };
}

export type TodayHooks = ReturnType<typeof createTodayHooks>;
