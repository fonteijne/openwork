import type { Meter } from "./meter.ts";
import type { ChatRef, SessionActivity } from "./types.ts";

/**
 * Turns you started (plan §2.2, §5.4): `session.execution` going to `running` in a chat counts once
 * for that chat's project, in the quarter it started. A turn that keeps running does not count again;
 * routine runs (the planner starts them) and sub-tasks (`parentId` set) never count. The chat title
 * goes with the quarter.
 */
export type TrackerHost = {
  sessionInfo(sessionId: string): Promise<{ id: string; title: string | null; parentId: string | null } | null>;
  /** Chats running in a workspace now, or null when the engine cannot say. */
  runningSessions?(workspaceId: string): Promise<string[] | null>;
  log(level: "info" | "warn" | "error", message: string, fields?: Record<string, unknown>): void;
};

export type TrackerOptions = {
  host: TrackerHost;
  meter: Meter;
  now: () => number;
  /** Measuring is on (settings `enabled`). */
  enabled: () => boolean;
  isRoutineChat?: (sessionId: string) => boolean;
};

const INFO_CACHE_MAX = 500;
/** The engine's placeholder title before a chat gets its own ("New session - 2026-11-02T…"). */
const PLACEHOLDER_TITLE = /^New session - \d{4}-/;

export const chatTitle = (title: string | null | undefined): string | null => {
  const trimmed = title?.replace(/\s+/g, " ").trim();
  return trimmed && !PLACEHOLDER_TITLE.test(trimmed) ? trimmed : null;
};

export function createTracker(options: TrackerOptions) {
  const { host, meter, now } = options;
  /** sessionId → since when it runs, and in which project. */
  const running = new Map<string, { workspaceId: string; since: number }>();
  /** sessionId → sub-task or not; that never changes. */
  const subtask = new Map<string, boolean>();
  const pending = new Set<Promise<void>>();

  async function info(sessionId: string): Promise<{ title: string | null; subtask: boolean }> {
    const found = await host.sessionInfo(sessionId).catch(() => null);
    const isSubtask = subtask.get(sessionId) ?? (found ? found.parentId !== null : false);
    if (found) {
      if (subtask.size >= INFO_CACHE_MAX) subtask.clear();
      subtask.set(sessionId, isSubtask);
    }
    return { title: chatTitle(found?.title), subtask: isSubtask };
  }

  async function started(activity: SessionActivity, at: number): Promise<void> {
    if (options.isRoutineChat?.(activity.sessionId)) return;
    if (subtask.get(activity.sessionId) === true) return;
    const { title, subtask: isSubtask } = await info(activity.sessionId);
    if (isSubtask) return;
    const chat: ChatRef = { id: activity.sessionId, title };
    meter.addTurn(activity.workspaceId, at, chat);
  }

  function onActivity(activity: SessionActivity): void {
    if (activity.state === "idle") {
      running.delete(activity.sessionId);
      return;
    }
    // Once per turn: a repeated "running" (a stream that reconnected) is the same turn.
    if (running.has(activity.sessionId)) return;
    const at = now();
    running.set(activity.sessionId, { workspaceId: activity.workspaceId, since: at });
    if (!options.enabled()) return;
    const work = started(activity, at).catch((error: unknown) => host.log("warn", "Agenda could not record a turn", { error: String(error) }));
    pending.add(work);
    void work.finally(() => pending.delete(work));
  }

  /** A turn whose end event was missed (engine restart) is forgotten, so the next turn in that chat counts. */
  async function prune(): Promise<void> {
    if (!host.runningSessions) return;
    const byWorkspace = new Map<string, string[]>();
    for (const [sessionId, entry] of running) {
      if (entry.since > now() - 60_000) continue;
      byWorkspace.set(entry.workspaceId, [...(byWorkspace.get(entry.workspaceId) ?? []), sessionId]);
    }
    for (const [workspaceId, sessionIds] of byWorkspace) {
      const active = await host.runningSessions(workspaceId).catch(() => null);
      if (!active) continue;
      for (const sessionId of sessionIds) if (!active.includes(sessionId)) running.delete(sessionId);
    }
  }

  /** The chats' current titles: a new chat gets its own title during its first turn. */
  async function titles(chats: Record<string, ChatRef[]>): Promise<Record<string, ChatRef[]>> {
    const result: Record<string, ChatRef[]> = {};
    for (const [workspaceId, list] of Object.entries(chats)) {
      result[workspaceId] = await Promise.all(list.map(async (chat) => {
        const found = await host.sessionInfo(chat.id).catch(() => null);
        return { id: chat.id, title: chatTitle(found?.title) ?? chat.title };
      }));
    }
    return result;
  }

  return {
    onActivity,
    prune,
    titles,
    /** Tests: wait until the turns being looked up are counted. */
    settled: () => Promise.all([...pending]).then(() => undefined),
  };
}

export type Tracker = ReturnType<typeof createTracker>;
