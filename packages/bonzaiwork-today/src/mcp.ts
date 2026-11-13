import { timingSafeEqual } from "node:crypto";

import { localDate, rankTodos } from "./rank.ts";
import { TodayError, type TodayService } from "./service.ts";
import type { PlanBlock } from "./types.ts";

/**
 * The local MCP server "vandaag", for the engine only (loopback, a local token). The agent reads
 * to-dos, the calendar, mail and Slack through it and reports cards; it has no tool that sends
 * anything (T7). The tools that read mail, the calendar or Slack ask first in an ordinary chat;
 * only the personal agent's own rounds skip that question (hooks.ts).
 */
type Json = Record<string, unknown>;
type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

const str = { type: "string" };
const int = { type: "integer" };
const bool = { type: "boolean" };

export const MCP_SERVER_NAME = "vandaag";

export const TODAY_TOOLS = [
  {
    name: "taken_lijst",
    description: "De open taken van de gebruiker uit alle breinen, in volgorde van urgentie, met id, brein, eigenaar en datum. Met alles=true ook de taken van het team zonder eigenaar.",
    inputSchema: { type: "object", properties: { alles: bool } },
  },
  {
    name: "taak_toevoegen",
    description: "Zet een taak in een brein (in taken.md). Zonder brein: het persoonlijke brein. In een gedeeld brein ziet het hele team de taak. eigenaar is de @naam van wie het doet; datum als JJJJ-MM-DD; wacht_op=true als de gebruiker op iemand anders wacht.",
    inputSchema: { type: "object", properties: { tekst: str, brein: { ...str, description: "Naam van het brein uit breinen_lijst; leeg voor het persoonlijke brein" }, eigenaar: str, datum: str, wacht_op: bool }, required: ["tekst"] },
  },
  {
    name: "taak_afvinken",
    description: "Vink een taak af. Alleen als de gebruiker dat vraagt of als je de taak aantoonbaar zelf hebt afgerond.",
    inputSchema: { type: "object", properties: { id: str }, required: ["id"] },
  },
  {
    name: "eerste_stap",
    description: "Schrijf bij een taak de eerste stap van ongeveer vijf minuten en één zin waarom deze taak nu. De gebruiker ziet dit bij 'Start hier'.",
    inputSchema: { type: "object", properties: { id: str, stap: str, waarom: str }, required: ["id", "stap"] },
  },
  {
    name: "dagplan_voorstellen",
    description: "Stel het dagplan voor: hooguit drie taak-id's als top, en blokken met van/tot (UU:MM), wat er gebeurt en optioneel de taak-id. De gebruiker keurt het goed met één klik.",
    inputSchema: {
      type: "object",
      properties: { top: { type: "array", items: str }, blokken: { type: "array", items: { type: "object", properties: { van: str, tot: str, wat: str, taak: str }, required: ["van", "tot", "wat"] } } },
      required: ["top"],
    },
  },
  {
    name: "agenda_lezen",
    description: "De afspraken uit de Outlook-agenda van de gebruiker voor de komende dagen (standaard 2, hooguit 7), met id, tijd, plaats en organisator. Alleen lezen.",
    inputSchema: { type: "object", properties: { dagen: int } },
  },
  {
    name: "mail_ongelezen",
    description: "De nieuwste ongelezen mail uit de inbox van de gebruiker (standaard 10, hooguit 20), met id, afzender, onderwerp en de tekst zonder geciteerde geschiedenis. Alleen lezen.",
    inputSchema: { type: "object", properties: { max: int } },
  },
  {
    name: "mail_lezen",
    description: "Eén mail in zijn geheel, met de id uit mail_ongelezen. Alleen lezen.",
    inputSchema: { type: "object", properties: { id: str }, required: ["id"] },
  },
  {
    name: "slack_ongelezen",
    description: "De Slack-gesprekken met ongelezen berichten (standaard 10). alleen_vermeldingen=true voor alleen vermeldingen en directe berichten. Alleen lezen.",
    inputSchema: { type: "object", properties: { max: int, alleen_vermeldingen: bool } },
  },
  {
    name: "slack_geschiedenis",
    description: "De recente berichten van één Slack-kanaal of direct gesprek (kanaal-id of link). sinds: 'today', 'yesterday' of JJJJ-MM-DD. Alleen lezen.",
    inputSchema: { type: "object", properties: { kanaal: str, sinds: str, max: int }, required: ["kanaal"] },
  },
  {
    name: "slack_draad",
    description: "Eén Slack-bericht met zijn hele draad, via de link naar het bericht. Alleen lezen.",
    inputSchema: { type: "object", properties: { link: str }, required: ["link"] },
  },
  {
    name: "slack_zoeken",
    description: "Zoek in Slack op woorden. Alleen lezen.",
    inputSchema: { type: "object", properties: { vraag: str }, required: ["vraag"] },
  },
  {
    name: "bericht_melden",
    description: "Meld een mail of Slack-draad die de gebruiker zelf nodig heeft. De gebruiker ziet een kaart met jouw 'waarom' en het concept, en verstuurt zelf. bron is 'mail' of 'slack'; id is de mail-id, of voor Slack kanaal-id plus tijdstempel van het bericht. Voor Slack: kanaal (id) en draad (tijdstempel van het eerste bericht) zodat het antwoord in de draad komt.",
    inputSchema: { type: "object", properties: { bron: { ...str, enum: ["mail", "slack"] }, id: str, titel: str, van: str, waarom: str, concept: str, link: str, kanaal: str, draad: str }, required: ["bron", "id", "titel", "van", "waarom"] },
  },
  {
    name: "voorbereiding_melden",
    description: "Zet de voorbereiding voor een afspraak klaar (Markdown, hooguit tien regels), met de id uit agenda_lezen. De kaart verschijnt een halfuur voor de afspraak.",
    inputSchema: { type: "object", properties: { afspraak_id: str, voorbereiding: str }, required: ["afspraak_id", "voorbereiding"] },
  },
  {
    name: "belofte_voorstellen",
    description: "Stel een belofte met een datum voor die je in een bericht of notitie vond. wie is 'ik' (de gebruiker beloofde het) of 'ander' (iemand beloofde het aan de gebruiker). De gebruiker beslist op een kaart; zet de belofte nooit zelf als taak.",
    inputSchema: { type: "object", properties: { tekst: str, wie: { ...str, enum: ["ik", "ander"] }, persoon: str, datum: str, bron: { ...str, enum: ["mail", "slack", "notities"] }, bron_id: str, brein: str, link: str }, required: ["tekst", "wie", "bron", "bron_id"] },
  },
  {
    name: "inbox_lezen",
    description: "De geparkeerde gedachten van de gebruiker (inbox.md in het persoonlijke brein), elk met een id.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "inbox_afhandelen",
    description: "Haal één geparkeerde gedachte uit de inbox, nadat je haar als taak of notitie op de juiste plek hebt gezet.",
    inputSchema: { type: "object", properties: { id: str }, required: ["id"] },
  },
];

