import { describe, expect, test } from "bun:test";

import { roundSpecs } from "../src/agent.ts";
import { parseEvents, parseMails, splitCommand } from "../src/connectors.ts";
import { formatTodoLine, isProseTodo, ownHandles, parseTeam, parseTodoLine, setDone } from "../src/notation.ts";
import { meetingIsNear, pickStart, rankTodos, upcomingRows } from "../src/rank.ts";
import { parseState, readSettings } from "../src/store.ts";
import { DEFAULT_SETTINGS, type Meeting, type Todo } from "../src/types.ts";

const todo = (id: string, patch: Partial<Todo> = {}): Todo => ({
  id, brainId: "b", brainName: "Sales", brainKind: "project", path: "taken.md", line: 1, text: id, done: false, owner: "sam", due: null, dueKind: null, mine: true, ...patch,
});

describe("de notatie (plan §2.1)", () => {
  test("een regel met eigenaar en datum", () => {
    expect(parseTodoLine("- [ ] Offerte sturen @Sam 📅 2026-11-20")).toEqual({ done: false, text: "Offerte sturen", owner: "sam", due: "2026-11-20", dueKind: "deadline" });
    expect(parseTodoLine("  * [x] Reactie van de leverancier @robin ⏳ 2026-11-19")).toEqual({ done: true, text: "Reactie van de leverancier", owner: "robin", due: "2026-11-19", dueKind: "waiting" });
    expect(parseTodoLine("1. [ ] Zonder iets")).toEqual({ done: false, text: "Zonder iets", owner: null, due: null, dueKind: null });
  });

  test("een e-mailadres is geen eigenaar, een onmogelijke datum geen datum", () => {
    expect(parseTodoLine("- [ ] Mail naar info@example.com sturen")).toMatchObject({ owner: null, text: "Mail naar info@example.com sturen" });
    expect(parseTodoLine("- [ ] Iets 📅 2026-02-31")).toMatchObject({ due: null, text: "Iets 📅 2026-02-31" });
  });

  test("geen checkbox, geen taak", () => {
    expect(parseTodoLine("- Offerte sturen")).toBeNull();
    expect(parseTodoLine("[ ] los")).toBeNull();
    expect(parseTodoLine("- [ ]   ")).toBeNull();
  });

  test("schrijven en teruglezen geven hetzelfde; afvinken laat de rest van de regel staan", () => {
    const line = formatTodoLine({ text: "  Demo\nvoorbereiden ", owner: "@Sam", due: "2026-11-25", dueKind: "waiting" });
    expect(line).toBe("- [ ] Demo voorbereiden @sam ⏳ 2026-11-25");
    expect(parseTodoLine(line)).toMatchObject({ text: "Demo voorbereiden", owner: "sam", dueKind: "waiting" });
    expect(setDone("  - [ ] Iets  @sam  📅 2026-11-20 <!-- x -->", true)).toBe("  - [x] Iets  @sam  📅 2026-11-20 <!-- x -->");
    expect(setDone("geen taak", true)).toBeNull();
  });

  test("taakachtig proza wordt herkend, een checkbox niet", () => {
    expect(isProseTodo("TODO: offerte nabellen")).toBe(true);
    expect(isProseTodo("- **Actie**: Sam stuurt de planning")).toBe(true);
    expect(isProseTodo("- [ ] TODO: al een taak")).toBe(false);
    expect(isProseTodo("We bespraken de todo-lijst.")).toBe(false);
  });

  test("team.md koppelt @naam aan de git-auteur; zonder team.md telt de voornaam", () => {
    const team = parseTeam("# Team\n\n| Naam | Wie |\n|---|---|\n| @sam | Sam Jansen <sam@example.invalid> |\n- @robin: Robin de Vries\n");
    expect(team).toEqual([{ handle: "sam", name: "Sam Jansen", email: "sam@example.invalid" }, { handle: "robin", name: "Robin de Vries", email: null }]);
    expect(ownHandles({ handle: null, author: { name: "Iemand Anders", email: "SAM@example.invalid" }, teams: team })).toEqual(["sam"]);
    expect(ownHandles({ handle: null, author: { name: "robin de vries", email: "r@example.invalid" }, teams: team })).toEqual(["robin"]);
    expect(ownHandles({ handle: null, author: { name: "Zoë Bakker", email: "z@example.invalid" }, teams: team })).toEqual(["zoe"]);
    expect(ownHandles({ handle: "@Baas", author: { name: "Sam Jansen", email: "sam@example.invalid" }, teams: team })).toEqual(["baas", "sam"]);
  });
});

