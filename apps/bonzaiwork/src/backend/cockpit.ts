/**
 * The cockpit domain: everything the "decision-first cockpit" screens add on top of projects and
 * chats. To-dos and the inbox, runs that follow a werkwijze in stages, approvals for anything that
 * leaves the app, the Library with its shelves, the activity log and the sent log, the day plan.
 *
 * Screens talk to `Backend.cockpit` only. The demo implements all of it; the live backend serves
 * what the local server and this device can answer and reports the rest as locked through
 * `CockpitCapabilities`, so a screen keeps its control visible with the reason (DESIGN.md P4).
 *
 * Times are epoch milliseconds. Free text is Dutch and already written for the person.
 */

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

/** Why a cockpit area cannot work here; null when it can. Dutch, one sentence, names who can change it. */
export type LockReason = string | null;

export type CockpitCapabilities = {
  todos: LockReason;
  inbox: LockReason;
  /** Mail suggestions and flags need the mail connection. */
  mail: LockReason;
  calendar: LockReason;
  runs: LockReason;
  approvals: LockReason;
  library: LockReason;
  activity: LockReason;
  dayPlan: LockReason;
};

// ---------------------------------------------------------------------------
// People and sources
// ---------------------------------------------------------------------------

export type Person = {
  name: string;
  /** Mail address, when it matters (an external recipient). */
  address: string | null;
  /** "Extern", or the colleague's team. */
  org: string;
  external: boolean;
};

export type SourceKind = "email" | "ticket" | "calendar" | "library" | "decision" | "file" | "chat" | "web" | "link";

/** Something work is based on: an email, a ticket, a Library page, a decision. */
export type SourceRef = {
  id: string;
  kind: SourceKind;
  title: string;
  /** "Extern · Outlook · 3 nov 16:12", "Iedereen in het team · gecontroleerd 4 nov". */
  meta: string;
  href: string | null;
};

// ---------------------------------------------------------------------------
// To-dos and waiting-for
// ---------------------------------------------------------------------------

export type DueKind = "deadline" | "due";

export type Todo = {
  id: string;
  title: string;
  projectId: string | null;
  /** Where it came from: "uit de mail van Lars van Dijk", "HubSpot DKS-142". */
  origin: string | null;
  external: boolean;
  due: { kind: DueKind; at: number } | null;
  done: boolean;
  doneAt: number | null;
  /** Today's list: the person accepted it for today (or it is due). */
  today: boolean;
  /** Times it was carried over to the next day without being done. */
  rolledOver: number;
  /** The run this to-do was delegated to. */
  runId: string | null;
  createdAt: number;
};

export type TodoInput = Pick<Todo, "title" | "projectId" | "due"> & { origin?: string | null; external?: boolean; today?: boolean };
export type TodoPatch = Partial<Pick<Todo, "title" | "projectId" | "due" | "done" | "today" | "runId">>;

export type WaitingFor = {
  id: string;
  title: string;
  person: Person;
  projectId: string | null;
  askedAt: number;
};

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

export type InboxKind = "mail" | "waiting" | "captured" | "agent";

export type InboxItem = {
  id: string;
  kind: InboxKind;
  title: string;
  projectId: string | null;
  /** The project the agent suggests (from the sender's domain); null when none. */
  suggestedProjectId: string | null;
  deadline: number | null;
  receivedAt: number;
  /** For mail: the sender; for waiting-for: who you wait on. */
  from: Person | null;
  /** "Waarom hier: een verzoek met een datum, aan jou gericht". */
  why: string | null;
  /** "Pilotscope" subject, ticket title, the run it came from. */
  sourceLabel: string | null;
  mail: { subject: string; body: string; thread: number; imagesOff: boolean } | null;
  /** A to-do that looks like the same thing. */
  duplicateOf: { todoId: string; title: string } | null;
};

export type InboxDecision =
  | { kind: "accept"; title: string; projectId: string | null; deadline: number | null; flagMail: boolean }
  | { kind: "link"; todoId: string }
  | { kind: "snooze"; until: number }
  | { kind: "dismiss" };

// ---------------------------------------------------------------------------
// Werkwijzen (run recipes) and permissions
// ---------------------------------------------------------------------------

/** One line of what a run may do: allowed, never, or only with your approval. */
export type PermissionGrant = { kind: "allow" | "deny" | "ask"; text: string };

