import { createHash, timingSafeEqual } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";

import { brainPath, PREFERENCES_FILE } from "./personal.ts";
import { ALWAYS_EXCLUDED_FOLDERS } from "./trust.ts";

/**
 * The local MCP server "breinen" (plan §5.2, §7.3), for the engine only:
 * loopback, a local token, Markdown only, writes only in the personal brain
 * and never in its instructions. Other brains on this laptop are read-only;
 * brein_zoeken and brein_lezen ask the user first (engine `ask` rule).
 */
export type TeamBrain = { id: string; name: string; description: string; root: string; lastSyncAt: number | null };

export type PersonalAccess = {
  /** The personal brain's folder, or null when there is none yet. */
  root(): string | null;
  excluded(): readonly string[];
  /** A tool changed this file: the next quiet moment records it as the AI's. */
  wrote(path: string): void;
  propose(preference: string, reason: string | null): Promise<string>;
  /** The project brains on this laptop. */
  teamBrains(): Promise<TeamBrain[]>;
  /** Brings a brain up to date before it is read, when it is quiet; never waits long. */
  refresh(id: string): Promise<void>;
};

type Json = Record<string, unknown>;
type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

const PROTOCOL_VERSION = "2025-06-18";
const MAX_READ = 512 * 1024;
const MAX_WRITE = 256 * 1024;

const str = { type: "string" };
export const BRAIN_TOOLS = [
  {
    name: "persoonlijk_brein_lezen",
    description: "Lees één Markdown-bestand uit het persoonlijke brein van de gebruiker. Geeft de inhoud en de versie die je meegeeft bij bewerken.",
    inputSchema: { type: "object", properties: { pad: { ...str, description: "Pad binnen het persoonlijke brein, bijvoorbeeld knowledge/index.md" } }, required: ["pad"] },
  },
  {
    name: "persoonlijk_brein_zoeken",
    description: "Zoek in het persoonlijke brein. Begin met knowledge/index.md als je de weg wilt volgen; dit zoekt op woorden in titels, beschrijvingen en tekst.",
    inputSchema: { type: "object", properties: { vraag: { ...str, description: "Waar je naar zoekt" } }, required: ["vraag"] },
  },
  {
    name: "persoonlijk_brein_schrijven",
    description: "Maak een nieuwe notitie in het persoonlijke brein (alleen .md). Nieuwe kennis als concept in knowledge/ volgens _meta/schema.md. Bestaat het bestand al, gebruik dan persoonlijk_brein_bewerken.",
    inputSchema: { type: "object", properties: { pad: str, inhoud: str }, required: ["pad", "inhoud"] },
  },
  {
    name: "persoonlijk_brein_bewerken",
    description: "Vervang één passage in een bestaande notitie van het persoonlijke brein. Geef de versie mee die persoonlijk_brein_lezen gaf; is de notitie intussen veranderd, lees dan opnieuw.",
    inputSchema: { type: "object", properties: { pad: str, oud: { ...str, description: "De passage zoals hij nu precies staat" }, nieuw: str, versie: str }, required: ["pad", "oud", "nieuw", "versie"] },
  },
  {
    name: "breinen_lijst",
    description: "De gedeelde breinen op deze laptop: naam, waar ze over gaan, wanneer bijgewerkt. Kijk alleen in een ander brein als de gebruiker erom vraagt; denk je dat er een helpt, stel het dan in één zin voor en wacht.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "brein_zoeken",
    description: "Zoek in een ander gedeeld brein (alleen lezen). Volgt knowledge/index.md en zoekt daarna op woorden. Gebruik wat je vindt in het huidige project, met de bron erbij.",
    inputSchema: { type: "object", properties: { brein: { ...str, description: "Naam van het brein uit breinen_lijst" }, vraag: str }, required: ["brein", "vraag"] },
  },
  {
    name: "brein_lezen",
    description: "Lees één Markdown-bestand uit een ander gedeeld brein (alleen lezen). Neem over wat je nodig hebt in het huidige project, met bronvermelding (brein en pad).",
    inputSchema: { type: "object", properties: { brein: { ...str, description: "Naam van het brein uit breinen_lijst" }, pad: str }, required: ["brein", "pad"] },
  },
  {
    name: "voorkeur_voorstellen",
    description: "Stel een voorkeur van de gebruiker voor ('samenvattingen altijd in drie punten'). De gebruiker ziet een kaart en beslist; schrijf voorkeuren nooit zelf.",
    inputSchema: { type: "object", properties: { voorkeur: str, reden: str }, required: ["voorkeur"] },
  },
];

export function contentVersion(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

const ok = (text: string): ToolResult => ({ content: [{ type: "text", text }] });
const refuse = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true });

