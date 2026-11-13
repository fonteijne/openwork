import { isDate } from "./notation.ts";
import {
  DEFAULT_SETTINGS, type AgentRound, type BrainKind, type ChatStart, type CleanupCandidate, type ConnectorState, type ConnectorStatus, type DayItem, type DayPlan, type DoneEntry, type Focus, type SentEntry, type Meeting,
  type PlanBlock, type ReplyTarget, type StartHere, type StartReason, type TodaySettings, type Todo, type TodayView, type UpcomingBucket, type UpcomingRow,
} from "./types.ts";

/**
 * Reads the shapes of Vandaag from JSON that is only known as `unknown`: the state file on the
 * server and the answers of the routes in the app. Pure; anything that does not fit is left out.
 */
type Json = Record<string, unknown>;
export const record = (value: unknown): Json | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null);
export const text = (value: unknown, key: string): string | null => {
  const found = record(value)?.[key];
  return typeof found === "string" ? found : null;
};
export const number = (value: unknown, key: string): number | null => {
  const found = record(value)?.[key];
  return typeof found === "number" && Number.isFinite(found) ? found : null;
};
export const flag = (value: unknown, key: string, fallback: boolean): boolean => {
  const found = record(value)?.[key];
  return typeof found === "boolean" ? found : fallback;
};

export function readSettings(value: unknown, current: TodaySettings = DEFAULT_SETTINGS): TodaySettings {
  const hour = (key: string, fallback: number, min: number, max: number) => {
    const found = number(value, key);
    return found !== null && Number.isInteger(found) && found >= min && found <= max ? found : fallback;
  };
  const line = (key: string, fallback: string, max: number) => {
    const found = text(value, key);
    return found === null ? fallback : found.replace(/[\r\n]+/g, " ").trim().slice(0, max);
  };
  const handle = record(value) && "handle" in (record(value) ?? {}) ? (text(value, "handle")?.trim().replace(/^@/, "").slice(0, 60) || null) : current.handle;
  const workStartHour = hour("workStartHour", current.workStartHour, 0, 22);
  const workEndHour = Math.max(workStartHour + 1, hour("workEndHour", current.workEndHour, 1, 24));
  return {
    enabled: flag(value, "enabled", current.enabled),
    calendar: flag(value, "calendar", current.calendar),
    mail: flag(value, "mail", current.mail),
    slack: flag(value, "slack", current.slack),
    model: line("model", current.model, 120) || DEFAULT_SETTINGS.model,
    handle,
    ms365Command: line("ms365Command", current.ms365Command, 500),
    slackCommand: line("slackCommand", current.slackCommand, 500),
    workStartHour, workEndHour,
  };
}

export function readMeeting(value: unknown): Meeting | null {
  const id = text(value, "id");
  const start = number(value, "start");
  const end = number(value, "end");
  if (!id || start === null || end === null) return null;
  return { id, title: text(value, "title") ?? "Afspraak", start, end, allDay: flag(value, "allDay", false), location: text(value, "location"), organizer: text(value, "organizer"), link: text(value, "link") };
}

export function readReply(value: unknown): ReplyTarget | null {
  const via = text(value, "via");
  if (via === "mail") {
    const messageId = text(value, "messageId");
    return messageId ? { via, messageId } : null;
  }
  if (via === "slack") {
    const channel = text(value, "channel");
    return channel ? { via, channel, threadTs: text(value, "threadTs") } : null;
  }
  return null;
}

export function readItem(value: unknown): DayItem | null {
  const key = text(value, "key");
  const at = number(value, "at") ?? Date.now();
  const kind = text(value, "kind");
  if (!key) return null;
  if (kind === "message") {
    const source = text(value, "source");
    if (source !== "mail" && source !== "slack") return null;
    return { kind, key, source, title: text(value, "title") ?? "", from: text(value, "from") ?? "", why: text(value, "why") ?? "", draft: text(value, "draft"), link: text(value, "link"), reply: readReply(record(value)?.reply), at };
  }
  if (kind === "meeting") {
    const meeting = readMeeting(record(value)?.meeting);
    return meeting ? { kind, key, meeting, prep: text(value, "prep"), at } : null;
  }
  if (kind === "commitment") {
    const source = text(value, "source");
    const due = text(value, "due");
    return {
      kind, key, source: source === "mail" || source === "slack" ? source : "notes", text: text(value, "text") ?? "", who: text(value, "who") === "theirs" ? "theirs" : "mine",
      person: text(value, "person"), due: due && isDate(due) ? due : null, brainId: text(value, "brainId"), link: text(value, "link"), at,
    };
  }
  return null;
}

export function readPlan(value: unknown): DayPlan | null {
  const date = text(value, "date");
  if (!date || !isDate(date)) return null;
  const list = (key: string): unknown[] => { const found = record(value)?.[key]; return Array.isArray(found) ? found : []; };
  return {
    date, approved: flag(value, "approved", false),
    top: list("top").filter((entry): entry is string => typeof entry === "string").slice(0, 3),
    blocks: list("blocks").flatMap((entry): PlanBlock[] => {
      const start = text(entry, "start");
      const end = text(entry, "end");
      const label = text(entry, "label");
      return start && end && label ? [{ start, end, label, todoId: text(entry, "todoId") }] : [];
    }).slice(0, 12),
  };
}


export function readFocus(value: unknown): Focus | null {
  const title = text(value, "title");
  return title ? { todoId: text(value, "todoId"), title, brainId: text(value, "brainId"), chatId: text(value, "chatId"), startedAt: number(value, "startedAt") ?? Date.now() } : null;
}