export type Werkwijze = {
  id: string;
  name: string;
  version: number;
  /** Where this version comes from; a project version wins over yours, yours over the app's. */
  origin: "project" | "personal" | "app";
  projectId: string | null;
  stages: string[];
  grants: PermissionGrant[];
  /** Runs bill to the project key, or your personal key (agent chats). */
  key: "project" | "personal";
  /** "Werkwijze · projectkey" for the settings cards. */
  label: string;
};

export type RiskClass = "R0" | "R1" | "R2" | "R3" | "R4" | "R5";
export type RiskEffect = "allow" | "allow_undo" | "ask" | "deny" | "locked";

export type RiskRule = {
  risk: RiskClass;
  action: string;
  className: string;
  effect: RiskEffect;
  /** The choices offered for this class; empty when fixed. */
  choices: Array<"allow" | "ask" | "deny">;
  /** Why a choice is unavailable or fixed ("Vast door het teambeleid"). */
  note: string | null;
};

export type Denial = { id: string; title: string; runId: string; at: number; reason: "unclassified" | "rule"; detail: string };

export type AgentSettings = {
  selfCheck: { ok: boolean; at: number; text: string };
  werkwijzen: Werkwijze[];
  safeDefault: PermissionGrant[];
  caps: { money: number; currency: string; toolCalls: number; minutes: number };
  rules: RiskRule[];
  denials: Denial[];
  /** "1 mogelijke tegenspraak tussen Alleen jij en het team". */
  contradictions: number;
};

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export type RunStatus = "review" | "question" | "working" | "failed" | "done" | "issues" | "draft" | "interrupted" | "stopped";

export type StageState = "done" | "review" | "working" | "pending" | "failed";

export type RunCheck = { result: "pass" | "care" | "fail"; text: string };

export type RunStage = {
  title: string;
  state: StageState;
  /** "Geaccepteerd · 1 wijziging · wo 16:02", "Wacht op jouw controle". */
  note: string | null;
  /** The file this stage produced ("01-scope.md"). */
  artifact: string | null;
};

/** The artifact a stage waits on, with its checks and what it was built from. */
export type StageReview = {
  stageIndex: number;
  file: string;
  /** "Sinds stap 1: + 3 besluiten, + 4 actiepunten". */
  delta: string | null;
  /** Markdown. `[[let op: …]]` marks a sentence the agent is unsure about. */
  body: string;
  /** The person's edits so far, as Markdown, or null. */
  edits: string | null;
  /** The same stage's output from the last run, for "vs vorige run". */
  previous: string | null;
  checks: RunCheck[];
  builtFrom: SourceRef[];
  citations: string | null;
};

export type RunQuestion = { text: string; options: string[]; deadline: number | null; consequence: string };

export type RunInterruption = {
  /** "Laptop sliep om 13:42 · weer open 14:10". */
  cause: string;
  happened: Array<{ label: string; text: string; tone: "done" | "saved" | "not_done" | "external" }>;
  /** The outbound item whose result is unknown. */
  outbound: OutboundEntry | null;
  timeline: Array<{ at: number; text: string; state: "done" | "unknown" | "failed" }>;
  whyNoRetry: string;
};

export type Run = {
  id: string;
  title: string;
  projectId: string | null;
  werkwijzeId: string | null;
  werkwijzeName: string;
  status: RunStatus;
  /** "Stap 4 van 4", "Stap 3 van 5 · leest 4 bronnen". */
  progress: string;
  /** "Jij: controleer \"Notitie schrijven\"" or "Niets". */
  waitingOn: string;
  waitingDetail: string | null;
  due: number | null;
  updatedAt: number;
  startedAt: number;
  /** The chat that started it, where its card lives. */
  chatRef: { projectId: string; chatId: string } | null;
  /** Where it came from ("van de to-do \"Optie-overzicht naar Lars sturen\""). */
  origin: string | null;
  stages: RunStage[];
  review: StageReview | null;
  question: RunQuestion | null;
  interruption: RunInterruption | null;
  grants: PermissionGrant[];
  budget: { spent: number; cap: number; currency: string; keyAlias: string; keyLeft: number; resetsAt: number | null } | null;
  /** What needs its own approval after this run. */
  after: string[];
  toolCalls: number;
  /** Instructions queued for the next stage. */
  queued: string[];
};

