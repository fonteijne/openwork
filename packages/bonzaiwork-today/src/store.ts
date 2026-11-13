import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { number, readFocus, readItem, readPlan, readSettings, record, text } from "./read.ts";
import { DEFAULT_SETTINGS, type DayItem, type DayPlan, type DoneEntry, type Focus, type SentEntry, type TodaySettings } from "./types.ts";

export { readSettings };

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
  /** Mail a round already read, so the next round only gets what is new (cost: plan §5). */
  seen: Record<string, number>;
  done: DoneEntry[];
  sent: SentEntry[];
  /** The local date the person last closed their day. */
  closed: string;
  /** The to-do chosen at closing, to start with from the day after `after`. */
  pinned: { todoId: string; after: string } | null;
  skips: { date: string; ids: string[] };
  steps: Record<string, Step>;
  plan: DayPlan | null;
  focus: Focus | null;
};

const KEEP_DISMISSED_MS = 45 * 24 * 60 * 60_000;
const MAX_ITEMS = 60;
const KEEP_SEEN_MS = 14 * 24 * 60 * 60_000;
const MAX_SEEN = 1000;

const times = (value: unknown): Record<string, number> => Object.fromEntries(Object.entries(record(value) ?? {}).filter((entry): entry is [string, number] => typeof entry[1] === "number"));

export function emptyState(): TodayState {
  return { settings: { ...DEFAULT_SETTINGS }, items: [], dismissed: {}, later: {}, seen: {}, done: [], sent: [], closed: "", pinned: null, skips: { date: "", ids: [] }, steps: {}, plan: null, focus: null };
}

export function parseState(raw: string): TodayState {
  let stored: Record<string, unknown> | null = null;
  try { stored = record(JSON.parse(raw)); } catch { stored = null; }
  if (!stored) return emptyState();
  const list = (key: string): unknown[] => { const found = stored?.[key]; return Array.isArray(found) ? found : []; };
  const skips = record(stored.skips);
  return {
    settings: readSettings(stored.settings),
    items: list("items").flatMap((entry) => { const item = readItem(entry); return item ? [item] : []; }),
    dismissed: times(stored.dismissed),
    later: times(stored.later),
    seen: times(stored.seen),
    done: list("done").flatMap((entry): DoneEntry[] => {
      const todoId = text(entry, "todoId");
      return todoId ? [{ todoId, text: text(entry, "text") ?? "", brainName: text(entry, "brainName") ?? "", at: number(entry, "at") ?? 0 }] : [];
    }),
    sent: list("sent").flatMap((entry): SentEntry[] => {
      const key = text(entry, "key");
      const via = text(entry, "via");
      return key && (via === "mail" || via === "slack") ? [{ key, via, title: text(entry, "title") ?? "", to: text(entry, "to") ?? "", at: number(entry, "at") ?? 0 }] : [];
    }),
    closed: text(stored, "closed") ?? "",
    pinned: text(stored.pinned, "todoId") ? { todoId: text(stored.pinned, "todoId") ?? "", after: text(stored.pinned, "after") ?? "" } : null,
    skips: { date: text(skips, "date") ?? "", ids: Array.isArray(skips?.ids) ? skips.ids.filter((entry): entry is string => typeof entry === "string") : [] },
    steps: Object.fromEntries(Object.entries(record(stored.steps) ?? {}).flatMap(([id, value]): Array<[string, Step]> => {
      const step = text(value, "step");
      const why = text(value, "why");
      return step || why ? [[id, { step, why, at: number(value, "at") ?? 0 }]] : [];
    })),
    plan: readPlan(stored.plan),
    focus: readFocus(stored.focus),
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
    this.state.done = this.state.done.filter((entry) => entry.at > now - KEEP_SEEN_MS).slice(-200);
    this.state.sent = this.state.sent.filter((entry) => entry.at > now - KEEP_SEEN_MS).slice(-200);
    this.state.seen = Object.fromEntries(Object.entries(this.state.seen).filter(([, at]) => at > now - KEEP_SEEN_MS).slice(-MAX_SEEN));
    this.state.items = this.state.items.filter((item) => item.kind !== "meeting" || item.meeting.end > now - 60 * 60_000);
    if (this.state.skips.date !== today) this.state.skips = { date: today, ids: [] };
    if (this.state.plan && this.state.plan.date !== today) this.state.plan = null;
  }
}
