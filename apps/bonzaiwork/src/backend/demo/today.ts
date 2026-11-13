import {
  DEFAULT_SETTINGS, MAX_SKIPS, addDays, formatTodoLine, localDate, meetingIsNear, parseTodoLine, pickStart, upcomingRows, visibleItems,
  type AgentRound, type DayItem, type DayPlan, type Focus, type Meeting, type TodaySettings, type Todo, type TodayView,
} from "@bonzaiwork/today/model";

import { readLocalJson, writeLocalJson } from "~/lib/storage";

import { BackendError, type TodayBackend } from "../types";

/**
 * Vandaag's personal agent in the browser: seeded to-dos, a mail and a Slack thread with a draft,
 * a promise, an appointment that starts soon and a day plan. It chooses and groups with the same
 * functions as the server (`@bonzaiwork/today/model`). `?agent=uit` starts with the feature off,
 * `?agent=leeg` on but with nothing found yet.
 */
type DemoToday = {
  version: 1;
  settings: TodaySettings;
  todos: Todo[];
  items: DayItem[];
  later: Record<string, number>;
  skips: { date: string; ids: string[] };
  steps: Record<string, { step: string; why: string }>;
  plan: DayPlan | null;
  focus: Focus | null;
  inbox: string[];
};

type DemoProject = { id: string; name: string };

const HOUR = 60 * 60_000;

function seed(now: number, projects: readonly DemoProject[], mode: string | null): DemoToday {
  const today = localDate(now);
  const personal = "demo-persoonlijk";
  const first = projects[0] ?? { id: "demo-project", name: "Project" };
  const second = projects[1] ?? first;
  const line = (id: string, brain: DemoProject | null, text: string): Todo | null => {
    const parsed = parseTodoLine(text);
    if (!parsed) return null;
    return {
      ...parsed, id, brainId: brain?.id ?? personal, brainName: brain?.name ?? "Mijn brein", brainKind: brain ? "project" : "personal", path: "taken.md", line: 1,
      mine: parsed.owner ? parsed.owner === "ik" : !brain,
    };
  };
  const todos = mode === "leeg" ? [] : [
    line("t-offerte", first, `- [ ] Offerte voor de gemeente nalopen en versturen @ik 📅 ${addDays(today, -1)}`),
    line("t-prijslijst", first, `- [ ] Prijslijst 2027 bijwerken @ik 📅 ${today}`),
    line("t-wacht", second, `- [ ] Cijfers van Q3 van finance @ik ⏳ ${addDays(today, 2)}`),
    line("t-demo", second, `- [ ] Demo voorbereiden voor de klantdag @ik 📅 ${addDays(today, 4)}`),
    line("t-belasting", null, `- [ ] Aangifte nakijken 📅 ${addDays(today, 12)}`),
    line("t-boek", null, "- [ ] Hoofdstuk 3 uitlezen"),
    line("t-team", first, "- [ ] Website nalopen op oude prijzen"),
    line("t-ander", first, `- [ ] Contract nalezen @robin 📅 ${addDays(today, 1)}`),
  ].flatMap((todo) => (todo ? [todo] : []));
  const meeting: Meeting = { id: "m-klant", title: "Klantoverleg gemeente", start: now + 20 * 60_000, end: now + 80 * 60_000, allDay: false, location: "Zaal 2", organizer: "Robin de Vries", link: null };
  const items: DayItem[] = mode === "leeg" ? [] : [
    {
      kind: "meeting", key: "meeting:m-klant", meeting, at: now - HOUR,
      prep: "- Doel: akkoord op de offerte, of weten wat er nog mist\n- Beslissen: of de korting van 5% blijft staan\n- Open: de planning van de oplevering staat nog niet in het brein",
    },
    {
      kind: "message", key: "mail:demo-1", source: "mail", title: "Offerte akkoord?", from: "Robin de Vries", at: now - 2 * HOUR,
      why: "Robin wacht sinds gisteren op je akkoord voor de offerte", link: null, reply: { via: "mail", messageId: "demo-1" },
      draft: "Hoi Robin,\n\nAkkoord, met één wijziging: de oplevering wordt week 49 in plaats van week 48. Ik stuur de aangepaste versie vanmiddag.\n\nGroet",
    },
    {
      kind: "message", key: "slack:C1:1.0", source: "slack", title: "#sales", from: "Mila Bakker", at: now - HOUR,
      why: "Mila vraagt of jij de prijslijst vandaag nog deelt", link: null, reply: { via: "slack", channel: "C1", threadTs: "1.0" },
      draft: "Ja, die komt vandaag. Ik zet hem voor vijf uur in het kanaal.",
    },
    {
      kind: "commitment", key: "belofte:mail:demo-2", source: "mail", text: "De planning van de oplevering sturen", who: "mine", person: "Robin de Vries",
      due: addDays(today, 3), brainId: first.id, link: null, at: now - 3 * HOUR,
    },
  ];
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS, enabled: mode !== "uit", calendar: mode !== "uit", mail: mode !== "uit", slack: mode !== "uit", slackCommand: "~/tools/slack/slack.sh", handle: "ik" },
    todos, items, later: {}, skips: { date: today, ids: [] },
    steps: mode === "leeg" ? {} : { "t-offerte": { step: "Open de offerte en controleer de drie bedragen in de tabel", why: "De gemeente verwachtte hem gisteren" } },
    plan: mode === "leeg" ? null : {
      date: today, approved: false, top: ["t-offerte", "t-prijslijst", "t-demo"],
      blocks: [{ start: "10:30", end: "11:15", label: "Offerte gemeente", todoId: "t-offerte" }, { start: "13:00", end: "14:00", label: "Prijslijst 2027", todoId: "t-prijslijst" }, { start: "15:30", end: "16:00", label: "Demo klantdag", todoId: "t-demo" }],
    },
    focus: null, inbox: [],
  };
}

