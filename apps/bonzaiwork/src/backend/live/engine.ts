import {
  BackendError,
  type ChatError,
  type ChatStatus,
  type Message,
  type MessagePart,
  type PermissionReply,
  type PermissionRequest,
  type ProjectEvent,
  type QuestionField,
  type QuestionRequest,
  type ToolPart,
} from "../types";

import { enc, headers, request, type Connection } from "./http";
import { decodePrompt } from "./prompt";
import { data, field, items, list, num, rec, str, strings, type Json } from "./read";

/**
 * A client for one workspace's OpenCode v2 engine, mounted by the OpenWork
 * server at `/workspace/<id>/opencode2` (never `/opencode`: that is v1, which
 * does not enforce the LiteLLM-only policy). Request shapes follow upstream's
 * apps/app/src/app/lib/opencode-v2-adapter.ts, pinned to opencodeV2Version
 * 2.0.26 (openwork constants.json).
 */

export const PROVIDER_ID = "litellm";

export type EngineTarget = { connection: Connection; workspaceId: string; directory: string };

export type NativeSession = {
  id: string;
  title: string;
  untitled: boolean;
  createdAt: number;
  updatedAt: number;
  parentId: string | null;
  model: string | null;
  revertMessageId: string | null;
};

function base(target: EngineTarget) {
  return `/workspace/${enc(target.workspaceId)}/opencode2`;
}

function call(target: EngineTarget, method: string, path: string, body?: unknown, timeoutMs?: number) {
  return request(target.connection, `${base(target)}${path}`, { method, body, timeoutMs });
}

// ---------------------------------------------------------------------------
// Reading native shapes
// ---------------------------------------------------------------------------

export function readSession(value: unknown): NativeSession | null {
  const inner = data(value);
  const source = rec(field(inner, "info")) ?? rec(inner);
  if (!source) return null;
  const id = str(source, "id") ?? str(source, "sessionID");
  if (!id) return null;
  const time = field(source, "time");
  const createdAt = num(time, "created") ?? num(source, "created") ?? 0;
  const updatedAt = num(time, "updated") ?? num(source, "updated") ?? createdAt;
  const rawTitle = str(source, "title") ?? "";
  const untitled = !rawTitle.trim() || /^New session - \d{4}-/.test(rawTitle);
  const model = field(source, "model");
  return {
    id,
    title: untitled ? "" : rawTitle,
    untitled,
    createdAt,
    updatedAt,
    parentId: str(source, "parentID") ?? null,
    model: str(model, "id") ?? str(model, "modelID") ?? null,
    revertMessageId: str(field(source, "revert"), "messageID") ?? null,
  };
}

function parseInput(value: unknown, tool: string): Record<string, unknown> {
  const direct = rec(value);
  if (direct) return tool === "subagent" && typeof direct.agent === "string" ? { subagent_type: direct.agent, ...direct } : direct;
  if (typeof value !== "string" || !value) return {};
  try {
    return parseInput(JSON.parse(value), tool);
  } catch {
    return {};
  }
}

function compatibleTool(tool: string): string {
  return tool === "shell" ? "bash" : tool === "subagent" ? "task" : tool;
}

