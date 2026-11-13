import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { createRoutinesHooks } from "../../bonzaiwork-routines/src/index.ts";
import { createMs365, createSlackCli } from "../src/connectors.ts";
import { createTodayHooks, type TodayHooks, type TodayHost } from "../src/hooks.ts";
import { readView } from "../src/read.ts";
import type { Todo, TodayView } from "../src/types.ts";

/**
 * The routes and the agent's tools together, on real folders, with stand-ins for the MS365 server
 * and the Slack script (test/fixtures) and the real routine planner.
 */
const NOW = new Date(2026, 10, 13, 10, 0).getTime(); // Friday 13 November 2026, 10:00
const fixture = (name: string) => join(import.meta.dir, "fixtures", name);

let root: string;
let hooks: TodayHooks;
let routines: ReturnType<typeof createRoutinesHooks>;
let changed: string[];
let mcpEntries: Array<Record<string, Record<string, unknown> | null>>;
let engineCalls: Array<{ method: string; path: string; body: unknown }>;
let pendingQuestions: Array<{ id: string; action: string }>;
let readOnly = false;

const write = async (path: string, content: string) => { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), content); };
const read = (path: string) => readFile(join(root, path), "utf8");
type Logged = { name?: string; command?: string; args: unknown; stdin?: string };
const lines = async (path: string): Promise<Array<{ name: string | null; command: string | null; args: unknown; list: string[]; stdin: string | null }>> =>
  (await readFile(path, "utf8").catch(() => "")).split("\n").filter(Boolean).map((line) => {
    const entry: unknown = JSON.parse(line);
    const text = (key: keyof Logged) => { const value = field(entry, key); return typeof value === "string" ? value : null; };
    const args = field(entry, "args");
    return { name: text("name"), command: text("command"), args, list: Array.isArray(args) ? args.map(String) : [], stdin: text("stdin") };
  });