/** The tools that read the person's mail, calendar or Slack: an ordinary chat asks first. */
export const ASKING_TOOLS = ["agenda_lezen", "mail_ongelezen", "mail_lezen", "slack_ongelezen", "slack_geschiedenis", "slack_draad", "slack_zoeken"];

const ok = (text: string): ToolResult => ({ content: [{ type: "text", text }] });
const refuse = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true });

const time = (at: number) => {
  const date = new Date(at);
  return `${localDate(date)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

export async function callTodayTool(service: TodayService, name: string, args: Json): Promise<ToolResult> {
  if (!service.enabled()) return refuse("De persoonlijke agent staat uit. De gebruiker zet hem aan bij Instellingen → Persoonlijke agent.");
  const text = (key: string) => (typeof args[key] === "string" ? String(args[key]).trim() : "");
  const count = (key: string, fallback: number) => (typeof args[key] === "number" && Number.isFinite(args[key]) ? Math.trunc(Number(args[key])) : fallback);
  const yes = (key: string) => args[key] === true;

  switch (name) {
    case "taken_lijst": {
      const found = await service.scan();
      const today = localDate(Date.now());
      const mine = rankTodos(found.todos, { today, planTop: [] }).map((entry) => entry.todo);
      const backlog = yes("alles") ? found.todos.filter((todo) => !todo.done && !todo.mine && !todo.owner) : [];
      const line = (todo: (typeof mine)[number]) => `- ${todo.id} · ${todo.text}${todo.due ? ` · ${todo.dueKind === "waiting" ? "wacht op, tot" : "datum"} ${todo.due}` : ""} · ${todo.brainName}${todo.owner ? ` · @${todo.owner}` : ""} · ${todo.path}`;
      if (!mine.length && !backlog.length) return ok("Er staan geen open taken.");
      return ok([`Vandaag is ${today}. Open taken van de gebruiker (${mine.length}):`, ...mine.slice(0, 80).map(line), ...(backlog.length ? ["", `Van het team, zonder eigenaar (${backlog.length}):`, ...backlog.slice(0, 40).map(line)] : [])].join("\n"));
    }
    case "taak_toevoegen": {
      const todo = await service.add({ text: text("tekst"), brain: text("brein") || null, owner: text("eigenaar") || null, due: text("datum") || null, dueKind: yes("wacht_op") ? "waiting" : "deadline" });
      return ok(`Taak ${todo.id} staat in ${todo.brainName} (${todo.path}).`);
    }
    case "taak_afvinken": {
      const todo = await service.setDone(text("id"), true);
      return ok(`Afgevinkt: ${todo.text}`);
    }
    case "eerste_stap":
      await service.setStep(text("id"), text("stap"), text("waarom"));
      return ok("De eerste stap staat bij de taak.");
    case "dagplan_voorstellen": {
      const top = Array.isArray(args.top) ? args.top.filter((entry): entry is string => typeof entry === "string") : [];
      const blocks = (Array.isArray(args.blokken) ? args.blokken : []).flatMap((entry: unknown): PlanBlock[] => {
        if (typeof entry !== "object" || entry === null) return [];
        const field = (key: string) => { const value: unknown = Reflect.get(entry, key); return typeof value === "string" ? value.trim() : ""; };
        return field("van") && field("tot") && field("wat") ? [{ start: field("van"), end: field("tot"), label: field("wat"), todoId: field("taak") || null }] : [];
      });
      await service.proposePlan(top, blocks);
      return ok("Het dagplan staat bij de gebruiker ter goedkeuring.");
    }
    case "agenda_lezen": {
      const meetings = await service.meetingsFor(count("dagen", 2));
      if (!meetings.length) return ok("Geen afspraken in deze periode.");
      return ok(meetings.map((meeting) => `- ${meeting.id} · ${meeting.allDay ? `${localDate(meeting.start)} hele dag` : `${time(meeting.start)}–${time(meeting.end).slice(11)}`} · ${meeting.title}${meeting.location ? ` · ${meeting.location}` : ""}${meeting.organizer ? ` · van ${meeting.organizer}` : ""}`).join("\n"));
    }
    case "mail_ongelezen": {
      const mails = await service.unreadMail(count("max", 10));
      if (!mails.length) return ok("Geen ongelezen mail.");
      return ok(mails.map((mail) => `## ${mail.subject}\nid: ${mail.id}\nvan: ${mail.from}${mail.received ? `\nontvangen: ${mail.received}` : ""}${mail.link ? `\nlink: ${mail.link}` : ""}\n\n${mail.text}`).join("\n\n---\n\n"));
    }
    case "mail_lezen": {
      const mail = await service.mail(text("id"));
      return mail ? ok(`## ${mail.subject}\nvan: ${mail.from}\n\n${mail.text}`) : refuse("Die mail is niet gevonden. Gebruik de id uit mail_ongelezen.");
    }
    case "slack_ongelezen":
      return ok(await service.slackRead((slack) => slack.unreads(count("max", 10), yes("alleen_vermeldingen"))) || "Geen ongelezen gesprekken.");
    case "slack_geschiedenis":
      return ok(await service.slackRead((slack) => slack.history(text("kanaal"), text("sinds") || null, count("max", 20))) || "Geen berichten.");
    case "slack_draad":
      return ok(await service.slackRead((slack) => slack.thread(text("link"))) || "Geen berichten.");
    case "slack_zoeken":
      return ok(await service.slackRead((slack) => slack.search(text("vraag"), 10)) || "Niets gevonden.");
    case "bericht_melden": {
      const source = text("bron");
      if (source !== "mail" && source !== "slack") return refuse("bron is 'mail' of 'slack'.");
      return ok(await service.reportMessage({ source, id: text("id"), title: text("titel"), from: text("van"), why: text("waarom"), draft: text("concept") || null, link: text("link") || null, channel: text("kanaal") || null, threadTs: text("draad") || null }));
    }
    case "voorbereiding_melden":
      return ok(await service.reportPrep(text("afspraak_id"), text("voorbereiding")));
    case "belofte_voorstellen": {
      const source = text("bron");
      return ok(await service.proposeCommitment({
        text: text("tekst"), who: text("wie") === "ander" ? "theirs" : "mine", person: text("persoon") || null, due: text("datum") || null,
        source: source === "mail" || source === "slack" ? source : "notes", sourceId: text("bron_id"), brain: text("brein") || null, link: text("link") || null,
      }));
    }
    case "inbox_lezen": {
      const entries = await service.inbox();
      return ok(entries.length ? entries.map((entry) => `- ${entry.id} · ${entry.text}`).join("\n") : "De inbox is leeg.");
    }
    case "inbox_afhandelen":
      return (await service.fileInbox(text("id"))) ? ok("Uit de inbox gehaald.") : refuse("Die gedachte staat niet (meer) in de inbox.");
    default:
      return refuse(`Onbekend hulpmiddel ${name}.`);
  }
}

