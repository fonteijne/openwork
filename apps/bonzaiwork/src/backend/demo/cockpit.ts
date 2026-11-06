import type {
  ActivityEntry,
  ApprovalDecision,
  CockpitBackend,
  CockpitCapabilities,
  DayPlan,
  DelegateDraft,
  NeedsYou,
  OutboundEntry,
  ProjectBrief,
  ProjectProposal,
  ProjectReview,
  Run,
  RunAction,
  SearchHit,
  Todo,
} from "../cockpit";
import { readLocalJson, writeLocal, writeLocalJson } from "~/lib/storage";

import { createCockpitSeed, dayAt, demoAway, emptyCockpitSeed, P, TEAM, type CockpitState } from "./cockpit-seed";

const CAPABILITIES: CockpitCapabilities = {
  todos: null,
  inbox: null,
  mail: null,
  calendar: null,
  runs: null,
  approvals: null,
  library: null,
  activity: null,
  dayPlan: null,
};

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function latency(kind: "read" | "write" = "read"): Promise<void> {
  const base = kind === "read" ? 30 : 200;
  return wait(base + Math.round(Math.random() * base));
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isState(value: unknown): value is CockpitState {
  return typeof value === "object" && value !== null && Reflect.get(value, "version") === 1 && Array.isArray(Reflect.get(value, "runs"));
}

const RUN_RANK: Record<Run["status"], number> = { review: 0, question: 0, interrupted: 0, working: 1, failed: 2, issues: 3, done: 4, draft: 5, stopped: 6 };

function sortRuns(runs: Run[]): Run[] {
  return [...runs].sort((a, b) => RUN_RANK[a.status] - RUN_RANK[b.status] || (a.due ?? Infinity) - (b.due ?? Infinity) || b.updatedAt - a.updatedAt);
}

function time(at: number): string {
  return new Date(at).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

const GENERIC_STAGE_BODY = (title: string, stage: string) => `## ${stage}\n\nUitkomst van "${stage}" voor ${title}. De agent heeft de bronnen gelezen en de belangrijkste punten op een rij gezet.\n\n- Punt 1, met bron.\n- Punt 2, met bron.\n- Punt 3, met bron.`;

/**
 * The cockpit in the browser: one state object in localStorage next to the demo's own state, with
 * realistic latency and runs that move on by themselves (a stage turns into a review after a few
 * seconds), so every screen can be tried end to end.
 */
export function createDemoCockpit(options: { storageKey: string; empty: boolean; projectName: (projectId: string) => string | null; projectIds: () => string[] }): CockpitBackend & { reset(): void } {
  const key = `${options.storageKey}.cockpit`;
  const stored = readLocalJson(key);
  const seed = () => (options.empty ? emptyCockpitSeed(Date.now()) : createCockpitSeed(Date.now()));
  let state: CockpitState = isState(stored) ? stored : seed();
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => writeLocalJson(key, state), 150);
  };
  const later = (ms: number, fn: () => void) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      fn();
      save();
    }, ms);
    timers.add(timer);
  };
  const name = (projectId: string | null) => (projectId ? (options.projectName(projectId) ?? "Project") : "Geen project");
  const log = (entry: Omit<ActivityEntry, "id" | "at">) => {
    state.activity.unshift({ ...entry, id: `ac-${Date.now()}-${Math.round(Math.random() * 1000)}`, at: Date.now() });
  };
  const findRun = (runId: string): Run => {
    const run = state.runs.find((entry) => entry.id === runId);
    if (!run) throw new Error("Deze run bestaat niet meer.");
    return run;
  };
  const nextRunId = () => {
    const numbers = state.runs.map((run) => Number(run.id.replace("RUN-", ""))).filter((value) => Number.isFinite(value));
    return `RUN-${String(Math.max(424, ...numbers) + 1).padStart(4, "0")}`;
  };
  const nextOutId = () => {
    const ids = [...state.sent.map((entry) => entry.id), ...state.approvals.map((entry) => entry.id)];
    const numbers = ids.map((id) => Number(id.replace(/^[A-Z]+-/, ""))).filter((value) => Number.isFinite(value));
    return `OUT-${String(Math.max(95, ...numbers) + 1).padStart(4, "0")}`;
  };

  /** A working stage turns into a review after a few seconds (the demo's agent). */
  const workThenReview = (run: Run, stageIndex: number, ms = 5000) => {
    later(ms, () => {
      const current = state.runs.find((entry) => entry.id === run.id);
      if (!current || current.status !== "working") return;
      const stage = current.stages[stageIndex];
      if (!stage) return;
      stage.state = "review";
      stage.note = "Wacht op jouw controle";
      stage.artifact = `${String(stageIndex + 1).padStart(2, "0")}-${stage.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`;
      current.status = "review";
      current.progress = `Stap ${stageIndex + 1} van ${current.stages.length}`;
      current.waitingOn = `Jij: controleer "${stage.title}"`;
      current.updatedAt = Date.now();
      current.review = {
        stageIndex,
        file: stage.artifact,
        delta: null,
        body: GENERIC_STAGE_BODY(current.title, stage.title),
        edits: null,
        previous: null,
        checks: [{ result: "pass", text: "Geslaagd: elke bewering heeft een bron" }],
        builtFrom: [],
        citations: null,
      };
      log({ actor: "agent", actorName: "Agent", text: `Stap ${stageIndex + 1} van ${current.id} klaargezet voor controle`, basis: current.werkwijzeName, projectId: current.projectId, runId: current.id });
    });
  };

  const advance = (run: Run, how: "accepted" | "skipped") => {
    const index = run.review?.stageIndex ?? run.stages.findIndex((stage) => stage.state === "review");
    const stage = run.stages[index];
    if (stage) {
      stage.state = "done";
      stage.note = how === "accepted" ? `Geaccepteerd · ${time(Date.now())}` : `Controle overgeslagen · ${time(Date.now())}`;
    }
    run.review = null;
    const next = run.stages[index + 1];
    run.updatedAt = Date.now();
    if (!next) {
      run.status = "done";
      run.progress = `${run.stages.length} van ${run.stages.length}`;
      run.waitingOn = "Uitkomst klaar om te lezen";
      return;
    }
    next.state = "working";
    next.note = "Bezig";
    run.status = "working";
    run.progress = `Stap ${index + 2} van ${run.stages.length}`;
    run.waitingOn = "Niets";
    workThenReview(run, index + 1);
  };

  const outboundFromApproval = (approvalId: string): OutboundEntry => {
    const approval = state.approvals.find((entry) => entry.id === approvalId);
    if (!approval) throw new Error("Deze goedkeuring bestaat niet meer.");
    const target: OutboundEntry["target"] =
      approval.mail
        ? [`Aan ${approval.mail.to.map((person) => `${person.name} · ${person.org}`).join(", ")}`, approval.mail.cc.filter((cc) => cc.decision !== "remove").map((cc) => `Cc ${cc.name} · ${cc.org.toLowerCase()}`).join(", ") || null]
        : approval.library
          ? [approval.library.changes.map((change) => change.pageTitle).join(", "), approval.audience]
          : [approval.title, approval.audience];
    return {
      id: approval.id.startsWith("OUT-") ? approval.id : nextOutId(),
      title: approval.kind === "email" ? `Antwoord: ${approval.mail?.subject ?? approval.title}` : approval.kind === "library" ? "Een bibliotheekwijziging publiceren" : "Agendablokken toevoegen",
      kind: approval.kind,
      target,
      status: approval.holdSeconds > 0 ? "held" : approval.kind === "library" ? "published" : "accepted",
      statusText: approval.holdSeconds > 0 ? `${approval.holdSeconds} s vastgehouden` : approval.kind === "library" ? "Gepubliceerd" : "Toegevoegd",
      decidedBy: "Jij keurde goed",
      at: Date.now(),
      steps: [{ at: Date.now(), title: "Jij keurde goed", detail: "Gebonden aan deze precieze inhoud" }],
      projectId: approval.projectId,
    };
  };

  const planFor = (): DayPlan => {
    const now = Date.now();
    const open = state.todos.filter((todo) => !todo.done);
    const carryOver = open.filter((todo) => todo.rolledOver > 0).map((todo) => ({ todoId: todo.id, title: todo.title, rolledOver: todo.rolledOver, choice: "today" as const }));
    const t3 = open.find((todo) => todo.id === "t-3");
    const order: DayPlan["order"] = [];
    if (state.runs.some((run) => run.id === "RUN-0417" && run.status === "review")) order.push({ todoId: "plan-review-0417", title: "Uitkomst van RUN-0417 nalezen", change: "added", note: "Voor Lars, ma", included: true });
    if (t3) order.push({ todoId: t3.id, title: "Antwoord aan Lars opstellen", change: "moved_up", note: "Deadline ma", included: true });
    for (const todo of open.filter((entry) => entry.today && entry.id !== "t-3" && entry.id !== "t-4" && entry.rolledOver === 0)) {
      const overdue = todo.due !== null && todo.due.at < now;
      order.push({ todoId: todo.id, title: todo.title, change: null, note: overdue ? "Te laat" : todo.due ? "Vandaag" : "Geen datum", included: true });
    }
    const t1 = open.find((todo) => todo.id === "t-1");
    if (t1 && !order.some((entry) => entry.todoId === t1.id)) order.push({ todoId: t1.id, title: t1.title, change: null, note: "Te laat", included: true });
    const t4 = open.find((todo) => todo.id === "t-4");
    const tuesday = dayAt(now, ((2 - new Date(now).getDay() + 7) % 7) || 7, 9);
    return {
      proposedAt: dayAt(now, 0, 8, 55) > now ? now - 5 * MIN : dayAt(now, 0, 8, 55),
      freeMinutes: 285,
      plannedMinutes: 230,
      carryOver,
      order,
      judgement: t4 ? { todoId: t4.id, text: `"${t4.title}" naar ${new Date(tuesday).toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" })} verplaatsen? Vandaag zit vol.`, toDate: tuesday } : null,
      calendar: [
        ...state.calendar.filter((event) => new Date(event.start).toDateString() === new Date(now).toDateString()),
        { id: "pb-1", start: dayAt(now, 0, 10), end: dayAt(now, 0, 11), title: "Focus: opties Van Dijk", proposed: true },
        { id: "pb-2", start: dayAt(now, 0, 13), end: dayAt(now, 0, 14, 30), title: "Focus: antwoordrichtlijn", proposed: true },
      ].sort((a, b) => a.start - b.start),
      notProposed: open.filter((todo) => !todo.today).slice(0, 1).map((todo) => ({ todoId: todo.id, title: todo.title, reason: "Geen datum en geen ruimte vandaag" })),
      blocks: { count: 2, showAs: "Vrij", titleSeen: "Focustijd" },
    };
  };

  const briefFor = (projectId: string): ProjectBrief => {
    const existing = state.briefs.find((entry) => entry.projectId === projectId);
    if (existing) return existing;
    const area = state.areas.find((entry) => entry.id === "a-intern") ?? state.areas[0];
    if (!area) throw new Error("Geen gebied");
    const fresh: ProjectBrief = { projectId, area, state: "active", goal: null, doneWhen: null, target: null, keyAlias: null, keyLeft: null, needsYou: null, waitingOnYou: null, changes: [], lastVisitAt: null, sources: [], decisions: [], outputs: [] };
    state.briefs.push(fresh);
    return fresh;
  };

  const draftFor = (todo: Todo | null, goal: string | null): DelegateDraft => {
    const werkwijze = todo?.projectId ? state.werkwijzen.find((entry) => entry.projectId === todo.projectId) : undefined;
    if (todo?.id === "t-3") {
      return {
        todoId: todo.id,
        title: todo.title,
        projectId: P.offertes,
        due: dayAt(Date.now(), ((5 - new Date().getDay() + 7) % 7) || 7, 12),
        goal: "2–3 onderhoudsopties vergelijken die passen bij Bakkerij Van Dijk, met een ruwe indicatie van de kosten.",
        goalSuggested: true,
        werkwijzeId: "ww-opties",
        context: [
          { id: "cx-1", kind: "email", title: "Mailgesprek \"Onderhoudscontract\" van Lars", meta: "Extern · het verzoek zelf" },
          { id: "cx-2", kind: "link", title: "DKS-142", meta: "HubSpot-link · het ticket waar dit antwoord op is" },
          { id: "cx-3", kind: "library", title: "Checklist privacy klantgegevens", meta: `Iedereen in ${TEAM} · gecontroleerd door Fleur · bepaalt de criteria` },
          { id: "cx-4", kind: "decision", title: "B-007 Service binnen 24 uur", meta: "Team Van Dijk · besluit om te respecteren" },
        ],
        constraints: [
          { text: "Alleen service binnen 24 uur (B-007)", by: "agent" },
          { text: "Elk bedrag met een bron", by: "werkwijze" },
          { text: "Geen opties die een eigen werkplaats vragen", by: "you" },
        ],
        output: "Een vergelijkingsnotitie, opgeslagen in Alleen jij.",
        offerToShelf: true,
        caps: { money: 2, currency: "EUR", toolCalls: 200, minutes: 90 },
        typicalCost: "Gewoonlijk voor vergelijkbare runs: [bereik uit eerdere runs]",
      };
    }
    return {
      todoId: todo?.id ?? null,
      title: todo?.title ?? (goal ?? "Nieuwe opdracht"),
      projectId: todo?.projectId ?? null,
      due: todo?.due?.at ?? null,
      goal: goal ?? todo?.title ?? "",
      goalSuggested: goal === null && todo !== null,
      werkwijzeId: werkwijze?.id ?? null,
      context: todo?.origin ? [{ id: "cx-origin", kind: "link", title: todo.origin, meta: "Waar deze to-do vandaan komt" }] : [],
      constraints: [{ text: "Elk bedrag met een bron", by: "werkwijze" }],
      output: "Een notitie, opgeslagen in Alleen jij.",
      offerToShelf: false,
      caps: { ...state.agent.caps },
      typicalCost: null,
    };
  };

  const cockpit: CockpitBackend & { reset(): void } = {
    capabilities: CAPABILITIES,

    reset() {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      writeLocal(key, null);
      state = seed();
    },

    async status() {
      await latency();
      const missing = options.projectIds().filter((id) => !state.briefs.find((brief) => brief.projectId === id)?.keyAlias && id !== P.personal).length;
      const withKey = state.briefs.filter((brief) => brief.keyAlias && brief.state !== "completed").length;
      const working = state.runs.filter((run) => run.status === "working").length;
      const unknown = state.sent.filter((entry) => entry.status === "unknown").length;
      const held = state.sent.filter((entry) => entry.status === "held").length;
      const openEmail = state.approvals.filter((entry) => entry.status === "open" && entry.kind === "email").length;
      return {
        library: "Bibliotheek bijgewerkt",
        keys: `Modeldienst · EU-routering · ${withKey} projectkeys${missing > 0 ? `, ${missing} ontbreekt` : ""}`,
        mail: "Outlook (pilot) verbonden",
        runs: working > 0 ? `${working} ${working === 1 ? "run" : "runs"} bezig` : null,
        outbound: unknown > 0 ? `Uitgaand: ${unknown} uitkomst onbekend` : held > 0 ? `Uitgaand: ${held} wordt verstuurd` : openEmail > 0 ? `Uitgaand: ${openEmail} wacht op goedkeuring` : "Uitgaand: niets in afwachting",
        outboundAlert: unknown > 0,
      };
    },

    async needsYou() {
      await latency();
      const items: NeedsYou[] = [];
      for (const run of state.runs) {
        if (run.status === "review" && run.review) {
          const stage = run.stages[run.review.stageIndex];
          items.push({
            id: `${run.id}-review`,
            kind: "review",
            context: name(run.projectId),
            title: run.id === "RUN-0417" ? "Lees de vergelijkingsnotitie na voordat hij wordt opgeslagen" : `Controleer "${stage?.title ?? "de stap"}" van ${run.werkwijzeName.toLowerCase()}`,
            detail: `${run.id} · stap ${run.review.stageIndex + 1} van ${run.stages.length}, ${stage?.title ?? ""}. Controleren verstuurt niets.`,
            action: "Controle openen",
            href: `#/runs/${run.id}`,
            at: run.updatedAt,
          });
        }
        if (run.status === "question" && run.question) {
          items.push({ id: `${run.id}-question`, kind: "question", context: name(run.projectId), title: run.question.text, detail: run.question.consequence, action: "Antwoorden", href: `#/runs/${run.id}`, at: run.updatedAt });
        }
      }
      for (const approval of state.approvals) {
        if (approval.status !== "open") continue;
        items.push({
          id: approval.id,
          kind: "approval",
          context: approval.audience,
          title: approval.title,
          detail: approval.kind === "email" ? `${approval.headline}. ${approval.consequence.split(".")[0] ?? ""}.` : approval.consequence,
          action: "Goedkeuring openen",
          href: approval.id === "APR-0094" ? "#/bibliotheek/voorstel/vs-12" : `#/goedkeuring/${approval.id}`,
          at: approval.createdAt,
        });
      }
      return items.sort((a, b) => a.at - b.at);
    },

    async away(since) {
      await latency();
      return since <= state.lastSeenAt && state.runs.length > 0 ? demoAway(Date.now()) : [];
    },

    async calendar(day) {
      await latency();
      const date = new Date(day).toDateString();
      return clone(state.calendar.filter((event) => new Date(event.start).toDateString() === date).sort((a, b) => a.start - b.start));
    },

    todos: {
      async list() {
        await latency();
        return clone(state.todos);
      },
      async create(input) {
        await latency("write");
        const todo: Todo = {
          id: `t-${Date.now()}`,
          title: input.title,
          projectId: input.projectId,
          origin: input.origin ?? null,
          external: input.external ?? false,
          due: input.due,
          done: false,
          doneAt: null,
          today: input.today ?? true,
          rolledOver: 0,
          runId: null,
          createdAt: Date.now(),
        };
        state.todos.push(todo);
        save();
        return clone(todo);
      },
      async update(todoId, patch) {
        await latency("write");
        const todo = state.todos.find((entry) => entry.id === todoId);
        if (!todo) throw new Error("Deze to-do bestaat niet meer.");
        Object.assign(todo, patch);
        if (patch.done === true) todo.doneAt = Date.now();
        if (patch.done === false) todo.doneAt = null;
        save();
        return clone(todo);
      },
      async remove(todoId) {
        await latency("write");
        state.todos = state.todos.filter((entry) => entry.id !== todoId);
        save();
      },
      async waiting() {
        await latency();
        return clone(state.waiting);
      },
    },

    inbox: {
      async list() {
        await latency();
        return clone([...state.inbox].sort((a, b) => b.receivedAt - a.receivedAt));
      },
      async decide(itemId, decision) {
        await latency("write");
        const item = state.inbox.find((entry) => entry.id === itemId);
        if (!item) throw new Error("Dit item staat niet meer in je inbox.");
        if (decision.kind === "accept") {
          state.todos.push({
            id: `t-${Date.now()}`,
            title: decision.title,
            projectId: decision.projectId,
            origin: item.from ? `uit de mail van ${item.from.name}` : (item.sourceLabel ?? null),
            external: item.from?.external ?? false,
            due: decision.deadline !== null ? { kind: "deadline", at: decision.deadline } : null,
            done: false,
            doneAt: null,
            today: true,
            rolledOver: 0,
            runId: null,
            createdAt: Date.now(),
          });
          log({ actor: "you", actorName: "Jij", text: `Accepteerde "${decision.title}" als to-do`, basis: item.sourceLabel, projectId: decision.projectId, runId: null });
        }
        state.inbox = state.inbox.filter((entry) => entry.id !== itemId);
        save();
      },
      async capture(text, projectId) {
        await latency("write");
        const item = {
          id: `i-${Date.now()}`,
          kind: "captured" as const,
          title: text,
          projectId,
          suggestedProjectId: null,
          deadline: null,
          receivedAt: Date.now(),
          from: null,
          why: null,
          sourceLabel: null,
          mail: null,
          duplicateOf: null,
        };
        state.inbox.unshift(item);
        save();
        return clone(item);
      },
    },

    plan: {
      async get() {
        await latency();
        return planFor();
      },
      async commit(choices) {
        await latency("write");
        for (const [todoId, choice] of Object.entries(choices.carryOver)) {
          const todo = state.todos.find((entry) => entry.id === todoId);
          if (!todo) continue;
          if (choice === "drop") todo.today = false;
          if (choice === "later") {
            todo.today = false;
            todo.due = { kind: "due", at: dayAt(Date.now(), 1, 9) };
          }
        }
        for (const todo of state.todos) if (choices.included.includes(todo.id)) todo.today = true;
        const plan = planFor();
        if (choices.acceptJudgement && plan.judgement) {
          const todo = state.todos.find((entry) => entry.id === plan.judgement?.todoId);
          if (todo) {
            todo.today = false;
            todo.due = { kind: "deadline", at: plan.judgement.toDate };
          }
        }
        state.planCommittedAt = Date.now();
        log({ actor: "you", actorName: "Jij", text: "Legde de dagplanning vast", basis: `${choices.included.length} to-do's`, projectId: null, runId: null });
        save();
      },
    },

    runs: {
      async list() {
        await latency();
        return clone(sortRuns(state.runs));
      },
      async get(runId) {
        await latency();
        const run = state.runs.find((entry) => entry.id === runId);
        return run ? clone(run) : null;
      },
      async act(runId, action: RunAction, note) {
        await latency("write");
        const run = findRun(runId);
        switch (action) {
          case "accept":
          case "continue":
            advance(run, "accepted");
            log({ actor: "you", actorName: "Jij", text: `Accepteerde een stap van ${run.id}`, basis: null, projectId: run.projectId, runId: run.id });
            break;
          case "skip_review":
            advance(run, "skipped");
            log({ actor: "you", actorName: "Jij", text: `Sloeg de controle van ${run.id} over (gelogd)`, basis: null, projectId: run.projectId, runId: run.id });
            break;
          case "rerun": {
            const index = run.review?.stageIndex ?? 0;
            const stage = run.stages[index];
            if (stage) {
              stage.state = "working";
              stage.note = note ? `Opnieuw met notitie: ${note}` : "Opnieuw";
            }
            run.status = "working";
            run.waitingOn = "Niets";
            run.review = null;
            if (note) run.queued.push(note);
            workThenReview(run, index);
            log({ actor: "you", actorName: "Jij", text: `Liet een stap van ${run.id} opnieuw doen`, basis: note ?? null, projectId: run.projectId, runId: run.id });
            break;
          }
          case "abandon":
          case "stop":
            run.status = "stopped";
            run.progress = "Gestopt";
            run.waitingOn = "Niets; de uitkomsten tot nu toe zijn bewaard";
            run.review = null;
            run.question = null;
            log({ actor: "you", actorName: "Jij", text: `Stopte ${run.id}; uitkomsten bewaard`, basis: null, projectId: run.projectId, runId: run.id });
            break;
          case "resume": {
            const outbound = run.interruption?.outbound;
            if (outbound && outbound.status === "unknown") throw new Error(`Hervatten kan pas als ${outbound.id} is opgelost.`);
            run.status = "done";
            run.progress = `${run.stages.length} van ${run.stages.length}`;
            run.waitingOn = "Uitkomst klaar om te lezen";
            for (const stage of run.stages) stage.state = "done";
            run.interruption = null;
            log({ actor: "you", actorName: "Jij", text: `Hervatte ${run.id}`, basis: "Afgerond werk gecontroleerd, niets herhaald", projectId: run.projectId, runId: run.id });
            break;
          }
          case "edit":
            if (run.review && note) run.review.edits = note;
            break;
        }
        run.updatedAt = Date.now();
        save();
        return clone(run);
      },
      async answer(runId, answer) {
        await latency("write");
        const run = findRun(runId);
        run.question = null;
        run.status = "working";
        run.waitingOn = "Niets";
        const index = run.stages.findIndex((stage) => stage.state === "working");
        const stage = run.stages[index];
        if (stage) stage.note = `Jij koos: ${answer}`;
        workThenReview(run, Math.max(index, 0), 6000);
        log({ actor: "you", actorName: "Jij", text: `Beantwoordde de vraag van ${run.id}: ${answer}`, basis: null, projectId: run.projectId, runId: run.id });
        save();
        return clone(run);
      },
      async steer(runId, instruction) {
        await latency("write");
        const run = findRun(runId);
        run.queued.push(instruction);
        log({ actor: "you", actorName: "Jij", text: `Gaf ${run.id} een instructie voor de volgende stap`, basis: instruction, projectId: run.projectId, runId: run.id });
        save();
        return clone(run);
      },
      async draft(todoId, goal) {
        await latency();
        const todo = todoId ? (state.todos.find((entry) => entry.id === todoId) ?? null) : null;
        return draftFor(todo, goal ?? null);
      },
      async start(draft) {
        await latency("write");
        const werkwijze = draft.werkwijzeId ? state.werkwijzen.find((entry) => entry.id === draft.werkwijzeId) : undefined;
        const stages = werkwijze?.stages ?? ["Werken", "Notitie schrijven"];
        const brief = draft.projectId ? state.briefs.find((entry) => entry.projectId === draft.projectId) : undefined;
        const run: Run = {
          id: nextRunId(),
          title: draft.goal || draft.title,
          projectId: draft.projectId,
          werkwijzeId: werkwijze?.id ?? null,
          werkwijzeName: werkwijze?.name ?? "Zonder werkwijze",
          status: "working",
          progress: `Stap 1 van ${stages.length}`,
          waitingOn: "Niets",
          waitingDetail: null,
          due: draft.due,
          updatedAt: Date.now(),
          startedAt: Date.now(),
          chatRef: null,
          origin: draft.todoId ? `van de to-do "${draft.title}"` : null,
          stages: stages.map((title, index) => ({ title, state: index === 0 ? "working" : "pending", note: index === 0 ? "Bezig" : null, artifact: null })),
          review: null,
          question: null,
          interruption: null,
          grants: werkwijze?.grants ?? state.agent.safeDefault,
          budget: { spent: 0, cap: draft.caps.money, currency: draft.caps.currency, keyAlias: brief?.keyAlias ?? "persoonlijk", keyLeft: brief?.keyLeft ?? 70, resetsAt: dayAt(Date.now(), 26, 0) },
          after: draft.offerToShelf ? ["De notitie voorstellen aan de plank van het project"] : [],
          toolCalls: 0,
          queued: [],
        };
        state.runs.unshift(run);
        if (draft.todoId) {
          const todo = state.todos.find((entry) => entry.id === draft.todoId);
          if (todo) todo.runId = run.id;
        }
        workThenReview(run, 0, 6000);
        log({ actor: "you", actorName: "Jij", text: `Delegeerde "${draft.title}" als ${run.id}`, basis: run.werkwijzeName, projectId: run.projectId, runId: run.id });
        save();
        return clone(run);
      },
      async werkwijzen(projectId) {
        await latency();
        return clone(state.werkwijzen.filter((entry) => entry.projectId === null || entry.projectId === projectId));
      },
    },

    approvals: {
      async list() {
        await latency();
        return clone(state.approvals);
      },
      async get(approvalId) {
        await latency();
        const approval = state.approvals.find((entry) => entry.id === approvalId);
        return approval ? clone(approval) : null;
      },
      async decide(approvalId, decision: ApprovalDecision) {
        await latency("write");
        const approval = state.approvals.find((entry) => entry.id === approvalId);
        if (!approval) throw new Error("Deze goedkeuring bestaat niet meer.");
        if (decision.kind === "snooze") {
          approval.status = "snoozed";
          save();
          return null;
        }
        if (decision.kind === "decline") {
          approval.status = "declined";
          const entry: OutboundEntry = { ...outboundFromApproval(approvalId), status: "declined", statusText: "Afgewezen", decidedBy: decision.note ? `Jij: "${decision.note}"` : "Jij wees af", steps: [] };
          state.sent.unshift(entry);
          log({ actor: "you", actorName: "Jij", text: `Wees ${approval.id} af`, basis: decision.note, projectId: approval.projectId, runId: approval.runId });
          save();
          return clone(entry);
        }
        if (approval.mail && decision.ccDecisions) {
          for (const cc of approval.mail.cc) {
            const choice = cc.address ? decision.ccDecisions[cc.address] : undefined;
            if (choice) cc.decision = choice;
          }
        }
        approval.status = "approved";
        const entry = outboundFromApproval(approvalId);
        state.sent.unshift(entry);
        log({ actor: "you", actorName: "Jij", text: `Keurde ${approval.id} goed: ${approval.title}`, basis: approval.provenance, projectId: approval.projectId, runId: approval.runId });
        if (approval.kind === "library") {
          for (const proposal of state.proposals) if (approval.id === "APR-0094" && proposal.id === "vs-12") proposal.status = "accepted";
          state.requests = state.requests.filter((request) => request.approvalId !== approval.id);
        }
        if (entry.status === "held") {
          const outId = entry.id;
          later(approval.holdSeconds * 1000, () => {
            const current = state.sent.find((sent) => sent.id === outId);
            if (!current || current.status !== "held") return;
            const at = Date.now();
            current.status = "sent";
            current.statusText = "Verstuurd, gevonden in Verzonden items";
            current.steps.push(
              { at: at - 2000, title: `${approval.holdSeconds} s vastgehouden`, detail: "Ongedaan maken was mogelijk" },
              { at: at - 1000, title: "Versturen", detail: "Concept ongewijzigd sinds goedkeuring" },
              { at, title: "Outlook nam hem aan", detail: "Verstuurd" },
              { at: at + 1000, title: "Gevonden in Verzonden items", detail: "Bevestigd" },
            );
            if (approval.runId === "RUN-0421") {
              const todo = state.todos.find((todoEntry) => todoEntry.id === "t-3");
              if (todo) {
                todo.done = true;
                todo.doneAt = at;
              }
            }
            log({ actor: "app", actorName: "De app", text: `${outId} verstuurd en gevonden in Verzonden items`, basis: null, projectId: approval.projectId, runId: approval.runId });
          });
        }
        save();
        return clone(entry);
      },
      async undo(outboundId) {
        await latency("write");
        const entry = state.sent.find((sent) => sent.id === outboundId);
        if (!entry || entry.status !== "held") throw new Error("Dit kan niet meer ongedaan worden gemaakt.");
        entry.status = "undone";
        entry.statusText = "Ongedaan gemaakt tijdens het wachten";
        entry.decidedBy = "Jij keurde goed en maakte het ongedaan";
        const approval = state.approvals.find((candidate) => candidate.id === outboundId);
        if (approval) approval.status = "open";
        log({ actor: "you", actorName: "Jij", text: `Maakte ${outboundId} ongedaan tijdens het wachten`, basis: null, projectId: entry.projectId, runId: null });
        save();
      },
      async resolve(outboundId, outcome) {
        await latency("write");
        const entry = state.sent.find((sent) => sent.id === outboundId);
        if (!entry) throw new Error("Dit item staat niet meer in het verzendlog.");
        if (outcome === "later") return;
        entry.status = outcome === "sent" ? "sent" : "declined";
        entry.statusText = outcome === "sent" ? "Verstuurd, door jou bevestigd" : "Niet verstuurd; opnieuw versturen vraagt een nieuwe goedkeuring";
        for (const run of state.runs) {
          if (run.interruption?.outbound?.id === outboundId) run.interruption.outbound = clone(entry);
        }
        log({ actor: "you", actorName: "Jij", text: outcome === "sent" ? `Bevestigde dat ${outboundId} is verstuurd` : `Bevestigde dat ${outboundId} niet is verstuurd`, basis: "Gecontroleerd in Verzonden items", projectId: entry.projectId, runId: null });
        save();
      },
    },

    activity: {
      async list() {
        await latency();
        return clone([...state.activity].sort((a, b) => b.at - a.at));
      },
      async sent() {
        await latency();
        return clone([...state.sent].sort((a, b) => b.at - a.at));
      },
    },

    library: {
      async shelves() {
        await latency();
        return clone(state.shelves);
      },
      async pages(shelfId) {
        await latency();
        return clone(state.pages.filter((page) => shelfId === null || page.shelfId === shelfId).sort((a, b) => b.updatedAt - a.updatedAt));
      },
      async page(pageId) {
        await latency();
        const page = state.pages.find((entry) => entry.id === pageId);
        return page ? clone(page) : null;
      },
      async requests() {
        await latency();
        return clone(state.requests);
      },
      async proposals() {
        await latency();
        return clone(state.proposals);
      },
      async proposal(proposalId) {
        await latency();
        const proposal = state.proposals.find((entry) => entry.id === proposalId);
        return proposal ? clone(proposal) : null;
      },
      async decide(proposalId, decision) {
        await latency("write");
        const proposal = state.proposals.find((entry) => entry.id === proposalId);
        if (!proposal) throw new Error("Dit voorstel bestaat niet meer.");
        proposal.status = decision === "accept" ? "accepted" : "rejected";
        const approval = state.approvals.find((entry) => entry.id === "APR-0094" && proposalId === "vs-12");
        if (approval) approval.status = decision === "accept" ? "approved" : "declined";
        state.requests = state.requests.filter((request) => !(proposalId === "vs-12" && request.approvalId === "APR-0094"));
        if (decision === "accept") {
          const page = state.pages.find((entry) => entry.title === proposal.changes[0]?.pageTitle);
          if (page) {
            page.body += `\n- ${proposal.changes[0]?.diff.find((line) => line.op === "add")?.text ?? ""}`;
            page.updatedAt = Date.now();
            page.history.unshift({ at: Date.now(), who: "Jij", text: "Wijziging gepubliceerd" });
          }
          state.sent.unshift({ id: nextOutId(), title: "Een bibliotheekwijziging publiceren", kind: "library", target: [proposal.changes.map((change) => change.pageTitle).join(", "), proposal.audience], status: "published", statusText: "Gepubliceerd", decidedBy: "Jij keurde goed", at: Date.now(), steps: [], projectId: null });
        }
        log({ actor: "you", actorName: "Jij", text: decision === "accept" ? `Publiceerde "${proposal.title}"` : `Wees "${proposal.title}" af`, basis: proposal.from, projectId: null, runId: proposal.runId });
        save();
      },
      async verify(pageId) {
        await latency("write");
        const page = state.pages.find((entry) => entry.id === pageId);
        if (!page) throw new Error("Deze pagina bestaat niet meer.");
        page.verified = { by: "Jij", at: Date.now() };
        page.stale = null;
        page.checkDue = Date.now() + 90 * DAY;
        page.history.unshift({ at: Date.now(), who: "Jij", text: "Gecontroleerd" });
        state.requests = state.requests.filter((request) => request.pageId !== pageId || request.kind !== "check");
        log({ actor: "you", actorName: "Jij", text: `Controleerde "${page.title}"`, basis: null, projectId: null, runId: null });
        save();
        return clone(page);
      },
      async ask(question) {
        await wait(900);
        const words = question.toLowerCase().split(/\W+/).filter((word) => word.length > 3);
        const hits = state.pages.filter((page) => words.some((word) => `${page.title} ${page.body}`.toLowerCase().includes(word))).slice(0, 2);
        const shelfName = (shelfId: string) => state.shelves.find((shelf) => shelf.id === shelfId)?.name ?? "";
        if (hits.length === 0) return { text: "Daar staat nog niets over in de pagina's die je mag lezen. Leg het vast als notitie in Alleen jij, of vraag een collega.", citations: [] };
        return {
          text: `Volgens ${hits.map((page) => `"${page.title}"`).join(" en ")}: ${hits[0]?.body.split("\n").find((line) => line.startsWith("- ") || (line.length > 40 && !line.startsWith("#")))?.replace(/^- /, "") ?? ""}`,
          citations: hits.map((page) => ({ pageId: page.id, title: page.title, shelf: shelfName(page.shelfId) })),
        };
      },
    },

    projects: {
      async areas() {
        await latency();
        return clone(state.areas);
      },
      async briefs() {
        await latency();
        for (const id of options.projectIds()) if (id !== P.personal) briefFor(id);
        return clone(state.briefs.filter((brief) => options.projectIds().includes(brief.projectId)));
      },
      async brief(projectId) {
        await latency();
        if (!options.projectIds().includes(projectId)) return null;
        return clone(briefFor(projectId));
      },
      async updateBrief(projectId, patch) {
        await latency("write");
        const brief = briefFor(projectId);
        const { areaId, ...rest } = patch;
        Object.assign(brief, rest);
        if (areaId) {
          const area = state.areas.find((entry) => entry.id === areaId);
          if (area) brief.area = area;
        }
        save();
        return clone(brief);
      },
      async proposal(fromChat): Promise<ProjectProposal> {
        await latency();
        const now = Date.now();
        return {
          fromChat: fromChat ? { ...fromChat, title: "Onderhoud voor een bakkerij", startedAt: dayAt(now, -2, 11, 20) } : null,
          title: fromChat ? "Onderhoudscontract Bakkerij Van Dijk" : "",
          goal: fromChat ? "Een onderhoudsvoorstel en een planning leveren aan Bakkerij Van Dijk." : "",
          doneWhen: "Het voorstel is naar Lars gestuurd en de planning is afgesproken in het overleg.",
          areaId: fromChat ? "a-vandijk" : "a-intern",
          target: fromChat ? dayAt(now, 15, 17) : null,
          sources: fromChat
            ? [
                { id: "ps-1", title: "Deze chat", meta: "verhuist naar het project", pinned: true },
                { id: "ps-2", title: "\"Onderhoudscontract\" van Lars van Dijk", meta: "Extern · gekoppeld, niet gekopieerd", pinned: true },
                { id: "ps-3", title: "DKS-142 Onderhoud: leverancier kiezen", meta: "HubSpot", pinned: true },
              ]
            : [],
          todos: fromChat
            ? [
                { id: "pt-1", title: "Optie-overzicht naar Lars sturen", due: dayAt(now, 4, 17), include: false, duplicateOf: "Optie-overzicht naar Lars sturen" },
                { id: "pt-2", title: "Presentatie voor het overleg voorbereiden", due: dayAt(now, 7, 14), include: true, duplicateOf: null },
                { id: "pt-3", title: "Ruben om een testomgeving vragen", due: null, include: true, duplicateOf: null },
              ]
            : [],
        };
      },
      async review(projectId): Promise<ProjectReview> {
        await latency();
        const todos = state.todos.filter((todo) => todo.projectId === projectId && !todo.done);
        const waiting = state.waiting.filter((entry) => entry.projectId === projectId);
        const runs = state.runs.filter((run) => run.projectId === projectId);
        return {
          open: [
            ...todos.map((todo, index) => ({ id: todo.id, title: todo.title, kind: "todo" as const, detail: null, choice: index === 0 ? ("done" as const) : null })),
            ...waiting.map((entry) => ({ id: entry.id, title: `Wachten op ${entry.person.name}: ${entry.title.toLowerCase()}`, kind: "waiting" as const, detail: `Wachten-op · ${entry.person.org}`, choice: "keep" as const })),
          ],
          agentWork: {
            summary: `${runs.filter((run) => run.status === "working").length === 0 ? "Geen runs actief" : `${runs.filter((run) => run.status === "working").length} runs actief`}. ${runs.filter((run) => run.status === "done").length} runs klaar en gecontroleerd.`,
            unreviewed: runs.filter((run) => run.status === "review").map((run) => ({ id: run.id, title: run.title, meta: `${run.id} · Alleen jij` })),
          },
          decisions:
            projectId === P.offertes
              ? [{ id: "dc-1", title: "Gekozen onderhoudsoptie: [de optie uit het overleg]", body: "Waarom, de alternatieven en de 24-uurscontrole, gekoppeld aan de notitie van RUN-0417.", choice: null }]
              : [],
          learnings:
            projectId === P.offertes
              ? [
                  {
                    id: "ln-1",
                    title: "Werkinstructie: een onderhoudscontract kiezen",
                    diff: [
                      { op: "remove", text: "Bakkerij Van Dijk" },
                      { op: "add", text: "De klant" },
                      { op: "same", text: "wilde 2–3 opties met een ruwe indicatie van de maandkosten…" },
                    ],
                    removed: 6,
                    include: true,
                  },
                ]
              : [],
          outside: projectId === P.offertes ? "DKS-142 staat nog open in HubSpot. Deze app wijzigt HubSpot niet." : null,
        };
      },
      async complete(projectId, commit) {
        await latency("write");
        for (const [todoId, choice] of Object.entries(commit.open)) {
          const todo = state.todos.find((entry) => entry.id === todoId);
          if (todo && (choice === "done" || choice === "cancel")) {
            todo.done = true;
            todo.doneAt = Date.now();
          }
          if (todo && choice === "move") todo.projectId = null;
          if (choice === "cancel") state.waiting = state.waiting.filter((entry) => entry.id !== todoId);
        }
        const brief = briefFor(projectId);
        brief.state = commit.final === "completed" ? "completed" : "on_hold";
        log({ actor: "you", actorName: "Jij", text: commit.final === "completed" ? `Rondde ${name(projectId)} af` : `Stopte ${name(projectId)}`, basis: null, projectId, runId: null });
        save();
      },
    },

    settings: {
      async agent() {
        await latency();
        return clone(state.agent);
      },
      async setRisk(risk, effect) {
        await latency("write");
        const rule = state.agent.rules.find((entry) => entry.risk === risk);
        if (rule && rule.choices.includes(effect)) rule.effect = effect;
        save();
        return clone(state.agent);
      },
    },

    async search(query) {
      await latency();
      const q = query.trim().toLowerCase();
      if (!q) return [];
      const match = (text: string) => text.toLowerCase().includes(q);
      const hits: SearchHit[] = [];
      for (const id of options.projectIds()) {
        const projectName = options.projectName(id) ?? "";
        const brief = state.briefs.find((entry) => entry.projectId === id);
        if (match(projectName) || (brief?.goal && match(brief.goal))) hits.push({ id: `p-${id}`, group: "work", kind: "project", title: projectName, meta: `Project${brief?.goal ? ` · doel: ${brief.goal}` : ""}`, href: `#/p/${id}` });
      }
      for (const run of state.runs) if (match(run.title) || match(run.id)) hits.push({ id: run.id, group: "work", kind: "run", title: run.title, meta: `Run ${run.id} · ${run.waitingOn}`, href: `#/runs/${run.id}` });
      for (const todo of state.todos) if (!todo.done && match(todo.title)) hits.push({ id: todo.id, group: "work", kind: "todo", title: todo.title, meta: `To-do${todo.origin ? ` · ${todo.origin}` : ""}`, href: "#/" });
      for (const page of state.pages) if (match(page.title) || match(page.body)) hits.push({ id: page.id, group: "library", kind: "page", title: page.title, meta: `${state.shelves.find((shelf) => shelf.id === page.shelfId)?.name ?? ""} · ${page.kind === "note" ? "notitie" : page.kind === "decision" ? "besluit" : page.kind === "checklist" ? "checklist" : "werkinstructie"}`, href: `#/bibliotheek/pagina/${page.id}` });
      for (const item of state.inbox) if (item.mail && (match(item.mail.subject) || match(item.mail.body))) hits.push({ id: item.id, group: "library", kind: "mail", title: item.mail.subject, meta: `Outlook · ${item.from?.name ?? ""} · ${item.from?.org ?? ""}`, href: "#/inbox" });
      return hits.slice(0, 12);
    },
  };

  return cockpit;
}

