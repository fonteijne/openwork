/** A turn starting or ending in a workspace (downstream-hooks `DownstreamSessionActivity`). */
export type SessionActivity = { workspaceId: string; sessionId: string; state: "running" | "idle"; outcome?: "succeeded" | "failed" | "interrupted" };

/** What the agenda needs from apps/server/src/downstream-hooks.ts, structurally. */
export type AgendaHost = {
  readOnly: boolean;
  workspaces(): Array<{ id: string; path: string }>;
  onSessionActivity(listener: (activity: SessionActivity) => void): () => void;
  sessionInfo(sessionId: string): Promise<{ id: string; title: string | null; parentId: string | null } | null>;
  log(level: "info" | "warn" | "error", message: string, fields?: Record<string, unknown>): void;
};

export type AgendaRoute = { method: string; path: string; auth: "client" | "host-token"; handle: (request: Request, params: Record<string, string>) => Promise<Response> };