export type RunAction = "accept" | "edit" | "rerun" | "abandon" | "stop" | "resume" | "skip_review" | "continue";

export type ContextItem = { id: string; kind: SourceKind; title: string; meta: string };

export type DelegateDraft = {
  todoId: string | null;
  title: string;
  projectId: string | null;
  due: number | null;
  goal: string;
  goalSuggested: boolean;
  werkwijzeId: string | null;
  context: ContextItem[];
  constraints: Array<{ text: string; by: "agent" | "werkwijze" | "you" }>;
  output: string;
  offerToShelf: boolean;
  caps: { money: number; currency: string; toolCalls: number; minutes: number };
  typicalCost: string | null;
};

// ---------------------------------------------------------------------------
// Approvals and the sent log
// ---------------------------------------------------------------------------

export type ApprovalKind = "email" | "library" | "calendar";

export type MailDraft = {
  from: string;
  to: Person[];
  cc: Array<Person & { addedByAgent: boolean; reason: string | null; decision: "keep" | "remove" | null }>;
  subject: string;
  attached: string | null;
  /** Markdown. `[[let op: …]]` marks a sentence the agent is unsure about. */
  body: string;
  replyingTo: { from: string; at: number; body: string } | null;
};

export type LibraryChange = {
  shelfId: string;
  pageTitle: string;
  section: string | null;
  /** Lines: unchanged, added or removed. */
  diff: Array<{ op: "same" | "add" | "remove"; text: string }>;
};

export type Approval = {
  id: string;
  kind: ApprovalKind;
  risk: RiskClass;
  /** "Optie-overzicht naar Lars sturen". */
  title: string;
  /** "Stuurt een e-mail naar 1 externe persoon". */
  headline: string;
  /** "Kan na de wachttijd van 20 s niet worden teruggehaald." */
  consequence: string;
  /** "Extern · verlaat het team", "Zichtbaar voor het team". */
  audience: string;
  projectId: string | null;
  runId: string | null;
  status: "open" | "approved" | "declined" | "snoozed";
  holdSeconds: number;
  /** How it was made ("Opgesteld door de agent in RUN-0421 …"). */
  provenance: string;
  mail: MailDraft | null;
  library: { changes: LibraryChange[]; reviewers: string[] } | null;
  calendar: { events: Array<{ start: number; end: number; title: string }>; showAs: string; titleSeen: string } | null;
  createdAt: number;
};

export type ApprovalDecision =
  | { kind: "approve"; ccDecisions?: Record<string, "keep" | "remove"> }
  | { kind: "decline"; note: string | null }
  | { kind: "snooze"; until: number };

export type OutboundStatus = "held" | "sent" | "published" | "unknown" | "undone" | "declined" | "accepted";

export type OutboundEntry = {
  id: string;
  title: string;
  kind: ApprovalKind;
  /** "Aan Lars van Dijk · Extern" and a second line ("Cc Fleur Jansen · team"). */
  target: [string, string | null];
  status: OutboundStatus;
  statusText: string;
  /** "Jij hebt aangepast en goedgekeurd". */
  decidedBy: string;
  at: number;
  steps: Array<{ at: number; title: string; detail: string }>;
  projectId: string | null;
};

export type ActivityActor = "you" | "agent" | "colleague" | "app";

export type ActivityEntry = {
  id: string;
  at: number;
  actor: ActivityActor;
  actorName: string;
  text: string;
  /** What it was based on. */
  basis: string | null;
  projectId: string | null;
  runId: string | null;
};

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

export type ShelfAudience = "personal" | "team" | "everyone";

export type Shelf = {
  id: string;
  name: string;
  audience: ShelfAudience;
  /** "Persoonlijk", "Klant: Bakkerij Van Dijk", "Team". */
  tag: string;
  description: string;
  newest: string | null;
  projectId: string | null;
};

export type LibraryPage = {
  id: string;
  title: string;
  shelfId: string;
  kind: "note" | "decision" | "checklist" | "howto";
  owner: string;
  verified: { by: string; at: number } | null;
  checkDue: number | null;
  /** "controledatum verstreken", "een bron is gewijzigd sinds 2 okt". */
  stale: string | null;
  /** Markdown. */
  body: string;
  sources: SourceRef[];
  comments: Array<{ id: string; author: string; at: number; text: string; anchor: string | null }>;
  history: Array<{ at: number; who: string; text: string }>;
  updatedAt: number;
  addedBy: string;
};