export function createDemoToday(input: { storageKey: string; search: string; now?: () => number; projects: () => DemoProject[] }): TodayBackend & { reset(): void } {
  const mode = new URLSearchParams(input.search).get("agent");
  const key = `${input.storageKey}.today.${mode ?? "normaal"}`;
  const now = input.now ?? Date.now;
  const valid = (value: unknown): value is DemoToday => typeof value === "object" && value !== null && Reflect.get(value, "version") === 1;
  const stored = readLocalJson(key);
  // A seed of an earlier day would show yesterday's appointment: start again each day.
  let state: DemoToday = valid(stored) && stored.skips.date === localDate(now()) ? stored : seed(now(), input.projects(), mode);
  const save = () => writeLocalJson(key, state);
  const missing = () => new BackendError("item_not_found", "Deze kaart is er niet meer.", 404);

  const rounds = (): AgentRound[] => {
    if (!state.settings.enabled) return [];
    const at = now();
    return [
      { system: "agent.ochtend", name: "Persoonlijke agent: ochtend", state: "active", nextRunAt: at + 20 * HOUR, lastRunAt: at - 2 * HOUR, lastStatus: "succeeded", model: state.settings.model },
      { system: "agent.tussendoor", name: "Persoonlijke agent: tussendoor", state: "active", nextRunAt: at + HOUR, lastRunAt: at - HOUR, lastStatus: "succeeded", model: state.settings.model },
      { system: "agent.avond", name: "Persoonlijke agent: avond", state: "active", nextRunAt: at + 7 * HOUR, lastRunAt: null, lastStatus: null, model: state.settings.model },
    ];
  };

  function view(): TodayView {
    const off = { calendar: { state: "off" as const, detail: null, checkedAt: null }, mail: { state: "off" as const, detail: null, checkedAt: null }, slack: { state: "off" as const, detail: null, checkedAt: null } };
    if (!state.settings.enabled) {
      return { enabled: false, blocked: null, handles: [], start: null, upcoming: [], items: [], plan: null, focus: null, cleanup: [], counts: { mine: 0, backlog: 0, inbox: 0 }, connectors: off, rounds: [] };
    }
    const at = now();
    const today = localDate(at);
    const open = state.todos.filter((todo) => !todo.done);
    const skipped = state.skips.date === today ? state.skips.ids : [];
    const plan = state.plan?.date === today ? state.plan : null;
    const picked = pickStart(open, { today, planTop: plan?.top ?? [], skipped });
    const step = picked ? state.steps[picked.todo.id] : undefined;
    const current = state.items.filter((item) => (state.later[item.key] ?? 0) <= at && (item.kind !== "meeting" || item.meeting.end > at));
    const meetings = state.items.flatMap((item) => (item.kind === "meeting" ? [item.meeting] : []));
    const ok = (on: boolean) => (on ? { state: "ok" as const, detail: null, checkedAt: at } : off.mail);
    const first = input.projects()[0];
    return {
      enabled: true, blocked: null, handles: ["ik"],
      start: picked ? { todo: picked.todo, reason: picked.reason, why: step?.why ?? null, firstStep: step?.step ?? null, skipsLeft: Math.max(0, MAX_SKIPS - skipped.length) } : null,
      upcoming: upcomingRows({ todos: state.todos, meetings, now: at }),
      items: visibleItems(current, at).filter((item) => item.kind !== "meeting" || meetingIsNear(item.meeting, at)),
      plan, focus: state.focus,
      cleanup: mode === "leeg" || !first ? [] : [{ brainId: first.id, brainName: first.name, brainKind: "project", lines: 6 }],
      counts: { mine: open.filter((todo) => todo.mine).length, backlog: open.filter((todo) => !todo.mine && !todo.owner).length, inbox: state.inbox.length },
      connectors: { calendar: ok(state.settings.calendar), mail: ok(state.settings.mail), slack: ok(state.settings.slack) },
      rounds: rounds(),
    };
  }

  const todoOf = (id: string) => {
    const todo = state.todos.find((entry) => entry.id === id);
    if (!todo) throw new BackendError("todo_not_found", "Deze taak staat niet meer in het brein.", 404);
    return todo;
  };
  const remove = (key: string) => {
    if (!state.items.some((item) => item.key === key)) throw missing();
    state.items = state.items.filter((item) => item.key !== key);
    save();
  };
  const add = (text: string, brainId: string | null, due: string | null, waiting: boolean): Todo => {
    const brain = input.projects().find((project) => project.id === brainId) ?? null;
    const parsed = parseTodoLine(formatTodoLine({ text, owner: brain ? "ik" : null, due, dueKind: waiting ? "waiting" : "deadline" }));
    if (!parsed) throw new BackendError("invalid_todo", "Een taak heeft tekst nodig.", 400);
    const todo: Todo = { ...parsed, id: `t-${Date.now().toString(36)}`, brainId: brain?.id ?? "demo-persoonlijk", brainName: brain?.name ?? "Mijn brein", brainKind: brain ? "project" : "personal", path: "taken.md", line: 1, mine: true };
    state.todos = [...state.todos, todo];
    save();
    return todo;
  };

  return {
    view: async () => view(),
    settings: async () => ({ settings: { ...state.settings }, killed: false }),
    setSettings: async (patch) => {
      state.settings = { ...state.settings, ...patch };
      save();
      return { settings: { ...state.settings }, killed: false };
    },
    checkConnectors: async () => {
      const at = now();
      const ok = (on: boolean, detail: string) => (on ? { state: "ok" as const, detail, checkedAt: at } : { state: "off" as const, detail: null, checkedAt: null });
      return { calendar: ok(state.settings.calendar, "1 afspraak in de komende 24 uur"), mail: ok(state.settings.mail, "2 ongelezen (van de nieuwste 5)"), slack: ok(state.settings.slack, "verbonden") };
    },
    addTodo: async ({ text, brainId, due }) => add(text, brainId, due, false),
    setDone: async (todoId, done) => {
      todoOf(todoId).done = done;
      if (done && state.focus?.todoId === todoId) state.focus = null;
      save();
    },
    skip: async (todoId) => {
      const today = localDate(now());
      const ids = state.skips.date === today ? state.skips.ids : [];
      if (ids.length < MAX_SKIPS && !ids.includes(todoId)) state.skips = { date: today, ids: [...ids, todoId] };
      save();
    },
    park: async (text) => {
      if (!text.trim()) throw new BackendError("empty_thought", "Er is niets om te parkeren.", 400);
      state.inbox = [...state.inbox, text.trim()];
      save();
    },
    focus: async (todoId, chatId) => {
      const todo = todoOf(todoId);
      const step = state.steps[todoId]?.step ?? null;
      const focus: Focus = state.focus?.todoId === todoId ? { ...state.focus, chatId: chatId ?? state.focus.chatId } : { todoId, title: todo.text, brainId: todo.brainId, chatId, startedAt: now() };
      state.focus = focus;
      save();
      const projects = input.projects();
      const projectId = projects.find((project) => project.id === todo.brainId)?.id ?? projects[0]?.id ?? todo.brainId;
      const prompt = [`Ik wil nu beginnen aan deze taak: "${todo.text}" (uit ${todo.path} in ${todo.brainName}).`, step ? `De eerste stap die klaarstond: ${step}` : "", "Help me starten. Doe de eerste stap van ongeveer vijf minuten zelf waar dat kan en laat me het resultaat zien."].filter(Boolean).join("\n\n");
      return { focus, chat: { projectId, title: todo.text.slice(0, 80), prompt, model: null } };
    },
    stopFocus: async () => {
      state.focus = null;
      save();
    },
    send: async (key) => remove(key),
    dismiss: async (key) => remove(key),
    later: async (key) => {
      if (!state.items.some((item) => item.key === key)) throw missing();
      state.later = { ...state.later, [key]: now() + 20 * HOUR };
      save();
    },
    accept: async (key) => {
      const item = state.items.find((entry) => entry.key === key);
      if (!item || item.kind !== "commitment") throw missing();
      const todo = add(item.who === "theirs" && item.person ? `${item.person}: ${item.text}` : item.text, item.brainId, item.due, item.who === "theirs");
      remove(key);
      return todo;
    },
    decidePlan: async (decision) => {
      state.plan = decision === "approve" && state.plan ? { ...state.plan, approved: true } : null;
      save();
    },
    cleanup: async (brainId) => {
      const project = input.projects().find((entry) => entry.id === brainId) ?? input.projects()[0];
      if (!project) throw new BackendError("brain_not_found", "Dat brein staat niet op deze laptop.", 404);
      return { projectId: project.id, title: "Taken opruimen", model: null, prompt: `Ruim de taken in dit brein (${project.name}) op. Laat me eerst in één overzicht zien wat je vond en vraag of het zo goed is; verander nog niets.` };
    },
    runRound: async () => undefined,
    reset() {
      state = seed(now(), input.projects(), mode);
      save();
    },
  };
}
