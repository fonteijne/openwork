/**
 * The BonzaiWork domain and the one interface every screen talks to.
 *
 * Mirrors docs/bonzaiwork/frontend-contract.md (openwork): a project is an
 * OpenWork workspace, a chat is an engine session, a routine is our own
 * scheduled prompt. Two implementations exist: `live/` speaks to the local
 * OpenWork server (+ OpenCode v2 engine + /bonzaiwork routes), `demo/` runs in
 * the browser for previews and design review. Screens never know which one.
 */

// ---------------------------------------------------------------------------
// App, keys and models
// ---------------------------------------------------------------------------

export type KeyMode = "user" | "workspace";

export type KeyState = { hasKey: boolean; keyHint: string | null };

export type Model = { id: string; name: string };

export type AppStatus = {
  litellmBaseUrl: string;
  keyMode: KeyMode;
  /** False on Linux without a keychain: keys live in memory until the app stops. */
  keyStorePersistent: boolean;
  user: KeyState;
  models: Model[];
  defaultModel: string | null;
  /** Host actions (create/rename/remove projects, keys) are unavailable. */
  readOnly: boolean;
};

/**
 * What this backend can do today. Live mode discovers the §7 routes; screens
 * keep a control visible with its reason when a capability is off (P4).
 */
export type Capabilities = {
  routines: boolean;
  /** Real spend from LiteLLM; without it the UI shows tokens only. */
  usage: boolean;
  /** Search in message text; without it search covers titles only. */
  contentSearch: boolean;
  /** Where project metadata (description, color, pins, archive) lives. */
  projectMeta: "server" | "device";
  /** A native folder picker exists (desktop). */
  folderPicker: boolean;
  /** Can reveal a path in Finder/Explorer. */
  revealPath: boolean;
  /** OS notifications when a routine finishes. */
  notifications: boolean;
  /** Skills and commands for every project can be edited (not only read). */
  globalConfig: boolean;
  /** Brains: projects that are shared git repositories, and the personal brain (§7.5). */
  brains: boolean;
};

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const PROJECT_COLORS = ["jade", "sage", "blue", "violet", "amber", "orange", "tomato", "pink", "cyan"] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];

export const PROJECT_ICONS = [
  "folder",
  "briefcase",
  "file-text",
  "chart",
  "megaphone",
  "users",
  "scale",
  "lightbulb",
  "book",
  "calendar",
  "mail",
  "code",
] as const;
export type ProjectIcon = (typeof PROJECT_ICONS)[number];

export type Project = {
  id: string;
  name: string;
  /** Folder on disk. Technical: sidecar, settings and details only. */
  path: string;
  description: string | null;
  color: ProjectColor;
  icon: ProjectIcon;
  pinned: boolean;
  archivedAt: number | null;
  key: KeyState;
  defaultModel: string | null;
  /** null = every model of the key. */
  allowedModels: string[] | null;
};

export type ProjectSummary = {
  chatCount: number;
  lastActivityAt: number | null;
  runningCount: number;
  waitingCount: number;
  /** null when the backend cannot total them cheaply. */
  tokens: { input: number; output: number } | null;
  nextRoutineAt: number | null;
};

export type Usage = {
  period: "month";
  spend: number;
  currency: string;
  maxBudget: number | null;
  budgetResetAt: number | null;
  byModel: { model: string; spend: number; tokens: number }[];
};

export type NewProjectInput = {
  name: string;
  description: string | null;
  color: ProjectColor;
  icon: ProjectIcon;
  /** null = the default folder (~/BonzaiWork/<name>). */
  folderPath: string | null;
  instructions: string | null;
  defaultModel: string | null;
};

export type ProjectPatch = Partial<Pick<Project, "name" | "description" | "color" | "icon" | "pinned" | "allowedModels">> & {
  archived?: boolean;
};

// ---------------------------------------------------------------------------
// Chats and messages
// ---------------------------------------------------------------------------

export type ChatStatus = "idle" | "running" | "waiting" | "failed";

export type Chat = {
  id: string;
  projectId: string;
  title: string;
  /** The engine has not named the chat yet. */
  untitled: boolean;
  createdAt: number;
  updatedAt: number;
  model: string | null;
  /** Set for sub-tasks the agent started from another chat. */
  parentId: string | null;
  groupId: string | null;
  pinned: boolean;
  archived: boolean;
  note: string | null;
  status: ChatStatus;
  /** Reverted up to (and hiding) this message, restorable. */
  revertMessageId: string | null;
  /** The routine whose run started this chat. */
  routineId: string | null;
};

