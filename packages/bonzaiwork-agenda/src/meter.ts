import { quarterKey, quarterStart, QUARTER_MS } from "./clock.ts";
import { score } from "./quarters.ts";
import type { ChatRef, Measured } from "./types.ts";

/**
 * Counters per quarter, in memory (plan §5.3): presence minutes and turns per project, the last
 * activity, the chats, and whether the agenda ran. A finished quarter goes to disk once.
 */
type Counter = {
  key: string;
  start: number;
  presence: Record<string, number>;
  turns: Record<string, number>;
  lastActivity: Record<string, number>;
  chats: Record<string, ChatRef[]>;
  appOpen: boolean;
};

const CHATS_PER_PROJECT = 20;

export function toMeasured(counter: Counter): Measured {
  const projects = new Set([...Object.keys(counter.presence), ...Object.keys(counter.turns)]);
  return {
    scores: Object.fromEntries([...projects].map((workspaceId) => [workspaceId, score(counter.presence[workspaceId] ?? 0, counter.turns[workspaceId] ?? 0)])),
    lastActivity: { ...counter.lastActivity },
    chats: Object.fromEntries(Object.entries(counter.chats).map(([workspaceId, chats]) => [workspaceId, chats.map((chat) => ({ ...chat }))])),
    appOpen: counter.appOpen,
  };
}

function mergeChats(a: ChatRef[], b: ChatRef[]): ChatRef[] {
  const merged = new Map<string, ChatRef>();
  for (const chat of [...a, ...b]) merged.set(chat.id, { id: chat.id, title: chat.title ?? merged.get(chat.id)?.title ?? null });
  return [...merged.values()].slice(0, CHATS_PER_PROJECT);
}

/** Two measurements of one quarter together (the app restarted in it, or a late event): scores add up. */
export function mergeMeasured(stored: Measured | null, next: Measured): Measured {
  if (!stored) return next;
  const add = (a: Record<string, number>, b: Record<string, number>, combine: (x: number, y: number) => number) => {
    const result = { ...a };
    for (const [key, value] of Object.entries(b)) result[key] = key in result ? combine(result[key] ?? 0, value) : value;
    return result;
  };
  const chats: Record<string, ChatRef[]> = { ...stored.chats };
  for (const [workspaceId, list] of Object.entries(next.chats)) chats[workspaceId] = mergeChats(chats[workspaceId] ?? [], list);
  return {
    scores: add(stored.scores, next.scores, (x, y) => x + y),
    lastActivity: add(stored.lastActivity, next.lastActivity, Math.max),
    chats,
    appOpen: stored.appOpen || next.appOpen,
  };
}

export function createMeter() {
  const counters = new Map<string, Counter>();

  function counter(at: number): Counter {
    const key = quarterKey(at);
    let found = counters.get(key);
    if (!found) {
      found = { key, start: quarterStart(at), presence: {}, turns: {}, lastActivity: {}, chats: {}, appOpen: false };
      counters.set(key, found);
    }
    return found;
  }

  const touch = (entry: Counter, workspaceId: string, at: number) => {
    entry.lastActivity[workspaceId] = Math.max(entry.lastActivity[workspaceId] ?? 0, at);
  };

  return {
    /** The agenda ran during the quarter of `at`. */
    markOpen(at: number) {
      counter(at).appOpen = true;
    },
    addPresence(workspaceId: string, at: number) {
      const entry = counter(at);
      entry.appOpen = true;
      entry.presence[workspaceId] = (entry.presence[workspaceId] ?? 0) + 1;
      touch(entry, workspaceId, at);
    },
    addTurn(workspaceId: string, at: number, chat: ChatRef) {
      const entry = counter(at);
      entry.appOpen = true;
      entry.turns[workspaceId] = (entry.turns[workspaceId] ?? 0) + 1;
      entry.chats[workspaceId] = mergeChats(entry.chats[workspaceId] ?? [], [chat]);
      touch(entry, workspaceId, at);
    },
    /** The live measurement of the quarter of `at`, for the day view; not removed. */
    peek(at: number): { key: string; start: number; measured: Measured } | null {
      const found = counters.get(quarterKey(at));
      return found ? { key: found.key, start: found.start, measured: toMeasured(found) } : null;
    },
    /** Takes the quarters that ended at `now` (all of them with `all`), oldest first. */
    take(now: number, all = false): Array<{ key: string; start: number; measured: Measured }> {
      const taken = [...counters.values()].filter((entry) => all || entry.start + QUARTER_MS <= now).sort((a, b) => a.start - b.start);
      for (const entry of taken) counters.delete(entry.key);
      return taken.map((entry) => ({ key: entry.key, start: entry.start, measured: toMeasured(entry) }));
    },
  };
}

export type Meter = ReturnType<typeof createMeter>;
