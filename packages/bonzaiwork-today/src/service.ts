import { cleanupPrompt, startPrompt } from "./agent.ts";
import { ConnectorError, type MailSummary, type Ms365, type SlackCli } from "./connectors.ts";
import { isDate, ownHandles, type TeamMember } from "./notation.ts";
import { localDate, meetingIsNear, pickStart, upcomingRows, visibleItems } from "./rank.ts";
import { addTodo, parkThought, readInbox, readTeam, removeInboxEntry, scanBrain, setTodoDone, type BrainFolder, type InboxEntry } from "./scan.ts";
import { readSettings, type TodayStore } from "./store.ts";
import {
  MAX_SKIPS, type AgentRound, type ChatStart, type CleanupCandidate, type ConnectorStatus, type DayItem, type DueKind, type Focus, type Meeting, type PlanBlock, type ReplyTarget,
  type TodaySettings, type Todo, type TodayView,
} from "./types.ts";

/**
 * Everything Vandaag does, for the routes and for the agent's tools alike (plan §2–§5): the index
 * over the brains, the choosing, the cards, and the two actions that reach the outside world
 * (a reply by mail or Slack), which only run on the person's click.
 */
export type Author = { name: string; email: string };

export type TodayDeps = {
  store: TodayStore;
  /** Every brain folder on this laptop. */
  brains(): Promise<BrainFolder[]>;
  author(): Author | null;
  /** BonzaiWork changed a file in this brain outside a chat: record it (and share it as the brain's mode says). */
  changed(brainId: string): Promise<void>;
  ms365: Ms365;
  slack: SlackCli;
  now(): number;
  /** `BONZAIWORK_TODAY=0`: the feature is off whatever the settings say. */
  killed: boolean;
  rounds(): AgentRound[];
  log(level: "info" | "warn" | "error", message: string, fields?: Record<string, unknown>): void;
};

export class TodayError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

const MEETINGS_EVERY_MS = 5 * 60_000;
const MEETING_HORIZON_MS = 8 * 24 * 60 * 60_000;
const OFF: ConnectorStatus = { state: "off", detail: null, checkedAt: null };

type Scan = { brains: BrainFolder[]; todos: Todo[]; handles: string[]; cleanup: CleanupCandidate[]; inbox: InboxEntry[] };