describe("de keuze (T4)", () => {
  const today = "2026-11-13";
  const todos = [
    todo("later", { due: "2026-11-30", dueKind: "deadline" }),
    todo("zonder"),
    todo("gepland"),
    todo("week", { due: "2026-11-17", dueKind: "deadline" }),
    todo("wacht", { due: "2026-11-12", dueKind: "waiting" }),
    todo("vandaag", { due: today, dueKind: "deadline" }),
    todo("telaat", { due: "2026-11-10", dueKind: "deadline" }),
    todo("ergtelaat", { due: "2026-11-01", dueKind: "deadline" }),
    todo("vananderen", { mine: false }),
    todo("klaar", { done: true, due: "2026-11-01", dueKind: "deadline" }),
  ];

  test("te laat, vandaag, verlopen wachten, dagplan, deze week, de rest", () => {
    expect(rankTodos(todos, { today, planTop: ["gepland"] }).map((entry) => `${entry.todo.id}:${entry.reason}`)).toEqual([
      "ergtelaat:overdue", "telaat:overdue", "vandaag:today", "wacht:waiting_due", "gepland:plan", "week:soon", "later:oldest", "zonder:oldest",
    ]);
  });

  test("'Niet nu' geeft de volgende; is alles overgeslagen, dan blijft de eerste staan", () => {
    expect(pickStart(todos, { today, planTop: [], skipped: ["ergtelaat", "telaat"] })?.todo.id).toBe("vandaag");
    expect(pickStart([todo("a"), todo("b")], { today, planTop: [], skipped: ["a", "b"] })?.todo.id).toBe("a");
    expect(pickStart([todo("x", { mine: false })], { today, planTop: [], skipped: [] })).toBeNull();
  });

  test("Komt eraan: te laat, vandaag, deze week, later; afspraken die voorbij zijn vallen weg", () => {
    const now = new Date(2026, 10, 13, 10, 0).getTime();
    const meeting = (id: string, hours: number): Meeting => ({ id, title: id, start: now + hours * 3_600_000, end: now + (hours + 1) * 3_600_000, allDay: false, location: null, organizer: null, link: null });
    const rows = upcomingRows({ todos, meetings: [meeting("straks", 2), meeting("voorbij", -3), meeting("overmorgen", 50)], now });
    expect(rows.map((row) => `${row.bucket}:${row.kind === "todo" ? row.todo.id : row.meeting.id}`)).toEqual([
      "late:ergtelaat", "late:telaat", "late:wacht", "today:straks", "today:vandaag", "week:overmorgen", "week:week", "later:later",
    ]);
    expect(meetingIsNear(meeting("a", 0.4), now)).toBe(true);
    expect(meetingIsNear(meeting("b", 0.6), now)).toBe(false);
    expect(meetingIsNear({ ...meeting("c", -2) }, now)).toBe(false);
  });
});

describe("instellingen en opslag", () => {
  test("alles staat uit tot de gebruiker het aanzet; het model is gpt-6-luna en instelbaar", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ enabled: false, calendar: false, mail: false, slack: false, model: "gpt-6-luna" });
    const next = readSettings({ enabled: true, model: " ander-model ", handle: "@Sam", workStartHour: 9, workEndHour: 9, slackCommand: "/x/slack.sh\n--json" });
    expect(next).toMatchObject({ enabled: true, model: "ander-model", handle: "Sam", workStartHour: 9, workEndHour: 10, slackCommand: "/x/slack.sh --json", ms365Command: DEFAULT_SETTINGS.ms365Command });
    expect(readSettings({ model: "" }).model).toBe("gpt-6-luna");
    expect(readSettings({ enabled: "ja" }, next).enabled).toBe(true);
  });

  test("een kapot bestand geeft een lege toestand, geen fout", () => {
    expect(parseState("{nee").settings.enabled).toBe(false);
    const state = parseState(JSON.stringify({ items: [{ kind: "message", key: "mail:1", source: "mail", title: "T", from: "F", why: "W", reply: { via: "mail", messageId: "1" }, at: 1 }, { kind: "onbekend", key: "x" }], dismissed: { a: 1, b: "nee" } }));
    expect(state.items).toHaveLength(1);
    expect(state.dismissed).toEqual({ a: 1 });
  });
});

