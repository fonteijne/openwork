import type { AgendaHost, SessionActivity } from "../src/types.ts";

/** A host with chats, a clock you set, and activity you emit. Placeholders only. */
export function fakeHost(options: { readOnly?: boolean } = {}) {
  const listeners = new Set<(activity: SessionActivity) => void>();
  const sessions = new Map<string, { title: string | null; parentId: string | null }>();
  const running = new Map<string, string[]>();
  const logs: Array<{ level: string; message: string }> = [];
  let infoCalls = 0;
  const host: AgendaHost = {
    readOnly: options.readOnly ?? false,
    workspaces: () => [{ id: "ws_a", path: "/projects/Project A" }, { id: "ws_b", path: "/projects/Project B" }],
    onSessionActivity: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    sessionInfo: async (sessionId) => {
      infoCalls++;
      const found = sessions.get(sessionId);
      return found ? { id: sessionId, ...found } : null;
    },
    runningSessions: async (workspaceId) => running.get(workspaceId) ?? [],
    log: (level, message) => { logs.push({ level, message }); },
  };
  return {
    host,
    logs,
    get infoCalls() { return infoCalls; },
    get listeners() { return listeners.size; },
    session(sessionId: string, title: string | null, parentId: string | null = null) { sessions.set(sessionId, { title, parentId }); },
    setRunning(workspaceId: string, sessionIds: string[]) { running.set(workspaceId, sessionIds); },
    emit(workspaceId: string, sessionId: string, state: "running" | "idle") {
      const activity: SessionActivity = state === "idle" ? { workspaceId, sessionId, state, outcome: "succeeded" } : { workspaceId, sessionId, state };
      for (const listener of listeners) listener(activity);
    },
  };
}
