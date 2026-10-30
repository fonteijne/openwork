import {
  BackendError,
  PROJECT_COLORS,
  type AppStatus,
  type AuditEntry,
  type Backend,
  type Capabilities,
  type Chat,
  type ChatStatus,
  type Connection as ConnectionEntry,
  type KeyState,
  type Project,
  type ProjectEvent,
  type ProjectSummary,
  type Routine,
  type RoutineRun,
  type RoutineSchedule,
  type RunMode,
  type Usage,
  type EngineState,
} from "../types";

import { hasDesktopBridge, pickDirectory, readServerInfo, restartServer, revealItem } from "./desktop";
import { engine, createTranslator, followEvents, PROVIDER_ID, type EngineTarget, type NativeSession } from "./engine";
import { enc, probe, request, type Connection } from "./http";
import { deviceMetaStore, EMPTY_META, serverMetaStore, type MetaStore, type ProjectMeta } from "./meta";
import { encodePrompt, type PromptAttachment } from "./prompt";
import { bool, data, field, items, list, num, rec, str, strings } from "./read";
import { readLocal } from "~/lib/storage";

/**
 * The live backend: the local OpenWork server the desktop shell starts, its
 * OpenCode v2 engine per workspace, and BonzaiWork's own `/bonzaiwork` routes
 * (packages/bonzaiwork-litellm). Routes from frontend-contract §7 that are not
 * built yet are probed once; without them metadata lives on this device and
 * routines show their locked state (DESIGN.md P4).
 */

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function resolveConnection(): Promise<Connection> {
  if (hasDesktopBridge()) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const info = await readServerInfo();
      if (info) return info;
      if (attempt === 0) {
        const restarted = await restartServer();
        if (restarted) return restarted;
      }
      await wait(500);
    }
    throw new BackendError("network", "De lokale server is niet gestart.");
  }
  // Development in a plain browser: `?server=…&token=…[&hostToken=…]`. Never in a build.
  const params = new URLSearchParams(window.location.search);
  const baseUrl = import.meta.env.DEV ? params.get("server") : null;
  const token = import.meta.env.DEV ? params.get("token") : null;
  if (!baseUrl || !token) throw new BackendError("network", "Geen lokale server: start BonzaiWork vanuit de desktop-app.");
  return { baseUrl, token, hostToken: params.get("hostToken") };
}

type Workspace = { id: string; name: string; path: string };

type ServerStatus = { app: AppStatus; workspaceKeys: Map<string, KeyState> };

function readKey(value: unknown): KeyState {
  return { hasKey: field(value, "hasKey") === true, keyHint: str(value, "keyHint") ?? null };
}

function readStatus(payload: unknown, readOnly: boolean): ServerStatus {
  const workspaceKeys = new Map<string, KeyState>();
  for (const entry of list(payload, "workspaces")) {
    const id = str(entry, "id");
    if (id) workspaceKeys.set(id, readKey(entry));
  }
  return {
    app: {
      litellmBaseUrl: str(payload, "litellmBaseUrl") ?? "",
      keyMode: str(payload, "keyMode") === "workspace" ? "workspace" : "user",
      keyStorePersistent: field(payload, "keyStorePersistent") !== false,
      user: readKey(field(payload, "user")),
      models: list(payload, "models").flatMap((model) => {
        const id = str(model, "id");
        return id ? [{ id, name: str(model, "name") ?? id }] : [];
      }),
      defaultModel: str(payload, "defaultModel") ?? null,
      preferredModels: strings(field(payload, "preferredModels")),
      readOnly,
    },
    workspaceKeys,
  };
}

function colorFor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PROJECT_COLORS[hash % PROJECT_COLORS.length] ?? "jade";
}

function safeFolderName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "Project";
}

const HOME_RE = /^(\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)/;

function readSchedule(value: unknown): RoutineSchedule | null {
  const kind = str(value, "kind");
  const timezone = str(value, "timezone") ?? "UTC";
  if (kind === "once") {
    const at = num(value, "at");
    return at === undefined ? null : { kind, timezone, at };
  }
  const hour = num(value, "hour") ?? 9;
  const minute = num(value, "minute") ?? 0;
  const days = list(value, "daysOfWeek").filter((day): day is number => typeof day === "number");
  if (kind === "daily") return { kind, timezone, hour, minute };
  if (kind === "weekly") return { kind, timezone, daysOfWeek: days, hour, minute };
  if (kind === "interval") return { kind, timezone, everyHours: num(value, "everyHours") ?? 1, startHour: num(value, "startHour") ?? 0, endHour: num(value, "endHour") ?? 24, daysOfWeek: days };
  return null;
}

const RUN_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled", "skipped"] as const;
const ROUTINE_STATES = ["active", "inactive", "needs_attention", "archived"] as const;

function readRun(value: unknown): RoutineRun | null {
  const id = str(value, "id");
  const routineId = str(value, "routineId");
  if (!id || !routineId) return null;
  const status = RUN_STATUSES.find((entry) => entry === str(value, "status")) ?? "queued";
  const trigger = str(value, "trigger");
  return {
    id,
    routineId,
    trigger: trigger === "manual" || trigger === "recovery" ? trigger : "scheduled",
    status,
    skippedReason: str(value, "skippedReason") === "app_closed" ? "app_closed" : null,
    chatId: str(value, "chatId") ?? null,
    scheduledAt: num(value, "scheduledAt") ?? num(value, "startedAt") ?? 0,
    startedAt: num(value, "startedAt") ?? null,
    finishedAt: num(value, "finishedAt") ?? null,
    error: str(value, "error") ?? null,
  };
}