/** A field of an answer that is only known as JSON. */
const field = (value: unknown, key: string): unknown => (typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined);

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; body: unknown }> {
  const route = hooks.routes.find((entry) => entry.method === method && new RegExp(`^${entry.path.replace(/:[A-Za-z]+/g, "([^/]+)")}$`).test(path));
  if (!route) throw new Error(`no route ${method} ${path}`);
  const names = [...route.path.matchAll(/:([A-Za-z]+)/g)].map((match) => match[1] ?? "");
  const values = new RegExp(`^${route.path.replace(/:[A-Za-z]+/g, "([^/]+)")}$`).exec(path)?.slice(1) ?? [];
  const params = Object.fromEntries(names.map((name, index) => [name, decodeURIComponent(values[index] ?? "")]));
  const response = await route.handle(new Request(`http://local${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), params);
  const answer: unknown = await response.json().catch(() => null);
  return { status: response.status, body: answer };
}

async function tool(name: string, args: Record<string, unknown> = {}): Promise<{ text: string; isError: boolean }> {
  const route = hooks.routes.find((entry) => entry.method === "POST" && entry.path === "/bonzaiwork/today/mcp");
  const token = String(field(mcpEntries.filter((entry) => entry.vandaag).at(-1)?.vandaag?.headers, "authorization"));
  if (!route) throw new Error("no MCP route");
  const response = await route.handle(new Request("http://local/mcp", { method: "POST", headers: { authorization: token }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }), {});
  const answer: unknown = await response.json();
  const result = field(answer, "result");
  const content: unknown = field(result, "content");
  return { text: String(field(Array.isArray(content) ? content[0] : null, "text")), isError: field(result, "isError") === true };
}

const view = (): Promise<TodayView> => hooks.service.view();
const todos = async (): Promise<Todo[]> => (await hooks.service.scan()).todos;
/** The to-do "Start hier" shows now. */
const first = async (): Promise<Todo> => {
  const start = (await view()).start;
  if (!start) throw new Error("no to-do to start with");
  return start.todo;
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "bonzaiwork-today-"));
  changed = []; mcpEntries = []; engineCalls = []; pendingQuestions = []; readOnly = false;
  await write("mijn/AGENTS.md", "# Mijn brein\n");
  await write("mijn/taken.md", "# Taken\n\n- [ ] Belasting regelen 📅 2026-11-13\n- [ ] Boek uitlezen\n");
  await write("sales/team.md", "- @sam: Sam Jansen <sam@example.invalid>\n- @robin: Robin de Vries <robin@example.invalid>\n");
  await write("sales/taken.md", "# Taken\n\n- [ ] Offerte sturen @sam 📅 2026-11-10\n- [ ] Demo voorbereiden @robin 📅 2026-11-12\n- [ ] Website nalopen\n- [x] Planning rondgestuurd @sam\n");
  await write("sales/notities/overleg.md", "# Overleg\n\nTODO: prijslijst bijwerken\n\n```\n- [ ] in een codeblok telt niet @sam\n```\n\n- [ ] Notulen delen @sam ⏳ 2026-11-20\n");
  await write("sales/.opencode/x.md", "- [ ] verborgen map telt niet @sam\n");

  const host: TodayHost & Parameters<typeof routines.start>[0] = {
    port: 4321,
    get readOnly() { return readOnly; },
    workspaces: () => [{ id: "ws-mijn", path: join(root, "mijn") }, { id: "ws-sales", path: join(root, "sales") }],
    updateEngineMcp: async (servers) => { mcpEntries.push(servers); return true; },
    engineRequest: async (_workspaceId, method, path, body) => {
      engineCalls.push({ method, path, body });
      if (method === "POST" && path === "/api/session") return { status: 200, body: { id: `ses_${engineCalls.length}` } };
      if (method === "GET" && path.endsWith("/permission")) return { status: 200, body: pendingQuestions };
      return { status: 200, body: {} };
    },
    onSessionActivity: () => () => undefined,
    log: () => undefined,
  };
  const environment = { ...process.env, FAKE_NOW: String(NOW), FAKE_MS365_LOG: join(root, "ms365.log"), FAKE_SLACK_LOG: join(root, "slack.log") };
  // The planner waits on its own clock for the brain tools, so its clock has to run.
  const started = Date.now();
  routines = createRoutinesHooks({ stateDirectory: join(root, "state"), now: () => NOW + (Date.now() - started), tickMs: 3_600_000, mcpWaitMs: 1 });
  hooks = createTodayHooks({
    stateDirectory: join(root, "state"), now: () => NOW, timezone: "Europe/Amsterdam", environment, reconcileEveryMs: 3_600_000, permissionPollMs: 3_600_000,
    routines,
    brains: {
      brains: async () => [
        { id: "ws-mijn", name: "Mijn brein", root: join(root, "mijn"), kind: "personal", excluded: [], readOnly: false },
        { id: "ws-sales", name: "Sales", root: join(root, "sales"), kind: "project", excluded: [], readOnly: false },
      ],
      author: () => ({ name: "Sam Jansen", email: "sam@example.invalid" }),
      changed: async (id) => { changed.push(id); },
    },
    ms365: createMs365({ command: () => `node ${fixture("fake-ms365.mjs")}`, environment }),
    slack: createSlackCli({ command: () => `node ${fixture("fake-slack.mjs")}`, environment }),
  });
  await routines.start(host);
  await hooks.start(host);
});

afterEach(async () => {
  hooks.stop();
  routines.stop();
  await rm(root, { recursive: true, force: true });
});

const enable = (patch: Record<string, unknown> = {}) => call("PUT", "/bonzaiwork/today/settings", { enabled: true, ...patch });

describe("uit tot je het aanzet (T10)", () => {
  test("uit: geen tools in de engine, geen rondes, Vandaag zoals het was", async () => {
    expect(mcpEntries).toEqual([{ vandaag: null }]);
    expect((await call("GET", "/bonzaiwork/today")).body).toMatchObject({ enabled: false, start: null, items: [], rounds: [] });
    expect((await call("POST", "/bonzaiwork/today/park", { text: "idee" })).status).toBe(409);
    expect(routines.systemRoutines("agent.")).toEqual([]);
  });

  test("aan: de tools staan in de engine en de drie rondes bestaan in het persoonlijke brein, op gpt-6-luna", async () => {
    await enable();
    expect(mcpEntries.at(-1)?.vandaag).toMatchObject({ type: "remote", url: "http://127.0.0.1:4321/bonzaiwork/today/mcp" });
    const rounds = routines.systemRoutines("agent.");
    expect(rounds.map((round) => round.system)).toEqual(["agent.ochtend", "agent.tussendoor", "agent.avond"]);
    for (const round of rounds) expect(round).toMatchObject({ workspaceId: "ws-mijn", model: "gpt-6-luna", brains: ["ws-sales"], state: "active" });
    expect(rounds.every((round) => typeof round.nextRunAt === "number" && round.nextRunAt > NOW)).toBe(true);
    expect((await view()).rounds.map((round) => round.name)).toEqual(["Persoonlijke agent: ochtend", "Persoonlijke agent: tussendoor", "Persoonlijke agent: avond"]);
  });

  test("een ander model geldt voor alle rondes; uitzetten haalt ze weg; BONZAIWORK_TODAY=0 wint van de instelling", async () => {
    await enable();
    await enable({ model: "glm-5" });
    expect(routines.systemRoutines("agent.").map((round) => round.model)).toEqual(["glm-5", "glm-5", "glm-5"]);
    await call("PUT", "/bonzaiwork/today/settings", { enabled: false });
    expect(routines.systemRoutines("agent.")).toEqual([]);
    expect(mcpEntries.at(-1)).toEqual({ vandaag: null });

    const killed = createTodayHooks({ stateDirectory: join(root, "state"), environment: { BONZAIWORK_TODAY: "0" } });
    await killed.service.setSettings({ enabled: true });
    expect(killed.service.enabled()).toBe(false);
  });

  test("een alleen-lezen apparaat verandert niets", async () => {
    await enable();
    readOnly = true;
    expect((await call("POST", "/bonzaiwork/today/park", { text: "idee" })).status).toBe(403);
    expect((await call("GET", "/bonzaiwork/today")).status).toBe(200);
  });
});

describe("taken over de breinen (plan §2)", () => {
  beforeEach(async () => { await enable(); });

  test("de index leest elke checkbox; mijn taken zijn die met mijn @naam, en alles zonder naam in mijn eigen brein", async () => {
    const listed = await call("GET", "/bonzaiwork/today/todos");
    expect(listed.status).toBe(200);
    expect(field(listed.body, "items")).toHaveLength(7);
    expect((await todos()).map((todo) => `${todo.brainName}/${todo.path}:${todo.text}:${todo.mine}`)).toEqual([
      "Mijn brein/taken.md:Belasting regelen:true", "Mijn brein/taken.md:Boek uitlezen:true",
      "Sales/notities/overleg.md:Notulen delen:true",
      "Sales/taken.md:Offerte sturen:true", "Sales/taken.md:Demo voorbereiden:false", "Sales/taken.md:Website nalopen:false", "Sales/taken.md:Planning rondgestuurd:true",
    ]);
    const now = await view();
    expect(now.handles).toEqual(["sam"]);
    expect(now.counts).toEqual({ mine: 4, backlog: 1, inbox: 0 });
    expect(now.cleanup).toEqual([{ brainId: "ws-sales", brainName: "Sales", brainKind: "project", lines: 1 }]);
  });

  test("Start hier kiest de taak die te laat is; 'Niet nu' geeft de volgende, hooguit drie keer", async () => {
    let now = await view();
    expect(now.start).toMatchObject({ reason: "overdue", todo: { text: "Offerte sturen" }, skipsLeft: 3, firstStep: null });
    await call("POST", `/bonzaiwork/today/todos/${(await first()).id}/skip`);
    now = await view();
    expect(now.start).toMatchObject({ reason: "today", todo: { text: "Belasting regelen" }, skipsLeft: 2 });
    for (let turn = 0; turn < 4; turn += 1) await call("POST", `/bonzaiwork/today/todos/${(await first()).id}/skip`);
    // Three skipped (the late one, today's, the book): the fourth stands, and "Niet nu" is used up.
    expect((await view()).start).toMatchObject({ skipsLeft: 0, todo: { text: "Notulen delen" } });
  });

  test("afvinken verandert alleen die regel, legt het vast in het brein en geeft de volgende taak", async () => {
    const done = await call("POST", `/bonzaiwork/today/todos/${(await first()).id}/done`, { done: true });
    expect(field(done.body, "todo")).toMatchObject({ done: true, text: "Offerte sturen" });
    expect(await read("sales/taken.md")).toBe("# Taken\n\n- [x] Offerte sturen @sam 📅 2026-11-10\n- [ ] Demo voorbereiden @robin 📅 2026-11-12\n- [ ] Website nalopen\n- [x] Planning rondgestuurd @sam\n");
    expect(changed).toEqual(["ws-sales"]);
    expect((await view()).start?.todo.text).toBe("Belasting regelen");
    expect((await call("POST", "/bonzaiwork/today/todos/bestaatniet/done", {})).status).toBe(404);
  });

  test("een nieuwe taak in een gedeeld brein is van mij, tenzij ze iemand noemt; een teamgenoot ziet haar als de zijne", async () => {
    const mine = await call("POST", "/bonzaiwork/today/todos", { text: "Prijslijst  bijwerken", brainId: "ws-sales", due: "2026-11-18" });
    expect(mine.status).toBe(201);
    expect(field(mine.body, "todo")).toMatchObject({ owner: "sam", mine: true, due: "2026-11-18", path: "taken.md" });
    const theirs = await call("POST", "/bonzaiwork/today/todos", { text: "Contract nalezen", brainId: "ws-sales", owner: "@Robin" });
    expect(field(theirs.body, "todo")).toMatchObject({ owner: "robin", mine: false });
    expect(await read("sales/taken.md")).toContain("- [ ] Prijslijst bijwerken @sam 📅 2026-11-18\n- [ ] Contract nalezen @robin\n");
    const own = await call("POST", "/bonzaiwork/today/todos", { text: "Tandarts bellen" });
    expect(field(own.body, "todo")).toMatchObject({ brainId: "ws-mijn", owner: null, mine: true });
    expect((await call("POST", "/bonzaiwork/today/todos", { text: "x", due: "morgen" })).status).toBe(400);
  });

  test("Komt eraan: deadlines en beloftes met een datum, die van anderen niet", async () => {
    const rows = (await view()).upcoming;
    expect(rows.map((row) => `${row.bucket}:${row.kind === "todo" ? row.todo.text : row.meeting.title}`)).toEqual(["late:Offerte sturen", "today:Belasting regelen", "week:Notulen delen"]);
  });

  test("Parkeren zet de gedachte in de inbox van het persoonlijke brein en nergens anders", async () => {
    const parked = await call("POST", "/bonzaiwork/today/park", { text: "  Idee:\nnieuwsbrief  over de klantdag " });
    expect(parked.status).toBe(201);
    expect(await read("mijn/inbox.md")).toContain("- Idee: nieuwsbrief over de klantdag _(geparkeerd 2026-11-13 10:00)_\n");
    expect(changed).toEqual(["ws-mijn"]);
    const now = await view();
    expect(now.counts.inbox).toBe(1);
    expect(now.counts.mine).toBe(4);
    const entries = await tool("inbox_lezen");
    const id = /- (\w+) · Idee/.exec(entries.text)?.[1] ?? "";
    expect((await tool("inbox_afhandelen", { id })).isError).toBe(false);
    expect(await read("mijn/inbox.md")).not.toContain("klantdag");
  });

  test("Start: de taak wordt de focus en de app krijgt de chat die de eerste stap al doet", async () => {
    const todo = await first();
    await tool("eerste_stap", { id: todo.id, stap: "Open de offerte en vul de drie bedragen in", waarom: "De klant wacht sinds dinsdag" });
    expect((await view()).start).toMatchObject({ firstStep: "Open de offerte en vul de drie bedragen in", why: "De klant wacht sinds dinsdag" });
    const started = await call("POST", "/bonzaiwork/today/focus", { todoId: todo.id });
    expect(field(started.body, "chat")).toMatchObject({ projectId: "ws-sales", title: "Offerte sturen" });
    expect(String(field(field(started.body, "chat"), "prompt"))).toContain("Open de offerte en vul de drie bedragen in");
    await call("POST", "/bonzaiwork/today/focus", { todoId: todo.id, chatId: "ses_9" });
    expect((await view()).focus).toMatchObject({ title: "Offerte sturen", brainId: "ws-sales", chatId: "ses_9", startedAt: NOW });
    await call("POST", `/bonzaiwork/today/todos/${todo.id}/done`, { done: true });
    expect((await view()).focus).toBeNull();
  });

  test("opruimen: de app krijgt een chat in dat brein; de agent stelt eerst voor en schrijft pas na ja", async () => {
    const chat = (await call("POST", "/bonzaiwork/today/cleanup", { brainId: "ws-sales" })).body;
    expect(chat).toMatchObject({ projectId: "ws-sales", title: "Taken opruimen" });
    const prompt = String(field(chat, "prompt"));
    expect(prompt).toContain("Verander nog niets en vraag of het zo goed is");
    expect(prompt).toContain("@sam");
    expect(prompt).toContain("gedeeld met het team");
  });
});

describe("de agent en de buitenwereld (plan §3, T7)", () => {
  beforeEach(async () => { await enable({ calendar: true, mail: true, slack: true, ms365Command: "x", slackCommand: "x" }); });

  test("een koppeling die uit staat weigert, met een zin voor de gebruiker", async () => {
    await enable({ mail: false });
    const refused = await tool("mail_ongelezen");
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain("staat uit");
    expect((await view()).connectors.mail.state).toBe("off");
  });

  test("de agent leest taken, agenda, mail en Slack via zijn eigen, kleine set tools", async () => {
    const todos = await tool("taken_lijst", { alles: true });
    expect(todos.text).toContain("Open taken van de gebruiker (4)");
    expect(todos.text.indexOf("Offerte sturen")).toBeLessThan(todos.text.indexOf("Belasting regelen"));
    expect(todos.text).toContain("Van het team, zonder eigenaar (1)");
    expect((await tool("agenda_lezen")).text).toContain("evt-soon · 2026-11-13 10:20–11:20 · Klantoverleg · Zaal 2 · van Robin");
    expect((await tool("mail_ongelezen")).text).toContain("id: mail-1\nvan: Robin <robin@example.invalid>");
    // The next round only gets what is new; asking again shows it once more.
    expect((await tool("mail_ongelezen")).text).toBe("Geen nieuwe ongelezen mail sinds de vorige ronde.");
    expect((await tool("mail_ongelezen", { opnieuw: true })).text).toContain("id: mail-1");
    expect((await tool("slack_ongelezen", { alleen_vermeldingen: true })).text).toContain('"mentions":1');
    const slack = await lines(join(root, "slack.log"));
    expect(slack[0]).toMatchObject({ command: "unreads", args: ["--json", "--limit", "10", "--mentions-only"] });
    const ms365 = await lines(join(root, "ms365.log"));
    expect(ms365.map((entry) => entry.name)).toEqual(["get-calendar-view", "read-mail-text", "read-mail-text", "read-mail-text"]);
    expect(ms365[1]?.args).toMatchObject({ folderId: "inbox", filter: "isRead eq false" });
  });

  test("een gemeld bericht wordt één kaart; versturen gebeurt pas op de klik, door de server, met de bewerkte tekst", async () => {
    const report = { bron: "mail", id: "mail-1", titel: "Offerte akkoord?", van: "Robin", waarom: "Robin wacht op je akkoord", concept: "Hoi Robin, akkoord." };
    expect((await tool("bericht_melden", report)).text).toBe("De kaart staat bij de gebruiker.");
    expect((await tool("bericht_melden", { ...report, waarom: "Robin wacht nog steeds" })).text).toBe("De kaart is bijgewerkt.");
    const cards = (await view()).items.filter((item) => item.kind === "message");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ key: "mail:mail-1", why: "Robin wacht nog steeds", draft: "Hoi Robin, akkoord.", reply: { via: "mail", messageId: "mail-1" } });
    // Nothing was sent by reporting.
    expect((await lines(join(root, "ms365.log"))).some((entry) => entry.name === "reply-mail-message")).toBe(false);

    const sent = await call("POST", "/bonzaiwork/today/items/send", { key: "mail:mail-1", text: "Hoi Robin, akkoord. Groet, Sam" });
    expect(sent.status).toBe(200);
    expect((await lines(join(root, "ms365.log"))).at(-1)).toMatchObject({ name: "reply-mail-message", args: { "message-id": "mail-1", body: { comment: "Hoi Robin, akkoord. Groet, Sam" } } });
    expect((await view()).items.filter((item) => item.kind === "message")).toEqual([]);
    // The same message found again in a later round stays away.
    expect((await tool("bericht_melden", report)).text).toContain("al afgehandeld");
    expect((await view()).items.filter((item) => item.kind === "message")).toEqual([]);
  });

  test("Slack: het antwoord gaat in de draad, via het script, met de tekst op stdin; een fout laat de kaart staan", async () => {
    await tool("bericht_melden", { bron: "slack", id: "C1:1.0", titel: "#sales", van: "Robin", waarom: "Vraagt om de prijslijst", concept: "Komt eraan.", kanaal: "C1", draad: "1.0" });
    await tool("bericht_melden", { bron: "slack", id: "C-GEEN:1.0", titel: "#weg", van: "X", waarom: "Y", concept: "Z", kanaal: "C-GEEN" });
    expect((await call("POST", "/bonzaiwork/today/items/send", { key: "slack:C1:1.0" })).status).toBe(200);
    const sent = (await lines(join(root, "slack.log"))).at(-1);
    expect(sent).toMatchObject({ command: "reply", stdin: "Komt eraan." });
    expect(sent?.list.slice(0, 3)).toEqual(["C1", "1.0", "--text-stdin"]);
    const failed = await call("POST", "/bonzaiwork/today/items/send", { key: "slack:C-GEEN:1.0" });
    expect(failed.status).toBe(502);
    expect(String(field(failed.body, "userMessage"))).toContain("channel_not_found");
    expect((await view()).items.map((item) => item.key)).toContain("slack:C-GEEN:1.0");
    expect((await view()).connectors.slack.state).toBe("error");
  });

  test("Later verbergt een kaart tot morgen; Niet voor mij haalt haar weg", async () => {
    await tool("bericht_melden", { bron: "mail", id: "a", titel: "A", van: "X", waarom: "Y" });
    await tool("bericht_melden", { bron: "mail", id: "b", titel: "B", van: "X", waarom: "Y" });
    await call("POST", "/bonzaiwork/today/items/later", { key: "mail:a" });
    await call("POST", "/bonzaiwork/today/items/dismiss", { key: "mail:b" });
    expect((await view()).items.filter((item) => item.kind === "message")).toEqual([]);
    const state: unknown = JSON.parse(await read("state/today.json"));
    expect(new Date(Number(field(field(state, "later"), "mail:a"))).getDate()).toBe(14);
    expect(field(state, "items")).toMatchObject([{ key: "mail:a" }]);
  });

  test("een afspraak die binnen een halfuur begint is een kaart, met de voorbereiding als die er is", async () => {
    await hooks.service.refreshMeetings(true);
    let now = await view();
    expect(now.items.filter((item) => item.kind === "meeting")).toMatchObject([{ key: "meeting:evt-soon", prep: null, meeting: { title: "Klantoverleg" } }]);
    expect(now.upcoming.filter((row) => row.kind === "meeting").map((row) => row.kind === "meeting" && `${row.bucket}:${row.meeting.title}`)).toEqual(["today:Klantoverleg", "week:Teamoverleg"]);
    expect((await tool("voorbereiding_melden", { afspraak_id: "evt-tomorrow", voorbereiding: "- Doel: planning Q1" })).isError).toBe(false);
    await tool("voorbereiding_melden", { afspraak_id: "evt-soon", voorbereiding: "- Doel: akkoord op de offerte" });
    now = await view();
    // Tomorrow's preparation waits for its own half hour.
    expect(now.items.filter((item) => item.kind === "meeting")).toMatchObject([{ key: "meeting:evt-soon", prep: "- Doel: akkoord op de offerte" }]);
    expect((await tool("voorbereiding_melden", { afspraak_id: "bestaat-niet", voorbereiding: "x" })).isError).toBe(true);
  });

  test("een gevonden belofte is een voorstel; pas na Toevoegen staat ze als taak in het brein", async () => {
    await tool("belofte_voorstellen", { tekst: "Prijslijst sturen", wie: "ik", persoon: "Robin", datum: "2026-11-16", bron: "mail", bron_id: "mail-1", brein: "Sales" });
    await tool("belofte_voorstellen", { tekst: "de cijfers van Q3", wie: "ander", persoon: "Robin", datum: "2026-11-17", bron: "slack", bron_id: "C1:1.0" });
    expect(await read("sales/taken.md")).not.toContain("Prijslijst sturen");
    const cards = (await view()).items.filter((item) => item.kind === "commitment");
    expect(cards).toMatchObject([{ who: "mine", brainId: "ws-sales", due: "2026-11-16" }, { who: "theirs", brainId: null }]);
    for (const card of cards) await call("POST", "/bonzaiwork/today/items/accept", { key: card.key });
    expect(await read("sales/taken.md")).toContain("- [ ] Prijslijst sturen @sam 📅 2026-11-16\n");
    expect(await read("mijn/taken.md")).toContain("- [ ] Robin: de cijfers van Q3 ⏳ 2026-11-17\n");
    expect((await view()).items.filter((item) => item.kind === "commitment")).toEqual([]);
  });

  test("het dagplan is een voorstel tot de gebruiker het goedkeurt; de top stuurt Start hier pas na te laat en vandaag", async () => {
    const book = (await todos()).find((todo) => todo.text === "Boek uitlezen")?.id ?? "";
    await tool("dagplan_voorstellen", { top: [book, "onbekend"], blokken: [{ van: "11:30", tot: "12:00", wat: "Boek", taak: book }, { van: "x", tot: "y", wat: "kapot" }] });
    expect((await view()).plan).toEqual({ date: "2026-11-13", approved: false, top: [book], blocks: [{ start: "11:30", end: "12:00", label: "Boek", todoId: book }] });
    await call("POST", "/bonzaiwork/today/plan", { decision: "approve" });
    expect((await view()).plan?.approved).toBe(true);
    await call("POST", "/bonzaiwork/today/plan", { decision: "drop" });
    expect((await view()).plan).toBeNull();
  });

  test("de app leest het antwoord van de route terug tot precies dezelfde vorm", async () => {
    await hooks.service.refreshMeetings(true);
    await tool("bericht_melden", { bron: "slack", id: "C1:1.0", titel: "#sales", van: "Robin", waarom: "Vraagt iets", concept: "Ja.", kanaal: "C1", draad: "1.0", link: "https://slack.example/x" });
    await tool("belofte_voorstellen", { tekst: "Prijslijst sturen", wie: "ik", datum: "2026-11-16", bron: "mail", bron_id: "mail-1" });
    await tool("voorbereiding_melden", { afspraak_id: "evt-soon", voorbereiding: "- Doel" });
    await tool("eerste_stap", { id: (await first()).id, stap: "Open de offerte", waarom: "Te laat" });
    await tool("dagplan_voorstellen", { top: [(await first()).id], blokken: [{ van: "11:00", tot: "12:00", wat: "Offerte" }] });
    await call("POST", "/bonzaiwork/today/focus", { todoId: (await first()).id, chatId: "ses_1" });
    const answer = (await call("GET", "/bonzaiwork/today")).body;
    const now = await view();
    expect(now.items.map((item) => item.kind).sort()).toEqual(["commitment", "meeting", "message"]);
    expect(readView(JSON.parse(JSON.stringify(answer)))).toEqual(now);
  });

  test("de koppelingen testen zegt per koppeling of het werkt", async () => {
    const checked = field((await call("POST", "/bonzaiwork/today/connectors/check")).body, "connectors");
    expect(checked).toMatchObject({ calendar: { state: "ok", detail: "2 afspraken in de komende 24 uur" }, mail: { state: "ok" }, slack: { state: "ok", detail: "verbonden" } });
  });

  test("lezen vraagt eerst in een gewone chat; alleen de eigen rondes van de agent krijgen vanzelf antwoord", async () => {
    expect(hooks.enginePermissions().map((rule) => `${rule.action}:${rule.effect}`)).toContain("vandaag_mail_ongelezen:ask");
    expect(hooks.enginePermissions().some((rule) => rule.action === "vandaag_taken_lijst")).toBe(false);
    pendingQuestions = [{ id: "q1", action: "vandaag_mail_ongelezen" }, { id: "q2", action: "bash" }];
    await hooks.answerOwnReads();
    expect(engineCalls.filter((entry) => entry.path.includes("/reply"))).toEqual([]);

    expect((await call("POST", "/bonzaiwork/today/rounds/run", { system: "agent.tussendoor" })).status).toBe(200);
    const session = engineCalls.find((entry) => entry.path === "/api/session");
    expect(session?.body).toMatchObject({ title: "Persoonlijke agent: tussendoor", model: { providerID: "litellm", id: "gpt-6-luna" } });
    await hooks.answerOwnReads();
    const replies = engineCalls.filter((entry) => entry.path.includes("/reply"));
    expect(replies).toHaveLength(1);
    expect(replies[0]?.path).toContain("/permission/q1/reply");
    expect((await call("POST", "/bonzaiwork/today/rounds/run", { system: "anders" })).status).toBe(404);
  });
});