export type LibraryRequest = {
  id: string;
  kind: "change" | "check";
  title: string;
  detail: string;
  shelfId: string;
  /** For a change: the approval or proposal to open; for a check: the page. */
  approvalId: string | null;
  pageId: string | null;
};

export type LibraryProposal = {
  id: string;
  title: string;
  shelfId: string;
  from: string;
  runId: string | null;
  audience: string;
  reason: string;
  changes: LibraryChange[];
  checks: RunCheck[];
  status: "open" | "accepted" | "rejected";
  createdAt: number;
};

export type LibraryAnswer = { text: string; citations: Array<{ pageId: string; title: string; shelf: string }> };

// ---------------------------------------------------------------------------
// Today, plan and calendar
// ---------------------------------------------------------------------------

export type CalendarEvent = { id: string; start: number; end: number; title: string; proposed: boolean };

export type AwayGroup = { projectId: string | null; label: string; lines: string[]; link: { label: string; href: string } };

export type NeedsYouKind = "review" | "question" | "approval";

/** One decision only the person can make: the Needs you band. */
export type NeedsYou = {
  id: string;
  kind: NeedsYouKind;
  /** "Offertes 2026", "Iedereen in het team". */
  context: string;
  title: string;
  detail: string;
  action: string;
  href: string;
  at: number;
};

export type DayPlan = {
  proposedAt: number;
  freeMinutes: number;
  plannedMinutes: number;
  carryOver: Array<{ todoId: string; title: string; rolledOver: number; choice: "today" | "later" | "drop" }>;
  order: Array<{ todoId: string; title: string; change: "added" | "moved_up" | null; note: string; included: boolean }>;
  judgement: { todoId: string; text: string; toDate: number } | null;
  calendar: CalendarEvent[];
  notProposed: Array<{ todoId: string; title: string; reason: string }>;
  blocks: { count: number; showAs: string; titleSeen: string } | null;
};

export type PlanCommit = {
  carryOver: Record<string, "today" | "later" | "drop">;
  included: string[];
  acceptJudgement: boolean;
};

// ---------------------------------------------------------------------------
// Projects (the cockpit's view of a project)
// ---------------------------------------------------------------------------

export type ProjectState = "active" | "on_hold" | "completed";

export type Area = { id: string; name: string; client: string | null };

export type ProjectBrief = {
  projectId: string;
  area: Area;
  state: ProjectState;
  goal: string | null;
  doneWhen: string | null;
  target: number | null;
  keyAlias: string | null;
  /** Budget left on the project key, 0–100; null when unknown. */
  keyLeft: number | null;
  /** The decision waiting on you here ("1 controle", "1 antwoord"). */
  needsYou: string | null;
  waitingOnYou: { title: string; href: string; action: string } | null;
  changes: Array<{ at: number; text: string }>;
  lastVisitAt: number | null;
  sources: SourceRef[];
  decisions: Array<{ id: string; title: string; state: string; body: string }>;
  outputs: Array<{ id: string; title: string; meta: string; runId: string | null }>;
};

export type ProjectBriefPatch = Partial<Pick<ProjectBrief, "goal" | "doneWhen" | "target" | "state">> & { areaId?: string };

/** Everything still open when a project is completed: the review sheet. */
export type ProjectReview = {
  open: Array<{ id: string; title: string; kind: "todo" | "waiting"; detail: string | null; choice: "done" | "move" | "cancel" | "keep" | null }>;
  agentWork: { summary: string; unreviewed: Array<{ id: string; title: string; meta: string }> };
  decisions: Array<{ id: string; title: string; body: string; choice: "personal" | "shelf" | "skip" | null }>;
  learnings: Array<{ id: string; title: string; diff: Array<{ op: "same" | "add" | "remove"; text: string }>; removed: number; include: boolean }>;
  outside: string | null;
};

export type ProjectReviewCommit = {
  open: Record<string, "done" | "move" | "cancel" | "keep">;
  decisions: Record<string, "personal" | "shelf" | "skip">;
  learnings: string[];
  final: "completed" | "cancelled";
};

/** A new project from a chat: everything the agent suggests, nothing applied until created. */
export type ProjectProposal = {
  fromChat: { projectId: string; chatId: string; title: string; startedAt: number } | null;
  title: string;
  goal: string;
  doneWhen: string;
  areaId: string;
  target: number | null;
  sources: Array<{ id: string; title: string; meta: string; pinned: boolean }>;
  todos: Array<{ id: string; title: string; due: number | null; include: boolean; duplicateOf: string | null }>;
};