const brainKind = (value: unknown): BrainKind => (value === "personal" ? "personal" : "project");

export function readTodo(value: unknown): Todo | null {
  const id = text(value, "id");
  const brainId = text(value, "brainId");
  const body = text(value, "text");
  if (!id || !brainId || body === null) return null;
  const due = text(value, "due");
  return {
    id, brainId, text: body, brainName: text(value, "brainName") ?? "", brainKind: brainKind(record(value)?.brainKind), path: text(value, "path") ?? "", line: number(value, "line") ?? 0,
    done: flag(value, "done", false), owner: text(value, "owner"), due: due && isDate(due) ? due : null,
    dueKind: due ? (text(value, "dueKind") === "waiting" ? "waiting" : "deadline") : null, mine: flag(value, "mine", false),
  };
}

const REASONS: readonly StartReason[] = ["chosen", "overdue", "today", "waiting_due", "plan", "soon", "oldest"];
const BUCKETS: readonly UpcomingBucket[] = ["late", "today", "week", "later"];
const CONNECTOR_STATES: readonly ConnectorState[] = ["off", "ok", "not_configured", "error"];
const ROUND_STATES: readonly AgentRound["state"][] = ["active", "inactive", "needs_attention", "archived"];
const list = (value: unknown, key: string): unknown[] => { const found = record(value)?.[key]; return Array.isArray(found) ? found : []; };

function readStart(value: unknown): StartHere | null {
  const todo = readTodo(record(value)?.todo);
  if (!todo) return null;
  return { todo, reason: REASONS.find((entry) => entry === text(value, "reason")) ?? "oldest", why: text(value, "why"), firstStep: text(value, "firstStep"), skipsLeft: number(value, "skipsLeft") ?? 0 };
}

function readUpcoming(value: unknown): UpcomingRow | null {
  const key = text(value, "key");
  const date = text(value, "date");
  const bucket = BUCKETS.find((entry) => entry === text(value, "bucket"));
  if (!key || !date || !bucket) return null;
  if (text(value, "kind") === "meeting") {
    const meeting = readMeeting(record(value)?.meeting);
    return meeting ? { kind: "meeting", key, bucket, date, meeting } : null;
  }
  const todo = readTodo(record(value)?.todo);
  return todo ? { kind: "todo", key, bucket, date, todo } : null;
}

export function readConnector(value: unknown): ConnectorStatus {
  return { state: CONNECTOR_STATES.find((entry) => entry === text(value, "state")) ?? "off", detail: text(value, "detail"), checkedAt: number(value, "checkedAt") };
}

export function readConnectors(value: unknown): TodayView["connectors"] {
  return { calendar: readConnector(record(value)?.calendar), mail: readConnector(record(value)?.mail), slack: readConnector(record(value)?.slack) };
}

function readRound(value: unknown): AgentRound | null {
  const system = text(value, "system");
  if (!system) return null;
  return {
    system, name: text(value, "name") ?? system, state: ROUND_STATES.find((entry) => entry === text(value, "state")) ?? "inactive",
    nextRunAt: number(value, "nextRunAt"), lastRunAt: number(value, "lastRunAt"), lastStatus: text(value, "lastStatus"), model: text(value, "model"),
  };
}

function readCleanup(value: unknown): CleanupCandidate | null {
  const brainId = text(value, "brainId");
  return brainId ? { brainId, brainName: text(value, "brainName") ?? "", brainKind: brainKind(record(value)?.brainKind), lines: number(value, "lines") ?? 0 } : null;
}

const each = <T>(values: unknown[], read: (value: unknown) => T | null): T[] => values.flatMap((value) => { const found = read(value); return found === null ? [] : [found]; });

/** The answer of `GET /bonzaiwork/today`. */
export function readView(value: unknown): TodayView {
  const counts = record(value)?.counts;
  return {
    enabled: flag(value, "enabled", false), blocked: text(value, "blocked"),
    handles: list(value, "handles").filter((entry): entry is string => typeof entry === "string"),
    start: readStart(record(value)?.start),
    upcoming: each(list(value, "upcoming"), readUpcoming),
    items: each(list(value, "items"), readItem),
    plan: readPlan(record(value)?.plan), focus: readFocus(record(value)?.focus),
    cleanup: each(list(value, "cleanup"), readCleanup),
    counts: { mine: number(counts, "mine") ?? 0, backlog: number(counts, "backlog") ?? 0, inbox: number(counts, "inbox") ?? 0 },
    done: list(value, "done").flatMap((entry): DoneEntry[] => {
      const todoId = text(entry, "todoId");
      return todoId ? [{ todoId, text: text(entry, "text") ?? "", brainName: text(entry, "brainName") ?? "", at: number(entry, "at") ?? 0 }] : [];
    }),
    sent: list(value, "sent").flatMap((entry): SentEntry[] => {
      const key = text(entry, "key");
      const via = text(entry, "via");
      return key && (via === "mail" || via === "slack") ? [{ key, via, title: text(entry, "title") ?? "", to: text(entry, "to") ?? "", at: number(entry, "at") ?? 0 }] : [];
    }),
    close: record(value)?.close ? { open: each(list(record(value)?.close, "open"), readTodo), candidates: each(list(record(value)?.close, "candidates"), readTodo) } : null,
    connectors: readConnectors(record(value)?.connectors),
    rounds: each(list(value, "rounds"), readRound),
  };
}

export function readChatStart(value: unknown): ChatStart | null {
  const projectId = text(value, "projectId");
  const prompt = text(value, "prompt");
  return projectId && prompt ? { projectId, prompt, title: text(value, "title") ?? "", model: text(value, "model") } : null;
}
