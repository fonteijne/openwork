import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { isDate } from "./notation.ts";
import { DEFAULT_SETTINGS, type DayItem, type DayPlan, type Focus, type Meeting, type PlanBlock, type ReplyTarget, type TodaySettings } from "./types.ts";

/**
 * What Vandaag remembers on this laptop (`today.json` in the state folder): the settings, what the
 * agent found, and what the person did with it. To-dos are not here: they live in the brains.
 */
export type Step = { step: string | null; why: string | null; at: number };

export type TodayState = {
  settings: TodaySettings;
  items: DayItem[];
  /** Keys the person answered or waved away: they never come back. */
  dismissed: Record<string, number>;
  /** Keys hidden until a moment ("Later"). */
  later: Record<string, number>;
  skips: { date: string; ids: string[] };
  steps: Record<string, Step>;
  plan: DayPlan | null;
  focus: Focus | null;
};

type Json = Record<string, unknown>;
const record = (value: unknown): Json | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null);
const text = (value: unknown, key: string): string | null => {
  const found = record(value)?.[key];
  return typeof found === "string" ? found : null;
};
const number = (value: unknown, key: string): number | null => {
  const found = record(value)?.[key];
  return typeof found === "number" && Number.isFinite(found) ? found : null;
};
const flag = (value: unknown, key: string, fallback: boolean): boolean => {
  const found = record(value)?.[key];
  return typeof found === "boolean" ? found : fallback;
};

const KEEP_DISMISSED_MS = 45 * 24 * 60 * 60_000;
const MAX_ITEMS = 60;

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

function readMeeting(value: unknown): Meeting | null {
  const id = text(value, "id");
  const start = number(value, "start");
  const end = number(value, "end");
  if (!id || start === null || end === null) return null;
  return { id, title: text(value, "title") ?? "Afspraak", start, end, allDay: flag(value, "allDay", false), location: text(value, "location"), organizer: text(value, "organizer"), link: text(value, "link") };
}

function readReply(value: unknown): ReplyTarget | null {
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

function readItem(value: unknown): DayItem | null {
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

function readPlan(value: unknown): DayPlan | null {
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

const times = (value: unknown): Record<string, number> => Object.fromEntries(Object.entries(record(value) ?? {}).filter((entry): entry is [string, number] => typeof entry[1] === "number"));

export function emptyState(): TodayState {
  return { settings: { ...DEFAULT_SETTINGS }, items: [], dismissed: {}, later: {}, skips: { date: "", ids: [] }, steps: {}, plan: null, focus: null };
}

export function parseState(raw: string): TodayState {
  let stored: Json | null = null;
  try { stored = record(JSON.parse(raw)); } catch { stored = null; }
  if (!stored) return emptyState();
  const list = (key: string): unknown[] => { const found = stored?.[key]; return Array.isArray(found) ? found : []; };
  const focus = record(stored.focus);
  const skips = record(stored.skips);
  return {
    settings: readSettings(stored.settings),
    items: list("items").flatMap((entry) => { const item = readItem(entry); return item ? [item] : []; }),
    dismissed: times(stored.dismissed),
    later: times(stored.later),
    skips: { date: text(skips, "date") ?? "", ids: Array.isArray(skips?.ids) ? skips.ids.filter((entry): entry is string => typeof entry === "string") : [] },
    steps: Object.fromEntries(Object.entries(record(stored.steps) ?? {}).flatMap(([id, value]): Array<[string, Step]> => {
      const step = text(value, "step");
      const why = text(value, "why");
      return step || why ? [[id, { step, why, at: number(value, "at") ?? 0 }]] : [];
    })),
    plan: readPlan(stored.plan),
    focus: focus && text(focus, "title") ? { todoId: text(focus, "todoId"), title: text(focus, "title") ?? "", brainId: text(focus, "brainId"), chatId: text(focus, "chatId"), startedAt: number(focus, "startedAt") ?? Date.now() } : null,
  };
}

export class TodayStore {
  state: TodayState = emptyState();
  private saving: Promise<void> = Promise.resolve();

  constructor(private readonly file: string, private readonly log: (message: string, fields: Record<string, unknown>) => void = () => undefined) {}

  async load(): Promise<void> {
    this.state = parseState(await readFile(this.file, "utf8").catch(() => "{}"));
  }

  save(): Promise<void> {
    this.saving = this.saving.then(async () => {
      await mkdir(dirname(this.file), { recursive: true });
      const temporary = `${this.file}.tmp-${randomBytes(4).toString("hex")}`;
      await writeFile(temporary, `${JSON.stringify({ version: 1, ...this.state }, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, this.file);
    }).catch((error: unknown) => this.log("Vandaag could not be saved", { error: String(error) }));
    return this.saving;
  }

  /**
   * An item the agent found. The same key again only refreshes what the agent wrote; an item the
   * person already answered or waved away stays away.
   */
  report(item: DayItem): "added" | "updated" | "dismissed" {
    if (this.state.dismissed[item.key] !== undefined) return "dismissed";
    const index = this.state.items.findIndex((entry) => entry.key === item.key);
    if (index === -1) {
      this.state.items = [...this.state.items, item].slice(-MAX_ITEMS);
      return "added";
    }
    const existing = this.state.items[index];
    this.state.items[index] = existing ? { ...item, at: existing.at } : item;
    return "updated";
  }

  dismiss(key: string, now: number): boolean {
    const had = this.state.items.some((item) => item.key === key);
    this.state.items = this.state.items.filter((item) => item.key !== key);
    this.state.dismissed[key] = now;
    delete this.state.later[key];
    return had;
  }

  /** What shows now: not hidden until later, and appointments that are over are let go. */
  current(now: number): DayItem[] {
    return this.state.items.filter((item) => (this.state.later[item.key] ?? 0) <= now && (item.kind !== "meeting" || item.meeting.end > now));
  }

  /** Housekeeping once a day: old answers, yesterday's skips and plan, appointments that are over. */
  prune(now: number, today: string): void {
    this.state.dismissed = Object.fromEntries(Object.entries(this.state.dismissed).filter(([, at]) => at > now - KEEP_DISMISSED_MS));
    this.state.later = Object.fromEntries(Object.entries(this.state.later).filter(([, until]) => until > now));
    this.state.items = this.state.items.filter((item) => item.kind !== "meeting" || item.meeting.end > now - 60 * 60_000);
    if (this.state.skips.date !== today) this.state.skips = { date: today, ids: [] };
    if (this.state.plan && this.state.plan.date !== today) this.state.plan = null;
  }
}