function readRoutine(value: unknown): Routine | null {
  const id = str(value, "id");
  const projectId = str(value, "workspaceId") ?? str(value, "projectId");
  const schedule = readSchedule(field(value, "schedule"));
  if (!id || !projectId || !schedule) return null;
  return {
    id,
    projectId,
    name: str(value, "name") ?? "",
    prompt: str(value, "prompt") ?? "",
    model: str(value, "model") ?? null,
    schedule,
    state: ROUTINE_STATES.find((entry) => entry === str(value, "state")) ?? "inactive",
    needsAttentionReason: str(value, "needsAttentionReason") ?? null,
    nextRunAt: num(value, "nextRunAt") ?? null,
    lastRun: readRun(field(value, "lastRun")),
    createdAt: num(value, "createdAt") ?? 0,
    updatedAt: num(value, "updatedAt") ?? 0,
  };
}

const AGENT_NAMES: Record<string, { name: string; description: string }> = {
  build: { name: "Uitvoeren", description: "Werkt direct in je bestanden" },
  plan: { name: "Plannen", description: "Denkt mee en maakt een plan, zonder iets te wijzigen" },
};

export async function createLiveBackend(): Promise<Backend> {
  // whenStarting: a request that meets "engine not running" waits for engineReady() (below).
  const connection: Connection = { ...(await resolveConnection()), whenStarting: () => engineReady() };
  const [metaOnServer, routinesOnServer] = await Promise.all([probe(connection, "/bonzaiwork/projects"), probe(connection, "/bonzaiwork/routines")]);
  const meta: MetaStore = metaOnServer ? serverMetaStore(connection) : deviceMetaStore(new URL(connection.baseUrl).host);
  const desktop = hasDesktopBridge();
  const capabilities: Capabilities = {
    routines: routinesOnServer,
    usage: metaOnServer,
    contentSearch: metaOnServer,
    projectMeta: metaOnServer ? "server" : "device",
    folderPicker: desktop,
    revealPath: desktop,
    notifications: false,
    globalConfig: false,
  };

  const workspaces = new Map<string, Workspace>();
  /** Live run state per chat, from the event stream; list reads fill it in. */
  const liveStatus = new Map<string, ChatStatus>();
  const assignmentsByProject = new Map<string, Record<string, string>>();
  let lastStatus: ServerStatus | null = null;

  const host = { host: true };
  const req = (path: string, options: Parameters<typeof request>[2] = {}) => request(connection, path, options);
  const unsupported = (what: string) => new BackendError("unsupported", `${what} is in deze versie van de app nog niet beschikbaar.`, 501);

  // -------------------------------------------------------------------------
  // Engine readiness
  // -------------------------------------------------------------------------

  /**
   * Chats run on the OpenCode v2 engine. On a profile that still has OpenWork
   * v1 history, the server may keep v2 off, or copy that history first; until
   * then every engine request answers 503. BonzaiWork only uses v2, so it
   * switches the v2 process on (nothing else: no chat routing, no migration)
   * and waits until it serves. A migration in progress is waited out.
   */
  let engineState: EngineState = "ready";
  const engineListeners = new Set<() => void>();
  const setEngineState = (next: EngineState) => {
    if (next === engineState) return;
    engineState = next;
    for (const listener of engineListeners) listener();
  };
  let readiness: Promise<void> | null = null;
  // After a failure, requests fail at once with that reason until retryEngine().
  let engineFailure: BackendError | null = null;
  function engineReady(): Promise<void> {
    if (engineFailure) return Promise.reject(engineFailure);
    readiness ??= waitForEngine().finally(() => {
      readiness = null;
    });
    return readiness;
  }
  function retryEngine(): void {
    engineFailure = null;
    void engineReady().catch(() => undefined);
  }

  async function waitForEngine(): Promise<void> {
    const direct: Connection = { ...connection, whenStarting: undefined };
    const begun = Date.now();
    let switchedOn = false;
    let resumed = false;
    try {
      for (;;) {
        const status = await request(direct, "/experimental/engine-v2-preview/status", { timeoutMs: 10_000 });
        const migration = str(field(status, "migration"), "state");
        const running = field(status, "running") === true;
        if (running && migration !== "running") {
          setEngineState("ready");
          return;
        }
        if (migration === "error" && field(field(status, "migration"), "resumed") === true && !running) {
          // A saved copy of older chats that stopped halfway keeps v2 locked until it finishes.
          // The server resumes it on request, as it does after a restart; nothing is trimmed.
          if (resumed) throw new BackendError("engine_migration_failed", "Je eerdere gesprekken konden niet worden overgezet, en tot dat lukt start de AI-engine niet. Sluit BonzaiWork en open de app opnieuw.", 503, str(field(status, "migration"), "error"));
          resumed = true;
          setEngineState("migrating");
          await request(direct, "/experimental/engine-v2-preview/migrate", { method: "POST", body: { confirm: true }, host: true, timeoutMs: 15_000 });
          await wait(1_500);
          continue;
        }
        setEngineState(migration === "running" ? "migrating" : "starting");
        if (migration !== "running" && field(status, "enabled") !== true && !switchedOn) {
          switchedOn = true;
          await request(direct, "/experimental/engine-v2-preview", { method: "PUT", body: { enabled: true }, timeoutMs: 10_000 }).catch(() => null);
        }
        const lastError = str(status, "lastError");
        // Starting can install the engine binary first; give it time before calling it failed.
        if (migration !== "running" && lastError && Date.now() - begun > 20_000) throw new BackendError("engine_failed", "De AI-engine start niet. Sluit BonzaiWork en open de app opnieuw.", 503, lastError);
        if (migration !== "running" && Date.now() - begun > 120_000) throw new BackendError("engine_failed", "De AI-engine start niet. Sluit BonzaiWork en open de app opnieuw.", 503, "Not running after two minutes.");
        await wait(1_500);
      }
    } catch (failure) {
      engineFailure = failure instanceof BackendError ? failure : new BackendError("engine_failed", "De AI-engine start niet. Sluit BonzaiWork en open de app opnieuw.", 503);
      setEngineState("failed");
      throw engineFailure;
    }
  }

  /**
   * The server saves a connection change first and then waits for its tools.
   * "Not ready yet" therefore still means saved: the list shows the live
   * status (starting, failed, needs sign-in) from there.
   */
  async function connectionChange(pending: Promise<unknown>): Promise<void> {
    try {
      await pending;
    } catch (failure) {
      if (!(failure instanceof BackendError && failure.code === "mcp_tools_not_ready")) throw failure;
    }
  }

  // -------------------------------------------------------------------------
  // Lookups
  // -------------------------------------------------------------------------

  async function listWorkspaces(): Promise<Workspace[]> {
    const payload = await req("/workspaces");
    const result = items(payload).flatMap((entry) => {
      const id = str(entry, "id");
      const path = str(entry, "path");
      const type = str(entry, "workspaceType");
      if (!id || !path || (type && type !== "local")) return [];
      return [{ id, name: str(entry, "displayName") || str(entry, "name") || path, path }];
    });
    workspaces.clear();
    for (const workspace of result) workspaces.set(workspace.id, workspace);
    return result;
  }

  async function workspace(projectId: string): Promise<Workspace> {
    const found = workspaces.get(projectId) ?? (await listWorkspaces()).find((entry) => entry.id === projectId);
    if (!found) throw new BackendError("not_found", "Dit project bestaat niet meer.", 404);
    return found;
  }

  async function target(projectId: string): Promise<EngineTarget> {
    const found = await workspace(projectId);
    return { connection, workspaceId: found.id, directory: found.path };
  }

  async function fetchStatus(): Promise<ServerStatus> {
    lastStatus = readStatus(await req("/bonzaiwork/status"), !connection.hostToken);
    return lastStatus;
  }

  async function defaultModel(projectId: string): Promise<string | null> {
    const payload = await req(`/workspace/${enc(projectId)}/default-model`).catch(() => null);
    return str(field(payload, "model"), "modelID") ?? null;
  }

  function toProject(entry: Workspace, projectMeta: ProjectMeta, key: KeyState | undefined, model: string | null): Project {
    return {
      id: entry.id,
      name: entry.name,
      path: entry.path,
      description: projectMeta.description,
      color: projectMeta.color ?? colorFor(entry.id),
      icon: projectMeta.icon ?? "folder",
      pinned: projectMeta.pinned,
      archivedAt: projectMeta.archivedAt,
      key: key ?? { hasKey: false, keyHint: null },
      defaultModel: model,
      allowedModels: projectMeta.allowedModels,
    };
  }

  async function projectById(projectId: string): Promise<Project> {
    const [entry, projectMeta, status, model] = await Promise.all([workspace(projectId), meta.get(projectId), lastStatus ?? fetchStatus(), defaultModel(projectId)]);
    return toProject(entry, projectMeta, status.workspaceKeys.get(projectId), model);
  }

  function toChat(projectId: string, session: NativeSession, projectMeta: ProjectMeta, status: ChatStatus): Chat {
    return {
      id: session.id,
      projectId,
      title: session.title,
      untitled: session.untitled,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      model: session.model,
      parentId: session.parentId,
      groupId: assignmentsByProject.get(projectId)?.[session.id] ?? null,
      pinned: projectMeta.pinnedChatIds.includes(session.id),
      archived: projectMeta.archivedChatIds.includes(session.id),
      note: projectMeta.chatNotes[session.id] ?? null,
      status,
      revertMessageId: session.revertMessageId,
      routineId: null,
    };
  }

  /** Running chats; those with an open permission or question wait on the person. */
  async function runStates(engineTarget: EngineTarget): Promise<Map<string, ChatStatus>> {
    const active = await engine.activeSessions(engineTarget).catch(() => new Set<string>());
    const states = new Map<string, ChatStatus>();
    await Promise.all(
      [...active].map(async (id) => {
        const [permissions, questions] = await Promise.all([engine.permissions(engineTarget, id).catch(() => []), engine.questions(engineTarget, id).catch(() => [])]);
        states.set(id, permissions.length || questions.length ? "waiting" : "running");
      }),
    );
    return states;
  }

  /**
   * Where a new project's folder goes: the person's preference, else the
   * BonzaiWork folder their projects already live in, else ~/BonzaiWork.
   * The server does not expand `~`, so the result is always absolute.
   */
  async function defaultFolder(): Promise<string> {
    const stored = readLocal("bonzaiwork.defaultFolder")?.trim();
    const known = workspaces.size ? [...workspaces.values()] : await listWorkspaces();
    if (stored && !stored.startsWith("~")) return stored.replace(/[\\/]+$/, "");
    const shared = known.map((entry) => /^(.*[\\/]BonzaiWork)[\\/][^\\/]+[\\/]?$/.exec(entry.path)?.[1]).find(Boolean);
    if (shared && !stored) return shared;
    const home = known.map((entry) => HOME_RE.exec(entry.path)?.[1]).find(Boolean);
    if (home) return `${home}${home.includes("\\") ? "\\" : "/"}${stored ? stored.replace(/^~[\\/]?/, "") : "BonzaiWork"}`;
    throw new BackendError("folder_required", "Kies een map voor dit project of stel een standaardmap in bij Instellingen.", 400);
  }

  async function uploadToInbox(projectId: string, file: File, path: string): Promise<string> {
    const form = new FormData();
    form.append("file", file);
    form.append("path", path);
    const payload = await req(`/workspace/${enc(projectId)}/inbox`, { method: "POST", form, timeoutMs: 120_000 });
    return str(payload, "path") ?? path;
  }

  async function routinesList(projectId: string | null): Promise<Routine[]> {
    if (!routinesOnServer) return [];
    const query = projectId ? `?workspaceId=${enc(projectId)}` : "";
    return items(await req(`/bonzaiwork/routines${query}`)).flatMap((entry) => readRoutine(entry) ?? []);
  }

  // -------------------------------------------------------------------------
  // The interface
  // -------------------------------------------------------------------------

  const backend: Backend = {
    mode: "live",
    capabilities,
    engine: {
      current: () => engineState,
      error: () => engineFailure?.message ?? null,
      retry: retryEngine,
      subscribe(listener) {
        engineListeners.add(listener);
        return () => engineListeners.delete(listener);
      },
    },

    async status() {
      return (await fetchStatus()).app;
    },

    keys: {
      linkUser: async (key) => readStatus(await req("/bonzaiwork/keys/user", { method: "PUT", body: { key }, ...host }), !connection.hostToken).app,
      unlinkUser: async () => readStatus(await req("/bonzaiwork/keys/user", { method: "DELETE", ...host }), !connection.hostToken).app,
      linkProject: async (projectId, key) => {
        lastStatus = readStatus(await req(`/bonzaiwork/keys/workspace/${enc(projectId)}`, { method: "PUT", body: { key }, ...host }), !connection.hostToken);
        return lastStatus.app;
      },
      unlinkProject: async (projectId) => {
        lastStatus = readStatus(await req(`/bonzaiwork/keys/workspace/${enc(projectId)}`, { method: "DELETE", ...host }), !connection.hostToken);
        return lastStatus.app;
      },
      refreshModels: async () => {
        lastStatus = readStatus(await req("/bonzaiwork/models/refresh", { method: "POST", timeoutMs: 60_000 }), !connection.hostToken);
        return lastStatus.app;
      },
    },

    projects: {
      async list() {
        const [entries, status, metas] = await Promise.all([listWorkspaces(), fetchStatus(), meta.all()]);
        const models = await Promise.all(entries.map((entry) => defaultModel(entry.id)));
        return entries.map((entry, index) => toProject(entry, metas.get(entry.id) ?? EMPTY_META, status.workspaceKeys.get(entry.id), models[index] ?? null));
      },
      async create(input) {
        const folderPath = input.folderPath?.trim() || `${await defaultFolder()}/${safeFolderName(input.name)}`;
        const payload = await req("/workspaces/local", { method: "POST", body: { folderPath, name: input.name.trim(), preset: "starter" }, ...host });
        const listed = await listWorkspaces();
        const id = str(payload, "activeId") ?? listed.find((entry) => entry.path.replace(/[\\/]+$/, "") === folderPath.replace(/[\\/]+$/, ""))?.id;
        if (!id) throw new BackendError("invalid_response", "Het project is gemaakt, maar niet teruggevonden. Ververs de lijst.");
        await meta.patch(id, { description: input.description, color: input.color, icon: input.icon, allowedModels: input.allowedModels });
        if (input.defaultModel) await req(`/workspace/${enc(id)}/default-model`, { method: "PUT", body: { model: { providerID: PROVIDER_ID, modelID: input.defaultModel } } }).catch(() => null);
        if (input.instructions) await req(`/workspace/${enc(id)}/files/content`, { method: "POST", body: { path: "AGENTS.md", content: input.instructions, force: true } }).catch(() => null);
        return projectById(id);
      },
      async update(projectId, patch) {
        const { name, archived, ...rest } = patch;
        if (name) await req(`/workspaces/${enc(projectId)}/display-name`, { method: "PATCH", body: { displayName: name }, ...host });
        const metaPatch: Partial<ProjectMeta> = { ...rest };
        if (archived !== undefined) metaPatch.archivedAt = archived ? Date.now() : null;
        if (Object.keys(metaPatch).length) await meta.patch(projectId, metaPatch);
        if (name) await listWorkspaces();
        return projectById(projectId);
      },
      async setDefaultModel(projectId, model) {
        await req(`/workspace/${enc(projectId)}/default-model`, { method: "PUT", body: { model: model ? { providerID: PROVIDER_ID, modelID: model } : null } });
        return projectById(projectId);
      },
      async remove(projectId) {
        await req(`/workspaces/${enc(projectId)}`, { method: "DELETE", ...host });
        await meta.remove(projectId);
        workspaces.delete(projectId);
      },
      async summary(projectId): Promise<ProjectSummary> {
        if (metaOnServer) {
          const payload = await req(`/bonzaiwork/projects/${enc(projectId)}/summary`).catch(() => null);
          if (payload) {
            const tokens = rec(field(payload, "tokens"));
            return {
              chatCount: num(payload, "chatCount") ?? 0,
              lastActivityAt: num(payload, "lastActivityAt") ?? null,
              runningCount: num(payload, "runningCount") ?? 0,
              waitingCount: num(payload, "waitingCount") ?? 0,
              tokens: tokens ? { input: num(tokens, "input") ?? 0, output: num(tokens, "output") ?? 0 } : null,
              nextRoutineAt: num(payload, "nextRoutineAt") ?? null,
            };
          }
        }
        const engineTarget = await target(projectId);
        const [page, states, projectMeta, routines] = await Promise.all([engine.listSessions(engineTarget, null, 100), runStates(engineTarget), meta.get(projectId), routinesList(projectId).catch(() => [])]);
        const top = page.sessions.filter((session) => !session.parentId && !projectMeta.archivedChatIds.includes(session.id));
        const nextRuns = routines.filter((routine) => routine.state === "active" && routine.nextRunAt).map((routine) => routine.nextRunAt ?? Infinity);
        return {
          chatCount: top.length,
          lastActivityAt: page.sessions.length ? Math.max(...page.sessions.map((session) => session.updatedAt)) : null,
          runningCount: [...states.values()].filter((state) => state === "running").length,
          waitingCount: [...states.values()].filter((state) => state === "waiting").length,
          tokens: null,
          nextRoutineAt: nextRuns.length ? Math.min(...nextRuns) : null,
        };
      },
      async usage(projectId): Promise<Usage | null> {
        if (!metaOnServer) return null;
        const payload = await req(`/bonzaiwork/projects/${enc(projectId)}/usage?period=month`).catch(() => null);
        if (!payload) return null;
        return {
          period: "month",
          spend: num(payload, "spend") ?? 0,
          currency: str(payload, "currency") ?? "EUR",
          maxBudget: num(payload, "maxBudget") ?? null,
          budgetResetAt: num(payload, "budgetResetAt") ?? null,
          byModel: list(payload, "byModel").flatMap((entry) => (str(entry, "model") ? [{ model: str(entry, "model") ?? "", spend: num(entry, "spend") ?? 0, tokens: num(entry, "tokens") ?? 0 }] : [])),
        };
      },
      async exportUrl(projectId) {
        const payload = await req(`/workspace/${enc(projectId)}/export`, { timeoutMs: 60_000 });
        return URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
      },
    },

    chats: {
      async list(projectId, cursor) {
        const engineTarget = await target(projectId);
        const [page, states, projectMeta, groups] = await Promise.all([
          engine.listSessions(engineTarget, cursor),
          cursor ? Promise.resolve(new Map<string, ChatStatus>()) : runStates(engineTarget),
          meta.get(projectId),
          cursor ? Promise.resolve(null) : backend.groups.list(projectId).catch(() => null),
        ]);
        if (groups) assignmentsByProject.set(projectId, groups.assignments);
        if (!cursor) {
          for (const [id, state] of liveStatus) if ((state === "running" || state === "waiting") && !states.has(id)) liveStatus.delete(id);
          for (const [id, state] of states) liveStatus.set(id, state);
        }
        return { items: page.sessions.map((session) => toChat(projectId, session, projectMeta, states.get(session.id) ?? liveStatus.get(session.id) ?? "idle")), nextCursor: page.next };
      },
      async create(projectId, input) {
        const engineTarget = await target(projectId);
        const session = await engine.createSession(engineTarget, input.model, input.title);
        return toChat(projectId, session, await meta.get(projectId), "idle");
      },
      async rename(projectId, chatId, title) {
        const engineTarget = await target(projectId);
        const session = (await engine.renameSession(engineTarget, chatId, title)) ?? (await engine.getSession(engineTarget, chatId));
        return toChat(projectId, session, await meta.get(projectId), liveStatus.get(chatId) ?? "idle");
      },
      async remove(projectId, chatId) {
        await engine.deleteSession(await target(projectId), chatId);
        const projectMeta = await meta.get(projectId);
        const { [chatId]: _note, ...chatNotes } = projectMeta.chatNotes;
        await meta.patch(projectId, { pinnedChatIds: projectMeta.pinnedChatIds.filter((id) => id !== chatId), archivedChatIds: projectMeta.archivedChatIds.filter((id) => id !== chatId), chatNotes });
      },
      async setPinned(projectId, chatId, pinned) {
        const projectMeta = await meta.get(projectId);
        await meta.patch(projectId, { pinnedChatIds: pinned ? [...new Set([...projectMeta.pinnedChatIds, chatId])] : projectMeta.pinnedChatIds.filter((id) => id !== chatId) });
      },
      async setArchived(projectId, chatId, archived) {
        // The v2 engine cannot archive (V2_SESSION_ARCHIVE_UNAVAILABLE): BonzaiWork keeps the list.
        const projectMeta = await meta.get(projectId);
        await meta.patch(projectId, { archivedChatIds: archived ? [...new Set([...projectMeta.archivedChatIds, chatId])] : projectMeta.archivedChatIds.filter((id) => id !== chatId) });
      },
      async setNote(projectId, chatId, note) {
        const projectMeta = await meta.get(projectId);
        const { [chatId]: _old, ...rest } = projectMeta.chatNotes;
        await meta.patch(projectId, { chatNotes: note ? { ...rest, [chatId]: note } : rest });
      },
      messages: async (projectId, chatId) => engine.messages(await target(projectId), chatId),
      async send(projectId, chatId, input) {
        const engineTarget = await target(projectId);
        const attachments: PromptAttachment[] = [];
        for (const attachment of input.attachments) {
          const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
          const inboxPath = await uploadToInbox(projectId, attachment.file, `chat-attachments/${chatId}/${unique}-${attachment.name}`);
          const workspacePath = `.opencode/openwork/inbox/${inboxPath}`;
          attachments.push({ filename: attachment.name, workspacePath, url: `file://${engineTarget.directory.replace(/\\/g, "/")}/${workspacePath}`, bytes: attachment.size });
        }
        await engine.setModel(engineTarget, chatId, input.model);
        if (input.agent) await engine.setAgent(engineTarget, chatId, input.agent);
        const text = encodePrompt(input.text, attachments);
        if (input.command) await engine.command(engineTarget, chatId, input.command, text);
        else await engine.prompt(engineTarget, chatId, text, input.skills);
        liveStatus.set(chatId, "running");
      },
      abort: async (projectId, chatId) => void (await engine.interrupt(await target(projectId), chatId)),
      async fork(projectId, chatId, beforeMessageId) {
        const session = await engine.fork(await target(projectId), chatId, beforeMessageId);
        return toChat(projectId, session, await meta.get(projectId), "idle");
      },
      revert: async (projectId, chatId, messageId) => void (await engine.revert(await target(projectId), chatId, messageId)),
      unrevert: async (projectId, chatId) => void (await engine.unrevert(await target(projectId), chatId)),
      async search(projectId, query) {
        if (!metaOnServer) return [];
        const payload = await req(`/bonzaiwork/projects/${enc(projectId)}/chats/search?q=${enc(query)}`).catch(() => null);
        return items(payload).flatMap((entry) => {
          const chatId = str(entry, "chatId");
          return chatId ? [{ chatId, title: str(entry, "title") ?? "", snippet: str(entry, "snippet") ?? null }] : [];
        });
      },
    },

    groups: {
      async list(projectId) {
        const payload = await req(`/workspace/${enc(projectId)}/session-groups`);
        const state = field(payload, "state");
        const groups = list(state, "groups").flatMap((group) => (str(group, "id") && str(group, "label") !== undefined ? [{ id: str(group, "id") ?? "", label: str(group, "label") ?? "" }] : []));
        const assignments = Object.fromEntries(Object.entries(rec(field(state, "assignments")) ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
        assignmentsByProject.set(projectId, assignments);
        return { groups, assignments };
      },
      async create(projectId, label) {
        const payload = await req(`/workspace/${enc(projectId)}/session-groups`, { method: "POST", body: { label } });
        const group = list(field(payload, "state"), "groups").at(-1);
        return { id: str(group, "id") ?? "", label: str(group, "label") ?? label };
      },
      rename: async (projectId, groupId, label) => void (await req(`/workspace/${enc(projectId)}/session-groups/${enc(groupId)}`, { method: "PATCH", body: { label } })),
      remove: async (projectId, groupId) => void (await req(`/workspace/${enc(projectId)}/session-groups/${enc(groupId)}`, { method: "DELETE" })),
      reorder: async (projectId, groupIds) => void (await req(`/workspace/${enc(projectId)}/session-groups/reorder`, { method: "PATCH", body: { groupIds } })),
      async assign(projectId, chatId, groupId) {
        await req(`/workspace/${enc(projectId)}/session-groups/assignments/${enc(chatId)}`, { method: "PATCH", body: { groupId } });
        const assignments = { ...(assignmentsByProject.get(projectId) ?? {}) };
        if (groupId) assignments[chatId] = groupId;
        else delete assignments[chatId];
        assignmentsByProject.set(projectId, assignments);
      },
    },

    interactions: {
      permissions: async (projectId, chatId) => engine.permissions(await target(projectId), chatId),
      replyPermission: async (projectId, chatId, requestId, reply) => void (await engine.replyPermission(await target(projectId), chatId, requestId, reply)),
      questions: async (projectId, chatId) => engine.questions(await target(projectId), chatId),
      replyQuestion: async (projectId, chatId, requestId, answers) => engine.replyQuestion(await target(projectId), chatId, requestId, answers),
      rejectQuestion: async (projectId, chatId, requestId) => engine.replyQuestion(await target(projectId), chatId, requestId, null),
    },

    subscribe(projectId, listener) {
      let stop: (() => void) | null = null;
      let cancelled = false;
      const emit = (event: ProjectEvent) => {
        if (event.type === "chat.status") liveStatus.set(event.chatId, event.status);
        try {
          listener(event);
        } catch {
          // One broken listener must not end the stream.
        }
      };
      void target(projectId).then(
        (engineTarget) => {
          if (cancelled) return;
          const translate = createTranslator(engineTarget.directory);
          stop = followEvents(
            engineTarget,
            (raw) => {
              const { events, refresh } = translate(raw);
              for (const event of events) emit(event);
              for (const chatId of refresh) {
                void Promise.all([engine.getSession(engineTarget, chatId), meta.get(projectId)]).then(
                  ([session, projectMeta]) => emit({ type: "chat.upserted", chat: toChat(projectId, session, projectMeta, liveStatus.get(chatId) ?? "idle") }),
                  () => {},
                );
              }
            },
            (state) => emit({ type: "connection", state }),
          );
        },
        () => emit({ type: "connection", state: "reconnecting" }),
      );
      return () => {
        cancelled = true;
        stop?.();
      };
    },

    composer: {
      async agents(projectId) {
        const agents = await engine.agents(await target(projectId)).catch(() => []);
        return agents.map((agent) => ({ id: agent.id, name: AGENT_NAMES[agent.id]?.name ?? agent.id.charAt(0).toUpperCase() + agent.id.slice(1), description: AGENT_NAMES[agent.id]?.description ?? agent.description }));
      },
      async entries(projectId) {
        const catalog = await engine.commands(await target(projectId));
        const names = new Set(catalog.commands.map((command) => command.name));
        return [
          ...catalog.commands.map((command) => ({ ...command, kind: "command" as const })),
          ...catalog.skills.filter((skill) => !names.has(skill.name)).map((skill) => ({ ...skill, kind: "skill" as const })),
        ];
      },
      upload: async (projectId, file) => ({ path: `.opencode/openwork/inbox/${await uploadToInbox(projectId, file, file.name)}` }),
    },

    config: {
      async instructions(projectId) {
        try {
          return str(await req(`/workspace/${enc(projectId)}/files/content?path=AGENTS.md`), "content") ?? null;
        } catch (failure) {
          if (failure instanceof BackendError && failure.status === 404) return null;
          throw failure;
        }
      },
      setInstructions: async (projectId, content) => void (await req(`/workspace/${enc(projectId)}/files/content`, { method: "POST", body: { path: "AGENTS.md", content, force: true } })),
      async skills(projectId, scope) {
        const payload = await req(`/workspace/${enc(projectId)}/skills?includeGlobal=true`);
        return items(payload).flatMap((entry) => {
          const name = str(entry, "name");
          const entryScope = str(entry, "scope") === "global" ? "global" : "project";
          return name && entryScope === scope ? [{ name, description: str(entry, "description") ?? "", scope: entryScope, error: str(entry, "error") ?? null }] : [];
        });
      },
      async skill(projectId, name) {
        const payload = await req(`/workspace/${enc(projectId)}/skills/${enc(name)}?includeGlobal=true`);
        const item = field(payload, "item");
        return { skill: { name: str(item, "name") ?? name, description: str(item, "description") ?? "", scope: str(item, "scope") === "global" ? "global" : "project", error: str(item, "error") ?? null }, content: str(payload, "content") ?? "" };
      },
      async saveSkill(scopeId, input) {
        if (scopeId === "global") throw unsupported("Skills voor alle projecten bewerken");
        await req(`/workspace/${enc(scopeId)}/skills`, { method: "POST", body: { name: input.name, content: input.content, description: input.description } });
      },
      async removeSkill(scopeId, name) {
        if (scopeId === "global") throw unsupported("Skills voor alle projecten verwijderen");
        await req(`/workspace/${enc(scopeId)}/skills/${enc(name)}`, { method: "DELETE" });
      },
      async commands(projectId, scope) {
        const payload = await req(`/workspace/${enc(projectId)}/commands?scope=${scope}`);
        return items(payload).flatMap((entry) => {
          const name = str(entry, "name");
          return name ? [{ name, description: str(entry, "description") ?? null, template: str(entry, "template") ?? "", scope }] : [];
        });
      },
      async saveCommand(scopeId, input) {
        if (scopeId === "global" || input.scope === "global") throw unsupported("Commando's voor alle projecten bewerken");
        await req(`/workspace/${enc(scopeId)}/commands`, { method: "POST", body: { name: input.name, description: input.description ?? undefined, template: input.template } });
      },
      async removeCommand(scopeId, name) {
        if (scopeId === "global") throw unsupported("Commando's voor alle projecten verwijderen");
        await req(`/workspace/${enc(scopeId)}/commands/${enc(name)}`, { method: "DELETE" });
      },
      async connections(projectId) {
        const [payload, statuses] = await Promise.all([req(`/workspace/${enc(projectId)}/mcp`), engine.mcpStatus(await target(projectId)).catch(() => new Map<string, { status: string; error: string | null }>())]);
        return items(payload).flatMap((entry): ConnectionEntry[] => {
          const name = str(entry, "name");
          if (!name || name === "openwork-cloud") return [];
          const config = field(entry, "config");
          const remote = str(config, "type") === "remote" || Boolean(str(config, "url"));
          const enabled = bool(config, "enabled") !== false;
          const live = statuses.get(name);
          const status = !enabled ? "disabled" : live?.status === "connected" || live?.status === "needs_auth" || live?.status === "failed" ? live.status : live?.status === "needs_client_registration" ? "needs_auth" : "pending";
          return [{
            name,
            kind: remote ? "remote" : "local",
            target: remote ? str(config, "url") ?? "" : strings(field(config, "command")).join(" "),
            enabled,
            status,
            error: status === "failed" ? live?.error ?? null : null,
            scope: str(entry, "source") === "config.global" ? "global" : "project",
          }];
        });
      },
      async addConnection(projectId, input) {
        const config = input.kind === "remote" ? { type: "remote", url: input.url, enabled: true } : { type: "local", command: input.command.match(/"[^"]*"|\S+/g)?.map((part) => part.replace(/^"|"$/g, "")) ?? [], enabled: true };
        await connectionChange(req(`/workspace/${enc(projectId)}/mcp`, { method: "POST", body: { name: input.name, config } }));
      },
      setConnectionEnabled: (projectId, name, enabled) => connectionChange(req(`/workspace/${enc(projectId)}/mcp/${enc(name)}/enabled`, { method: "POST", body: { enabled } })),
      removeConnection: (projectId, name) => connectionChange(req(`/workspace/${enc(projectId)}/mcp/${enc(name)}`, { method: "DELETE" })),
      signOutConnection: async (projectId, name) => void (await req(`/workspace/${enc(projectId)}/mcp/${enc(name)}/auth`, { method: "DELETE" })),
      async runMode(projectId) {
        const payload = await req(`/workspace/${enc(projectId)}/permissions/mode`);
        const mode = str(payload, "mode");
        // The server's reason is English and technical; the screen says it in its own words.
        return { mode: mode === "default" || mode === "approve" || mode === "run-everything" ? mode : null, supported: field(payload, "supported") !== false, reason: null };
      },
      async setRunMode(projectId, mode: RunMode) {
        const payload = await req(`/workspace/${enc(projectId)}/permissions/mode`, { method: "PUT", body: { mode } });
        const next = str(payload, "mode");
        return { mode: next === "default" || next === "approve" || next === "run-everything" ? next : mode, supported: field(payload, "supported") !== false, reason: null };
      },
      folders: async (projectId) => strings(field(await req(`/workspace/${enc(projectId)}/authorized-folders`), "folders")),
      async setFolders(projectId, folders) {
        return strings(field(await req(`/workspace/${enc(projectId)}/authorized-folders`, { method: "PUT", body: { folders } }), "folders"));
      },
      async files(projectId) {
        const session = await req(`/workspace/${enc(projectId)}/files/sessions`, { method: "POST", body: { write: false, ttlSeconds: 60 } });
        const sessionId = str(field(session, "session"), "id");
        if (!sessionId) return [];
        try {
          const snapshot = await req(`/files/sessions/${enc(sessionId)}/catalog/snapshot?includeDirs=false&excludeHeavyDirectories=true&limit=1000`);
          return items(snapshot).flatMap((entry) => {
            const path = str(entry, "path");
            if (!path || str(entry, "kind") === "dir" || path.split("/").some((segment) => segment.startsWith("."))) return [];
            return [{ path, bytes: num(entry, "size") ?? 0, updatedAt: num(entry, "mtimeMs") ?? 0 }];
          });
        } finally {
          void req(`/files/sessions/${enc(sessionId)}`, { method: "DELETE" }).catch(() => null);
        }
      },
      async readFile(projectId, path, chatId) {
        const query = new URLSearchParams({ path });
        if (chatId) query.set("session", chatId);
        try {
          const payload = await req(`/workspace/${enc(projectId)}/files/content?${query.toString()}`);
          return { path, content: str(payload, "content") ?? null, bytes: num(payload, "bytes") ?? 0, updatedAt: num(payload, "updatedAt") ?? null };
        } catch (failure) {
          if (failure instanceof BackendError && (failure.status === 400 || failure.status === 413)) return { path, content: null, bytes: 0, updatedAt: null };
          throw failure;
        }
      },
      async audit(projectId): Promise<AuditEntry[]> {
        return items(await req(`/workspace/${enc(projectId)}/audit?limit=50`)).flatMap((entry) => {
          const id = str(entry, "id");
          if (!id) return [];
          const actor = str(field(entry, "actor"), "type");
          return [{ id, action: str(entry, "action") ?? "", summary: str(entry, "summary") ?? "", actor: actor === "host" || actor === "owner" ? "Jij" : actor === "agent" ? "Agent" : "App", at: num(entry, "timestamp") ?? 0 }];
        });
      },
    },

    routines: {
      list: (projectId) => routinesList(projectId),
      async create(input) {
        if (!routinesOnServer) throw unsupported("Routines");
        const routine = readRoutine(await req("/bonzaiwork/routines", { method: "POST", body: { workspaceId: input.projectId, name: input.name, prompt: input.prompt, model: input.model, schedule: input.schedule } }));
        if (!routine) throw new BackendError("invalid_response", "De routine is opgeslagen, maar niet teruggekomen. Ververs de lijst.");
        return routine;
      },
      async update(routineId, patch) {
        if (!routinesOnServer) throw unsupported("Routines");
        const { projectId, ...rest } = patch;
        const routine = readRoutine(await req(`/bonzaiwork/routines/${enc(routineId)}`, { method: "PATCH", body: { ...rest, ...(projectId ? { workspaceId: projectId } : {}) } }));
        if (!routine) throw new BackendError("invalid_response", "De routine is opgeslagen, maar niet teruggekomen. Ververs de lijst.");
        return routine;
      },
      async remove(routineId) {
        if (!routinesOnServer) throw unsupported("Routines");
        await req(`/bonzaiwork/routines/${enc(routineId)}`, { method: "DELETE" });
      },
      async run(routineId) {
        if (!routinesOnServer) throw unsupported("Routines");
        const run = readRun(data(await req(`/bonzaiwork/routines/${enc(routineId)}/run`, { method: "POST" })));
        if (!run) throw new BackendError("invalid_response", "De routine is gestart.");
        return run;
      },
      async runs(routineId) {
        if (!routinesOnServer) return [];
        return items(await req(`/bonzaiwork/routines/${enc(routineId)}/runs`)).flatMap((entry) => readRun(entry) ?? []);
      },
    },

    settings: {
      async env() {
        return items(await req("/env?includeValues=false", host)).flatMap((entry) => {
          const key = str(entry, "key");
          return key ? [{ key, hasValue: field(entry, "hasValue") !== false }] : [];
        });
      },
      setEnv: async (key, value) => void (await req("/env", { method: "PUT", body: { key, value }, ...host })),
      removeEnv: async (key) => void (await req(`/env/${enc(key)}`, { method: "DELETE", ...host })),
      async versions() {
        const [health, first] = await Promise.all([req("/health", { timeoutMs: 5_000 }).catch(() => null), listWorkspaces().then((entries) => entries[0] ?? null).catch(() => null)]);
        const engineVersion = first ? await engine.info({ connection, workspaceId: first.id, directory: first.path }).catch(() => null) : null;
        return { app: __APP_VERSION__, server: str(health, "version") ?? null, engine: engineVersion };
      },
    },

    desktop: {
      pickFolder: () => pickDirectory("Map voor dit project"),
      revealPath: (path) => revealItem(path),
    },
  };

  // Make sure the engine is on before the first chat needs it; failures surface on that request.
  void engineReady().catch(() => undefined);
  return backend;
}