export type ChatGroup = { id: string; label: string };

export type TokenUsage = { input: number; output: number; reasoning: number; cacheRead: number; cacheWrite: number };

export type ChatErrorKind =
  | "key_missing"
  | "key_rejected"
  | "budget_exceeded"
  | "rate_limited"
  | "litellm_unreachable"
  | "model_unavailable"
  | "unknown";

export type ChatError = { kind: ChatErrorKind; detail: string | null };

export type ToolStatus = "pending" | "running" | "completed" | "error";

export type TextPart = { type: "text"; id: string; text: string };
export type ReasoningPart = { type: "reasoning"; id: string; text: string; startedAt: number; endedAt: number | null };
export type ToolPart = {
  type: "tool";
  id: string;
  /** Engine tool name (read, edit, write, bash, webfetch, grep, glob, task, skill, mcp_*). Never shown raw (C3). */
  tool: string;
  status: ToolStatus;
  input: Record<string, unknown>;
  output: string | null;
  error: string | null;
  startedAt: number | null;
  endedAt: number | null;
  /** For a sub-task: the chat the agent started. */
  childChatId: string | null;
};
export type FilePart = { type: "file"; id: string; filename: string; mime: string; url: string | null };
export type MessagePart = TextPart | ReasoningPart | ToolPart | FilePart;

export type Message = {
  id: string;
  chatId: string;
  role: "user" | "assistant";
  createdAt: number;
  completedAt: number | null;
  parts: MessagePart[];
  model: string | null;
  tokens: TokenUsage | null;
  error: ChatError | null;
};

export type PermissionReply = "once" | "always" | "reject";

export type PermissionRequest = {
  id: string;
  chatId: string;
  /** Engine action: edit, bash, webfetch, external_directory, skill, mcp... */
  action: string;
  resources: string[];
  canAlways: boolean;
  message: string | null;
};

export type QuestionField = {
  key: string;
  title: string;
  description: string;
  multiple: boolean;
  custom: boolean;
  options: { value: string; label: string; description: string }[];
};

export type QuestionRequest = { id: string; chatId: string; fields: QuestionField[] };

export type Attachment = { name: string; mime: string; size: number; file: File };

export type SendInput = {
  text: string;
  model: string;
  agent: string | null;
  attachments: Attachment[];
  /** A `/command` picked in the composer; `text` then holds its arguments. */
  command: string | null;
  /** Skills picked in the composer, attached to this message. */
  skills: string[];
};

export type Agent = { id: string; name: string; description: string | null };

export type ComposerEntry = { name: string; description: string | null; kind: "command" | "skill" };

export type ChatSearchHit = { chatId: string; title: string; snippet: string | null };

/** Live updates for one project. Events are hints: screens may refetch. */
export type ProjectEvent =
  | { type: "chat.upserted"; chat: Chat }
  | { type: "chat.deleted"; chatId: string }
  | { type: "chat.status"; chatId: string; status: ChatStatus }
  | { type: "message.upserted"; message: Message }
  | { type: "message.removed"; chatId: string; messageId: string }
  | { type: "part.upserted"; chatId: string; messageId: string; part: MessagePart }
  | { type: "part.delta"; chatId: string; messageId: string; partId: string; delta: string }
  | { type: "history.changed"; chatId: string }
  | { type: "permission.asked"; request: PermissionRequest }
  | { type: "permission.resolved"; chatId: string; requestId: string }
  | { type: "question.asked"; request: QuestionRequest }
  | { type: "question.resolved"; chatId: string; requestId: string }
  | { type: "groups.changed" }
  | { type: "connection"; state: "open" | "reconnecting" };

// ---------------------------------------------------------------------------
// Project configuration
// ---------------------------------------------------------------------------

export type Skill = { name: string; description: string; scope: "project" | "global"; error: string | null };
export type SkillContent = { skill: Skill; content: string };

export type Command = {
  name: string;
  description: string | null;
  template: string;
  scope: "workspace" | "global";
};

export type ConnectionStatus = "connected" | "disabled" | "needs_auth" | "failed" | "pending";
export type Connection = {
  name: string;
  kind: "remote" | "local";
  /** URL for remote, command line for local. Details only. */
  target: string;
  enabled: boolean;
  status: ConnectionStatus;
  error: string | null;
  scope: "project" | "global";
};
export type NewConnectionInput =
  | { name: string; kind: "remote"; url: string }
  | { name: string; kind: "local"; command: string };

export type RunMode = "default" | "approve" | "run-everything";
export type RunModeState = { mode: RunMode | null; supported: boolean; reason: string | null };

