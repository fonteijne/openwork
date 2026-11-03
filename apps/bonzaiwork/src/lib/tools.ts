import type { Message, ToolPart } from "~/backend/types";

/**
 * Tool activity in plain Dutch (DESIGN.md C3, C4): sentence first, past tense
 * when done, present tense while running. Engine tool names never reach the
 * screen; raw input/output lives under "Technische details".
 */

export type ToolKind = "read" | "write" | "edit" | "shell" | "search" | "list" | "web" | "websearch" | "subtask" | "skill" | "connection" | "other";

export type ToolLabel = {
  kind: ToolKind;
  /** The sentence without its object, e.g. "Las". */
  verb: string;
  /** The object, e.g. a file name. Shown in mono when `code`. */
  object: string | null;
  code: boolean;
  /** For connections: the service, e.g. "Linear". */
  service: string | null;
};

/** Bookkeeping steps that do no visible work (DESIGN.md T2); a question shows as its own card. */
const HIDDEN_TOOLS = new Set(["todowrite", "todoread", "invalid", "openwork_context", "openwork_query", "question"]);

/** OpenWork's built-in v2 tools, in words. */
const BUILT_IN: Record<string, { kind: ToolKind; past: string; present: string; service?: string }> = {
  browser_open: { kind: "web", past: "Opende de browser", present: "Opent de browser" },
  browser_act: { kind: "web", past: "Werkte in de browser", present: "Werkt in de browser" },
  browser_observe: { kind: "web", past: "Bekeek de webpagina", present: "Bekijkt de webpagina" },
  browser_extract: { kind: "web", past: "Haalde gegevens van de webpagina", present: "Haalt gegevens van de webpagina" },
  browser_tabs: { kind: "web", past: "Bekeek de tabbladen", present: "Bekijkt de tabbladen" },
  browser_handoff: { kind: "web", past: "Gaf de browser aan jou", present: "Geeft de browser aan jou" },
  openwork_gmail_draft: { kind: "connection", past: "Maakte een concept in Gmail", present: "Maakt een concept in Gmail", service: "Gmail" },
  openwork_outlook_draft: { kind: "connection", past: "Maakte een concept in Outlook", present: "Maakt een concept in Outlook", service: "Outlook" },
  openwork_drive_upload: { kind: "connection", past: "Zette een bestand in Drive", present: "Zet een bestand in Drive", service: "Google Drive" },
  openwork_execute: { kind: "connection", past: "Werkte met je connecties", present: "Werkt met je connecties" },
  execute: { kind: "connection", past: "Werkte met je connecties", present: "Werkt met je connecties" },
};