// ---------------------------------------------------------------------------
// Status line and search
// ---------------------------------------------------------------------------

export type StatusLine = {
  library: string;
  keys: string;
  mail: string | null;
  runs: string | null;
  outbound: string;
  /** Something leaving the app needs a look (an unknown outcome). */
  outboundAlert: boolean;
};

export type SearchHit = {
  id: string;
  group: "do" | "work" | "library";
  kind: "project" | "run" | "todo" | "page" | "mail" | "chat";
  title: string;
  meta: string;
  href: string;
};

// ---------------------------------------------------------------------------
// The interface
// ---------------------------------------------------------------------------

export interface CockpitBackend {
  readonly capabilities: CockpitCapabilities;

  status(): Promise<StatusLine>;
  needsYou(): Promise<NeedsYou[]>;
  away(since: number): Promise<AwayGroup[]>;
  calendar(day: number): Promise<CalendarEvent[]>;

  todos: {
    list(): Promise<Todo[]>;
    create(input: TodoInput): Promise<Todo>;
    update(todoId: string, patch: TodoPatch): Promise<Todo>;
    remove(todoId: string): Promise<void>;
    waiting(): Promise<WaitingFor[]>;
  };

  inbox: {
    list(): Promise<InboxItem[]>;
    decide(itemId: string, decision: InboxDecision): Promise<void>;
    /** Quick capture: lands in the inbox, never straight in a project (FLOW-02). */
    capture(text: string, projectId: string | null): Promise<InboxItem>;
  };

  plan: {
    get(): Promise<DayPlan | null>;
    commit(choices: PlanCommit): Promise<void>;
  };

  runs: {
    list(): Promise<Run[]>;
    get(runId: string): Promise<Run | null>;
    act(runId: string, action: RunAction, note?: string | null): Promise<Run>;
    answer(runId: string, answer: string): Promise<Run>;
    steer(runId: string, instruction: string): Promise<Run>;
    /** A brief for a to-do (or an empty one), with the agent's suggestions filled in. */
    draft(todoId: string | null, goal?: string | null): Promise<DelegateDraft>;
    start(draft: DelegateDraft): Promise<Run>;
    werkwijzen(projectId: string | null): Promise<Werkwijze[]>;
  };

  approvals: {
    list(): Promise<Approval[]>;
    get(approvalId: string): Promise<Approval | null>;
    decide(approvalId: string, decision: ApprovalDecision): Promise<OutboundEntry | null>;
    /** Undo during the hold. */
    undo(outboundId: string): Promise<void>;
    /** Resolves an unknown outcome after the person checked. */
    resolve(outboundId: string, outcome: "sent" | "not_sent" | "later"): Promise<void>;
  };

  activity: {
    list(): Promise<ActivityEntry[]>;
    sent(): Promise<OutboundEntry[]>;
  };

  library: {
    shelves(): Promise<Shelf[]>;
    pages(shelfId: string | null): Promise<LibraryPage[]>;
    page(pageId: string): Promise<LibraryPage | null>;
    requests(): Promise<LibraryRequest[]>;
    proposals(): Promise<LibraryProposal[]>;
    proposal(proposalId: string): Promise<LibraryProposal | null>;
    decide(proposalId: string, decision: "accept" | "reject"): Promise<void>;
    verify(pageId: string): Promise<LibraryPage>;
    ask(question: string): Promise<LibraryAnswer>;
  };

  projects: {
    areas(): Promise<Area[]>;
    briefs(): Promise<ProjectBrief[]>;
    brief(projectId: string): Promise<ProjectBrief | null>;
    updateBrief(projectId: string, patch: ProjectBriefPatch): Promise<ProjectBrief>;
    proposal(fromChat: { projectId: string; chatId: string } | null): Promise<ProjectProposal>;
    review(projectId: string): Promise<ProjectReview>;
    complete(projectId: string, commit: ProjectReviewCommit): Promise<void>;
  };

  settings: {
    agent(): Promise<AgentSettings>;
    setRisk(risk: RiskClass, effect: "allow" | "ask" | "deny"): Promise<AgentSettings>;
  };

  search(query: string): Promise<SearchHit[]>;
}
