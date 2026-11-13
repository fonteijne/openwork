/**
 * The types of the Vandaag routes (docs/bonzaiwork/persoonlijke-agent-plan.md). Pure: the BonzaiWork
 * UI and its demo backend import them through `@bonzaiwork/today/model`.
 */

/** `📅` a deadline or a promise of the owner; `⏳` a promise to the owner (waiting for someone). */
export type DueKind = "deadline" | "waiting";

export type BrainKind = "project" | "personal";

/** One checkbox line in a brain (plan §2.1). */
export type Todo = {
  /** Stable while the text stays the same, also when the line moves. */
  id: string;
  /** The brain's workspace id: the project the to-do belongs to. */
  brainId: string;
  brainName: string;
  brainKind: BrainKind;
  /** Path of the file inside the brain, with `/`. */
  path: string;
  /** 1-based line in that file, as last read. */
  line: number;
  /** The text without the owner and the date. */
  text: string;
  done: boolean;
  /** The `@name` on the line, without the `@`; null for team backlog. */
  owner: string | null;
  /** `YYYY-MM-DD`, or null. */
  due: string | null;
  dueKind: DueKind | null;
  /** The owner is the person at this laptop (or the line has no owner in the personal brain). */
  mine: boolean;
};

export type StartReason = "overdue" | "today" | "waiting_due" | "plan" | "soon" | "oldest";

/** "Start hier": the one to-do the agent picked, why, and the first step (plan §4, T4). */
export type StartHere = {
  todo: Todo;
  reason: StartReason;
  /** The agent's own sentence on why this one, when it wrote one. */
  why: string | null;
  /** The first step of about five minutes, when the agent wrote one. */
  firstStep: string | null;
  /** How often "Niet nu" still gives another to-do today. */
  skipsLeft: number;
};

export type UpcomingBucket = "late" | "today" | "week" | "later";

/** One row of "Komt eraan": a dated to-do, a promise or an appointment. */
export type UpcomingRow =
  | { kind: "todo"; key: string; bucket: UpcomingBucket; date: string; todo: Todo }
  | { kind: "meeting"; key: string; bucket: UpcomingBucket; date: string; meeting: Meeting };

export type Meeting = {
  id: string;
  title: string;
  /** Epoch ms. */
  start: number;
  end: number;
  allDay: boolean;
  location: string | null;
  organizer: string | null;
  /** A link that opens the appointment in Outlook, when the calendar gave one. */
  link: string | null;
};

export type MessageSource = "mail" | "slack";

/** Where an approved reply goes; the server sends it, never the model (T7). */
export type ReplyTarget =
  | { via: "mail"; messageId: string }
  | { via: "slack"; channel: string; threadTs: string | null };

/**
 * What the personal agent found in the world, one card each. `key` is `<source>:<source id>`, so
 * an item shows once however often a round finds it.
 */
export type DayItem =
  | {
      kind: "message"; key: string; source: MessageSource; title: string; from: string;
      /** One line: why this needs the person. */
      why: string;
      /** The agent's draft reply; null when it only needs reading. */
      draft: string | null;
      link: string | null; reply: ReplyTarget | null; at: number;
    }
  | {
      kind: "meeting"; key: string; meeting: Meeting;
      /** The preparation as Markdown; null while there is none. */
      prep: string | null;
      at: number;
    }
  | {
      kind: "commitment"; key: string; source: MessageSource | "notes";
      /** The promise in one sentence. */
      text: string;
      /** `mine`: the person promised it; `theirs`: someone promised it to the person. */
      who: "mine" | "theirs";
      person: string | null;
      due: string | null;
      /** The brain the to-do would go to; null for the personal brain. */
      brainId: string | null;
      link: string | null; at: number;
    };

export type PlanBlock = { start: string; end: string; label: string; todoId: string | null };

/** The day plan the morning round proposes; the person approves it with one click. */
export type DayPlan = { date: string; top: string[]; blocks: PlanBlock[]; approved: boolean };

export type Focus = { todoId: string | null; title: string; brainId: string | null; chatId: string | null; startedAt: number };

export type ConnectorState = "off" | "ok" | "not_configured" | "error";
export type ConnectorStatus = { state: ConnectorState; detail: string | null; checkedAt: number | null };

export type TodaySettings = {
  /** The whole feature (T10). Off: Vandaag is as it was and no round runs. */
  enabled: boolean;
  calendar: boolean;
  mail: boolean;
  slack: boolean;
  /** The LiteLLM model the rounds run on. */
  model: string;
  /** The person's `@name` in project brains; null: taken from `team.md` or the git author. */
  handle: string | null;
  /** How the local MS365 MCP server starts (stdio). */
  ms365Command: string;
  /** The local Slack CLI (a script that prints JSON). */
  slackCommand: string;
  workStartHour: number;
  workEndHour: number;
};

export type AgentRound = { system: string; name: string; state: "active" | "inactive" | "needs_attention" | "archived"; nextRunAt: number | null; lastRunAt: number | null; lastStatus: string | null; model: string | null };

/** A brain whose to-dos still stand in prose (T9). */
export type CleanupCandidate = { brainId: string; brainName: string; brainKind: BrainKind; lines: number };

export type TodayView = {
  enabled: boolean;
  /** Why the feature cannot run although it is on (no personal brain yet); a sentence for the person. */
  blocked: string | null;
  /** The handles that count as "mine" in project brains. */
  handles: string[];
  start: StartHere | null;
  upcoming: UpcomingRow[];
  items: DayItem[];
  plan: DayPlan | null;
  focus: Focus | null;
  cleanup: CleanupCandidate[];
  /** Open to-dos that are the person's, and the unassigned ones in project brains. */
  counts: { mine: number; backlog: number; inbox: number };
  connectors: { calendar: ConnectorStatus; mail: ConnectorStatus; slack: ConnectorStatus };
  rounds: AgentRound[];
};

/** What the app turns into a new chat (the server writes the prompt, the app starts the chat). */
export type ChatStart = { projectId: string; title: string; prompt: string; model: string | null };

export const DEFAULT_MODEL = "gpt-6-luna";
export const DEFAULT_MS365_COMMAND = "npx -y @softeria/ms-365-mcp-server";
/** How often "Niet nu" gives another to-do per day (T4: after that the choosing stops). */
export const MAX_SKIPS = 3;

export const DEFAULT_SETTINGS: TodaySettings = {
  enabled: false, calendar: false, mail: false, slack: false,
  model: DEFAULT_MODEL, handle: null, ms365Command: DEFAULT_MS365_COMMAND, slackCommand: "",
  workStartHour: 8, workEndHour: 18,
};