export type AuditEntry = { id: string; action: string; summary: string; actor: string; at: number };

export type ProjectFile = { path: string; bytes: number; updatedAt: number };
export type FileContent = { path: string; content: string | null; bytes: number; updatedAt: number | null };

// ---------------------------------------------------------------------------
// Routines (frontend-contract §5.6, §7.4)
// ---------------------------------------------------------------------------

export type RoutineSchedule =
  | { kind: "once"; timezone: string; at: number }
  | { kind: "daily"; timezone: string; hour: number; minute: number }
  | { kind: "weekly"; timezone: string; daysOfWeek: number[]; hour: number; minute: number }
  | { kind: "interval"; timezone: string; everyHours: number; startHour: number; endHour: number; daysOfWeek: number[] };

export type RoutineState = "active" | "inactive" | "needs_attention" | "archived";
export type RoutineRunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "skipped";

export type RoutineRun = {
  id: string;
  routineId: string;
  trigger: "scheduled" | "manual" | "recovery";
  status: RoutineRunStatus;
  skippedReason: "app_closed" | null;
  chatId: string | null;
  /** When it was due (a skipped run never started). */
  scheduledAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
};

export type Routine = {
  id: string;
  projectId: string;
  name: string;
  prompt: string;
  model: string | null;
  schedule: RoutineSchedule;
  state: RoutineState;
  needsAttentionReason: string | null;
  nextRunAt: number | null;
  lastRun: RoutineRun | null;
  createdAt: number;
  updatedAt: number;
};

export type RoutineInput = Pick<Routine, "projectId" | "name" | "prompt" | "model" | "schedule">;
export type RoutinePatch = Partial<RoutineInput> & { state?: Exclude<RoutineState, "needs_attention"> };

// ---------------------------------------------------------------------------
// Brains (docs/bonzaiwork/project-breinen-plan.md §8; frontend-contract §7.5)
// ---------------------------------------------------------------------------

export type BrainKind = "project" | "personal";
export type BrainMode = "auto" | "manual" | "read_only";
export type BrainState = "synced" | "syncing" | "behind" | "ahead" | "offline" | "conflict" | "read_only" | "local_only" | "needs_trust" | "error";

/** Something a shared brain brings that can run code; it stays out of the folder until trusted (§7.1). */
export type TrustItem = { path: string; kind: "config" | "plugin" | "agent" | "command" | "script"; mcpServers: string[] };

export type BrainStatus = {
  kind: BrainKind;
  state: BrainState;
  mode: BrainMode;
  /** SSH form; null for a personal brain with history only. */
  remote: string | null;
  branch: string;
  ahead: number;
  behind: number;
  lastSyncAt: number | null;
  conflictFiles: string[];
  conflictBy: string | null;
  /** Dutch, from the server. */
  error: string | null;
  pendingTrust: TrustItem[];
  unshared: { path: string; reason: "not_markdown" | "too_large" }[];
  warnings: string[];
  excluded: string[];
};

export type Brain = { projectId: string; path: string; status: BrainStatus };

export type BrainHistoryEntry = { commit: string; author: string; at: number; title: string; chatId: string | null; files: string[] };

export type RemoteProblem =
  | "host_unknown" | "host_changed" | "no_access" | "key_locked" | "not_found" | "read_only"
  | "rejected" | "unreachable" | "offline" | "ssh_missing" | "unknown";

export type RemoteCheck =
  | { ok: true; sshUrl: string; name: string; empty: boolean }
  | { ok: false; sshUrl: string | null; name: string | null; problem: RemoteProblem | "link"; message: string; host: { name: string; fingerprints: string[] } | null };

export type CloneJob = { state: "running" | "done" | "failed"; error: string | null; status: BrainStatus | null };

export type TrustTier = "unverified" | "machine" | "human" | "human_before_change";

/** A knowledge concept as the sidebar shows it (OKF trust, status, staleness). */
export type ConceptView = {
  type: string;
  title: string | null;
  description: string | null;
  tags: string[];
  status: "draft" | "stable" | "deprecated";
  stale: boolean;
  generated: { by: string; at: string | null } | null;
  verified: { by: string; at: string | null }[];
  tier: TrustTier;
  sources: { id: string | null; title: string | null; resource: string | null }[];
};

export type PreferenceProposal = { id: string; preference: string; reason: string | null; at: number };

export type HistoryAuthor = { name: string; email: string };

// ---------------------------------------------------------------------------
// App settings
// ---------------------------------------------------------------------------

