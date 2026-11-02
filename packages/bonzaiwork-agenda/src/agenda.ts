import { homedir } from "node:os";
import { join } from "node:path";

import { dateOf } from "./clock.ts";
import { createMeter, mergeMeasured } from "./meter.ts";
import { defaultSettings } from "./parse.ts";
import { createAgendaStore, type AgendaStore } from "./store.ts";
import { createTracker, type Tracker } from "./tracker.ts";
import type { AgendaDay, AgendaHost, AgendaRoute, AgendaSettings, Measured } from "./types.ts";

export type AgendaOptions = {
  stateDirectory?: string;
  environment?: NodeJS.ProcessEnv;
  now?: () => number;
  /** How often finished quarters go to disk (plan §5.5). */
  tickMs?: number;
  /** Chats a routine started (from the routines hooks): their turns never count. */
  isRoutineChat?: (sessionId: string) => boolean;
};

/**
 * The agenda (docs/bonzaiwork/agenda-manager-plan.md): in the server process, per quarter hour,
 * where you worked in BonzaiWork. No model, no engine, no brains (A7, A8).
 */
export function createAgendaHooks(options: AgendaOptions = {}) {
  const environment = options.environment ?? process.env;
  const stateDirectory = options.stateDirectory ?? environment.BONZAIWORK_STATE_DIR ?? join(homedir(), ".bonzaiwork");
  const now = options.now ?? Date.now;
  const meter = createMeter();
  let host: AgendaHost | null = null;
  let store: AgendaStore | null = null;
  let tracker: Tracker | null = null;
  let settings: AgendaSettings = defaultSettings();
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopActivity: (() => void) | null = null;
  let ticking: Promise<void> | null = null;
  /** Day changes take turns: a flush and a correction never read the same file at once. */
  let dayQueue: Promise<unknown> = Promise.resolve();

  const log: AgendaHost["log"] = (level, message, fields) => host?.log(level, message, fields);

  function requireStore(): AgendaStore {
    if (!store) throw new Error("The agenda has not started.");
    return store;
  }

  /** Reads a day, lets `change` edit it, writes it when `change` says so. One at a time. */
  function changeDay<T>(date: string, change: (day: AgendaDay) => Promise<{ write: boolean; result: T }> | { write: boolean; result: T }): Promise<T> {
    const next = dayQueue.then(async () => {
      const current = requireStore();
      const day = await current.readDay(date);
      const outcome = await change(day);
      if (outcome.write) await current.writeDay(day);
      return outcome.result;
    });
    dayQueue = next.catch(() => undefined);
    return next;
  }

  /** Finished quarters to disk, each merged with what is there (a restart within the quarter). */
  async function flush(all = false): Promise<void> {
    const finished = meter.take(now(), all);
    const byDate = new Map<string, typeof finished>();
    for (const entry of finished) byDate.set(dateOf(entry.start), [...(byDate.get(dateOf(entry.start)) ?? []), entry]);
    for (const [date, entries] of byDate) {
      const withTitles: Array<{ key: string; start: number; measured: Measured }> = [];
      for (const entry of entries) withTitles.push({ ...entry, measured: { ...entry.measured, chats: (await tracker?.titles(entry.measured.chats)) ?? entry.measured.chats } });
      await changeDay(date, (day) => {
        for (const entry of withTitles) {
          const existing = day.quarters[entry.key];
          day.quarters[entry.key] = existing
            ? { ...existing, measured: mergeMeasured(existing.measured, entry.measured) }
            : { key: entry.key, start: entry.start, measured: entry.measured, correction: null, note: null, reference: null };
        }
        return { write: true, result: undefined };
      }).catch((error: unknown) => log("error", "Agenda could not save a quarter", { date, error: String(error) }));
    }
  }

  /** The clock (plan §5.5): mark this quarter as open, close finished ones. One tick at a time. */
  function tick(): Promise<void> {
    if (ticking) return ticking;
    ticking = (async () => {
      try {
        if (settings.enabled) meter.markOpen(now());
        await tracker?.prune();
        await flush();
      } finally {
        ticking = null;
      }
    })();
    return ticking;
  }

  const routes: AgendaRoute[] = [];

  return {
    routes,
    /** Tests: one turn of the clock, and wait for turns being looked up. */
    tick,
    settled: () => tracker?.settled() ?? Promise.resolve(),
    readDay: (date: string) => requireStore().readDay(date),
    async start(next: AgendaHost) {
      host = next;
      store = createAgendaStore({ directory: join(stateDirectory, "agenda"), log, now });
      settings = await store.readSettings();
      tracker = createTracker({ host: next, meter, now, enabled: () => settings.enabled, isRoutineChat: options.isRoutineChat });
      stopActivity = next.onSessionActivity((activity) => tracker?.onActivity(activity));
      timer = setInterval(() => { void tick(); }, options.tickMs ?? 30_000);
      timer.unref?.();
      await tick();
    },
    /** Stops the clock and saves the quarter so far, so a restart within it keeps what was measured. */
    async stop() {
      stopActivity?.();
      stopActivity = null;
      if (timer) clearInterval(timer);
      timer = null;
      await ticking;
      if (store) await flush(true);
      host = null;
    },
  };
}

export type AgendaHooks = ReturnType<typeof createAgendaHooks>;
