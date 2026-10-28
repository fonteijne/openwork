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
    outlook: "Outlook",
    teams: "Teams",
    sharepoint: "SharePoint",
  };
  return known[id.toLowerCase()] ?? id.charAt(0).toUpperCase() + id.slice(1);
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
  if (builtIn) return { kind: builtIn.kind, verb: done ? builtIn.past : builtIn.present, object: null, code: false, service: builtIn.service ?? null };
  if (part.tool.startsWith("computer_")) return { kind: "other", verb: pick("Werkte op je computer", "Werkt op je computer"), object: null, code: false, service: null };
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

export type TouchedFile = { path: string; name: string; changed: boolean };

/** Files the agent read or changed in these messages, newest action wins. */
export function touchedFiles(messages: readonly Message[]): TouchedFile[] {
  const files = new Map<string, TouchedFile>();
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== "tool" || part.status === "error") continue;
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
