import {
  BackendError,
  type AppStatus,
  type Backend,
  type Capabilities,
  type Chat,
  type ChatErrorKind,
  type ChatSearchHit,
  type Message,
  type MessagePart,
  type PermissionReply,
  type Project,
  type ProjectEvent,
  type ProjectSummary,
  type Routine,
  type RoutineRun,
  type SendInput,
  type ToolPart,
} from "../types";
import { missedOccurrence, nextOccurrence } from "~/lib/schedule";
import { readLocalJson, writeLocalJson, writeLocal } from "~/lib/storage";

import { createDemoBrains } from "./brains";
import { planReply, titleFrom, type Step } from "./replies";
import { createSeed, type DemoState } from "./seed";

/**
 * The browser-only backend for development and design reviews. It
 * keeps the frontend contract honest: every screen runs against the same
 * interface as the live app, with realistic latency, streaming and failures.
 *
 * URL switches (for reviewers): `?demo=leeg` starts without projects (shows
 * onboarding), `?sleutel=gebruiker` uses one key per person instead of per
 * project. Typing "budget op" in a chat shows the budget error.
 */

const CAPABILITIES: Capabilities = {
  routines: true,
  usage: true,
  contentSearch: true,
  projectMeta: "server",
  folderPicker: false,
  revealPath: false,
  notifications: false,
  globalConfig: true,
  brains: true,
};

const MIN = 60_000;

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Reads answer like the local server does (fast); writes take a little longer. */
function latency(kind: "read" | "write" = "read"): Promise<void> {
  const base = kind === "read" ? 30 : 240;
  return wait(base + Math.round(Math.random() * base));
}

let counter = 0;
function newId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function keyHint(key: string): string {
  return `…${key.slice(-4)}`;
}

function validateKey(raw: string): string {
  const key = raw.trim();
  if (!key) throw new BackendError("invalid_key", "Plak een LiteLLM-key.", 400);
  if (!key.startsWith("sk-") || key.length < 8 || /fout|wrong|invalid/i.test(key)) {
    throw new BackendError("key_rejected", "LiteLLM accepteert deze key niet.", 401);
  }
  return key;
}

function demoFileContent(name: string): string {
  if (name.endsWith(".csv")) return "datum;onderwerp;aantal\n2026-10-01;levering;14\n2026-10-01;retour;6\n2026-10-02;betaling;3\n";
  if (name.startsWith("prijslijst")) return "# Prijslijst 2026\n\n| Dienst | Tarief |\n|---|---|\n| Onderhoud (per uur) | € 92,50 |\n| Hostingpakket Basis | € 19,00 p/m |\n| Hostingpakket Plus | € 39,00 p/m |\n| Spoedtoeslag | 50% |\n";
  if (name.startsWith("2026-0")) return `# Offerte ${name.replace(".md", "")}\n\n**Status:** verstuurd\n\n| Onderdeel | Totaal |\n|---|---|\n| Onderhoud webshop (per maand) | € 594,00 |\n| Migratie (eenmalig) | € 1.295,00 |\n\nGeldig tot 30 dagen na dagtekening.\n`;
  return `# ${name.replace(/\.md$/, "").replace(/[-_]/g, " ")}\n\nVoorbeeldinhoud in de demo. In de app zie je hier het echte bestand uit de projectmap.\n`;
}

type Waiter<T> = { resolve: (value: T) => void; reject: (error: unknown) => void };

export type DemoOptions = { empty: boolean; keyMode: "user" | "workspace" };

export function readDemoOptions(search: string): DemoOptions {
  const params = new URLSearchParams(search);
  const demo = params.get("demo");
  const key = params.get("sleutel") ?? params.get("keyMode");
  return { empty: demo === "leeg" || demo === "empty", keyMode: key === "gebruiker" || key === "user" ? "user" : "workspace" };
}

