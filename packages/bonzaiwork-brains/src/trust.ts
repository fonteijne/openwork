/**
 * What a shared brain can bring that runs code on the user's laptop, and how
 * BonzaiWork keeps it out of the folder until that user trusts it (plan §7.1;
 * fase 0 §6.2–§6.3). The engine loads these the moment they are on disk, so
 * they are excluded with sparse-checkout before any checkout or update.
 */
export type TrustKind = "config" | "plugin" | "agent" | "command" | "script" | "link";

export type TrustItem = {
  path: string;
  kind: TrustKind;
  /** Blob id: a trusted item that changes asks again. */
  blob: string;
  /** MCP servers an opencode.json declares, for the trust step and the engine policies. */
  mcpServers?: string[];
};

const CONFIG_FILES = new Set(["opencode.json", "opencode.jsonc", ".opencode/opencode.json", ".opencode/opencode.jsonc"]);

/** Case does not matter: on macOS and Windows `.OpenCode/Plugins/x.js` is the same file. */
export function riskKind(path: string): TrustKind | null {
  const lower = path.toLowerCase();
  if (CONFIG_FILES.has(lower)) return "config";
  if (/^\.opencode\/plugins?\//.test(lower)) return "plugin";
  if (/^\.opencode\/agents?\//.test(lower)) return "agent";
  if (/^\.opencode\/commands?\/.+\.md$/.test(lower)) return "command";
  if (/^_tools\//.test(lower)) return "script";
  return null;
}

/**
 * A name that sparse-checkout cannot exclude for certain (a newline, or white space at the end of a
 * part, which git trims from patterns): such a brain is not checked out at all.
 */
export function unsafePath(path: string): boolean {
  return /[\r\n]/.test(path) || path.split("/").some((part) => /[ \t]$/.test(part));
}

/** A command template runs shell without asking when it contains !`…` (fase 0 §6.2). */
export function commandRunsShell(content: string): boolean {
  return /!`[^`]+`/.test(content);
}

function stripJsonComments(text: string): string {
  return text.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (match, string: string | undefined) => string ?? "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** MCP names in an opencode.json, v1 (`mcp.<name>`) and v2 (`mcp.servers.<name>`) shape. */
export function mcpServerNames(content: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonComments(content).replace(/,(\s*[}\]])/g, "$1"));
  } catch {
    return [];
  }
  if (!isRecord(parsed) || !isRecord(parsed.mcp)) return [];
  const servers = isRecord(parsed.mcp.servers) ? parsed.mcp.servers : parsed.mcp;
  return Object.keys(servers).filter((name) => name !== "timeout" && name !== "servers").sort();
}

/** `mode` 120000 is a symlink: one could point `.opencode` at a folder of plugins (review #5). */
export type TreeEntry = { path: string; blob: string; mode?: string };

/** The items in a tree that need the user's decision; commands only when they run shell. */
export async function findTrustItems(entries: readonly TreeEntry[], read: (blob: string) => Promise<string>): Promise<TrustItem[]> {
  const items: TrustItem[] = [];
  for (const entry of entries) {
    // Every symlink waits for the user, wherever it is: the paths above only see what the link is called.
    const kind = entry.mode === "120000" ? "link" : riskKind(entry.path);
    if (!kind) continue;
    if (kind === "command" && !commandRunsShell(await read(entry.blob))) continue;
    const mcpServers = kind === "config" ? mcpServerNames(await read(entry.blob)) : undefined;
    items.push({ path: entry.path, kind, blob: entry.blob, ...(mcpServers?.length ? { mcpServers } : {}) });
  }
  return items;
}

/** Trusted means: the user accepted exactly this content. */
export function untrusted(items: readonly TrustItem[], trusted: Readonly<Record<string, string>>): TrustItem[] {
  return items.filter((item) => trusted[item.path] !== item.blob);
}

function sparseEscape(path: string): string {
  return path.replace(/[\\*?[\]!#]/g, (char) => `\\${char}`);
}

/** Non-cone sparse-checkout: everything, minus each untrusted file. */
export function sparsePatterns(excluded: readonly TrustItem[]): string[] {
  return ["/*", ...excluded.map((item) => `!/${sparseEscape(item.path)}`)];
}

const EXCLUDE_START = "# >>> BonzaiWork (beheerd, niet gedeeld)";
const EXCLUDE_END = "# <<< BonzaiWork";

/**
 * Local-only ignores in .git/info/exclude (plan §4.1): chat attachments, OS
 * clutter, run output (I1), and new risky files, so an AI-made plugin is
 * never shared by itself. Tracked files there still update via `add -u`.
 */
export const LOCAL_EXCLUDES = [
  "/.opencode/openwork/inbox/",
  ".DS_Store",
  "Thumbs.db",
  "/workflows/**/output/",
  "/_bewaard/",
  "/workflows/**/check.md",
  "/workflows/*/_runs/",
  "/.opencode/plugin/",
  "/.opencode/plugins/",
  "/.opencode/agent/",
  "/.opencode/agents/",
  "/_tools/",
  "/opencode.json",
  "/opencode.jsonc",
  "/.opencode/opencode.json",
  "/.opencode/opencode.jsonc",
];

/** Never part of a personal brain, whatever the user ticks (plan §5.1.1). */
export const ALWAYS_EXCLUDED_FOLDERS = [".obsidian", ".trash", ".logseq", ".git"];

/**
 * A personal brain keeps history of Markdown only (N5), outside the folders
 * the user excluded; attachments never make the history big.
 */
export function personalExcludes(excluded: readonly string[]): string[] {
  const folders = [...ALWAYS_EXCLUDED_FOLDERS, ...excluded]
    .map((folder) => folder.replace(/^\/+|\/+$/g, ""))
    .filter((folder) => folder && !folder.includes(".."));
  return ["*", "!*/", "!*.md", ...[...new Set(folders)].map((folder) => `/${folder.replace(/[\\*?[\]!#]/g, (char) => `\\${char}`)}/`)];
}

export function withLocalExcludes(current: string, extra: readonly string[] = []): string {
  const start = current.indexOf(EXCLUDE_START);
  const end = current.indexOf(EXCLUDE_END);
  const before = start >= 0 && end > start ? current.slice(0, start) + current.slice(end + EXCLUDE_END.length).replace(/^\n/, "") : current;
  const base = before.trimEnd();
  return `${base ? `${base}\n` : ""}${EXCLUDE_START}\n${[...extra, ...LOCAL_EXCLUDES].join("\n")}\n${EXCLUDE_END}\n`;
}