export function createTodayService(deps: TodayDeps) {
  const { store } = deps;
  let meetings: Meeting[] = [];
  let meetingsAt = 0;
  let meetingsLoading: Promise<void> | null = null;
  const status: { calendar: ConnectorStatus; mail: ConnectorStatus; slack: ConnectorStatus } = { calendar: OFF, mail: OFF, slack: OFF };

  const settings = (): TodaySettings => ({ ...store.state.settings, enabled: store.state.settings.enabled && !deps.killed });
  const enabled = () => settings().enabled;
  const fail = (error: unknown): ConnectorStatus => ({ state: "error", detail: error instanceof Error ? error.message : String(error), checkedAt: deps.now() });

  function connector(kind: "calendar" | "mail" | "slack"): ConnectorStatus {
    const current = settings();
    if (!current.enabled || !current[kind]) return OFF;
    const command = kind === "slack" ? current.slackCommand : current.ms365Command;
    if (!command.trim()) return { state: "not_configured", detail: null, checkedAt: null };
    return status[kind].state === "off" ? { state: "ok", detail: null, checkedAt: null } : status[kind];
  }

  function requireConnector(kind: "calendar" | "mail" | "slack"): void {
    const state = connector(kind).state;
    const name = kind === "calendar" ? "de agenda" : kind === "mail" ? "mail" : "Slack";
    if (state === "off") throw new TodayError(409, "connector_off", `De koppeling met ${name} staat uit. De gebruiker zet haar aan bij Instellingen → Persoonlijke agent.`);
    if (state === "not_configured") throw new TodayError(409, "connector_not_configured", `De koppeling met ${name} is nog niet ingesteld.`);
  }

  async function scan(): Promise<Scan> {
    const brains = await deps.brains();
    const teams: TeamMember[] = (await Promise.all(brains.filter((brain) => brain.kind === "project").map((brain) => readTeam(brain.root)))).flat();
    const handles = ownHandles({ handle: settings().handle, author: deps.author(), teams });
    const scans = await Promise.all(brains.map((brain) => scanBrain(brain, handles)));
    const personal = brains.find((brain) => brain.kind === "personal");
    return {
      brains, handles,
      todos: scans.flatMap((entry) => entry.todos),
      cleanup: brains.flatMap((brain, index): CleanupCandidate[] => {
        const lines = scans[index]?.proseLines ?? 0;
        return lines > 0 && !brain.readOnly ? [{ brainId: brain.id, brainName: brain.name, brainKind: brain.kind, lines }] : [];
      }),
      inbox: personal ? await readInbox(personal.root) : [],
    };
  }

  /** The appointments of the coming week, refreshed in the background so a slow calendar never holds the page. */
  function refreshMeetings(force = false): Promise<void> {
    if (connector("calendar").state === "off" || connector("calendar").state === "not_configured") {
      meetings = [];
      return Promise.resolve();
    }
    if (meetingsLoading) return meetingsLoading;
    if (!force && deps.now() - meetingsAt < MEETINGS_EVERY_MS) return Promise.resolve();
    const from = deps.now() - 60 * 60_000;
    meetingsLoading = deps.ms365.events(from, from + MEETING_HORIZON_MS)
      .then((found) => { meetings = found; status.calendar = { state: "ok", detail: null, checkedAt: deps.now() }; })
      .catch((error: unknown) => { status.calendar = fail(error); deps.log("warn", "Calendar not read", { error: String(error) }); })
      .finally(() => { meetingsAt = deps.now(); meetingsLoading = null; });
    return meetingsLoading;
  }

  function items(now: number): DayItem[] {
    const stored = visibleItems(store.current(now), now);
    const shown = new Set(stored.map((item) => item.key));
    // An appointment that starts soon shows also without a preparation: the card says when and where.
    const near = meetings.filter((meeting) => meetingIsNear(meeting, now)).flatMap((meeting): DayItem[] => {
      const key = `meeting:${meeting.id}`;
      return shown.has(key) || store.state.dismissed[key] !== undefined || (store.state.later[key] ?? 0) > now ? [] : [{ kind: "meeting", key, meeting, prep: null, at: meeting.start }];
    });
    return [...stored, ...near];
  }

  async function view(): Promise<TodayView> {
    const now = deps.now();
    const today = localDate(now);
    const base = { handles: [], start: null, upcoming: [], items: [], plan: null, focus: null, cleanup: [], counts: { mine: 0, backlog: 0, inbox: 0 }, connectors: { calendar: OFF, mail: OFF, slack: OFF }, rounds: [] };
    if (!enabled()) return { enabled: false, blocked: null, ...base };
    store.prune(now, today);
    const found = await scan();
    if (!found.brains.some((brain) => brain.kind === "personal")) {
      return { enabled: true, blocked: "Maak eerst je persoonlijke brein aan (Jouw brein). De persoonlijke agent werkt van daaruit.", ...base, handles: found.handles };
    }
    void refreshMeetings();
    const open = found.todos.filter((todo) => !todo.done);
    const skipped = store.state.skips.date === today ? store.state.skips.ids : [];
    const plan = store.state.plan?.date === today ? store.state.plan : null;
    const picked = pickStart(open, { today, planTop: plan?.top ?? [], skipped });
    const step = picked ? store.state.steps[picked.todo.id] : undefined;
    return {
      enabled: true, blocked: null, handles: found.handles,
      start: picked ? { todo: picked.todo, reason: picked.reason, why: step?.why ?? null, firstStep: step?.step ?? null, skipsLeft: Math.max(0, MAX_SKIPS - skipped.length) } : null,
      upcoming: upcomingRows({ todos: found.todos, meetings, now }),
      items: items(now), plan, focus: store.state.focus, cleanup: found.cleanup,
      counts: { mine: open.filter((todo) => todo.mine).length, backlog: open.filter((todo) => !todo.mine && !todo.owner).length, inbox: found.inbox.length },
      connectors: { calendar: connector("calendar"), mail: connector("mail"), slack: connector("slack") },
      rounds: deps.rounds(),
    };
  }

  async function findTodo(id: string): Promise<{ todo: Todo; brain: BrainFolder; found: Scan }> {
    const found = await scan();
    const todo = found.todos.find((entry) => entry.id === id);
    const brain = todo ? found.brains.find((entry) => entry.id === todo.brainId) : undefined;
    if (!todo || !brain) throw new TodayError(404, "todo_not_found", "Deze taak staat niet meer in het brein.");
    return { todo, brain, found };
  }

  /** A brain by id or by (part of) its name; null when the name fits none or more than one. */
  function brainNamed(brains: readonly BrainFolder[], wanted: string | null): BrainFolder | null {
    const personal = brains.find((brain) => brain.kind === "personal") ?? null;
    const key = wanted?.trim().toLowerCase() ?? "";
    if (!key || /^(persoonlijk|mijn|eigen)/.test(key)) return personal;
    const byId = brains.find((brain) => brain.id === wanted);
    if (byId) return byId;
    const exact = brains.filter((brain) => brain.name.toLowerCase() === key);
    if (exact.length === 1) return exact[0] ?? null;
    const partial = brains.filter((brain) => brain.name.toLowerCase().includes(key));
    return partial.length === 1 ? partial[0] ?? null : null;
  }

  async function add(input: { text: string; brain: string | null; owner: string | null; due: string | null; dueKind: DueKind | null }): Promise<Todo> {
    const text = input.text.replace(/\s+/g, " ").trim().slice(0, 500);
    if (!text) throw new TodayError(400, "invalid_todo", "Een taak heeft tekst nodig.");
    if (input.due && !isDate(input.due)) throw new TodayError(400, "invalid_date", "Gebruik een datum als 2026-11-20.");
    const found = await scan();
    const brain = brainNamed(found.brains, input.brain);
    if (!brain) throw new TodayError(404, "brain_not_found", "Dat brein staat niet op deze laptop.");
    // In a shared brain a to-do the person adds is theirs, unless it names someone.
    const owner = input.owner?.trim() || (brain.kind === "project" ? found.handles[0] ?? null : null);
    const written = await addTodo(brain, { text, owner, due: input.due, dueKind: input.due ? input.dueKind ?? "deadline" : null });
    if (!written.ok) throw new TodayError(409, written.reason, written.reason === "read_only" ? "Dit brein is alleen-lezen." : "De taak kon niet worden opgeslagen.");
    await deps.changed(brain.id);
    const own = new Set(found.handles);
    return { ...written.todo, brainName: brain.name, brainKind: brain.kind, mine: written.todo.owner ? own.has(written.todo.owner) : brain.kind === "personal" };
  }

  async function setDone(id: string, done: boolean): Promise<Todo> {
    const { todo, brain } = await findTodo(id);
    const written = await setTodoDone(brain, id, todo.path, done);
    if (!written.ok) throw new TodayError(409, written.reason, written.reason === "read_only" ? "Dit brein is alleen-lezen." : "Deze taak is intussen veranderd; kijk opnieuw.");
    if (done && store.state.focus?.todoId === id) store.state.focus = null;
    delete store.state.steps[id];
    await store.save();
    await deps.changed(brain.id);
    return { ...todo, done };
  }

  async function startFocus(todoId: string, chatId: string | null): Promise<{ focus: Focus; chat: ChatStart }> {
    const { todo } = await findTodo(todoId);
    const step = store.state.steps[todoId];
    const focus: Focus = store.state.focus?.todoId === todoId
      ? { ...store.state.focus, chatId: chatId ?? store.state.focus.chatId }
      : { todoId, title: todo.text, brainId: todo.brainId, chatId, startedAt: deps.now() };
    store.state.focus = focus;
    await store.save();
    return {
      focus,
      chat: { projectId: todo.brainId, title: todo.text.slice(0, 80), model: null, prompt: startPrompt({ text: todo.text, path: todo.path, brainName: todo.brainName, firstStep: step?.step ?? null, due: todo.due }) },
    };
  }

  function item(key: string): DayItem {
    const found = store.state.items.find((entry) => entry.key === key) ?? items(deps.now()).find((entry) => entry.key === key);
    if (!found) throw new TodayError(404, "item_not_found", "Deze kaart is er niet meer.");
    return found;
  }

  /** The one place a message leaves the laptop: the person clicked "Versturen" on this card (T7). */
  async function send(key: string, text: string | null): Promise<void> {
    const found = item(key);
    if (found.kind !== "message" || !found.reply) throw new TodayError(409, "no_reply", "Op deze kaart is geen antwoord te versturen.");
    const body = (text ?? found.draft ?? "").trim();
    if (!body) throw new TodayError(400, "empty_reply", "Schrijf eerst een antwoord.");
    requireConnector(found.reply.via);
    try {
      if (found.reply.via === "mail") await deps.ms365.reply(found.reply.messageId, body);
      else await deps.slack.send(found.reply.channel, found.reply.threadTs, body);
    } catch (error) {
      status[found.reply.via] = fail(error);
      throw new TodayError(502, "send_failed", `Versturen lukte niet: ${error instanceof Error ? error.message : String(error)}`);
    }
    store.dismiss(key, deps.now());
    await store.save();
    deps.log("info", "Reply sent from Vandaag", { via: found.reply.via });
  }

  async function acceptCommitment(key: string): Promise<Todo> {
    const found = item(key);
    if (found.kind !== "commitment") throw new TodayError(409, "not_a_commitment", "Deze kaart is geen belofte.");
    const text = found.who === "theirs" ? `${found.person ? `${found.person}: ` : "Wacht op: "}${found.text}` : found.text;
    const todo = await add({ text, brain: found.brainId, owner: null, due: found.due, dueKind: found.who === "theirs" ? "waiting" : "deadline" });
    store.dismiss(key, deps.now());
    await store.save();
    return todo;
  }

  /** "Later": the card is back tomorrow at the start of the working day. */
  async function later(key: string): Promise<void> {
    item(key);
    const next = new Date(deps.now());
    next.setDate(next.getDate() + 1);
    next.setHours(settings().workStartHour, 0, 0, 0);
    store.state.later[key] = next.getTime();
    await store.save();
  }

  async function checkConnectors(): Promise<TodayView["connectors"]> {
    const current = settings();
    const run = async (kind: "calendar" | "mail" | "slack", check: () => Promise<string>) => {
      if (connector(kind).state === "off" || connector(kind).state === "not_configured") { status[kind] = OFF; return; }
      status[kind] = await check().then((detail): ConnectorStatus => ({ state: "ok", detail, checkedAt: deps.now() })).catch(fail);
    };
    await Promise.all([
      run("calendar", () => deps.ms365.check()),
      run("mail", async () => `${(await deps.ms365.unread(5)).length} ongelezen (van de nieuwste 5)`),
      run("slack", () => deps.slack.check()),
    ]);
    if (current.calendar) void refreshMeetings(true);
    return { calendar: connector("calendar"), mail: connector("mail"), slack: connector("slack") };
  }

  const today = () => localDate(deps.now());

  return {
    settings, enabled, view, scan, add, setDone, startFocus, send, acceptCommitment, later, checkConnectors, refreshMeetings, requireConnector, brainNamed,

    async setSettings(patch: unknown): Promise<TodaySettings> {
      const before = store.state.settings;
      store.state.settings = readSettings(patch, before);
      if (before.ms365Command !== store.state.settings.ms365Command) { deps.ms365.dispose(); meetingsAt = 0; status.calendar = OFF; status.mail = OFF; }
      if (before.slackCommand !== store.state.settings.slackCommand) status.slack = OFF;
      await store.save();
      return settings();
    },

    /** "Niet nu": the next to-do; after MAX_SKIPS the first choice stands (T4). */
    async skip(id: string): Promise<void> {
      const date = today();
      const ids = store.state.skips.date === date ? store.state.skips.ids : [];
      if (ids.length < MAX_SKIPS && !ids.includes(id)) store.state.skips = { date, ids: [...ids, id] };
      await store.save();
    },

    async park(thought: string): Promise<InboxEntry> {
      const clean = thought.replace(/\s+/g, " ").trim().slice(0, 2000);
      if (!clean) throw new TodayError(400, "empty_thought", "Er is niets om te parkeren.");
      const personal = (await deps.brains()).find((brain) => brain.kind === "personal");
      if (!personal) throw new TodayError(409, "no_personal_brain", "Maak eerst je persoonlijke brein aan.");
      const entry = await parkThought(personal.root, clean, new Date(deps.now()));
      await deps.changed(personal.id);
      return entry;
    },

    async stopFocus(): Promise<void> {
      store.state.focus = null;
      await store.save();
    },

    async dismiss(key: string): Promise<void> {
      store.dismiss(key, deps.now());
      await store.save();
    },

    async approvePlan(): Promise<void> {
      if (store.state.plan?.date === today()) store.state.plan = { ...store.state.plan, approved: true };
      await store.save();
    },

    async dropPlan(): Promise<void> {
      store.state.plan = null;
      await store.save();
    },

    async cleanupStart(brainId: string): Promise<ChatStart> {
      const found = await scan();
      const brain = found.brains.find((entry) => entry.id === brainId);
      if (!brain) throw new TodayError(404, "brain_not_found", "Dat brein staat niet op deze laptop.");
      return { projectId: brain.id, title: "Taken opruimen", model: null, prompt: cleanupPrompt({ brainName: brain.name, handles: found.handles, shared: brain.kind === "project" }) };
    },

    // --- what only the agent's tools use ---------------------------------------------

    async reportMessage(input: { source: "mail" | "slack"; id: string; title: string; from: string; why: string; draft: string | null; link: string | null; channel: string | null; threadTs: string | null }): Promise<string> {
      requireConnector(input.source);
      if (!input.id.trim() || !input.why.trim()) throw new TodayError(400, "invalid_item", "Geef de id van het bericht en waarom het de gebruiker nodig heeft.");
      const reply: ReplyTarget | null = input.source === "mail" ? { via: "mail", messageId: input.id } : input.channel ? { via: "slack", channel: input.channel, threadTs: input.threadTs } : null;
      const result = store.report({
        kind: "message", key: `${input.source}:${input.id}`, source: input.source, title: input.title.trim().slice(0, 200) || (input.source === "mail" ? "(geen onderwerp)" : "Slack"),
        from: input.from.trim().slice(0, 120), why: input.why.replace(/\s+/g, " ").trim().slice(0, 300), draft: input.draft?.trim().slice(0, 6000) || null, link: input.link, reply, at: deps.now(),
      });
      await store.save();
      return result === "dismissed" ? "De gebruiker heeft dit bericht al afgehandeld; er komt geen nieuwe kaart." : result === "updated" ? "De kaart is bijgewerkt." : "De kaart staat bij de gebruiker.";
    },

    async reportPrep(meetingId: string, prep: string): Promise<string> {
      requireConnector("calendar");
      await refreshMeetings();
      const meeting = meetings.find((entry) => entry.id === meetingId);
      if (!meeting) throw new TodayError(404, "meeting_not_found", "Die afspraak staat niet in de agenda van de komende week. Gebruik de id uit agenda_lezen.");
      store.report({ kind: "meeting", key: `meeting:${meeting.id}`, meeting, prep: prep.trim().slice(0, 6000) || null, at: deps.now() });
      await store.save();
      return "De voorbereiding staat klaar; de kaart verschijnt een halfuur voor de afspraak.";
    },

    async proposeCommitment(input: { text: string; who: "mine" | "theirs"; person: string | null; due: string | null; source: "mail" | "slack" | "notes"; sourceId: string; brain: string | null; link: string | null }): Promise<string> {
      const text = input.text.replace(/\s+/g, " ").trim().slice(0, 300);
      if (!text || !input.sourceId.trim()) throw new TodayError(400, "invalid_item", "Geef de belofte in één zin en de id van het bericht waar ze staat.");
      if (input.due && !isDate(input.due)) throw new TodayError(400, "invalid_date", "Gebruik een datum als 2026-11-20.");
      const brain = input.brain ? brainNamed((await scan()).brains, input.brain) : null;
      const result = store.report({
        kind: "commitment", key: `belofte:${input.source}:${input.sourceId}:${text.toLowerCase().slice(0, 60)}`, source: input.source, text, who: input.who,
        person: input.person?.trim().slice(0, 80) || null, due: input.due, brainId: brain?.kind === "project" ? brain.id : null, link: input.link, at: deps.now(),
      });
      await store.save();
      return result === "dismissed" ? "De gebruiker besliste hier al over." : "Het voorstel staat bij de gebruiker; zet de belofte niet zelf als taak.";
    },

    async setStep(id: string, step: string, why: string): Promise<void> {
      await findTodo(id);
      store.state.steps[id] = { step: step.replace(/\s+/g, " ").trim().slice(0, 300) || null, why: why.replace(/\s+/g, " ").trim().slice(0, 200) || null, at: deps.now() };
      await store.save();
    },

    async proposePlan(top: readonly string[], blocks: readonly PlanBlock[]): Promise<void> {
      const known = new Set((await scan()).todos.map((todo) => todo.id));
      store.state.plan = {
        date: today(), approved: false, top: top.filter((id) => known.has(id)).slice(0, 3),
        blocks: blocks.filter((block) => /^\d{1,2}:\d{2}$/.test(block.start) && /^\d{1,2}:\d{2}$/.test(block.end) && block.label.trim()).slice(0, 12)
          .map((block) => ({ ...block, label: block.label.trim().slice(0, 120), todoId: block.todoId && known.has(block.todoId) ? block.todoId : null })),
      };
      await store.save();
    },

    async meetingsFor(days: number): Promise<Meeting[]> {
      requireConnector("calendar");
      await refreshMeetings(true);
      if (status.calendar.state === "error") throw new TodayError(502, "calendar_failed", status.calendar.detail ?? "De agenda is niet te lezen.");
      const until = deps.now() + Math.max(1, Math.min(days, 7)) * 24 * 60 * 60_000;
      return meetings.filter((meeting) => meeting.start < until);
    },

    /**
     * The unread mail a round has not read yet. A mail the agent read and did not report is not
     * offered again (unless `again`), so a full inbox costs its tokens once, not every round.
     */
    async unreadMail(limit: number, again = false): Promise<MailSummary[]> {
      requireConnector("mail");
      try {
        const found = await deps.ms365.unread(limit);
        status.mail = { state: "ok", detail: null, checkedAt: deps.now() };
        if (again) return found;
        const fresh = found.filter((mail) => store.state.seen[`mail:${mail.id}`] === undefined);
        for (const mail of fresh) store.state.seen[`mail:${mail.id}`] = deps.now();
        if (fresh.length) await store.save();
        return fresh;
      } catch (error) {
        status.mail = fail(error);
        throw new TodayError(502, "mail_failed", error instanceof ConnectorError ? error.message : "De mail is niet te lezen.");
      }
    },

    async mail(id: string): Promise<MailSummary | null> {
      requireConnector("mail");
      return deps.ms365.message(id);
    },

    async slackRead(read: (cli: SlackCli) => Promise<string>): Promise<string> {
      requireConnector("slack");
      try {
        const found = await read(deps.slack);
        status.slack = { state: "ok", detail: null, checkedAt: deps.now() };
        return found;
      } catch (error) {
        status.slack = fail(error);
        throw new TodayError(502, "slack_failed", error instanceof ConnectorError ? error.message : "Slack is niet te lezen.");
      }
    },

    async inbox(): Promise<InboxEntry[]> {
      return (await scan()).inbox;
    },

    async fileInbox(id: string): Promise<boolean> {
      const personal = (await deps.brains()).find((brain) => brain.kind === "personal");
      if (!personal || !(await removeInboxEntry(personal.root, id))) return false;
      await deps.changed(personal.id);
      return true;
    },
  };
}

export type TodayService = ReturnType<typeof createTodayService>;