describe("koppelingen", () => {
  test("een opdrachtregel wordt in woorden gesplitst, zonder shell", () => {
    expect(splitCommand(`npx -y @softeria/ms-365-mcp-server --org-mode`)).toEqual(["npx", "-y", "@softeria/ms-365-mcp-server", "--org-mode"]);
    expect(splitCommand(`"/Users/een map/slack.sh" --x 'a b' ""`)).toEqual(["/Users/een map/slack.sh", "--x", "a b", ""]);
    expect(splitCommand("  ")).toEqual([]);
  });

  test("afspraken uit Graph: UTC zonder zone, geannuleerd valt weg, op starttijd", () => {
    const events = parseEvents(JSON.stringify({ value: [
      { id: "b", subject: "Later", start: { dateTime: "2026-11-13T14:00:00.0000000", timeZone: "UTC" }, end: { dateTime: "2026-11-13T15:00:00.0000000", timeZone: "UTC" }, location: { displayName: " Zaal 2 " }, organizer: { emailAddress: { name: "Robin" } }, webLink: "https://outlook.example/b" },
      { id: "a", subject: "", start: { dateTime: "2026-11-13T09:00:00Z" }, end: { dateTime: "2026-11-13T09:30:00Z" }, isAllDay: false },
      { id: "c", subject: "Weg", isCancelled: true, start: { dateTime: "2026-11-13T10:00:00" }, end: { dateTime: "2026-11-13T11:00:00" } },
    ] }));
    expect(events.map((event) => event.id)).toEqual(["a", "b"]);
    expect(events[0]).toMatchObject({ title: "Afspraak", start: Date.parse("2026-11-13T09:00:00Z") });
    expect(events[1]).toMatchObject({ location: "Zaal 2", organizer: "Robin", start: Date.parse("2026-11-13T14:00:00Z"), link: "https://outlook.example/b" });
    expect(parseEvents("geen json")).toEqual([]);
  });

  test("mail: de triagevorm en de gewone lijst lezen hetzelfde", () => {
    expect(parseMails(JSON.stringify([{ id: "1", from: "Robin <r@example.invalid>", subject: "Offerte", received: "2026-11-13T08:00:00Z", text: "Kun je vandaag reageren?" }]), 100)[0])
      .toMatchObject({ id: "1", from: "Robin <r@example.invalid>", subject: "Offerte", text: "Kun je vandaag reageren?" });
    expect(parseMails(JSON.stringify({ value: [{ id: "2", from: { emailAddress: { name: "Sam", address: "s@example.invalid" } }, subject: " ", bodyPreview: "x".repeat(50), webLink: "https://outlook.example/2" }] }), 10)[0])
      .toMatchObject({ id: "2", from: "Sam", subject: "(geen onderwerp)", text: "x".repeat(10), link: "https://outlook.example/2" });
  });
});

describe("de rondes", () => {
  test("drie rondes op werkdagen, binnen de werktijd; de prompt noemt alleen wat aan staat", () => {
    const specs = roundSpecs({ ...DEFAULT_SETTINGS, enabled: true, mail: true, workStartHour: 8, workEndHour: 18 }, "Europe/Amsterdam");
    expect(specs.map((spec) => spec.system)).toEqual(["agent.ochtend", "agent.tussendoor", "agent.avond"]);
    expect(specs[0]?.schedule).toEqual({ kind: "weekly", timezone: "Europe/Amsterdam", daysOfWeek: [1, 2, 3, 4, 5], hour: 8, minute: 0 });
    expect(specs[1]?.schedule).toEqual({ kind: "interval", timezone: "Europe/Amsterdam", everyHours: 2, daysOfWeek: [1, 2, 3, 4, 5], startHour: 10, endHour: 18 });
    expect(specs[2]?.schedule).toMatchObject({ hour: 17, minute: 30 });
    expect(specs[0]?.prompt).toContain("mail_ongelezen");
    expect(specs[0]?.prompt).not.toContain("slack_ongelezen");
    expect(specs[0]?.prompt).not.toContain("agenda_lezen");
    for (const spec of specs) expect(spec.prompt).toContain("Je verstuurt nooit zelf iets");
  });
});