export type EnvVar = { key: string; hasValue: boolean };
export type Versions = { app: string; server: string | null; engine: string | null };

// ---------------------------------------------------------------------------
// The interface
// ---------------------------------------------------------------------------

export type Page<T> = { items: T[]; nextCursor: string | null };

/** The live engine behind chats: up, still starting, or copying older chats over first. */
export type EngineState = "ready" | "starting" | "migrating" | "failed";

export interface Backend {
  readonly mode: "demo" | "live";
  readonly capabilities: Capabilities;
  /** Live only: the engine's state, for a banner while it is not ready. */
  readonly engine?: { current(): EngineState; subscribe(listener: () => void): () => void; error(): string | null; retry(): void };

  status(): Promise<AppStatus>;
  keys: {
    linkUser(key: string): Promise<AppStatus>;
    unlinkUser(): Promise<AppStatus>;
    linkProject(projectId: string, key: string): Promise<AppStatus>;
    unlinkProject(projectId: string): Promise<AppStatus>;
    refreshModels(): Promise<AppStatus>;
  };

  projects: {
    list(): Promise<Project[]>;
    create(input: NewProjectInput): Promise<Project>;
    update(projectId: string, patch: ProjectPatch): Promise<Project>;
    setDefaultModel(projectId: string, model: string | null): Promise<Project>;
    /** Detaches the project from BonzaiWork; the folder stays on disk. */
    remove(projectId: string): Promise<void>;
    summary(projectId: string): Promise<ProjectSummary>;
    usage(projectId: string): Promise<Usage | null>;
    exportUrl(projectId: string): Promise<string | null>;
  };

  chats: {
    list(projectId: string, cursor: string | null): Promise<Page<Chat>>;
    create(projectId: string, input: { model: string; title?: string }): Promise<Chat>;
    rename(projectId: string, chatId: string, title: string): Promise<Chat>;
    remove(projectId: string, chatId: string): Promise<void>;
    setPinned(projectId: string, chatId: string, pinned: boolean): Promise<void>;
    setArchived(projectId: string, chatId: string, archived: boolean): Promise<void>;
    setNote(projectId: string, chatId: string, note: string | null): Promise<void>;
    messages(projectId: string, chatId: string): Promise<Message[]>;
    send(projectId: string, chatId: string, input: SendInput): Promise<void>;
    abort(projectId: string, chatId: string): Promise<void>;
    /** A new chat with the history strictly before `beforeMessageId`. */
    fork(projectId: string, chatId: string, beforeMessageId: string | null): Promise<Chat>;
    revert(projectId: string, chatId: string, messageId: string): Promise<void>;
    unrevert(projectId: string, chatId: string): Promise<void>;
    search(projectId: string, query: string): Promise<ChatSearchHit[]>;
  };

  groups: {
    list(projectId: string): Promise<{ groups: ChatGroup[]; assignments: Record<string, string> }>;
    create(projectId: string, label: string): Promise<ChatGroup>;
    rename(projectId: string, groupId: string, label: string): Promise<void>;
    remove(projectId: string, groupId: string): Promise<void>;
    reorder(projectId: string, groupIds: string[]): Promise<void>;
    assign(projectId: string, chatId: string, groupId: string | null): Promise<void>;
  };

  interactions: {
    permissions(projectId: string, chatId: string): Promise<PermissionRequest[]>;
    replyPermission(projectId: string, chatId: string, requestId: string, reply: PermissionReply): Promise<void>;
    questions(projectId: string, chatId: string): Promise<QuestionRequest[]>;
    /** One answer list per field, in field order (labels or custom text). */
    replyQuestion(projectId: string, chatId: string, requestId: string, answers: string[][]): Promise<void>;
    rejectQuestion(projectId: string, chatId: string, requestId: string): Promise<void>;
  };

  subscribe(projectId: string, listener: (event: ProjectEvent) => void): () => void;

  composer: {
    agents(projectId: string): Promise<Agent[]>;
    entries(projectId: string): Promise<ComposerEntry[]>;
    upload(projectId: string, file: File): Promise<{ path: string }>;
  };

