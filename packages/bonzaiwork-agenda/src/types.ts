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

/** The label of a quarter without activity in BonzaiWork (A2). Not translated. */
export const AWAY_LABEL = "Away from BonzaiWork";

/** A booking post in Bridge: the `--entity` of `bridge add_worklog` (plan §2.6). */
export type BridgePost = {
  entityId: string;
  label: string | null;
};

export type AgendaProject = { name: string | null; bridgePost: BridgePost | null };

export type AgendaSettings = {
  version: 1;
  enabled: boolean;
  projects: Record<string, AgendaProject>;
  /** At most 10, newest first. */
  recentPosts: BridgePost[];
};

export type Correction =
  | { kind: "project"; workspaceId: string }
  | { kind: "other"; label: string; bridgePost: BridgePost | null }
  | { kind: "away" };

export type ChatRef = { id: string; title: string | null };

export type Measured = {
  /** workspaceId → presence minutes + 2 × turns started (plan §2.3). */
  scores: Record<string, number>;
  /** workspaceId → ms of the last activity, for a tie. */
  lastActivity: Record<string, number>;
  /** Chats with a turn started in this quarter, per workspace. */
  chats: Record<string, ChatRef[]>;
  /** The agenda ran during this quarter. */
  appOpen: boolean;
};

export type QuarterRecord = {
  key: string;
  start: number;
  measured: Measured | null;
  correction: (Correction & { at: number }) | null;
  note: string | null;
  reference: string | null;
};

export type AgendaDay = {
  version: 1;
  date: string;
  /** Only quarters with a measurement, a correction or a note. */
  quarters: Record<string, QuarterRecord>;
  /** undoId → the quarters as they were before that change; the last 20 changes. */
  undo: Record<string, Array<{ key: string; before: QuarterRecord | null }>>;
};

export type QuarterKind = "project" | "other" | "away";

export type QuarterView = {
  key: string;
  start: number;
  end: number;
  kind: QuarterKind;
  workspaceId: string | null;
  projectName: string | null;
  /** Project name, own label, or "Away from BonzaiWork". */
  label: string;
  /** From the correction, otherwise from the project. */
  bridgePost: BridgePost | null;
  source: "measured" | "user";
  /** Names of the other projects with activity in this quarter (plan §2.3). */
  shared: string[];
  chats: string[];
  note: string | null;
  reference: string | null;
  /** Away because the app was closed. */
  appClosed: boolean;
  current: boolean;
};

export type Block = {
  start: number;
  end: number;
  quarters: number;
  kind: QuarterKind;
  workspaceId: string | null;
  label: string;
  bridgePost: BridgePost | null;
  reference: string | null;
  source: "measured" | "user";
  appClosed: boolean;
  chats: string[];
  notes: string[];
  shared: string[];
};

export type DayTotal = { bridgePost: BridgePost | null; label: string; minutes: number };

export type DayView = {
  date: string;
  now: { workspaceId: string | null; label: string; since: number } | null;
  quarters: QuarterView[];
  blocks: Block[];
  /** Away does not count. */
  totals: DayTotal[];
  /** Quarters to book without a Bridge post. */
  missingPosts: number;
};