/** The instruction files go into every chat: only the user changes them (plan §7.3). */
function isInstructionFile(path: string): boolean {
  const lower = path.toLowerCase();
  return lower === "agents.md" || lower === PREFERENCES_FILE.toLowerCase();
}

async function search(root: string, excluded: readonly string[], query: string): Promise<string> {
  const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 1);
  if (!terms.length) return "Geef een paar woorden om op te zoeken.";
  const skip = new Set([...ALWAYS_EXCLUDED_FOLDERS, ...excluded].map((folder) => folder.toLowerCase()));
  const hits: Array<{ path: string; score: number; title: string; fragment: string }> = [];
  let seen = 0;
  async function walk(relative: string): Promise<void> {
    if (seen > 5000) return;
    for (const entry of await readdir(join(root, relative), { withFileTypes: true }).catch(() => [])) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".") || skip.has(path.toLowerCase())) continue;
        await walk(path);
      } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
        seen += 1;
        // Files that are only online (OneDrive on demand) report blocks but no data; size alone is cheap.
        const info = await stat(join(root, path)).catch(() => null);
        if (!info || info.size > MAX_READ) continue;
        const text = await readFile(join(root, path), "utf8").catch(() => null);
        if (text === null) continue;
        const lower = text.toLowerCase();
        const head = lower.slice(0, 600);
        let score = 0;
        for (const term of terms) {
          if (!lower.includes(term)) continue;
          score += 1 + (head.includes(term) ? 2 : 0) + (path.toLowerCase().includes(term) ? 2 : 0);
        }
        if (!score) continue;
        const at = Math.max(0, lower.indexOf(terms.find((term) => lower.includes(term)) ?? "") - 80);
        const title = /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? posix.basename(path, ".md");
        hits.push({ path, score, title, fragment: text.slice(at, at + 240).replace(/\s+/g, " ").trim() });
      }
    }
  }
  await walk("");
  if (!hits.length) return `Niets gevonden voor "${query}".`;
  return hits.sort((a, b) => b.score - a.score).slice(0, 8)
    .map((hit) => `- ${hit.title} (\`${hit.path}\`): …${hit.fragment}…`).join("\n");
}

/** A brain by name, folder or a clear part of either. */
export function findBrain(brains: TeamBrain[], wanted: string): TeamBrain | null {
  const key = wanted.trim().toLowerCase().replace(/[-_]?brein$/, "").trim();
  if (!key) return null;
  const names = (brain: TeamBrain) => [brain.name, posix.basename(brain.root.replace(/\\/g, "/"))].map((name) => name.toLowerCase());
  const exact = brains.filter((brain) => names(brain).some((name) => name === key || name.replace(/[-_]?brein$/, "").trim() === key));
  if (exact.length === 1) return exact[0] ?? null;
  const partial = brains.filter((brain) => names(brain).some((name) => name.includes(key)));
  return partial.length === 1 ? partial[0] ?? null : null;
}

async function teamTool(access: PersonalAccess, name: string, text: (key: string) => string): Promise<ToolResult> {
  const brains = await access.teamBrains();
  if (name === "breinen_lijst") {
    if (!brains.length) return ok("Er staan nog geen gedeelde breinen op deze laptop.");
    return ok(brains.map((brain) => `- ${brain.name}${brain.description ? `: ${brain.description}` : ""}${brain.lastSyncAt ? ` (bijgewerkt ${new Date(brain.lastSyncAt).toISOString().slice(0, 16).replace("T", " ")})` : ""}`).join("\n"));
  }
  const brain = findBrain(brains, text("brein"));
  if (!brain) return refuse(`Geen brein "${text("brein")}" gevonden. Kies een naam uit breinen_lijst.`);
  await access.refresh(brain.id).catch(() => undefined);
  if (name === "brein_zoeken") {
    const query = text("vraag");
    const index = await readFile(join(brain.root, "knowledge", "index.md"), "utf8").catch(() => null);
    const found = await search(brain.root, [], query);
    return ok(`Brein ${brain.name}${index ? ` (begin bij knowledge/index.md)` : ""}:\n${found}`);
  }
  const checked = await brainPath(brain.root, text("pad"), []);
  if (!checked.ok) return refuse(checked.reason);
  const content = await readFile(checked.absolute, "utf8").catch(() => null);
  if (content === null) return refuse(`${checked.path} bestaat niet in ${brain.name}.`);
  if (Buffer.byteLength(content) > MAX_READ) return refuse(`${checked.path} is te groot om in één keer te lezen.`);
  return ok(`Uit het brein ${brain.name}, ${checked.path} (alleen lezen; noem deze bron als je het gebruikt):\n\n${content}`);
}

const TEAM_TOOLS = new Set(["breinen_lijst", "brein_zoeken", "brein_lezen"]);