function tokenMatches(header: string | null, token: string): boolean {
  const given = Buffer.from((header ?? "").replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const rpc = (id: unknown, result: unknown) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

/** MCP over HTTP (JSON-RPC in a POST, a JSON answer), as the brains server does it. */
export async function handleTodayMcp(request: Request, token: string, service: TodayService): Promise<Response> {
  if (!tokenMatches(request.headers.get("authorization"), token)) return new Response("Unauthorized", { status: 401 });
  if (request.method === "GET") return new Response(null, { status: 405, headers: { allow: "POST" } });
  if (request.method === "DELETE") return new Response(null, { status: 204 });
  if (request.method !== "POST") return new Response(null, { status: 405 });
  let body: unknown;
  try { body = JSON.parse(await request.text()); } catch { return Response.json(rpcError(null, -32700, "Parse error"), { status: 400 }); }
  const messages = Array.isArray(body) ? body : [body];
  const answers: unknown[] = [];
  for (const message of messages) {
    if (typeof message !== "object" || message === null) continue;
    const id: unknown = Reflect.get(message, "id");
    const method: unknown = Reflect.get(message, "method");
    const params: unknown = Reflect.get(message, "params");
    const paramRecord: Json = typeof params === "object" && params !== null ? Object.fromEntries(Object.entries(params)) : {};
    if (id === undefined) continue;
    if (method === "initialize") {
      const asked = typeof paramRecord.protocolVersion === "string" ? paramRecord.protocolVersion : "2025-06-18";
      answers.push(rpc(id, { protocolVersion: asked, capabilities: { tools: { listChanged: false } }, serverInfo: { name: MCP_SERVER_NAME, version: "0.1.0" } }));
    } else if (method === "ping") {
      answers.push(rpc(id, {}));
    } else if (method === "tools/list") {
      answers.push(rpc(id, { tools: TODAY_TOOLS }));
    } else if (method === "tools/call") {
      const name = typeof paramRecord.name === "string" ? paramRecord.name : "";
      const args: Json = typeof paramRecord.arguments === "object" && paramRecord.arguments !== null ? Object.fromEntries(Object.entries(paramRecord.arguments)) : {};
      try {
        answers.push(rpc(id, await callTodayTool(service, name, args)));
      } catch (error) {
        answers.push(rpc(id, refuse(error instanceof TodayError ? error.message : `Dat lukte niet: ${error instanceof Error ? error.message : String(error)}`)));
      }
    } else {
      answers.push(rpcError(id, -32601, "Method not found"));
    }
  }
  if (!answers.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? answers : answers[0], { headers: { "cache-control": "no-store" } });
}
