import type {
  ActivityEntry,
  AgentSettings,
  Area,
  AwayGroup,
  CockpitBackend,
  CockpitCapabilities,
  InboxItem,
  NeedsYou,
  ProjectBrief,
  Run,
  SearchHit,
  Todo,
  WaitingFor,
} from "../cockpit";
import type { Backend, Project, Routine, RoutineRun } from "../types";
import { BackendError } from "../types";
import { readLocalJson, writeLocalJson } from "~/lib/storage";

/**
 * The cockpit against the local OpenWork server. What the server can answer comes from it:
 * decisions (attention), runs (routines and running chats), activity (the audit log), projects.
 * To-dos, captures and project briefs live on this device until the server has routes for them
 * (frontend-contract §7), like project metadata does. Mail, calendar, approvals and the Library
 * need connections this version does not have: they report a locked reason (DESIGN.md P4).
 */

const LOCK_MAIL = "Mail en agenda koppelen kan nog niet in deze versie. Zodra de Outlook-koppeling er is, zet je hem aan in Instellingen.";
const LOCK_APPROVALS = "Goedkeuringen voor versturen en delen komen met de Outlook-koppeling en gedeelde planken.";
const LOCK_LIBRARY = "De Bibliotheek met gedeelde planken heeft de bibliotheekroutes op de server nodig. Je beheerder kan ze aanzetten.";

const CAPABILITIES: CockpitCapabilities = {
  todos: null,
  inbox: null,
  mail: LOCK_MAIL,
  calendar: LOCK_MAIL,
  runs: null,
  approvals: LOCK_APPROVALS,
  library: LOCK_LIBRARY,
  activity: null,
  dayPlan: null,
};

const STORE = "bonzaiwork.cockpit.device.v1";

type DeviceState = {
  version: 1;
  todos: Todo[];
  waiting: WaitingFor[];
  inbox: InboxItem[];
  briefs: Record<string, Partial<Pick<ProjectBrief, "goal" | "doneWhen" | "target" | "state">> & { areaId?: string }>;
  areas: Area[];
  lastSeenAt: number;
};

const DEFAULT_AREA: Area = { id: "a-projecten", name: "Projecten", client: null };

function isDevice(value: unknown): value is DeviceState {
  return typeof value === "object" && value !== null && Reflect.get(value, "version") === 1 && Array.isArray(Reflect.get(value, "todos"));
}

function load(): DeviceState {
  const stored = readLocalJson(STORE);
  return isDevice(stored) ? stored : { version: 1, todos: [], waiting: [], inbox: [], briefs: {}, areas: [DEFAULT_AREA], lastSeenAt: Date.now() };
}

function locked(reason: string): never {
  throw new BackendError("locked", reason);
}

const ROUTINE_STATUS: Record<RoutineRun["status"], Run["status"]> = {
  queued: "working",
  running: "working",
  succeeded: "done",
  failed: "failed",
  cancelled: "stopped",
  skipped: "issues",
};

function routineRun(routine: Routine, projectName: string): Run | null {
  const last = routine.lastRun;
  if (!last) return null;
  const status = ROUTINE_STATUS[last.status];
  return {
    id: `RT-${last.id}`,
    title: routine.name,
    projectId: routine.projectId,
    werkwijzeId: null,
    werkwijzeName: "Routine",
    status,
    progress: status === "working" ? "Bezig" : status === "done" ? "Klaar" : status === "failed" ? "Mislukt" : last.skippedReason === "app_closed" ? "Gemist: de app was dicht" : "Overgeslagen",
    waitingOn: status === "failed" ? (last.error ?? "Mislukt") : status === "done" ? "Uitkomst klaar om te lezen" : "Niets",
    waitingDetail: null,
    due: routine.nextRunAt,
    updatedAt: last.finishedAt ?? last.startedAt ?? last.scheduledAt,
    startedAt: last.startedAt ?? last.scheduledAt,
    chatRef: last.chatId ? { projectId: routine.projectId, chatId: last.chatId } : null,
    origin: `routine in ${projectName}`,
    stages: [],
    review: null,
    question: null,
    interruption: null,
    grants: [],
    budget: null,
    after: [],
    toolCalls: 0,
    queued: [],
  };
}