export async function callBrainTool(access: PersonalAccess, name: string, args: Json): Promise<ToolResult> {
  const text = (key: string) => (typeof args[key] === "string" ? String(args[key]) : "");
  if (TEAM_TOOLS.has(name)) return teamTool(access, name, text);
  const root = access.root();
  if (!root) return refuse("Er is nog geen persoonlijk brein ingesteld. De gebruiker kan dat doen in Mijn brein.");
  if (name === "persoonlijk_brein_zoeken") return ok(await search(root, access.excluded(), text("vraag")));
  if (name === "voorkeur_voorstellen") {
    const preference = text("voorkeur").trim();
    if (!preference) return refuse("Geef de voorkeur in één zin.");
    await access.propose(preference.slice(0, 2000), text("reden").trim().slice(0, 1000) || null);
    return ok("Het voorstel staat bij de gebruiker. Ga door met de taak; schrijf de voorkeur niet zelf.");
  }
  const checked = await brainPath(root, text("pad"), access.excluded());
  if (!checked.ok) return refuse(checked.reason);
  const current = await readFile(checked.absolute, "utf8").catch(() => null);
  if (name === "persoonlijk_brein_lezen") {
    if (current === null) return refuse(`${checked.path} bestaat niet.`);
    if (Buffer.byteLength(current) > MAX_READ) return refuse(`${checked.path} is te groot om in één keer te lezen.`);
    return ok(`versie: ${contentVersion(current)}\n\n${current}`);
  }
  if (isInstructionFile(checked.path)) return refuse(`${checked.path} gaat mee in elke chat; stel een wijziging voor met voorkeur_voorstellen.`);
  if (name === "persoonlijk_brein_schrijven") {
    if (current !== null) return refuse(`${checked.path} bestaat al. Lees hem en gebruik persoonlijk_brein_bewerken.`);
    const content = text("inhoud");
    if (Buffer.byteLength(content) > MAX_WRITE) return refuse("Deze notitie is te groot; splits hem op.");
    await mkdir(dirname(checked.absolute), { recursive: true });
    await writeFile(checked.absolute, content, { flag: "wx" });
    access.wrote(checked.path);
    return ok(`Nieuwe notitie ${checked.path} geschreven. versie: ${contentVersion(content)}`);
  }
  if (name === "persoonlijk_brein_bewerken") {
    if (current === null) return refuse(`${checked.path} bestaat niet; maak hem met persoonlijk_brein_schrijven.`);
    // The user may be typing in Obsidian, or a cloud sync brought a change: never overwrite that.
    if (contentVersion(current) !== text("versie").trim()) return refuse(`${checked.path} is veranderd sinds je hem las. Lees hem opnieuw en probeer het dan.`);
    const old = text("oud");
    const count = old ? current.split(old).length - 1 : 0;
    if (count !== 1) return refuse(count === 0 ? "De passage staat niet (meer) precies zo in de notitie." : "De passage staat er vaker in; neem meer tekst mee zodat hij uniek is.");
    const next = current.replace(old, () => text("nieuw"));
    await writeFile(checked.absolute, next);
    access.wrote(checked.path);
    return ok(`${checked.path} bijgewerkt. versie: ${contentVersion(next)}`);
  }
  return refuse(`Onbekend hulpmiddel ${name}.`);
}

function tokenMatches(header: string | null, token: string): boolean {
  const given = Buffer.from((header ?? "").replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const rpc = (id: unknown, result: unknown) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

/** MCP over HTTP (JSON-RPC in a POST, a JSON answer): enough for the engine's client. */
export async function handleMcpRequest(request: Request, token: string, access: PersonalAccess): Promise<Response> {
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
      const asked = typeof paramRecord.protocolVersion === "string" ? paramRecord.protocolVersion : PROTOCOL_VERSION;
      answers.push(rpc(id, { protocolVersion: asked, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "breinen", version: "0.1.0" } }));
    } else if (method === "ping") {
      answers.push(rpc(id, {}));
    } else if (method === "tools/list") {
      answers.push(rpc(id, { tools: BRAIN_TOOLS }));
    } else if (method === "tools/call") {
      const name = typeof paramRecord.name === "string" ? paramRecord.name : "";
      const args: Json = typeof paramRecord.arguments === "object" && paramRecord.arguments !== null ? Object.fromEntries(Object.entries(paramRecord.arguments)) : {};
      try {
        answers.push(rpc(id, await callBrainTool(access, name, args)));
      } catch (error) {
        answers.push(rpc(id, refuse(`Dat lukte niet: ${error instanceof Error ? error.message : String(error)}`)));
      }
    } else {
      answers.push(rpcError(id, -32601, "Method not found"));
    }
  }
  if (!answers.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? answers : answers[0], { headers: { "cache-control": "no-store" } });
}