  config: {
    instructions(projectId: string): Promise<string | null>;
    setInstructions(projectId: string, content: string): Promise<void>;
    skills(projectId: string, scope: "project" | "global"): Promise<Skill[]>;
    skill(projectId: string, name: string): Promise<SkillContent>;
    saveSkill(projectId: string, input: { name: string; description: string; content: string }): Promise<void>;
    removeSkill(projectId: string, name: string): Promise<void>;
    commands(projectId: string, scope: "workspace" | "global"): Promise<Command[]>;
    saveCommand(projectId: string, input: { name: string; description: string | null; template: string; scope: "workspace" | "global" }): Promise<void>;
    removeCommand(projectId: string, name: string): Promise<void>;
    connections(projectId: string): Promise<Connection[]>;
    addConnection(projectId: string, input: NewConnectionInput): Promise<void>;
    setConnectionEnabled(projectId: string, name: string, enabled: boolean): Promise<void>;
    removeConnection(projectId: string, name: string): Promise<void>;
    signOutConnection(projectId: string, name: string): Promise<void>;
    runMode(projectId: string): Promise<RunModeState>;
    setRunMode(projectId: string, mode: RunMode): Promise<RunModeState>;
    folders(projectId: string): Promise<string[]>;
    setFolders(projectId: string, folders: string[]): Promise<string[]>;
    files(projectId: string): Promise<ProjectFile[]>;
    /** Text content for a preview; `content` is null for binary or very large files. */
    readFile(projectId: string, path: string, chatId: string | null): Promise<FileContent>;
    audit(projectId: string): Promise<AuditEntry[]>;
  };

  routines: {
    list(projectId: string | null): Promise<Routine[]>;
    create(input: RoutineInput): Promise<Routine>;
    update(routineId: string, patch: RoutinePatch): Promise<Routine>;
    remove(routineId: string): Promise<void>;
    run(routineId: string): Promise<RoutineRun>;
    runs(routineId: string): Promise<RoutineRun[]>;
  };

  brains: {
    list(): Promise<Brain[]>;
    /** Checks the link and access before cloning ("Verbinding testen"). */
    checkRemote(url: string): Promise<RemoteCheck>;
    /** Stores an unknown host after the user compared its fingerprint. */
    trustHost(url: string, fingerprints: string[]): Promise<void>;
    /** Clones into `folderPath`, or into a new folder named after the project in the default folder. */
    clone(url: string, target: { folderPath: string | null; name: string }): Promise<{ jobId: string; folderPath: string }>;
    job(jobId: string): Promise<CloneJob>;
    /** Makes a project a brain: after a clone (`jobId`), or as the personal brain in its folder. */
    register(projectId: string, input: { jobId?: string; kind: BrainKind; mode?: BrainMode; trusted?: string[]; excluded?: string[] }): Promise<BrainStatus>;
    unregister(projectId: string): Promise<void>;
    /** Puts the brain template in an empty shared brain and shares it (plan §6.1). */
    setUp(projectId: string, input: { name: string; description: string }): Promise<BrainStatus>;
    /** Before a turn: updates the project brain and the personal brain (at most ~5 s). */
    prepare(projectId: string, chatId: string): Promise<void>;
    share(projectId: string): Promise<BrainStatus>;
    setMode(projectId: string, mode: BrainMode): Promise<BrainStatus>;
    history(projectId: string): Promise<BrainHistoryEntry[]>;
    keepMineApart(projectId: string): Promise<BrainStatus>;
    trust(projectId: string, paths: string[]): Promise<BrainStatus>;
    repair(projectId: string): Promise<BrainStatus>;
    setExcluded(projectId: string, folders: string[]): Promise<BrainStatus>;
    attachRemote(projectId: string, url: string): Promise<BrainStatus>;
    /** With a path: "Zet deze notitie terug"; without: "Draai deze beurt terug". */
    restore(projectId: string, commit: string, path: string | null): Promise<BrainStatus>;
    concept(projectId: string, path: string): Promise<ConceptView | null>;
    verify(projectId: string, path: string): Promise<ConceptView | null>;
    author(): Promise<{ author: HistoryAuthor | null; suggested: HistoryAuthor | null }>;
    setAuthor(author: HistoryAuthor): Promise<void>;
    proposals(): Promise<PreferenceProposal[]>;
    decide(proposalId: string, decision: "accept" | "reject", text: string | null): Promise<void>;
  };

  settings: {
    env(): Promise<EnvVar[]>;
    setEnv(key: string, value: string): Promise<void>;
    removeEnv(key: string): Promise<void>;
    versions(): Promise<Versions>;
  };

  desktop: {
    pickFolder(): Promise<string | null>;
    revealPath(path: string): Promise<void>;
  };
}

/** A failure the UI explains in its own words (DESIGN.md C6, T2). */
export class BackendError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number | null = null,
    /** The server's own (English) sentence, for logs; never shown. */
    readonly detail: string | null = null,
  ) {
    super(message);
    this.name = "BackendError";
  }
}