function str(input: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function fileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function truncate(text: string, max = 64): string {
  const single = text.replace(/\s+/g, " ").trim();
  return single.length > max ? `${single.slice(0, max - 1)}…` : single;
}

function serviceName(id: string): string {
  const known: Record<string, string> = {
    github: "GitHub",
    gitlab: "GitLab",
    linear: "Linear",
    notion: "Notion",
    slack: "Slack",
    google: "Google",
    gmail: "Gmail",
    gdrive: "Google Drive",
    drive: "Google Drive",
    "google-drive": "Google Drive",
    calendar: "Agenda",
    jira: "Jira",
    hubspot: "HubSpot",
    exact: "Exact Online",
    stripe: "Stripe",
    figma: "Figma",
    sentry: "Sentry",
    supabase: "Supabase",
    microsoft: "Microsoft 365",
    ms365: "Microsoft 365",
    m365: "Microsoft 365",
    outlook: "Outlook",
    teams: "Teams",
    sharepoint: "SharePoint",
  };
  return known[id.toLowerCase()] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

/** A call like `tools.ms365.list_events(` or `tools["ms365"]["list-calendar-events"](`. */
const TOOL_CALL = /\btools\s*(?:\.\s*([A-Za-z_$][\w$]*)|\[\s*(["'`])([^"'`]+)\2\s*\])\s*(?:\.\s*([A-Za-z_$][\w$]*)|\[\s*(["'`])([^"'`]+)\5\s*\])\s*\(/g;
/** Discovery: `search({ query: "...", namespace: "ms365" })`. */
const SEARCH_CALL = /\bsearch\s*\(\s*\{([^}]*)\}/;

function literal(source: string, key: string): string | null {
  const match = new RegExp(String.raw`\b${key}\s*:\s*(["'\`])((?:\\.|(?!\1).)*)\1`).exec(source);
  return match?.[2]?.trim() || null;
}

function humanAction(action: string): string {
  return action.replace(/[_-]+/g, " ").trim();
}

/**
 * What a Code Mode script did with the connections, so the collapsed row says
 * which connection and action ran (C4) instead of a generic sentence.
 */
function describeConnectionCode(code: string, pick: (past: string, present: string) => string): ToolLabel | null {
  const calls: { service: string; action: string }[] = [];
  for (const match of code.matchAll(TOOL_CALL)) {
    const namespace = match[1] ?? match[3];
    const action = match[4] ?? match[6];
    if (!namespace || !action) continue;
    const call = { service: serviceName(namespace), action: humanAction(action) };
    if (!calls.some((seen) => seen.service === call.service && seen.action === call.action)) calls.push(call);
  }
  const first = calls[0];
  if (first) {
    const others = calls.length - 1;
    const more = others === 0 ? "" : others === 1 ? " en 1 andere actie" : ` en ${others} andere acties`;
    return { kind: "connection", verb: pick(`Gebruikte ${first.service}:`, `Gebruikt ${first.service}:`), object: `${truncate(first.action, 48)}${more}`, code: false, service: first.service };
  }
  // Looking up what a connection can do is not using it: no service for usedCapabilities.
  const search = SEARCH_CALL.exec(code)?.[1];
  if (search === undefined) return null;
  const namespace = literal(search, "namespace");
  const query = literal(search, "query");
  const where = namespace ? `in ${serviceName(namespace)}` : "in je connecties";
  return { kind: "connection", verb: pick(`Zocht ${where} naar`, `Zoekt ${where} naar`), object: query ? `"${truncate(query, 40)}"` : "mogelijkheden", code: false, service: null };
}

/** Visible in the transcript at all? Bookkeeping steps are not (T2). */
export function isVisibleTool(part: ToolPart): boolean {
  return !HIDDEN_TOOLS.has(part.tool);
}

export function describeTool(part: ToolPart): ToolLabel {
  const done = part.status === "completed" || part.status === "error";
  const pick = (past: string, present: string) => (done ? past : present);
  const input = part.input;
  const path = str(input, "filePath", "file_path", "path", "filename");
  const builtIn = BUILT_IN[part.tool];
  if (builtIn?.kind === "connection" && !builtIn.service) {
    const code = str(input, "code");
    const fromCode = code ? describeConnectionCode(code, pick) : null;
    if (fromCode) return fromCode;
  }
  if (builtIn) return { kind: builtIn.kind, verb: done ? builtIn.past : builtIn.present, object: null, code: false, service: builtIn.service ?? null };
  if (part.tool.startsWith("computer_")) return { kind: "other", verb: pick("Werkte op je computer", "Werkt op je computer"), object: null, code: false, service: null };
  // The brains MCP (plan §5.2): "Las offerteproces.md in het brein Sales", in words, not tool names.
  if (part.tool.startsWith("breinen_")) {
    const brain = str(input, "brein");
    const where = brain ? ` in het brein ${brain}` : " in je persoonlijke brein";
    const note = str(input, "pad");
    switch (part.tool.slice("breinen_".length)) {
      case "breinen_lijst": return { kind: "read", verb: pick("Bekeek de gedeelde breinen", "Bekijkt de gedeelde breinen"), object: null, code: false, service: null };
      case "brein_zoeken":
      case "persoonlijk_brein_zoeken": return { kind: "search", verb: pick(`Zocht${where} naar`, `Zoekt${where} naar`), object: `"${truncate(str(input, "vraag") ?? "", 40)}"`, code: false, service: null };
      case "brein_lezen":
      case "persoonlijk_brein_lezen": return { kind: "read", verb: pick("Las", "Leest"), object: `${note ? fileName(note) : "een notitie"}${where}`, code: false, service: null };
      case "persoonlijk_brein_schrijven":
      case "persoonlijk_brein_bewerken": return { kind: "write", verb: pick("Schreef in je persoonlijke brein:", "Schrijft in je persoonlijke brein:"), object: note ? fileName(note) : "een notitie", code: Boolean(note), service: null };
      case "voorkeur_voorstellen": return { kind: "other", verb: pick("Stelde een voorkeur voor", "Stelt een voorkeur voor"), object: null, code: false, service: null };
    }
  }
  if (part.tool.startsWith("drive_")) return { kind: "connection", verb: pick("Werkte met bestanden in Drive", "Werkt met bestanden in Drive"), object: null, code: false, service: "Drive" };
  switch (part.tool) {
    case "read":
      return { kind: "read", verb: pick("Las", "Leest"), object: path ? fileName(path) : "een bestand", code: Boolean(path), service: null };
    case "write":
      return { kind: "write", verb: pick("Schreef", "Schrijft"), object: path ? fileName(path) : "een bestand", code: Boolean(path), service: null };
    case "edit":
    case "multiedit":
    case "patch":
    case "apply_patch":
      return { kind: "edit", verb: pick("Wijzigde", "Wijzigt"), object: path ? fileName(path) : "bestanden", code: Boolean(path), service: null };
    case "bash":
    case "shell": {
      const command = str(input, "command", "cmd");
      const description = str(input, "description");
      if (description) return { kind: "shell", verb: description, object: null, code: false, service: null };
      return { kind: "shell", verb: pick("Voerde uit:", "Voert uit:"), object: command ? truncate(command, 56) : "een opdracht", code: Boolean(command), service: null };
    }
    case "grep":
    case "search": {
      const pattern = str(input, "pattern", "query");
      return { kind: "search", verb: pick("Zocht in bestanden naar", "Zoekt in bestanden naar"), object: pattern ? `"${truncate(pattern, 40)}"` : "tekst", code: false, service: null };
    }
    case "glob":
    case "list":
    case "ls": {
      const target = str(input, "path", "pattern");
      return { kind: "list", verb: pick("Bekeek", "Bekijkt"), object: target ? fileName(target) || target : "de projectmap", code: Boolean(target), service: null };
    }
    case "webfetch":
    case "fetch": {
      const url = str(input, "url");
      return { kind: "web", verb: pick("Opende", "Opent"), object: url ? host(url) : "een webpagina", code: false, service: null };
    }
    case "websearch":
    case "web_search": {
      const query = str(input, "query", "q");
      return { kind: "websearch", verb: pick("Zocht op het web naar", "Zoekt op het web naar"), object: query ? `"${truncate(query, 48)}"` : "informatie", code: false, service: null };
    }
    case "task":
    case "subagent": {
      const description = str(input, "description", "prompt");
      return { kind: "subtask", verb: pick("Deeltaak:", "Deeltaak:"), object: description ? truncate(description, 60) : "uitgezet", code: false, service: null };
    }
    case "skill": {
      const name = str(input, "name", "skill");
      return { kind: "skill", verb: pick("Gebruikte de skill", "Gebruikt de skill"), object: name ?? "", code: false, service: null };
    }
    default: {
      const separator = part.tool.indexOf("_");
      if (separator > 0) {
        const service = serviceName(part.tool.slice(0, separator));
        const action = part.tool.slice(separator + 1).replace(/[_-]+/g, " ");
        return { kind: "connection", verb: pick(`Gebruikte ${service}:`, `Gebruikt ${service}:`), object: action, code: false, service };
      }
      return { kind: "other", verb: pick("Gebruikte een hulpmiddel", "Gebruikt een hulpmiddel"), object: null, code: false, service: null };
    }
  }
}

/** Plain sentence for screen readers and tooltips. */
export function toolSentence(part: ToolPart): string {
  const label = describeTool(part);
  return label.object ? `${label.verb} ${label.object}` : label.verb;
}

// ---------------------------------------------------------------------------
// How a step ended (brief §7; DESIGN.md C5: stopped and declined are decisions, not failures)
// ---------------------------------------------------------------------------

/** The person stopped the turn: the demo marks the step "Gestopt", the engine "aborted"/"interrupted". */
export function isStoppedStep(part: ToolPart): boolean {
  return part.status === "error" && /^(gestopt|aborted|interrupted|cancel)/i.test(part.error ?? "");
}

/** The person declined the permission for this step: their decision, shown in neutral ink. */
export function isDeclinedStep(part: ToolPart): boolean {
  return part.status === "error" && /^(geweigerd|denied|rejected)/i.test(part.error ?? "");
}

/** A step that really failed: red, inline with its fix (T2). */
export function isFailedStep(part: ToolPart): boolean {
  return part.status === "error" && !isStoppedStep(part) && !isDeclinedStep(part);
}

/** A turn the person stopped: nothing failed, but at least one step was cut short. */
export function isStoppedTurn(messages: readonly Message[]): boolean {
  let stopped = false;
  for (const message of messages) {
    if (message.error) return false;
    for (const part of message.parts) {
      if (part.type !== "tool") continue;
      if (isFailedStep(part)) return false;
      if (isStoppedStep(part)) stopped = true;
    }
  }
  return stopped;
}

export type StepFixKind = "locked" | "missing" | "access" | "signIn" | "timeout" | "tooLarge";

/**
 * What to do about a failed step, from the engine's own error text. Null when the text names
 * nothing a person can act on; the raw text then lives under "Technische details" alone.
 */
export function stepFixKind(part: ToolPart): StepFixKind | null {
  const text = `${part.error ?? ""} ${part.output ?? ""}`;
  if (!text.trim()) return null;
  if (/wachtwoord|password|encrypted|beveiligd|locked/i.test(text)) return "locked";
  if (/ENOENT|not found|no such file|bestaat niet|niet gevonden/i.test(text)) return "missing";
  if (/EACCES|EPERM|permission denied|geen toegang|not permitted/i.test(text)) return "access";
  if (/unauthori[sz]ed|\b401\b|\b403\b|token (expired|invalid)|sign.?in|inloggen|authenticat/i.test(text)) return "signIn";
  if (/timed? ?out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|unreachable|niet bereikbaar/i.test(text)) return "timeout";
  if (/too large|te groot|exceeds|limit exceeded|context length/i.test(text)) return "tooLarge";
  return null;
}

export type TouchedFile = { path: string; name: string; changed: boolean };

/**
 * Files the agent read or changed in these messages, newest action wins. Only completed steps
 * count: a write still waiting for permission (pending) or running has changed nothing yet (P1).
 */
export function touchedFiles(messages: readonly Message[]): TouchedFile[] {
  const files = new Map<string, TouchedFile>();
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== "tool" || part.status !== "completed") continue;
      const path = str(part.input, "filePath", "file_path", "path");
      if (!path) continue;
      const changed = ["write", "edit", "multiedit", "patch", "apply_patch"].includes(part.tool);
      const read = part.tool === "read";
      if (!changed && !read) continue;
      const previous = files.get(path);
      files.set(path, { path, name: fileName(path), changed: changed || Boolean(previous?.changed) });
    }
  }
  return [...files.values()].sort((a, b) => Number(b.changed) - Number(a.changed) || a.name.localeCompare(b.name, "nl"));
}

/** Files this turn wrote or changed: the result the person asked for ("Dit leverde op", brief §7). */
export function deliveredFiles(messages: readonly Message[]): TouchedFile[] {
  return touchedFiles(messages).filter((file) => file.changed);
}

/** Skills and connections the agent used in these messages. */
export function usedCapabilities(messages: readonly Message[]): { skills: string[]; services: string[] } {
  const skills = new Set<string>();
  const services = new Set<string>();
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== "tool") continue;
      const label = describeTool(part);
      if (label.kind === "skill" && label.object) skills.add(label.object);
      if (label.kind === "connection" && label.service) services.add(label.service);
    }
  }
  return { skills: [...skills], services: [...services] };
}