export function createLiveCockpit(getBackend: () => Backend): CockpitBackend {
  let device = load();
  const save = () => writeLocalJson(STORE, device);
  const backend = () => getBackend();
  const names = async () => new Map((await backend().projects.list()).map((project) => [project.id, project.name]));

  const briefOf = (project: Project, areas: Area[]): ProjectBrief => {
    const stored = device.briefs[project.id] ?? {};
    const area = areas.find((entry) => entry.id === stored.areaId) ?? areas[0] ?? DEFAULT_AREA;
    return {
      projectId: project.id,
      area,
      state: project.archivedAt !== null ? "completed" : (stored.state ?? "active"),
      goal: stored.goal ?? project.description,
      doneWhen: stored.doneWhen ?? null,
      target: stored.target ?? null,
      keyAlias: project.key.hasKey ? (project.key.keyHint ?? "projectkey") : null,
      keyLeft: null,
      needsYou: null,
      waitingOnYou: null,
      changes: [],
      lastVisitAt: null,
      sources: [],
      decisions: [],
      outputs: [],
    };
  };

  const runs = async (): Promise<Run[]> => {
    const [routines, recent, projectNames] = await Promise.all([backend().capabilities.routines ? backend().routines.list(null) : Promise.resolve([]), backend().chats.recent(30), names()]);
    const fromRoutines = routines.map((routine) => routineRun(routine, projectNames.get(routine.projectId) ?? "")).filter((run): run is Run => run !== null);
    const fromChats: Run[] = recent
      .filter((chat) => chat.status === "running" || chat.status === "waiting" || chat.status === "failed")
      .map((chat) => ({
        id: `CH-${chat.id.slice(-6)}`,
        title: chat.title,
        projectId: chat.projectId,
        werkwijzeId: null,
        werkwijzeName: "Chat",
        status: chat.status === "running" ? "working" : chat.status === "waiting" ? "question" : "failed",
        progress: chat.status === "running" ? "Bezig" : chat.status === "waiting" ? "Wacht op jou" : "Mislukt",
        waitingOn: chat.status === "waiting" ? "Jij: een beslissing in de chat" : chat.status === "failed" ? "De laatste beurt is mislukt" : "Niets",
        waitingDetail: null,
        due: null,
        updatedAt: chat.updatedAt,
        startedAt: chat.createdAt,
        chatRef: { projectId: chat.projectId, chatId: chat.id },
        origin: `chat in ${projectNames.get(chat.projectId) ?? ""}`,
        stages: [],
        review: null,
        question: null,
        interruption: null,
        grants: [],
        budget: null,
        after: [],
        toolCalls: 0,
        queued: [],
      }));
    return [...fromChats, ...fromRoutines].sort((a, b) => b.updatedAt - a.updatedAt);
  };

  const agentSettings = (): AgentSettings => ({
    selfCheck: { ok: true, at: Date.now(), text: "deze app volgt de toestemmingsregels en toegestane mappen van de lokale server." },
    werkwijzen: [],
    safeDefault: [
      { kind: "allow", text: "Lezen en onderzoeken binnen het project" },
      { kind: "ask", text: "Bestanden wijzigen en opdrachten uitvoeren, volgens de uitvoermodus van het project" },
      { kind: "deny", text: "Versturen, delen of publiceren buiten de app" },
    ],
    caps: { money: 5, currency: "EUR", toolCalls: 200, minutes: 90 },
    rules: [
      { risk: "R0", action: "Bestanden in het project lezen; op het web zoeken", className: "R0 · lezen", effect: "allow", choices: [], note: null },
      { risk: "R1", action: "Bestanden in het project wijzigen", className: "R1 · privé, terug te draaien", effect: "ask", choices: [], note: "Stel je in per project bij Instellingen › Toegang" },
      { risk: "R4", action: "E-mail versturen, uitnodigingen beantwoorden", className: "R4 · extern", effect: "locked", choices: [], note: LOCK_MAIL },
    ],
    denials: [],
    contradictions: 0,
  });

  const cockpit: CockpitBackend = {
    capabilities: CAPABILITIES,

    async status() {
      const projects = await backend().projects.list();
      const active = projects.filter((project) => project.archivedAt === null);
      const withKey = active.filter((project) => project.key.hasKey).length;
      const working = (await runs()).filter((run) => run.status === "working").length;
      return {
        library: "Bibliotheek niet gekoppeld",
        keys: `Modeldienst · ${withKey} projectkeys${active.length - withKey > 0 ? `, ${active.length - withKey} ontbreekt` : ""}`,
        mail: null,
        runs: working > 0 ? `${working} ${working === 1 ? "run" : "runs"} bezig` : null,
        outbound: "Uitgaand: niets in afwachting",
        outboundAlert: false,
      };
    },

    async needsYou() {
      const items = await backend().attention.list();
      const out: NeedsYou[] = [];
      for (const item of items) {
        if (item.kind === "permission")
          out.push({ id: `perm-${item.request.id}`, kind: "approval", context: item.chatTitle, title: item.request.message ?? "De agent vraagt toestemming", detail: item.request.resources.join(", ") || "In deze chat", action: "Chat openen", href: `#/p/${encodeURIComponent(item.projectId)}/c/${encodeURIComponent(item.chatId)}`, at: item.at });
        else if (item.kind === "question")
          out.push({ id: `q-${item.request.id}`, kind: "question", context: item.chatTitle, title: item.request.fields[0]?.title ?? "De agent heeft een vraag", detail: item.request.fields[0]?.description ?? "In deze chat", action: "Antwoorden", href: `#/p/${encodeURIComponent(item.projectId)}/c/${encodeURIComponent(item.chatId)}`, at: item.at });
        else if (item.kind === "chat_failed")
          out.push({ id: `f-${item.chatId}`, kind: "review", context: item.chatTitle, title: "Een chat liep vast", detail: item.error.detail ?? "Probeer het opnieuw vanuit de chat.", action: "Chat openen", href: `#/p/${encodeURIComponent(item.projectId)}/c/${encodeURIComponent(item.chatId)}`, at: item.at });
        else if (item.kind === "routine")
          out.push({ id: `r-${item.routineId}`, kind: "review", context: item.name, title: item.reason === "needs_attention" ? "Een routine kan niet draaien" : item.reason === "failed" ? "Een routine is mislukt" : "Een routine is gemist", detail: item.detail ?? "Open de routine om het te herstellen.", action: "Routine openen", href: `#/p/${encodeURIComponent(item.projectId)}/routines/${encodeURIComponent(item.routineId)}`, at: item.at });
      }
      return out;
    },

    async away(since) {
      const [recent, projectNames] = await Promise.all([backend().chats.recent(30), names()]);
      const groups = new Map<string, AwayGroup>();
      for (const chat of recent.filter((entry) => entry.updatedAt > since)) {
        const group = groups.get(chat.projectId) ?? { projectId: chat.projectId, label: projectNames.get(chat.projectId) ?? "Project", lines: [], link: { label: "Project openen", href: `#/p/${encodeURIComponent(chat.projectId)}` } };
        if (group.lines.length < 3) group.lines.push(chat.preview ? `${chat.title}: ${chat.preview}` : chat.title);
        groups.set(chat.projectId, group);
      }
      return [...groups.values()];
    },

    async calendar() {
      return [];
    },

    todos: {
      async list() {
        return structuredClone(device.todos);
      },
      async create(input) {
        const todo: Todo = { id: `t-${Date.now()}`, title: input.title, projectId: input.projectId, origin: input.origin ?? null, external: input.external ?? false, due: input.due, done: false, doneAt: null, today: input.today ?? true, rolledOver: 0, runId: null, createdAt: Date.now() };
        device.todos.push(todo);
        save();
        return structuredClone(todo);
      },
      async update(todoId, patch) {
        const todo = device.todos.find((entry) => entry.id === todoId);
        if (!todo) throw new BackendError("not_found", "Deze to-do bestaat niet meer.");
        Object.assign(todo, patch);
        if (patch.done === true) todo.doneAt = Date.now();
        if (patch.done === false) todo.doneAt = null;
        save();
        return structuredClone(todo);
      },
      async remove(todoId) {
        device.todos = device.todos.filter((entry) => entry.id !== todoId);
        save();
      },
      async waiting() {
        return structuredClone(device.waiting);
      },
    },

    inbox: {
      async list() {
        return structuredClone(device.inbox);
      },
      async decide(itemId, decision) {
        const item = device.inbox.find((entry) => entry.id === itemId);
        if (!item) throw new BackendError("not_found", "Dit item staat niet meer in je inbox.");
        if (decision.kind === "accept")
          device.todos.push({ id: `t-${Date.now()}`, title: decision.title, projectId: decision.projectId, origin: null, external: false, due: decision.deadline !== null ? { kind: "deadline", at: decision.deadline } : null, done: false, doneAt: null, today: true, rolledOver: 0, runId: null, createdAt: Date.now() });
        device.inbox = device.inbox.filter((entry) => entry.id !== itemId);
        save();
      },
      async capture(text, projectId) {
        const item: InboxItem = { id: `i-${Date.now()}`, kind: "captured", title: text, projectId, suggestedProjectId: null, deadline: null, receivedAt: Date.now(), from: null, why: null, sourceLabel: null, mail: null, duplicateOf: null };
        device.inbox.unshift(item);
        save();
        return structuredClone(item);
      },
    },

    plan: {
      async get() {
        const open = device.todos.filter((todo) => !todo.done);
        if (open.length === 0) return null;
        return {
          proposedAt: Date.now(),
          freeMinutes: 0,
          plannedMinutes: 0,
          carryOver: open.filter((todo) => todo.rolledOver > 0).map((todo) => ({ todoId: todo.id, title: todo.title, rolledOver: todo.rolledOver, choice: "today" })),
          order: open.filter((todo) => todo.today).map((todo) => ({ todoId: todo.id, title: todo.title, change: null, note: todo.due ? new Date(todo.due.at).toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" }) : "Geen datum", included: true })),
          judgement: null,
          calendar: [],
          notProposed: open.filter((todo) => !todo.today).map((todo) => ({ todoId: todo.id, title: todo.title, reason: "Niet voor vandaag gekozen" })),
          blocks: null,
        };
      },
      async commit(choices) {
        for (const todo of device.todos) {
          const carry = choices.carryOver[todo.id];
          if (carry === "drop" || carry === "later") todo.today = false;
          if (choices.included.includes(todo.id)) todo.today = true;
        }
        save();
      },
    },

    runs: {
      list: runs,
      async get(runId) {
        return (await runs()).find((run) => run.id === runId) ?? null;
      },
      async act(runId, action) {
        const run = (await runs()).find((entry) => entry.id === runId);
        if (!run) throw new BackendError("not_found", "Deze run bestaat niet meer.");
        if ((action === "stop" || action === "abandon") && run.chatRef) {
          await backend().chats.abort(run.chatRef.projectId, run.chatRef.chatId);
          return { ...run, status: "stopped", progress: "Gestopt", waitingOn: "Niets" };
        }
        return locked("Deze actie werkt in een run met stappen. Open de chat om verder te gaan.");
      },
      async answer() {
        return locked("Beantwoord de vraag in de chat zelf.");
      },
      async steer() {
        return locked("Stuur bij in de chat zelf.");
      },
      async draft(todoId, goal) {
        const todo = todoId ? (device.todos.find((entry) => entry.id === todoId) ?? null) : null;
        return {
          todoId: todo?.id ?? null,
          title: todo?.title ?? goal ?? "Nieuwe opdracht",
          projectId: todo?.projectId ?? null,
          due: todo?.due?.at ?? null,
          goal: goal ?? todo?.title ?? "",
          goalSuggested: false,
          werkwijzeId: null,
          context: [],
          constraints: [],
          output: "Het antwoord in een nieuwe chat in het project.",
          offerToShelf: false,
          caps: { money: 5, currency: "EUR", toolCalls: 200, minutes: 90 },
          typicalCost: null,
        };
      },
      async start(draft) {
        if (!draft.projectId) throw new BackendError("project_required", "Kies eerst een project: de run gebruikt de key van dat project.");
        const [status, projects] = await Promise.all([backend().status(), backend().projects.list()]);
        const project = projects.find((entry) => entry.id === draft.projectId);
        const model = project?.defaultModel ?? status.defaultModel ?? status.models[0]?.id;
        if (!model) throw new BackendError("no_model", "Er is geen model beschikbaar voor dit project. Koppel eerst een key.");
        const chat = await backend().chats.create(draft.projectId, { model, title: draft.title });
        const lines = [draft.goal, ...draft.constraints.map((constraint) => `- ${constraint.text}`), draft.output ? `Uitkomst: ${draft.output}` : ""].filter(Boolean);
        await backend().chats.send(draft.projectId, chat.id, { text: lines.join("\n"), model, agent: null, attachments: [], command: null, skills: [] });
        if (draft.todoId) {
          const todo = device.todos.find((entry) => entry.id === draft.todoId);
          if (todo) todo.runId = `CH-${chat.id.slice(-6)}`;
          save();
        }
        const started = (await runs()).find((run) => run.chatRef?.chatId === chat.id);
        if (started) return started;
        return {
          id: `CH-${chat.id.slice(-6)}`,
          title: draft.title,
          projectId: draft.projectId,
          werkwijzeId: null,
          werkwijzeName: "Chat",
          status: "working",
          progress: "Bezig",
          waitingOn: "Niets",
          waitingDetail: null,
          due: draft.due,
          updatedAt: Date.now(),
          startedAt: Date.now(),
          chatRef: { projectId: draft.projectId, chatId: chat.id },
          origin: null,
          stages: [],
          review: null,
          question: null,
          interruption: null,
          grants: [],
          budget: null,
          after: [],
          toolCalls: 0,
          queued: [],
        };
      },
      async werkwijzen() {
        return [];
      },
    },

    approvals: {
      async list() {
        return [];
      },
      async get() {
        return null;
      },
      async decide() {
        return locked(LOCK_APPROVALS);
      },
      async undo() {
        return locked(LOCK_APPROVALS);
      },
      async resolve() {
        return locked(LOCK_APPROVALS);
      },
    },

    activity: {
      async list() {
        const projects = (await backend().projects.list()).filter((project) => project.archivedAt === null);
        const lists = await Promise.all(projects.map((project) => backend().config.audit(project.id).then((entries) => entries.map((entry) => ({ entry, project })), () => [])));
        return lists
          .flat()
          .map(({ entry, project }): ActivityEntry => ({ id: entry.id, at: entry.at, actor: /agent|assistant/i.test(entry.actor) ? "agent" : /system|server|app/i.test(entry.actor) ? "app" : "you", actorName: entry.actor, text: entry.summary, basis: null, projectId: project.id, runId: null }))
          .sort((a, b) => b.at - a.at);
      },
      async sent() {
        return [];
      },
    },

    library: {
      async shelves() {
        return [];
      },
      async pages() {
        return [];
      },
      async page() {
        return null;
      },
      async requests() {
        return [];
      },
      async proposals() {
        return [];
      },
      async proposal() {
        return null;
      },
      async decide() {
        return locked(LOCK_LIBRARY);
      },
      async verify() {
        return locked(LOCK_LIBRARY);
      },
      async ask() {
        return locked(LOCK_LIBRARY);
      },
    },

    projects: {
      async areas() {
        return structuredClone(device.areas.length > 0 ? device.areas : [DEFAULT_AREA]);
      },
      async briefs() {
        const projects = await backend().projects.list();
        const areas = device.areas.length > 0 ? device.areas : [DEFAULT_AREA];
        return projects.map((project) => briefOf(project, areas));
      },
      async brief(projectId) {
        const project = (await backend().projects.list()).find((entry) => entry.id === projectId);
        return project ? briefOf(project, device.areas.length > 0 ? device.areas : [DEFAULT_AREA]) : null;
      },
      async updateBrief(projectId, patch) {
        const current = device.briefs[projectId] ?? {};
        device.briefs[projectId] = { ...current, ...patch };
        save();
        const brief = await cockpit.projects.brief(projectId);
        if (!brief) throw new BackendError("not_found", "Dit project bestaat niet meer.");
        return brief;
      },
      async proposal(fromChat) {
        return {
          fromChat: fromChat ? { ...fromChat, title: "", startedAt: Date.now() } : null,
          title: "",
          goal: "",
          doneWhen: "",
          areaId: (device.areas[0] ?? DEFAULT_AREA).id,
          target: null,
          sources: [],
          todos: [],
        };
      },
      async review(projectId) {
        return {
          open: device.todos.filter((todo) => todo.projectId === projectId && !todo.done).map((todo) => ({ id: todo.id, title: todo.title, kind: "todo" as const, detail: null, choice: null })),
          agentWork: { summary: "Chats en routines van dit project blijven leesbaar na het afronden.", unreviewed: [] },
          decisions: [],
          learnings: [],
          outside: null,
        };
      },
      async complete(projectId, commit) {
        for (const [todoId, choice] of Object.entries(commit.open)) {
          const todo = device.todos.find((entry) => entry.id === todoId);
          if (!todo) continue;
          if (choice === "done" || choice === "cancel") todo.done = true;
          if (choice === "move") todo.projectId = null;
        }
        device.briefs[projectId] = { ...(device.briefs[projectId] ?? {}), state: commit.final === "completed" ? "completed" : "on_hold" };
        save();
        if (commit.final === "completed") await backend().projects.update(projectId, { archived: true });
      },
    },

    settings: {
      async agent() {
        return agentSettings();
      },
      async setRisk() {
        return locked("De toestemmingen stel je per project in bij Instellingen › Toegang.");
      },
    },

    async search(query) {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      const [projects, recent] = await Promise.all([backend().projects.list(), backend().chats.recent(50)]);
      const hits: SearchHit[] = [];
      for (const project of projects) if (project.name.toLowerCase().includes(q)) hits.push({ id: project.id, group: "work", kind: "project", title: project.name, meta: `Project${project.description ? ` · ${project.description}` : ""}`, href: `#/p/${encodeURIComponent(project.id)}` });
      for (const chat of recent) if (chat.title.toLowerCase().includes(q)) hits.push({ id: chat.id, group: "work", kind: "chat", title: chat.title, meta: "Chat", href: `#/p/${encodeURIComponent(chat.projectId)}/c/${encodeURIComponent(chat.id)}` });
      for (const todo of device.todos) if (!todo.done && todo.title.toLowerCase().includes(q)) hits.push({ id: todo.id, group: "work", kind: "todo", title: todo.title, meta: "To-do", href: "#/" });
      return hits.slice(0, 12);
    },
  };

  // Re-read the device store when another window changed it.
  window.addEventListener("storage", (event) => {
    if (event.key === STORE) device = load();
  });

  return cockpit;
}