function toolOutput(content: unknown, result: unknown): string | null {
  const text = list(content)
    .flatMap((entry) => (str(entry, "type") === "text" && typeof field(entry, "text") === "string" ? [String(field(entry, "text"))] : []))
    .join("\n");
  if (text) return text;
  if (typeof result === "string") return result;
  if (result === undefined || result === null) return null;
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

function errorText(value: unknown): string {
  if (typeof value === "string") return value;
  return str(value, "message") ?? str(field(value, "data"), "message") ?? str(value, "error") ?? "";
}

function childSession(metadata: unknown): string | null {
  return str(metadata, "sessionId")?.trim() || str(metadata, "sessionID")?.trim() || null;
}

function readToolPart(value: Json, messageCreated: number): ToolPart | null {
  const callID = str(value, "callID") ?? str(value, "id");
  const tool = str(value, "tool") ?? str(value, "name");
  const state = rec(value.state);
  if (!callID || !tool || !state) return null;
  const time = field(value, "time");
  const startedAt = num(time, "ran") ?? num(time, "created") ?? messageCreated;
  const endedAt = num(time, "completed") ?? null;
  const status = str(state, "status");
  const input = parseInput(state.input, tool);
  const base = { type: "tool" as const, id: callID, tool: compatibleTool(tool), input, childChatId: childSession(state.metadata) };
  if (status === "pending" || status === "streaming") return { ...base, status: "pending", output: null, error: null, startedAt: null, endedAt: null };
  if (status === "running") return { ...base, status: "running", output: null, error: null, startedAt, endedAt: null };
  if (status === "completed") return { ...base, status: "completed", output: toolOutput(state.content, state.result), error: null, startedAt, endedAt: endedAt ?? startedAt };
  if (status === "error") return { ...base, status: "error", output: null, error: errorText(state.error ?? state.result) || "Mislukt", startedAt, endedAt: endedAt ?? startedAt };
  return null;
}

/** Turns a provider failure into something the person can act on (DESIGN.md T2). */
export function readChatError(value: unknown): ChatError | null {
  const raw = rec(value);
  if (!raw) return null;
  if (str(raw, "type") === "aborted") return null;
  const inner = rec(raw.data) ?? raw;
  const status = num(inner, "statusCode") ?? num(raw, "statusCode") ?? num(inner, "status") ?? num(raw, "status");
  const message = `${errorText(raw)} ${str(inner, "responseBody") ?? ""} ${str(raw, "code") ?? ""}`.toLowerCase();
  const detail = errorText(raw) || null;
  if (message.includes("key_missing") || message.includes("no key")) return { kind: "key_missing", detail };
  if (message.includes("budget")) return { kind: "budget_exceeded", detail };
  if (status === 401 || status === 403 || message.includes("key_rejected") || message.includes("invalid api key") || message.includes("authentication")) return { kind: "key_rejected", detail };
  if (status === 429 || message.includes("rate limit")) return { kind: "rate_limited", detail };
  if (message.includes("model") && (status === 404 || status === 400 || message.includes("not found") || message.includes("invalid model"))) return { kind: "model_unavailable", detail };
  if (status === 502 || status === 503 || status === 504 || message.includes("litellm_unreachable") || message.includes("econnrefused") || message.includes("fetch failed")) return { kind: "litellm_unreachable", detail };
  return { kind: "unknown", detail };
}

/** Native history also holds bookkeeping entries (`idle`, steps); only user and assistant turns are messages. */
function readRole(value: Json): "user" | "assistant" | null {
  const raw = str(value, "role") ?? str(value, "type");
  if (raw === "user") return "user";
  if (raw === "assistant") return "assistant";
  return null;
}

export function textPartId(messageId: string, kind: "text" | "reasoning", ordinal: number) {
  return kind === "text" ? `${messageId}:${ordinal}` : `${messageId}:reasoning:${ordinal}`;
}

export function readMessage(value: unknown, chatId: string): Message | null {
  const source = rec(value);
  const role = source ? readRole(source) : null;
  if (!source || !role) return null;
  const id = str(source, "id") ?? str(source, "messageID");
  if (!id) return null;
  const time = field(source, "time");
  const createdAt = num(time, "created") ?? num(source, "timestamp") ?? 0;
  const parts: MessagePart[] = [];
  const ordinals = { text: 0, reasoning: 0 };
  const content = list(source, "content");
  if (content.length) {
    for (const entry of content) {
      const part = rec(entry);
      if (!part) continue;
      const kind = str(part, "type");
      if (kind === "text" || kind === "reasoning") {
        const ordinal = ordinals[kind]++;
        const text = str(part, "text");
        if (text === undefined) continue;
        if (kind === "text") parts.push({ type: "text", id: textPartId(id, "text", ordinal), text });
        else parts.push({ type: "reasoning", id: textPartId(id, "reasoning", ordinal), text, startedAt: num(field(part, "time"), "created") ?? createdAt, endedAt: num(field(part, "time"), "completed") ?? createdAt });
      } else if (kind === "tool") {
        const tool = readToolPart(part, createdAt);
        if (tool) parts.push(tool);
      }
    }
  } else {
    const text = str(source, "text");
    if (text !== undefined) parts.push({ type: "text", id: `${id}:0`, text });
  }

  if (role === "user") {
    const text = parts.map((part) => (part.type === "text" ? part.text : "")).join("");
    const decoded = decodePrompt(text);
    const userParts: MessagePart[] = [{ type: "text", id: `${id}:0`, text: decoded.words }];
    decoded.files.forEach((filename, index) => userParts.push({ type: "file", id: `${id}:file:${index}`, filename, mime: "application/octet-stream", url: null }));
    return { id, chatId, role, createdAt, completedAt: createdAt, parts: userParts, model: null, tokens: null, error: null };
  }

  const tokens = rec(source.tokens);
  const cache = rec(tokens?.cache);
  const model = field(source, "model");
  return {
    id,
    chatId,
    role: "assistant",
    createdAt,
    completedAt: num(time, "completed") ?? null,
    parts,
    model: str(source, "modelID") ?? str(model, "id") ?? str(model, "modelID") ?? null,
    tokens: tokens
      ? { input: num(tokens, "input") ?? 0, output: num(tokens, "output") ?? 0, reasoning: num(tokens, "reasoning") ?? 0, cacheRead: num(cache, "read") ?? 0, cacheWrite: num(cache, "write") ?? 0 }
      : null,
    error: readChatError(source.error),
  };
}

export function readPermission(value: unknown): PermissionRequest | null {
  const source = rec(value);
  if (!source) return null;
  const id = str(source, "id");
  const chatId = str(source, "sessionID") ?? str(source, "sessionId");
  const action = str(source, "action") ?? str(source, "permission");
  if (!id || !chatId || !action) return null;
  const resources = strings(source.resources ?? source.patterns);
  // "Always" saves the request's `save` patterns; without any there is nothing to remember.
  const save = source.save === undefined ? null : strings(source.save);
  return { id, chatId, action, resources, canAlways: save === null || save.length > 0, message: str(source, "message") ?? str(field(source, "metadata"), "message") ?? null };
}

type FormFields = { request: QuestionRequest; keys: { key: string; multiple: boolean; options: { value: string; label: string }[] }[] };

export function readForm(value: unknown): FormFields | null {
  const source = rec(value);
  if (!source || str(field(source, "metadata"), "kind") !== "question") return null;
  const id = str(source, "id");
  const chatId = str(source, "sessionID");
  if (!id || !chatId) return null;
  const fields: QuestionField[] = [];
  const keys: FormFields["keys"] = [];
  for (const entry of list(source, "fields")) {
    const key = str(entry, "key");
    const type = str(entry, "type");
    if (!key || (type !== "string" && type !== "multiselect")) return null;
    const options = list(entry, "options").flatMap((option) => {
      const label = str(option, "label");
      const optionValue = str(option, "value");
      return label !== undefined && optionValue !== undefined ? [{ value: optionValue, label, description: str(option, "description") ?? "" }] : [];
    });
    fields.push({
      key,
      title: str(entry, "title") ?? "",
      description: str(entry, "description") ?? str(entry, "title") ?? "",
      multiple: type === "multiselect",
      custom: field(entry, "custom") !== false,
      options,
    });
    keys.push({ key, multiple: type === "multiselect", options });
  }
  if (!fields.length) return null;
  return { request: { id, chatId, fields }, keys };
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

const forms = new Map<string, FormFields>();

export const engine = {
  async listSessions(target: EngineTarget, cursor: string | null, limit = 60): Promise<{ sessions: NativeSession[]; next: string | null }> {
    const query = new URLSearchParams({ limit: String(limit) });
    if (cursor) query.set("cursor", cursor);
    const payload = await call(target, "GET", `/api/session?${query.toString()}`);
    const next = field(field(payload, "cursor"), "next");
    const page = items(payload);
    // v2 hands out a cursor with every non-empty page; a short page is the last.
    return { sessions: page.flatMap((item) => readSession(item) ?? []), next: typeof next === "string" && next && page.length >= limit ? next : null };
  },

  async getSession(target: EngineTarget, sessionId: string): Promise<NativeSession> {
    const session = readSession(await call(target, "GET", `/api/session/${enc(sessionId)}`));
    if (!session) throw new BackendError("invalid_response", "De engine gaf een onleesbare chat terug.");
    return session;
  },

  async createSession(target: EngineTarget, model: string, title?: string): Promise<NativeSession> {
    const session = readSession(await call(target, "POST", "/api/session", { model: { providerID: PROVIDER_ID, id: model }, ...(title ? { title } : {}), location: { directory: target.directory } }));
    if (!session) throw new BackendError("invalid_response", "De engine gaf een onleesbare chat terug.");
    return session;
  },

  async renameSession(target: EngineTarget, sessionId: string, title: string) {
    return readSession(await call(target, "PATCH", `/api/session/${enc(sessionId)}`, { title }));
  },

  deleteSession: (target: EngineTarget, sessionId: string) => call(target, "DELETE", `/api/session/${enc(sessionId)}`),

  async activeSessions(target: EngineTarget): Promise<Set<string>> {
    const payload = data(await call(target, "GET", "/api/session/active"));
    const active = new Set<string>();
    for (const [id, state] of Object.entries(rec(payload) ?? {})) if (str(state, "type") === "running") active.add(id);
    return active;
  },

  async messages(target: EngineTarget, sessionId: string): Promise<Message[]> {
    const collected: Message[] = [];
    let cursor: string | null = null;
    const seen = new Set<string>();
    for (let page = 0; page < 20; page += 1) {
      const query = new URLSearchParams({ limit: "200" });
      if (cursor) query.set("cursor", cursor);
      const payload = await call(target, "GET", `/api/session/${enc(sessionId)}/message?${query.toString()}`);
      const hasCursor = rec(payload) !== null && "cursor" in (rec(payload) ?? {});
      const batch = items(payload).flatMap((item) => readMessage(item, sessionId) ?? []);
      // Cursor pages come newest first; a cursor-less answer is chronological.
      collected.push(...(hasCursor ? batch.reverse() : batch));
      const next = field(field(payload, "cursor"), "next");
      if (typeof next !== "string" || !next || seen.has(next) || batch.length === 0 || items(payload).length < 200) break;
      seen.add(next);
      cursor = next;
    }
    return collected.sort((a, b) => a.createdAt - b.createdAt);
  },

  setModel: (target: EngineTarget, sessionId: string, model: string) => call(target, "POST", `/api/session/${enc(sessionId)}/model`, { model: { providerID: PROVIDER_ID, id: model } }),
  setAgent: (target: EngineTarget, sessionId: string, agent: string) => call(target, "POST", `/api/session/${enc(sessionId)}/agent`, { agent }),

  async prompt(target: EngineTarget, sessionId: string, text: string, skills: string[]) {
    if (skills.length) {
      // Attached skills skip the skill tool's own check; ask the engine (and its
      // policy hooks) first, as upstream does.
      const check = await call(target, "POST", `/api/session/${enc(sessionId)}/permission`, { action: "skill", resources: skills, save: skills });
      const effect = str(data(check), "effect");
      if (effect === "ask") throw new BackendError("skill_permission", "Deze skill vraagt eerst toestemming. Er is niets verstuurd; sta de skill toe en verstuur opnieuw.");
      if (effect !== "allow") throw new BackendError("skill_denied", "Deze skill is in dit project niet toegestaan. Er is niets verstuurd.");
    }
    return call(target, "POST", `/api/session/${enc(sessionId)}/prompt`, { text, delivery: "steer", ...(skills.length ? { skills: skills.map((id) => ({ id })) } : {}) });
  },

  command: (target: EngineTarget, sessionId: string, name: string, text: string) => call(target, "POST", `/api/session/${enc(sessionId)}/command`, { name, text }),
  interrupt: (target: EngineTarget, sessionId: string) => call(target, "POST", `/api/session/${enc(sessionId)}/interrupt`, {}),

  async fork(target: EngineTarget, sessionId: string, before: string | null): Promise<NativeSession> {
    const session = readSession(await call(target, "POST", `/api/session/${enc(sessionId)}/fork`, before ? { before } : {}));
    if (!session) throw new BackendError("invalid_response", "De engine gaf een onleesbare chat terug.");
    return session;
  },

  revert: (target: EngineTarget, sessionId: string, messageId: string) => call(target, "POST", `/api/session/${enc(sessionId)}/revert/stage`, { messageID: messageId, files: true }),
  unrevert: (target: EngineTarget, sessionId: string) => call(target, "DELETE", `/api/session/${enc(sessionId)}/revert`),

  async permissions(target: EngineTarget, sessionId: string): Promise<PermissionRequest[]> {
    return items(await call(target, "GET", `/api/session/${enc(sessionId)}/permission`)).flatMap((item) => readPermission(item) ?? []);
  },

  replyPermission: (target: EngineTarget, sessionId: string, requestId: string, reply: PermissionReply) =>
    // v2 2.0.26 reads `decision`; earlier builds read `reply`.
    call(target, "POST", `/api/session/${enc(sessionId)}/permission/${enc(requestId)}/reply`, { decision: reply, reply }),

  async questions(target: EngineTarget, sessionId: string): Promise<QuestionRequest[]> {
    return items(await call(target, "GET", `/api/session/${enc(sessionId)}/form`)).flatMap((item) => {
      const form = readForm(item);
      if (!form || form.request.chatId !== sessionId) return [];
      forms.set(form.request.id, form);
      return [form.request];
    });
  },

  async replyQuestion(target: EngineTarget, sessionId: string, requestId: string, answers: string[][] | null) {
    let form = forms.get(requestId);
    if (!form) {
      form = readForm(data(await call(target, "GET", `/api/session/${enc(sessionId)}/form/${enc(requestId)}`))) ?? undefined;
      if (!form) throw new BackendError("not_found", "Deze vraag is al beantwoord.", 404);
    }
    if (!answers) {
      await call(target, "DELETE", `/api/session/${enc(sessionId)}/form/${enc(requestId)}`);
    } else {
      const answer = Object.fromEntries(
        form.keys.map((entry, index) => {
          const values = (answers[index] ?? []).map((label) => entry.options.find((option) => option.label === label)?.value ?? label);
          return [entry.key, entry.multiple ? values : values[0] ?? ""];
        }),
      );
      await call(target, "POST", `/api/session/${enc(sessionId)}/form/${enc(requestId)}/reply`, { answer });
    }
    forms.delete(requestId);
  },

  async agents(target: EngineTarget) {
    return items(await call(target, "GET", "/api/agent")).flatMap((item) => {
      const id = str(item, "id");
      const mode = str(item, "mode");
      if (!id || field(item, "hidden") === true || (mode !== "primary" && mode !== "all")) return [];
      return [{ id, description: str(item, "description") ?? null }];
    });
  },

  async commands(target: EngineTarget) {
    // A folder the engine has not opened yet answers an empty list at first.
    let commands = items(await call(target, "GET", "/api/command"));
    for (const delay of [250, 750]) {
      if (commands.length) break;
      await new Promise((resolve) => setTimeout(resolve, delay));
      commands = items(await call(target, "GET", "/api/command"));
    }
    const skills = items(await call(target, "GET", "/api/skill").catch(() => []));
    return {
      commands: commands.flatMap((item) => (str(item, "name") ? [{ name: str(item, "name") ?? "", description: str(item, "description") ?? null }] : [])),
      skills: skills.flatMap((item) => {
        const id = str(item, "id");
        return id && !id.startsWith("openwork-cloud-") ? [{ name: id, description: str(item, "description") ?? null }] : [];
      }),
    };
  },

  async mcpStatus(target: EngineTarget): Promise<Map<string, { status: string; error: string | null }>> {
    const statuses = new Map<string, { status: string; error: string | null }>();
    for (const entry of items(await call(target, "GET", "/api/mcp").catch(() => []))) {
      const name = str(entry, "name");
      const status = str(field(entry, "status"), "status");
      if (name && status) statuses.set(name, { status, error: str(field(entry, "status"), "error") ?? null });
    }
    return statuses;
  },

  async info(target: EngineTarget): Promise<string | null> {
    return str(data(await call(target, "GET", "/api/info", undefined, 5_000)), "version") ?? null;
  },
};

// ---------------------------------------------------------------------------
// Live events
// ---------------------------------------------------------------------------

export type Translation = { events: ProjectEvent[]; refresh: string[] };

type TranslatorState = {
  streams: Map<string, string>;
  ordinals: Map<string, number>;
  tools: Map<string, ToolPart>;
  /** The message a tool call belongs to; later tool events may omit it. */
  toolOwners: Map<string, string>;
  retired: Set<string>;
};

function normalizeDirectory(path: string | undefined): string {
  return (path ?? "").replace(/[\\/]+$/, "");
}

function assistantShell(chatId: string, messageId: string, at: number, model: string | null): Message {
  return { id: messageId, chatId, role: "assistant", createdAt: at, completedAt: null, parts: [], model, tokens: null, error: null };
}

/**
 * Native v2 events to BonzaiWork events. Streaming text and tool steps are
 * applied as they come; when a run ends the chat's history is re-read, which
 * is the source of truth (the event stream is live-only, without replay).
 */
export function createTranslator(directory: string) {
  const state: TranslatorState = { streams: new Map(), ordinals: new Map(), tools: new Map(), toolOwners: new Map(), retired: new Set() };
  const home = normalizeDirectory(directory);

  return function translate(raw: unknown): Translation {
    const value = rec(raw);
    const none: Translation = { events: [], refresh: [] };
    if (!value) return none;
    const type = str(value, "type");
    if (!type) return none;
    const location = normalizeDirectory(str(field(value, "location"), "directory"));
    if (location && location !== home) return none;
    const props = rec(value.data) ?? rec(value.properties) ?? value;
    const chatId = str(props, "sessionID") ?? str(props, "sessionId") ?? "";
    const messageId = str(props, "assistantMessageID") ?? str(props, "messageID") ?? str(props, "messageId") ?? "";
    const at = num(props, "timestamp") ?? num(value, "created") ?? Date.now();
    const model = str(field(props, "model"), "id") ?? str(props, "modelID") ?? null;
    const status = (next: ChatStatus): ProjectEvent => ({ type: "chat.status", chatId, status: next });
    const t = type.replace(/^session\.next\./, "session.");

    if (t === "session.execution.started") {
      state.retired.delete(chatId);
      return { events: chatId ? [status("running")] : [], refresh: [] };
    }
    if (t === "session.execution.succeeded" || t === "session.execution.interrupted" || t === "session.execution.failed") {
      if (!chatId) return none;
      state.retired.add(chatId);
      for (const key of [...state.tools.keys()]) {
        if (!key.startsWith(`${chatId}|`)) continue;
        state.tools.delete(key);
        state.toolOwners.delete(key);
      }
      return { events: [status(t === "session.execution.failed" ? "failed" : "idle"), { type: "history.changed", chatId }], refresh: [chatId] };
    }
    if (t === "session.status") {
      const kind = str(field(props, "status"), "type");
      if (!chatId || !kind) return none;
      return { events: [status(kind === "idle" ? "idle" : "running")], refresh: [] };
    }
    if (t === "session.idle") {
      return chatId ? { events: [status("idle"), { type: "history.changed", chatId }], refresh: [chatId] } : none;
    }
    if (t === "session.created" || t === "session.renamed" || t === "session.forked" || t === "session.moved" || t === "session.metadata.updated") {
      return chatId ? { events: [], refresh: [chatId] } : none;
    }
    if (t.startsWith("session.revert.")) {
      return chatId ? { events: [{ type: "history.changed", chatId }], refresh: [chatId] } : none;
    }
    if (t === "session.deleted") {
      return chatId ? { events: [{ type: "chat.deleted", chatId }], refresh: [] } : none;
    }

    if (t === "permission.asked" || t === "permission.v2.asked") {
      const permission = readPermission(props);
      return permission ? { events: [{ type: "permission.asked", request: permission }, { type: "chat.status", chatId: permission.chatId, status: "waiting" }], refresh: [] } : none;
    }
    if (t === "permission.replied" || t === "permission.v2.replied") {
      const requestId = str(props, "requestID");
      return chatId && requestId ? { events: [{ type: "permission.resolved", chatId, requestId }, status("running")], refresh: [] } : none;
    }
    if (t === "form.created") {
      const form = readForm(props.form);
      if (!form) return none;
      forms.set(form.request.id, form);
      return { events: [{ type: "question.asked", request: form.request }, { type: "chat.status", chatId: form.request.chatId, status: "waiting" }], refresh: [] };
    }
    if (t === "form.replied" || t === "form.cancelled") {
      const requestId = str(props, "id");
      return chatId && requestId ? { events: [{ type: "question.resolved", chatId, requestId }, status("running")], refresh: [] } : none;
    }

    // Streaming parts. Ignore stragglers for a run that already ended.
    if (!chatId || state.retired.has(chatId)) return none;
    const kind = t.startsWith("session.reasoning.") ? "reasoning" : t.startsWith("session.text.") ? "text" : null;
    if (kind) {
      if (!messageId) return none;
      const explicit = str(props, `${kind}ID`) ?? str(props, `${kind}Id`);
      const counter = `${messageId}|${kind}`;
      const ordinalProp = num(props, "ordinal");
      const key = explicit ? `${chatId}|${kind}|${explicit}` : `${chatId}|${kind}|${messageId}|${ordinalProp ?? state.ordinals.get(counter) ?? 0}`;
      if (t.endsWith(".started")) {
        const ordinal = ordinalProp ?? state.ordinals.get(counter) ?? 0;
        state.ordinals.set(counter, Math.max(state.ordinals.get(counter) ?? 0, ordinal + 1));
        const partId = textPartId(messageId, kind, ordinal);
        state.streams.set(explicit ? key : `${chatId}|${kind}|${messageId}|${ordinal}`, partId);
        state.streams.set(`${chatId}|${kind}|latest`, partId);
        const part: MessagePart = kind === "text" ? { type: "text", id: partId, text: "" } : { type: "reasoning", id: partId, text: "", startedAt: at, endedAt: null };
        return { events: [{ type: "message.upserted", message: assistantShell(chatId, messageId, at, model) }, { type: "part.upserted", chatId, messageId, part }], refresh: [] };
      }
      const partId = state.streams.get(key) ?? state.streams.get(`${chatId}|${kind}|latest`) ?? textPartId(messageId, kind, ordinalProp ?? 0);
      if (t.endsWith(".delta")) {
        const delta = str(props, "delta");
        return delta === undefined ? none : { events: [{ type: "part.delta", chatId, messageId, partId, delta }], refresh: [] };
      }
      if (t.endsWith(".ended")) {
        const text = str(props, "text");
        if (text === undefined) return none;
        const part: MessagePart = kind === "text" ? { type: "text", id: partId, text } : { type: "reasoning", id: partId, text, startedAt: at, endedAt: at };
        return { events: [{ type: "part.upserted", chatId, messageId, part }], refresh: [] };
      }
      return none;
    }

    if (t.startsWith("session.tool.")) {
      const callId = str(props, "callID") ?? str(props, "id");
      if (!callId) return none;
      const toolKey = `${chatId}|${callId}`;
      const previous = state.tools.get(toolKey);
      const name = str(props, "name") ?? str(props, "tool");
      const sourceTool = name ?? previous?.tool ?? "tool";
      if (messageId) state.toolOwners.set(toolKey, messageId);
      const owner = messageId || state.toolOwners.get(toolKey) || "";
      let next: ToolPart | null = null;
      const events: ProjectEvent[] = [];
      if (t === "session.tool.input.started") {
        next = { type: "tool", id: callId, tool: compatibleTool(sourceTool), status: "pending", input: {}, output: null, error: null, startedAt: null, endedAt: null, childChatId: null };
        if (owner) events.push({ type: "message.upserted", message: assistantShell(chatId, owner, at, model) });
      } else if (t === "session.tool.input.ended" && previous) {
        next = { ...previous, input: parseInput(str(props, "text"), sourceTool) };
      } else if (t === "session.tool.called" && previous) {
        next = { ...previous, status: "running", input: parseInput(props.input, sourceTool), startedAt: previous.startedAt ?? at };
      } else if (t === "session.tool.progress" && previous) {
        next = { ...previous, status: "running", startedAt: previous.startedAt ?? at, childChatId: childSession(props.metadata ?? props.structured) ?? previous.childChatId };
      } else if (t === "session.tool.success" && previous) {
        next = { ...previous, status: "completed", output: toolOutput(props.content, props.result), endedAt: at, childChatId: childSession(props.metadata ?? props.structured) ?? previous.childChatId };
      } else if (t === "session.tool.failed" && previous) {
        next = { ...previous, status: "error", error: errorText(props.error ?? props.result) || "Mislukt", endedAt: at };
      }
      if (!next) return none;
      state.tools.set(toolKey, next);
      if (!owner) return none;
      events.push({ type: "part.upserted", chatId, messageId: owner, part: next });
      return { events, refresh: [] };
    }

    return none;
  };
}

/**
 * Follows `/api/event` (SSE) with the bearer token, reconnecting with backoff.
 * Every (re)open is reported so the store can catch up from history.
 */
export function followEvents(target: EngineTarget, onEvent: (raw: unknown) => void, onState: (state: "open" | "reconnecting") => void): () => void {
  let stopped = false;
  let controller: AbortController | null = null;
  let attempt = 0;

  const run = async () => {
    while (!stopped) {
      controller = new AbortController();
      try {
        const response = await fetch(`${target.connection.baseUrl.replace(/\/+$/, "")}${base(target)}/api/event`, {
          headers: (() => {
            const result = headers(target.connection);
            result.set("Accept", "text/event-stream");
            return result;
          })(),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error(`event stream ${response.status}`);
        attempt = 0;
        onState("open");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!stopped) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const text = line.slice(5).trim();
            if (!text) continue;
            try {
              let parsed: unknown = JSON.parse(text);
              if (typeof parsed === "string") parsed = JSON.parse(parsed);
              onEvent(parsed);
            } catch {
              // A malformed frame is skipped, not fatal.
            }
          }
        }
      } catch {
        // Aborted or dropped: reconnect below unless stopped.
      }
      if (stopped) return;
      onState("reconnecting");
      attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, Math.min(15_000, 500 * 2 ** Math.min(attempt, 5))));
    }
  };
  void run();
  return () => {
    stopped = true;
    controller?.abort();
  };
}