export function createDemoBackend(options: DemoOptions): Backend & { reset(): void } {
  const storageKey = `bonzaiwork.demo.v3.${options.empty ? "leeg" : "vol"}.${options.keyMode}`;
  const stored = readLocalJson(storageKey);
  const isState = (value: unknown): value is DemoState =>
    typeof value === "object" && value !== null && Reflect.get(value, "version") === 3 && Array.isArray(Reflect.get(value, "projects"));
  let state: DemoState = isState(stored) ? stored : createSeed(Date.now(), options);
  const freshSeed = !isState(stored);

  const listeners = new Map<string, Set<(event: ProjectEvent) => void>>();
  const running = new Map<string, AbortController>();
  const permissionWaiters = new Map<string, Waiter<PermissionReply>>();
  const questionWaiters = new Map<string, Waiter<string[][] | null>>();
  const alwaysAllowed = new Map<string, Set<string>>();
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  // -------------------------------------------------------------------------
  // Persistence and events
  // -------------------------------------------------------------------------

  const save = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 400);
  };
  function flush() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = undefined;
    state.lastSeenAt = Date.now();
    writeLocalJson(storageKey, state);
  }
  if (typeof window !== "undefined") window.addEventListener("pagehide", flush);

  const emit = (projectId: string, event: ProjectEvent) => {
    for (const listener of listeners.get(projectId) ?? []) {
      try {
        listener(clone(event));
      } catch {
        // A broken listener must not stop the others.
      }
    }
  };

  const audit = (projectId: string, action: string, summary: string) => {
    const list = state.audit[projectId] ?? [];
    list.unshift({ id: newId("a"), action, summary, actor: "Jij", at: Date.now() });
    state.audit[projectId] = list.slice(0, 100);
  };

  // -------------------------------------------------------------------------
  // Lookups
  // -------------------------------------------------------------------------

  const projectEntry = (projectId: string) => {
    const found = state.projects.find((entry) => entry.id === projectId);
    if (!found) throw new BackendError("not_found", "Dit project bestaat niet meer.", 404);
    return found;
  };
  const toProject = (entry: DemoState["projects"][number]): Project => {
    const { keyValue: _key, createdAt: _created, ...project } = entry;
    return clone(project);
  };
  const chatEntry = (chatId: string) => {
    const found = state.chats.find((entry) => entry.id === chatId);
    if (!found) throw new BackendError("not_found", "Deze chat bestaat niet meer.", 404);
    return found;
  };
  const messagesOf = (chatId: string) => {
    let list = state.messages[chatId];
    if (!list) {
      list = [];
      state.messages[chatId] = list;
    }
    return list;
  };
  const projectHasKey = (projectId: string) =>
    state.keyMode === "user" ? Boolean(state.userKey) : Boolean(projectEntry(projectId).keyValue);

  const status = (): AppStatus => ({
    litellmBaseUrl: "https://litellm.bonzaiwork.nl",
    keyMode: state.keyMode,
    keyStorePersistent: true,
    user: state.userKey ? { hasKey: true, keyHint: keyHint(state.userKey) } : { hasKey: false, keyHint: null },
    models: clone(state.models),
    defaultModel: state.defaultModel,
    readOnly: false,
  });

  const touchChat = (chat: Chat, patch: Partial<Chat> = {}) => {
    Object.assign(chat, patch, { updatedAt: Date.now() });
    emit(chat.projectId, { type: "chat.upserted", chat: clone(chat) });
    save();
  };

  const setStatus = (chat: Chat, status: Chat["status"]) => {
    chat.status = status;
    emit(chat.projectId, { type: "chat.status", chatId: chat.id, status });
    emit(chat.projectId, { type: "chat.upserted", chat: clone(chat) });
  };

  // -------------------------------------------------------------------------
  // The simulated agent
  // -------------------------------------------------------------------------

  async function streamText(chat: Chat, message: Message, text: string, signal: AbortSignal) {
    const part: MessagePart = { type: "text", id: newId("part"), text: "" };
    message.parts.push(part);
    emit(chat.projectId, { type: "part.upserted", chatId: chat.id, messageId: message.id, part: clone(part) });
    const chunks = text.match(/\S+\s*|\s+/g) ?? [text];
    for (let index = 0; index < chunks.length; index += 3) {
      await wait(28 + Math.random() * 30, signal);
      const delta = chunks.slice(index, index + 3).join("");
      part.text += delta;
      emit(chat.projectId, { type: "part.delta", chatId: chat.id, messageId: message.id, partId: part.id, delta });
    }
  }

  async function askPermission(chat: Chat, action: string, resources: string[], signal: AbortSignal): Promise<PermissionReply> {
    if (state.runModes[chat.projectId] === "run-everything" || alwaysAllowed.get(chat.projectId)?.has(action)) return "once";
    const request = { id: newId("perm"), chatId: chat.id, action, resources, canAlways: true, message: null };
    state.permissions.push(request);
    setStatus(chat, "waiting");
    emit(chat.projectId, { type: "permission.asked", request: clone(request) });
    save();
    try {
      return await new Promise<PermissionReply>((resolve, reject) => {
        permissionWaiters.set(request.id, { resolve, reject });
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
    } finally {
      permissionWaiters.delete(request.id);
      state.permissions = state.permissions.filter((entry) => entry.id !== request.id);
      emit(chat.projectId, { type: "permission.resolved", chatId: chat.id, requestId: request.id });
      if (chat.status === "waiting") setStatus(chat, "running");
    }
  }

  async function askQuestion(chat: Chat, step: Extract<Step, { kind: "question" }>, signal: AbortSignal): Promise<string | null> {
    const request = { id: newId("q"), chatId: chat.id, fields: [step.field] };
    state.questions.push(request);
    setStatus(chat, "waiting");
    emit(chat.projectId, { type: "question.asked", request: clone(request) });
    save();
    try {
      const answers = await new Promise<string[][] | null>((resolve, reject) => {
        questionWaiters.set(request.id, { resolve, reject });
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
      return answers?.[0]?.join(", ") ?? null;
    } finally {
      questionWaiters.delete(request.id);
      state.questions = state.questions.filter((entry) => entry.id !== request.id);
      emit(chat.projectId, { type: "question.resolved", chatId: chat.id, requestId: request.id });
      if (chat.status === "waiting") setStatus(chat, "running");
    }
  }

  async function runSteps(chat: Chat, message: Message, steps: Step[], signal: AbortSignal): Promise<ChatErrorKind | null> {
    for (const step of steps) {
      if (step.kind === "error") return step.error;
      if (step.kind === "reasoning") {
        const part: MessagePart = { type: "reasoning", id: newId("part"), text: "", startedAt: Date.now(), endedAt: null };
        message.parts.push(part);
        emit(chat.projectId, { type: "part.upserted", chatId: chat.id, messageId: message.id, part: clone(part) });
        await wait(step.ms, signal);
        part.text = step.text;
        part.endedAt = Date.now();
        emit(chat.projectId, { type: "part.upserted", chatId: chat.id, messageId: message.id, part: clone(part) });
      } else if (step.kind === "text") {
        await streamText(chat, message, step.text, signal);
      } else if (step.kind === "question") {
        const answer = await askQuestion(chat, step, signal);
        if (answer === null) {
          await streamText(chat, message, "Prima, dan laat ik het hierbij. Laat het weten als je verder wilt.", signal);
          return null;
        }
        const failure = await runSteps(chat, message, step.follow(answer), signal);
        if (failure) return failure;
      } else {
        const part: ToolPart = {
          type: "tool",
          id: newId("part"),
          tool: step.tool,
          status: "running",
          input: step.input,
          output: null,
          error: null,
          startedAt: Date.now(),
          endedAt: null,
          childChatId: null,
        };
        message.parts.push(part);
        emit(chat.projectId, { type: "part.upserted", chatId: chat.id, messageId: message.id, part: clone(part) });
        if (step.permission) {
          const reply = await askPermission(chat, step.permission.action, step.permission.resources, signal);
          if (reply === "always") {
            const set = alwaysAllowed.get(chat.projectId) ?? new Set<string>();
            set.add(step.permission.action);
            alwaysAllowed.set(chat.projectId, set);
          }
          if (reply === "reject") {
            Object.assign(part, { status: "error", error: "Geweigerd", endedAt: Date.now() });
            emit(chat.projectId, { type: "part.upserted", chatId: chat.id, messageId: message.id, part: clone(part) });
            await streamText(chat, message, "Begrepen, ik heb niets opgeslagen. Wil je dat ik het anders aanpak?", signal);
            return null;
          }
        }
        await wait(step.ms, signal);
        if (step.error) Object.assign(part, { status: "error", error: step.error, endedAt: Date.now() });
        else Object.assign(part, { status: "completed", output: step.output ?? null, endedAt: Date.now() });
        emit(chat.projectId, { type: "part.upserted", chatId: chat.id, messageId: message.id, part: clone(part) });
        if (step.tool === "write" || step.tool === "edit") {
          const path = typeof step.input.filePath === "string" ? step.input.filePath : null;
          if (path) {
            const files = state.files[chat.projectId] ?? [];
            state.files[chat.projectId] = [...files.filter((entry) => entry.path !== path), { path, bytes: 1_800 + Math.round(Math.random() * 2_000), updatedAt: Date.now() }];
          }
        }
      }
    }
    return null;
  }

  async function reply(chat: Chat, prompt: string, model: string): Promise<"succeeded" | "failed" | "cancelled"> {
    const controller = new AbortController();
    running.get(chat.id)?.abort();
    running.set(chat.id, controller);
    const message: Message = { id: newId("msg"), chatId: chat.id, role: "assistant", createdAt: Date.now(), completedAt: null, parts: [], model, tokens: null, error: null };
    messagesOf(chat.id).push(message);
    setStatus(chat, "running");
    emit(chat.projectId, { type: "message.upserted", message: clone(message) });
    let outcome: "succeeded" | "failed" | "cancelled" = "succeeded";
    try {
      await wait(450, controller.signal);
      if (!projectHasKey(chat.projectId)) throw Object.assign(new Error("key"), { kind: "key_missing" });
      const plan = planReply(prompt, {
        hasConnection: (name) => (state.connections[chat.projectId] ?? []).some((entry) => entry.name === name && entry.enabled),
      });
      if (chat.untitled) touchChat(chat, { title: plan.title, untitled: false });
      const failure = await runSteps(chat, message, plan.steps, controller.signal);
      if (failure) {
        message.error = { kind: failure, detail: null };
        outcome = "failed";
      } else {
        const text = message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
        const tools = message.parts.filter((part) => part.type === "tool").length;
        message.tokens = { input: 2_600 + tools * 1_100, output: Math.round(text.length / 3.6), reasoning: 120, cacheRead: 1_900, cacheWrite: 0 };
        const usage = state.usage[chat.projectId];
        if (usage) usage.spend = Math.round((usage.spend + 0.02 + text.length / 90_000) * 100) / 100;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        outcome = "cancelled";
        for (const part of message.parts) {
          if (part.type === "tool" && (part.status === "running" || part.status === "pending")) {
            Object.assign(part, { status: "error", error: "Gestopt", endedAt: Date.now() });
          }
        }
      } else {
        const kind = typeof error === "object" && error !== null && Reflect.get(error, "kind") === "key_missing" ? "key_missing" : "unknown";
        message.error = { kind, detail: null };
        outcome = "failed";
      }
    } finally {
      if (running.get(chat.id) === controller) running.delete(chat.id);
    }
    message.completedAt = Date.now();
    emit(chat.projectId, { type: "message.upserted", message: clone(message) });
    setStatus(chat, outcome === "failed" ? "failed" : "idle");
    touchChat(chat);
    return outcome;
  }

  // -------------------------------------------------------------------------
  // Routines
  // -------------------------------------------------------------------------

  const recordRun = (run: RoutineRun) => {
    const runs = state.runs[run.routineId] ?? [];
    state.runs[run.routineId] = [run, ...runs.filter((entry) => entry.id !== run.id)].slice(0, 50);
    const routine = state.routines.find((entry) => entry.id === run.routineId);
    if (routine) routine.lastRun = clone(run);
    save();
  };

  async function runRoutine(routine: Routine, trigger: RoutineRun["trigger"]): Promise<RoutineRun> {
    const now = Date.now();
    const run: RoutineRun = { id: newId("run"), routineId: routine.id, trigger, status: "running", skippedReason: null, chatId: null, scheduledAt: now, startedAt: now, finishedAt: null, error: null };
    const project = state.projects.find((entry) => entry.id === routine.projectId);
    const model = routine.model ?? project?.defaultModel ?? state.defaultModel;
    if (!project || !state.models.some((entry) => entry.id === model)) {
      Object.assign(run, { status: "failed", finishedAt: now, error: "Het model van deze routine is niet beschikbaar voor de key van dit project." });
      recordRun(run);
      return clone(run);
    }
    const label = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" }).format(now);
    const chat = createChat(routine.projectId, model, `${routine.name}, ${label}`);
    chat.routineId = routine.id;
    run.chatId = chat.id;
    recordRun(run);
    messagesOf(chat.id).push({ id: newId("msg"), chatId: chat.id, role: "user", createdAt: now, completedAt: now, parts: [{ type: "text", id: newId("part"), text: routine.prompt }], model: null, tokens: null, error: null });
    emit(chat.projectId, { type: "chat.upserted", chat: clone(chat) });
    void reply(chat, routine.prompt, model).then((outcome) => {
      Object.assign(run, { status: outcome === "succeeded" ? "succeeded" : outcome === "cancelled" ? "cancelled" : "failed", finishedAt: Date.now(), error: outcome === "failed" ? "Het antwoord is mislukt." : null });
      recordRun(run);
    });
    return clone(run);
  }

  const refreshNextRun = (routine: Routine) => {
    routine.nextRunAt = routine.state === "active" ? nextOccurrence(routine.schedule, Date.now()) : null;
  };

  // Runs that fell while the browser was closed are shown as missed (R1: no
  // silent catch-up), then the schedule moves on.
  for (const routine of state.routines) {
    if (routine.state !== "active") continue;
    const missed = missedOccurrence(routine.schedule, state.lastSeenAt, Date.now());
    if (missed && !(state.runs[routine.id] ?? []).some((run) => run.scheduledAt === missed)) {
      recordRun({ id: newId("run"), routineId: routine.id, trigger: "scheduled", status: "skipped", skippedReason: "app_closed", chatId: null, scheduledAt: missed, startedAt: null, finishedAt: null, error: null });
    }
    refreshNextRun(routine);
  }

  if (typeof window !== "undefined") {
    window.setInterval(() => {
      const now = Date.now();
      for (const routine of state.routines) {
        if (routine.state === "active" && routine.nextRunAt !== null && routine.nextRunAt <= now) {
          void runRoutine(routine, "scheduled");
          refreshNextRun(routine);
        }
      }
      state.lastSeenAt = now;
    }, 15_000);
  }

  // -------------------------------------------------------------------------
  // Chats
  // -------------------------------------------------------------------------

  function createChat(projectId: string, model: string, title?: string): Chat {
    const now = Date.now();
    const chat: Chat = {
      id: newId("c"),
      projectId,
      title: title ?? "Nieuwe chat",
      untitled: !title,
      createdAt: now,
      updatedAt: now,
      model,
      parentId: null,
      groupId: null,
      pinned: false,
      archived: false,
      note: null,
      status: "idle",
      revertMessageId: null,
      routineId: null,
    };
    state.chats.push(chat);
    state.messages[chat.id] = [];
    save();
    return chat;
  }

  const summary = (projectId: string): ProjectSummary => {
    const chats = state.chats.filter((chat) => chat.projectId === projectId);
    const visible = chats.filter((chat) => !chat.parentId && !chat.archived);
    let input = 0;
    let output = 0;
    for (const chat of chats) {
      for (const message of state.messages[chat.id] ?? []) {
        input += message.tokens?.input ?? 0;
        output += message.tokens?.output ?? 0;
      }
    }
    const next = state.routines
      .filter((routine) => routine.projectId === projectId && routine.state === "active" && routine.nextRunAt !== null)
      .map((routine) => routine.nextRunAt ?? Infinity);
    return {
      chatCount: visible.length,
      lastActivityAt: chats.length ? Math.max(...chats.map((chat) => chat.updatedAt)) : null,
      runningCount: visible.filter((chat) => chat.status === "running").length,
      waitingCount: visible.filter((chat) => chat.status === "waiting").length,
      tokens: { input, output },
      nextRoutineAt: next.length ? Math.min(...next) : null,
    };
  };

  // Replays seeded as "in progress", once per fresh demo.
  if (freshSeed && typeof window !== "undefined") {
    const replays = [...state.pendingReplays];
    state.pendingReplays = [];
    window.setTimeout(() => {
      for (const chatId of replays) {
        const chat = state.chats.find((entry) => entry.id === chatId);
        const prompt = state.messages[chatId]?.find((message) => message.role === "user")?.parts.find((part) => part.type === "text");
        if (chat && prompt?.type === "text") void reply(chat, prompt.text, chat.model ?? state.defaultModel);
      }
    }, 1_200);
  } else {
    // A reload mid-answer: the browser stopped it.
    for (const chat of state.chats) {
      if (chat.status === "running" && !state.permissions.some((entry) => entry.chatId === chat.id)) chat.status = "idle";
    }
  }

  // -------------------------------------------------------------------------
  // The interface
  // -------------------------------------------------------------------------

  const backend: Backend & { reset(): void } = {
    mode: "demo",
    capabilities: CAPABILITIES,

    reset() {
      for (const controller of running.values()) controller.abort();
      writeLocal(storageKey, null);
      state = createSeed(Date.now(), options);
      flush();
    },

    async status() {
      await latency();
      return status();
    },

    keys: {
      async linkUser(key) {
        await latency("write");
        state.userKey = validateKey(key);
        save();
        return status();
      },
      async unlinkUser() {
        await latency("write");
        state.userKey = null;
        save();
        return status();
      },
      async linkProject(projectId, key) {
        await latency("write");
        const entry = projectEntry(projectId);
        entry.keyValue = validateKey(key);
        entry.key = { hasKey: true, keyHint: keyHint(entry.keyValue) };
        audit(projectId, "key.link", "Key gekoppeld");
        save();
        return status();
      },
      async unlinkProject(projectId) {
        await latency("write");
        const entry = projectEntry(projectId);
        entry.keyValue = null;
        entry.key = { hasKey: false, keyHint: null };
        audit(projectId, "key.unlink", "Key ontkoppeld");
        save();
        return status();
      },
      async refreshModels() {
        await wait(700);
        return status();
      },
    },

    projects: {
      async list() {
        await latency();
        return state.projects.map(toProject);
      },
      async create(input) {
        await latency("write");
        const name = input.name.trim();
        if (!name) throw new BackendError("invalid_name", "Geef het project een naam.", 400);
        if (state.projects.some((entry) => entry.name.toLowerCase() === name.toLowerCase() && !entry.archivedAt)) {
          throw new BackendError("conflict", `Er is al een project met de naam ${name}.`, 409);
        }
        const id = newId("p");
        const entry = {
          id,
          name,
          path: input.folderPath ?? `${state.defaultFolder}/${name}`,
          description: input.description,
          color: input.color,
          icon: input.icon,
          pinned: false,
          archivedAt: null,
          key: { hasKey: false, keyHint: null },
          defaultModel: input.defaultModel,
          allowedModels: null,
          createdAt: Date.now(),
          keyValue: null,
        };
        state.projects.push(entry);
        state.groups[id] = { groups: [], assignments: {} };
        state.files[id] = [];
        if (input.instructions?.trim()) {
          state.instructions[id] = input.instructions.trim();
          state.files[id] = [{ path: "AGENTS.md", bytes: input.instructions.length, updatedAt: Date.now() }];
        }
        audit(id, "workspace.create", "Project gemaakt");
        save();
        return toProject(entry);
      },
      async update(projectId, patch) {
        await latency("write");
        const entry = projectEntry(projectId);
        const { archived, ...rest } = patch;
        Object.assign(entry, rest);
        if (archived !== undefined) entry.archivedAt = archived ? Date.now() : null;
        if (rest.name) audit(projectId, "workspace.rename", `Naam gewijzigd in ${rest.name}`);
        save();
        return toProject(entry);
      },
      async setDefaultModel(projectId, model) {
        await latency("write");
        const entry = projectEntry(projectId);
        entry.defaultModel = model;
        audit(projectId, "model.default", model ? `Standaardmodel ${model}` : "Standaardmodel gewist");
        save();
        return toProject(entry);
      },
      async remove(projectId) {
        await latency("write");
        projectEntry(projectId);
        state.projects = state.projects.filter((entry) => entry.id !== projectId);
        state.chats = state.chats.filter((chat) => chat.projectId !== projectId);
        state.routines = state.routines.filter((routine) => routine.projectId !== projectId);
        save();
      },
      async summary(projectId) {
        await latency();
        projectEntry(projectId);
        return summary(projectId);
      },
      async usage(projectId) {
        await latency();
        projectEntry(projectId);
        return clone(state.usage[projectId] ?? { period: "month", spend: 0, currency: "EUR", maxBudget: null, budgetResetAt: null, byModel: [] });
      },
      async exportUrl(projectId) {
        await latency("write");
        const entry = projectEntry(projectId);
        const data = {
          project: toProject(entry),
          chats: state.chats.filter((chat) => chat.projectId === projectId),
          instructions: state.instructions[projectId] ?? null,
          skills: state.skills[projectId] ?? [],
          commands: state.commands[projectId] ?? [],
          exportedAt: new Date().toISOString(),
        };
        return URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      },
    },

    chats: {
      async list(projectId) {
        await latency();
        projectEntry(projectId);
        const items = state.chats.filter((chat) => chat.projectId === projectId).sort((a, b) => b.updatedAt - a.updatedAt);
        return { items: clone(items), nextCursor: null };
      },
      async create(projectId, input) {
        await latency("write");
        projectEntry(projectId);
        const chat = createChat(projectId, input.model, input.title);
        emit(projectId, { type: "chat.upserted", chat: clone(chat) });
        return clone(chat);
      },
      async rename(projectId, chatId, title) {
        await latency("write");
        const chat = chatEntry(chatId);
        touchChat(chat, { title: title.trim() || chat.title, untitled: false });
        return clone(chat);
      },
      async remove(projectId, chatId) {
        await latency("write");
        running.get(chatId)?.abort();
        const removed = new Set([chatId, ...state.chats.filter((chat) => chat.parentId === chatId).map((chat) => chat.id)]);
        state.chats = state.chats.filter((chat) => !removed.has(chat.id));
        for (const id of removed) {
          delete state.messages[id];
          emit(projectId, { type: "chat.deleted", chatId: id });
        }
        save();
      },
      async setPinned(projectId, chatId, pinned) {
        await latency("write");
        touchChat(chatEntry(chatId), { pinned });
      },
      async setArchived(projectId, chatId, archived) {
        await latency("write");
        touchChat(chatEntry(chatId), { archived });
      },
      async setNote(projectId, chatId, note) {
        await latency("write");
        const chat = chatEntry(chatId);
        chat.note = note?.trim() || null;
        emit(projectId, { type: "chat.upserted", chat: clone(chat) });
        save();
      },
      async messages(projectId, chatId) {
        await latency();
        chatEntry(chatId);
        return clone(messagesOf(chatId));
      },
      async send(projectId, chatId, input: SendInput) {
        await latency("write");
        const chat = chatEntry(chatId);
        if (chat.revertMessageId) {
          const list = messagesOf(chatId);
          const index = list.findIndex((message) => message.id === chat.revertMessageId);
          if (index >= 0) state.messages[chatId] = list.slice(0, index);
          chat.revertMessageId = null;
          emit(projectId, { type: "history.changed", chatId });
        }
        let text = input.text.trim();
        if (input.command) {
          const commands = [...(state.commands[projectId] ?? []), ...(state.commands.global ?? [])];
          const command = commands.find((entry) => entry.name === input.command);
          text = command ? command.template.replace(/\$ARGUMENTS/g, text) : `/${input.command} ${text}`;
        }
        const parts: MessagePart[] = [{ type: "text", id: newId("part"), text: input.command ? `/${input.command} ${input.text}`.trim() : text }];
        for (const attachment of input.attachments) {
          parts.push({ type: "file", id: newId("part"), filename: attachment.name, mime: attachment.mime, url: null });
          const files = state.files[projectId] ?? [];
          state.files[projectId] = [...files, { path: `inbox/${attachment.name}`, bytes: attachment.size, updatedAt: Date.now() }];
        }
        const message: Message = { id: newId("msg"), chatId, role: "user", createdAt: Date.now(), completedAt: Date.now(), parts, model: null, tokens: null, error: null };
        messagesOf(chatId).push(message);
        emit(projectId, { type: "message.upserted", message: clone(message) });
        touchChat(chat, { model: input.model });
        void reply(chat, text, input.model);
      },
      async abort(projectId, chatId) {
        await latency();
        running.get(chatId)?.abort();
      },
      async fork(projectId, chatId, beforeMessageId) {
        await latency("write");
        const source = chatEntry(chatId);
        const list = messagesOf(chatId);
        const index = beforeMessageId ? list.findIndex((message) => message.id === beforeMessageId) : -1;
        const copied = index >= 0 ? list.slice(0, index) : list;
        const chat = createChat(projectId, source.model ?? state.defaultModel, `Kopie van ${source.title}`);
        chat.groupId = source.groupId;
        state.messages[chat.id] = copied.map((message) => ({ ...clone(message), id: newId("msg"), chatId: chat.id }));
        emit(projectId, { type: "chat.upserted", chat: clone(chat) });
        save();
        return clone(chat);
      },
      async revert(projectId, chatId, messageId) {
        await latency("write");
        touchChat(chatEntry(chatId), { revertMessageId: messageId });
      },
      async unrevert(projectId, chatId) {
        await latency("write");
        touchChat(chatEntry(chatId), { revertMessageId: null });
      },
      async search(projectId, query) {
        await latency();
        const needle = query.trim().toLowerCase();
        if (!needle) return [];
        const hits: ChatSearchHit[] = [];
        for (const chat of state.chats.filter((entry) => entry.projectId === projectId && !entry.parentId)) {
          if (chat.title.toLowerCase().includes(needle)) {
            hits.push({ chatId: chat.id, title: chat.title, snippet: null });
            continue;
          }
          for (const message of state.messages[chat.id] ?? []) {
            const text = message.parts.map((part) => (part.type === "text" ? part.text : "")).join(" ");
            const at = text.toLowerCase().indexOf(needle);
            if (at >= 0) {
              const start = Math.max(0, at - 40);
              hits.push({ chatId: chat.id, title: chat.title, snippet: `${start > 0 ? "…" : ""}${text.slice(start, at + needle.length + 60).replace(/\s+/g, " ").replace(/[*#|]/g, "")}…` });
              break;
            }
          }
        }
        return hits;
      },
    },

    groups: {
      async list(projectId) {
        await latency();
        return clone(state.groups[projectId] ?? { groups: [], assignments: {} });
      },
      async create(projectId, label) {
        await latency("write");
        const groups = state.groups[projectId] ?? { groups: [], assignments: {} };
        const group = { id: newId("g"), label: label.trim() };
        groups.groups.push(group);
        state.groups[projectId] = groups;
        emit(projectId, { type: "groups.changed" });
        save();
        return group;
      },
      async rename(projectId, groupId, label) {
        await latency("write");
        const group = state.groups[projectId]?.groups.find((entry) => entry.id === groupId);
        if (group) group.label = label.trim();
        emit(projectId, { type: "groups.changed" });
        save();
      },
      async remove(projectId, groupId) {
        await latency("write");
        const groups = state.groups[projectId];
        if (!groups) return;
        groups.groups = groups.groups.filter((entry) => entry.id !== groupId);
        for (const [chatId, assigned] of Object.entries(groups.assignments)) {
          if (assigned !== groupId) continue;
          delete groups.assignments[chatId];
          const chat = state.chats.find((entry) => entry.id === chatId);
          if (chat) touchChat(chat, { groupId: null });
        }
        emit(projectId, { type: "groups.changed" });
        save();
      },
      async reorder(projectId, groupIds) {
        await latency("write");
        const groups = state.groups[projectId];
        if (!groups) return;
        groups.groups = groupIds.flatMap((id) => groups.groups.filter((entry) => entry.id === id));
        emit(projectId, { type: "groups.changed" });
        save();
      },
      async assign(projectId, chatId, groupId) {
        await latency("write");
        const groups = state.groups[projectId] ?? { groups: [], assignments: {} };
        if (groupId) groups.assignments[chatId] = groupId;
        else delete groups.assignments[chatId];
        state.groups[projectId] = groups;
        touchChat(chatEntry(chatId), { groupId });
        emit(projectId, { type: "groups.changed" });
      },
    },

    interactions: {
      async permissions(projectId, chatId) {
        await latency();
        return clone(state.permissions.filter((entry) => entry.chatId === chatId));
      },
      async replyPermission(projectId, chatId, requestId, replyValue) {
        await latency("write");
        const waiter = permissionWaiters.get(requestId);
        if (waiter) {
          waiter.resolve(replyValue);
          return;
        }
        // A request that survived a reload: settle it the way the engine would.
        const request = state.permissions.find((entry) => entry.id === requestId);
        if (!request) return;
        state.permissions = state.permissions.filter((entry) => entry.id !== requestId);
        emit(projectId, { type: "permission.resolved", chatId, requestId });
        const chat = chatEntry(chatId);
        const message = messagesOf(chatId).at(-1);
        const tool = message?.parts.find((part): part is ToolPart => part.type === "tool" && part.status === "running");
        if (message && tool) {
          const allowed = replyValue !== "reject";
          Object.assign(tool, allowed ? { status: "completed", output: "Bestand geschreven", endedAt: Date.now() } : { status: "error", error: "Geweigerd", endedAt: Date.now() });
          emit(projectId, { type: "part.upserted", chatId, messageId: message.id, part: clone(tool) });
          setStatus(chat, "running");
          const controller = new AbortController();
          running.set(chatId, controller);
          try {
            await streamText(chat, message, allowed ? "Opgeslagen als **prijslijst-2027.md**. De grootste stijging zit in het hostingpakket Plus (€ 39,00 → € 40,50). Zal ik klanten met een lopend contract op een rij zetten?" : "Begrepen, ik heb niets opgeslagen.", controller.signal);
          } catch {
            // Stopped by the person.
          } finally {
            running.delete(chatId);
          }
          message.completedAt = Date.now();
          emit(projectId, { type: "message.upserted", message: clone(message) });
        }
        setStatus(chat, "idle");
        touchChat(chat);
      },
      async questions(projectId, chatId) {
        await latency();
        return clone(state.questions.filter((entry) => entry.chatId === chatId));
      },
      async replyQuestion(projectId, chatId, requestId, answers) {
        await latency("write");
        const waiter = questionWaiters.get(requestId);
        if (waiter) {
          waiter.resolve(answers);
          return;
        }
        const request = state.questions.find((entry) => entry.id === requestId);
        if (!request) return;
        state.questions = state.questions.filter((entry) => entry.id !== requestId);
        emit(projectId, { type: "question.resolved", chatId, requestId });
        const chat = chatEntry(chatId);
        const message = messagesOf(chatId).at(-1);
        if (message) {
          setStatus(chat, "running");
          const choice = answers[0]?.join(", ") ?? "";
          const controller = new AbortController();
          running.set(chatId, controller);
          try {
            await streamText(chat, message, `Duidelijk: **${choice.toLowerCase()}**. Hier is het antwoord:\n\n---\n\nBeste mevrouw Jansen,\n\nWat vervelend dat je bestelling vijf dagen te laat kwam en de verpakking beschadigd was. Dat had niet mogen gebeuren. De vertraging kwam door een vervangende vervoerder; we hebben hem daarop aangesproken.\n\nAls goedmaker bieden we je ${choice.toLowerCase()} aan. Je hoeft daar niets voor te doen.\n\nZijn de producten zelf ook beschadigd? Stuur dan een foto, dan sturen we direct nieuwe.\n\nHartelijke groet,\n\nTeam klantenservice\n\n---`, controller.signal);
          } catch {
            // Stopped by the person.
          } finally {
            running.delete(chatId);
          }
          message.completedAt = Date.now();
          emit(projectId, { type: "message.upserted", message: clone(message) });
        }
        setStatus(chat, "idle");
        touchChat(chat);
      },
      async rejectQuestion(projectId, chatId, requestId) {
        await latency("write");
        const waiter = questionWaiters.get(requestId);
        if (waiter) {
          waiter.resolve(null);
          return;
        }
        state.questions = state.questions.filter((entry) => entry.id !== requestId);
        emit(projectId, { type: "question.resolved", chatId, requestId });
        const chat = chatEntry(chatId);
        const message = messagesOf(chatId).at(-1);
        if (message) {
          message.completedAt = Date.now();
          emit(projectId, { type: "message.upserted", message: clone(message) });
        }
        setStatus(chat, "idle");
        touchChat(chat);
      },
    },

    subscribe(projectId, listener) {
      const set = listeners.get(projectId) ?? new Set();
      set.add(listener);
      listeners.set(projectId, set);
      queueMicrotask(() => listener({ type: "connection", state: "open" }));
      return () => {
        set.delete(listener);
      };
    },

    composer: {
      async agents() {
        return [
          { id: "build", name: "Uitvoeren", description: "Werkt direct in je bestanden" },
          { id: "plan", name: "Plannen", description: "Denkt mee en maakt een plan, zonder iets te wijzigen" },
        ];
      },
      async entries(projectId) {
        await latency();
        const commands = [...(state.commands[projectId] ?? []), ...(state.commands.global ?? [])];
        const skills = [...(state.skills[projectId] ?? []), ...(state.skills.global ?? [])];
        return [
          ...commands.map((command) => ({ name: command.name, description: command.description, kind: "command" as const })),
          ...skills.map((skill) => ({ name: skill.skill.name, description: skill.skill.description, kind: "skill" as const })),
        ];
      },
      async upload(projectId, file) {
        await latency("write");
        return { path: `inbox/${file.name}` };
      },
    },

    config: {
      async instructions(projectId) {
        await latency();
        return state.instructions[projectId] ?? null;
      },
      async setInstructions(projectId, content) {
        await latency("write");
        state.instructions[projectId] = content;
        const files = (state.files[projectId] ?? []).filter((entry) => entry.path !== "AGENTS.md");
        state.files[projectId] = [{ path: "AGENTS.md", bytes: content.length, updatedAt: Date.now() }, ...files];
        audit(projectId, "instructions.update", "Instructies bijgewerkt");
        save();
      },
      async skills(projectId, scope) {
        await latency();
        return clone((state.skills[scope === "global" ? "global" : projectId] ?? []).map((entry) => entry.skill));
      },
      async skill(projectId, name) {
        await latency();
        const found = [...(state.skills[projectId] ?? []), ...(state.skills.global ?? [])].find((entry) => entry.skill.name === name);
        if (!found) throw new BackendError("not_found", "Deze skill bestaat niet meer.", 404);
        return clone(found);
      },
      async saveSkill(projectId, input) {
        await latency("write");
        const scope = projectId === "global" ? "global" : "project";
        const list = (state.skills[projectId] ?? []).filter((entry) => entry.skill.name !== input.name);
        list.push({ skill: { name: input.name, description: input.description, scope, error: null }, content: input.content });
        state.skills[projectId] = list.sort((a, b) => a.skill.name.localeCompare(b.skill.name));
        if (projectId !== "global") audit(projectId, "skills.update", `Skill ${input.name} opgeslagen`);
        save();
      },
      async removeSkill(projectId, name) {
        await latency("write");
        state.skills[projectId] = (state.skills[projectId] ?? []).filter((entry) => entry.skill.name !== name);
        if (projectId !== "global") audit(projectId, "skills.remove", `Skill ${name} verwijderd`);
        save();
      },
      async commands(projectId, scope) {
        await latency();
        return clone(state.commands[scope === "global" ? "global" : projectId] ?? []);
      },
      async saveCommand(projectId, input) {
        await latency("write");
        const bucket = input.scope === "global" ? "global" : projectId;
        const list = (state.commands[bucket] ?? []).filter((entry) => entry.name !== input.name);
        list.push({ ...input });
        state.commands[bucket] = list.sort((a, b) => a.name.localeCompare(b.name));
        if (bucket !== "global") audit(projectId, "commands.update", `Commando /${input.name} opgeslagen`);
        save();
      },
      async removeCommand(projectId, name) {
        await latency("write");
        state.commands[projectId] = (state.commands[projectId] ?? []).filter((entry) => entry.name !== name);
        if (projectId !== "global") audit(projectId, "commands.remove", `Commando /${name} verwijderd`);
        save();
      },
      async connections(projectId) {
        await latency();
        return clone(state.connections[projectId] ?? []);
      },
      async addConnection(projectId, input) {
        await wait(600);
        const list = state.connections[projectId] ?? [];
        if (list.some((entry) => entry.name === input.name)) throw new BackendError("conflict", `Er is al een connectie met de naam ${input.name}.`, 409);
        list.push({
          name: input.name,
          kind: input.kind,
          target: input.kind === "remote" ? input.url : input.command,
          enabled: true,
          status: input.kind === "remote" ? "needs_auth" : "connected",
          error: null,
          scope: "project",
        });
        state.connections[projectId] = list;
        audit(projectId, "mcp.add", `Connectie ${input.name} toegevoegd`);
        save();
      },
      async setConnectionEnabled(projectId, name, enabled) {
        await latency("write");
        const connection = (state.connections[projectId] ?? []).find((entry) => entry.name === name);
        if (connection) {
          connection.enabled = enabled;
          connection.status = enabled ? (connection.status === "disabled" ? "connected" : connection.status) : "disabled";
        }
        audit(projectId, "mcp.toggle", `Connectie ${name} ${enabled ? "aangezet" : "uitgezet"}`);
        save();
      },
      async removeConnection(projectId, name) {
        await latency("write");
        state.connections[projectId] = (state.connections[projectId] ?? []).filter((entry) => entry.name !== name);
        audit(projectId, "mcp.remove", `Connectie ${name} verwijderd`);
        save();
      },
      async signOutConnection(projectId, name) {
        await latency("write");
        const connection = (state.connections[projectId] ?? []).find((entry) => entry.name === name);
        if (connection && connection.kind === "remote") connection.status = "needs_auth";
        save();
      },
      async runMode(projectId) {
        await latency();
        return { mode: state.runModes[projectId] ?? "default", supported: true, reason: null };
      },
      async setRunMode(projectId, mode) {
        await latency("write");
        state.runModes[projectId] = mode;
        audit(projectId, "permissions.mode", "Werkwijze van de agent gewijzigd");
        save();
        return { mode, supported: true, reason: null };
      },
      async folders(projectId) {
        await latency();
        return clone(state.folders[projectId] ?? []);
      },
      async setFolders(projectId, folders) {
        await latency("write");
        state.folders[projectId] = [...new Set(folders.map((folder) => folder.trim()).filter(Boolean))];
        audit(projectId, "permissions.folders", "Extra mappen gewijzigd");
        save();
        return clone(state.folders[projectId] ?? []);
      },
      async files(projectId) {
        await latency();
        return clone([...(state.files[projectId] ?? [])].sort((a, b) => a.path.localeCompare(b.path)));
      },
      async readFile(projectId, path) {
        await latency();
        const file = (state.files[projectId] ?? []).find((entry) => entry.path === path);
        const name = path.split("/").at(-1) ?? path;
        const binary = /\.(pdf|xlsx|png|jpe?g|zip)$/i.test(name);
        const content = path === "AGENTS.md" ? state.instructions[projectId] ?? "" : demoFileContent(name);
        return { path, content: binary ? null : content, bytes: file?.bytes ?? content.length, updatedAt: file?.updatedAt ?? null };
      },
      async audit(projectId) {
        await latency();
        return clone(state.audit[projectId] ?? []);
      },
    },

    routines: {
      async list(projectId) {
        await latency();
        return clone(state.routines.filter((routine) => projectId === null || routine.projectId === projectId));
      },
      async create(input) {
        await latency("write");
        projectEntry(input.projectId);
        const now = Date.now();
        const routine: Routine = { id: newId("r"), ...input, state: "active", needsAttentionReason: null, nextRunAt: null, lastRun: null, createdAt: now, updatedAt: now };
        refreshNextRun(routine);
        state.routines.push(routine);
        state.runs[routine.id] = [];
        audit(input.projectId, "routine.create", `Routine ${input.name} gemaakt`);
        save();
        return clone(routine);
      },
      async update(routineId, patch) {
        await latency("write");
        const routine = state.routines.find((entry) => entry.id === routineId);
        if (!routine) throw new BackendError("not_found", "Deze routine bestaat niet meer.", 404);
        Object.assign(routine, patch, { updatedAt: Date.now() });
        if (routine.state === "needs_attention" && (patch.model !== undefined || patch.schedule !== undefined)) {
          routine.state = "active";
          routine.needsAttentionReason = null;
        }
        refreshNextRun(routine);
        save();
        return clone(routine);
      },
      async remove(routineId) {
        await latency("write");
        state.routines = state.routines.filter((entry) => entry.id !== routineId);
        delete state.runs[routineId];
        save();
      },
      async run(routineId) {
        await latency("write");
        const routine = state.routines.find((entry) => entry.id === routineId);
        if (!routine) throw new BackendError("not_found", "Deze routine bestaat niet meer.", 404);
        return runRoutine(routine, "manual");
      },
      async runs(routineId) {
        await latency();
        return clone(state.runs[routineId] ?? []);
      },
    },

    brains: createDemoBrains({
      now: Date.now(),
      home: state.defaultFolder,
      storageKey,
      search: typeof window === "undefined" ? "" : window.location.search,
      projectPath: (projectId) => state.projects.find((entry) => entry.id === projectId)?.path ?? null,
    }),

    settings: {
      async env() {
        await latency();
        return Object.keys(state.env).sort().map((key) => ({ key, hasValue: Boolean(state.env[key]) }));
      },
      async setEnv(key, value) {
        await latency("write");
        state.env[key.trim()] = value;
        save();
      },
      async removeEnv(key) {
        await latency("write");
        delete state.env[key];
        save();
      },
      async versions() {
        await latency();
        return { app: __APP_VERSION__, server: null, engine: null };
      },
    },

    desktop: {
      async pickFolder() {
        return null;
      },
      async revealPath() {
        // No file system in the browser.
      },
    },
  };

  return backend;
}

