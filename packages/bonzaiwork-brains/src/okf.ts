import { readdir, readFile } from "node:fs/promises";
import { join, posix } from "node:path";

import { isMap, parseDocument, type Document } from "yaml";

/**
 * Knowledge in OKF v0.2 (plan §6.2, §6.5): what BonzaiWork does itself,
 * deterministically, just before every commit. The AI never writes
 * `index.md`, `log.md`, `generated` or `verified`.
 * Spec: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
 */
export const KNOWLEDGE = "knowledge";
export const OKF_VERSION = "0.2";
const RESERVED = new Set(["index.md", "log.md"]);

export function isKnowledgePath(path: string): boolean {
  return path.startsWith(`${KNOWLEDGE}/`) && /\.md$/i.test(path);
}

export function isReserved(path: string): boolean {
  return RESERVED.has(posix.basename(path).toLowerCase());
}

/** A concept: a non-reserved Markdown file in the bundle. */
export function isConceptPath(path: string): boolean {
  return isKnowledgePath(path) && !isReserved(path);
}

export function isReferencePath(path: string): boolean {
  return path.startsWith(`${KNOWLEDGE}/references/`) && !isReserved(path);
}

type Split = { frontmatter: string; body: string } | null;

function split(text: string): Split {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text.replace(/^﻿/, ""));
  return match ? { frontmatter: match[1], body: text.replace(/^﻿/, "").slice(match[0].length) } : null;
}

export type Concept = { type: string; title: string | null; description: string | null; status: string | null; data: Record<string, unknown> };

export type ConceptProblem = "no_frontmatter" | "invalid_yaml" | "no_type";

export function parseConcept(text: string): { ok: true; concept: Concept } | { ok: false; problem: ConceptProblem } {
  const parts = split(text);
  if (!parts) return { ok: false, problem: "no_frontmatter" };
  const doc = parseDocument(parts.frontmatter);
  if (doc.errors.length) return { ok: false, problem: "invalid_yaml" };
  const value: unknown = doc.toJS();
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { ok: false, problem: "invalid_yaml" };
  const data: Record<string, unknown> = Object.fromEntries(Object.entries(value));
  const type = typeof data.type === "string" ? data.type.trim() : "";
  if (!type) return { ok: false, problem: "no_type" };
  const str = (key: string) => (typeof data[key] === "string" ? String(data[key]).trim() || null : null);
  return { ok: true, concept: { type, title: str("title"), description: str("description"), status: str("status"), data } };
}

function frontmatterDocument(text: string): { doc: Document; body: string } | null {
  const parts = split(text);
  if (!parts) return null;
  const doc = parseDocument(parts.frontmatter);
  return doc.errors.length || !isMap(doc.contents) ? null : { doc, body: parts.body };
}

/**
 * Sets `generated` and keeps every other key, comment and order as it was
 * (the spec asks to preserve unknown keys).
 */
export function withGenerated(text: string, by: string, at: string): string {
  const parsed = frontmatterDocument(text);
  if (!parsed) return text;
  parsed.doc.set("generated", parsed.doc.createNode({ by, at }, { flow: true }));
  return `---\n${parsed.doc.toString({ lineWidth: 0, flowCollectionPadding: false }).trimEnd()}\n---\n${parsed.body}`;
}

/** "Klopt" in the UI (plan §6.2): adds a human verification and makes a draft stable. */
export function withVerified(text: string, by: string, at: string): string {
  const parsed = frontmatterDocument(text);
  if (!parsed) return text;
  const current: unknown = parsed.doc.toJS();
  const record = typeof current === "object" && current !== null && !Array.isArray(current) ? Object.fromEntries(Object.entries(current)) : {};
  const previous = record.verified;
  const list = Array.isArray(previous) ? previous : previous && typeof previous === "object" ? [previous] : [];
  parsed.doc.set("verified", parsed.doc.createNode([...list, { by, at }]));
  if (record.status === undefined || record.status === "draft") parsed.doc.set("status", "stable");
  return `---\n${parsed.doc.toString({ lineWidth: 0, flowCollectionPadding: false }).trimEnd()}\n---\n${parsed.body}`;
}

// --- index.md ------------------------------------------------------------------

export type IndexEntry = { file: string; title: string; description: string | null; type: string };

function sortByTitle<T extends { title: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.title.localeCompare(b.title, "nl"));
}

function folderTitle(name: string): string {
  const spaced = name.replace(/[-_]+/g, " ").trim();
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : name;
}

/**
 * One folder's index (spec §8): a section with subfolders and one per type,
 * each entry `* [Title](link) - description`. Only the bundle root carries
 * frontmatter, and only `okf_version`.
 */
export function renderIndex(input: { root: boolean; folders: Array<{ name: string; concepts: number }>; concepts: IndexEntry[] }): string {
  const lines: string[] = [];
  if (input.root) lines.push("---", `okf_version: "${OKF_VERSION}"`, "---");
  const sections: string[] = [];
  if (input.folders.length) {
    sections.push(["# Mappen", "", ...sortByTitle(input.folders.map((folder) => ({ ...folder, title: folderTitle(folder.name) })))
      .map((folder) => `* [${folder.title}](${encodeURI(folder.name)}/index.md) - ${folder.concepts} ${folder.concepts === 1 ? "concept" : "concepten"}`)].join("\n"));
  }
  const types = [...new Set(input.concepts.map((concept) => concept.type))].sort((a, b) => a.localeCompare(b, "nl"));
  for (const type of types) {
    const entries = sortByTitle(input.concepts.filter((concept) => concept.type === type));
    sections.push([`# ${type}`, "", ...entries.map((entry) => `* [${entry.title}](${encodeURI(entry.file)})${entry.description ? ` - ${entry.description}` : ""}`)].join("\n"));
  }
  if (!sections.length) sections.push("# Nog leeg\n\nHier komen de concepten van deze map.");
  return `${[...lines, ...(lines.length ? [""] : []), sections.join("\n\n")].join("\n")}\n`;
}

type Folder = { path: string; concepts: IndexEntry[]; folders: string[]; total: number };

/** Every folder of the bundle with its concepts, read from disk. */
export async function scanBundle(root: string, read: (path: string) => Promise<string | null> = (path) => readFile(join(root, path), "utf8").catch(() => null)): Promise<Map<string, Folder>> {
  const folders = new Map<string, Folder>();
  async function walk(relative: string): Promise<number> {
    const entries = await readdir(join(root, relative), { withFileTypes: true }).catch(() => []);
    const folder: Folder = { path: relative, concepts: [], folders: [], total: 0 };
    folders.set(relative, folder);
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".")) continue;
      const path = `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        const count = await walk(path);
        folder.folders.push(entry.name);
        folder.total += count;
      } else if (entry.isFile() && isConceptPath(path)) {
        const text = await read(path);
        const parsed = text === null ? null : parseConcept(text);
        if (!parsed?.ok) continue;
        folder.concepts.push({ file: entry.name, title: parsed.concept.title ?? folderTitle(entry.name.replace(/\.md$/i, "")), description: parsed.concept.description, type: parsed.concept.type });
        folder.total += 1;
      }
    }
    return folder.total;
  }
  await walk(KNOWLEDGE);
  return folders;
}

/** index.md for every folder, as it should be now. */
export async function renderIndexes(root: string): Promise<Map<string, string>> {
  const folders = await scanBundle(root);
  const result = new Map<string, string>();
  for (const folder of folders.values()) {
    const children = folder.folders.map((name) => ({ name, concepts: folders.get(`${folder.path}/${name}`)?.total ?? 0 }));
    result.set(`${folder.path}/index.md`, renderIndex({ root: folder.path === KNOWLEDGE, folders: children, concepts: folder.concepts }));
  }
  return result;
}

// --- log.md ------------------------------------------------------------------

export type LogLine = { label: "Creation" | "Update" | "Deprecation" | "Removal"; title: string; link: string; note: string };

const LOG_HEADING = "# Logboek";

type ParsedLog = { heading: string; days: Map<string, string[]> };

function parseLog(text: string): ParsedLog {
  const days = new Map<string, string[]>();
  let heading = LOG_HEADING;
  let current: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const day = /^##\s+(\d{4}-\d{2}-\d{2})\s*$/.exec(line);
    if (day) { current = day[1]; if (!days.has(current)) days.set(current, []); continue; }
    if (/^#\s/.test(line) && current === null) { heading = line.trim(); continue; }
    if (current && line.trim()) days.get(current)?.push(line.trimEnd());
  }
  return { heading, days };
}

function renderLog(log: ParsedLog): string {
  const days = [...log.days.entries()].filter(([, lines]) => lines.length).sort(([a], [b]) => b.localeCompare(a));
  return `${[log.heading, ...days.map(([day, lines]) => `\n## ${day}\n${lines.join("\n")}`)].join("\n")}\n`;
}

/** Newest first under today's date (spec §9). */
export function appendLog(current: string | null, day: string, lines: readonly LogLine[]): string {
  const log = parseLog(current ?? "");
  const rendered = lines.map((line) => `* **${line.label}**: [${line.title}](${encodeURI(line.link)})${line.note ? ` - ${line.note}` : ""}`);
  log.days.set(day, [...rendered, ...(log.days.get(day) ?? [])]);
  return renderLog(log);
}

/** A rebase conflict in log.md: both sides, per date, nothing lost (plan §4.5). */
export function mergeLogs(ours: string, theirs: string): string {
  const a = parseLog(ours);
  const b = parseLog(theirs);
  const days = new Map(a.days);
  for (const [day, lines] of b.days) {
    const existing = days.get(day) ?? [];
    days.set(day, [...lines.filter((line) => !existing.includes(line)), ...existing]);
  }
  return renderLog({ heading: a.heading, days });
}

// --- before a commit -----------------------------------------------------------

export type StagedChange = { path: string; status: "A" | "M" | "D" };

export type KnowledgePlan = {
  /** Files to write and stage. */
  write: Map<string, string>;
  /** Changes inside references/ to undo: sources are immutable. */
  restore: string[];
  /** Concepts that are not OKF-conformant: no commit. */
  invalid: Array<{ path: string; problem: ConceptProblem }>;
};

/**
 * What the sync does with the knowledge changes of one commit. `by` is the
 * actor: `bonzaiwork/<version>` for the AI's turn, `human:<id>` for the
 * user's own changes. Reads go through `read` (the work tree).
 */
export async function planKnowledge(input: {
  root: string;
  staged: readonly StagedChange[];
  by: string;
  at: string;
  note: string;
  read?: (path: string) => Promise<string | null>;
  /** Whether the file existed before this commit (HEAD), to tell creation from update. */
  existed: (path: string) => Promise<boolean>;
}): Promise<KnowledgePlan> {
  const read = input.read ?? ((path: string) => readFile(join(input.root, path), "utf8").catch(() => null));
  const write = new Map<string, string>();
  const restore: string[] = [];
  const invalid: KnowledgePlan["invalid"] = [];
  const logLines: LogLine[] = [];
  for (const change of input.staged) {
    if (!isConceptPath(change.path)) continue;
    if (isReferencePath(change.path) && change.status !== "A" && await input.existed(change.path)) {
      restore.push(change.path);
      continue;
    }
    const link = posix.relative(KNOWLEDGE, change.path);
    if (change.status === "D") {
      logLines.push({ label: "Removal", title: folderTitle(posix.basename(change.path, ".md")), link, note: input.note });
      continue;
    }
    const text = await read(change.path);
    if (text === null) continue;
    const parsed = parseConcept(text);
    if (!parsed.ok) { invalid.push({ path: change.path, problem: parsed.problem }); continue; }
    if (isReferencePath(change.path)) {
      logLines.push({ label: "Creation", title: parsed.concept.title ?? link, link, note: input.note });
      continue;
    }
    write.set(change.path, withGenerated(text, input.by, input.at));
    const label = parsed.concept.status === "deprecated" ? "Deprecation" : await input.existed(change.path) ? "Update" : "Creation";
    logLines.push({ label, title: parsed.concept.title ?? folderTitle(posix.basename(change.path, ".md")), link, note: input.note });
  }
  if (invalid.length || logLines.length === 0) return { write: invalid.length ? new Map() : write, restore, invalid };
  const logPath = `${KNOWLEDGE}/log.md`;
  write.set(logPath, appendLog(await read(logPath), input.at.slice(0, 10), logLines));
  return { write, restore, invalid };
}

// --- for the UI (plan §8.2, "Concept in de sidecar") ---------------------------

export type TrustTier = "unverified" | "machine" | "human" | "human_before_change";

export type ConceptView = {
  type: string;
  title: string | null;
  description: string | null;
  tags: string[];
  /** Absent means stable (spec §5.4). */
  status: "draft" | "stable" | "deprecated";
  stale: boolean;
  generated: { by: string; at: string | null } | null;
  verified: Array<{ by: string; at: string | null }>;
  tier: TrustTier;
  sources: Array<{ id: string | null; title: string | null; resource: string | null }>;
};

function actorList(value: unknown): Array<{ by: string; at: string | null }> {
  const list = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
  return list.flatMap((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) return [];
    const by = Reflect.get(entry, "by");
    const at = Reflect.get(entry, "at");
    return typeof by === "string" ? [{ by, at: typeof at === "string" ? at : at instanceof Date ? at.toISOString() : null }] : [];
  });
}

/** Trust tier (spec §5.3), plus "checked before the last change" when generated.at is later. */
export function describeConcept(text: string, now: Date = new Date()): ConceptView | null {
  const parsed = parseConcept(text);
  if (!parsed.ok) return null;
  const { data } = parsed.concept;
  const generated = actorList(data.generated)[0] ?? null;
  const verified = actorList(data.verified);
  const human = verified.filter((entry) => entry.by.startsWith("human:"));
  const lastHuman = human.map((entry) => entry.at ?? "").sort().at(-1) ?? "";
  const tier: TrustTier = human.length
    ? (generated?.at && lastHuman && generated.at > lastHuman ? "human_before_change" : "human")
    : verified.length ? "machine" : "unverified";
  const staleAfter = data.stale_after instanceof Date ? data.stale_after.getTime() : typeof data.stale_after === "string" ? Date.parse(data.stale_after) : Number.NaN;
  const status = parsed.concept.status === "draft" || parsed.concept.status === "deprecated" ? parsed.concept.status : "stable";
  const sources = Array.isArray(data.sources) ? data.sources.flatMap((source: unknown) => {
    if (typeof source !== "object" || source === null) return [];
    const field = (key: string) => { const value: unknown = Reflect.get(source, key); return typeof value === "string" ? value : null; };
    return [{ id: field("id"), title: field("title"), resource: field("resource") }];
  }) : [];
  return {
    type: parsed.concept.type, title: parsed.concept.title, description: parsed.concept.description,
    tags: Array.isArray(data.tags) ? data.tags.filter((tag): tag is string => typeof tag === "string") : [],
    status, stale: Number.isFinite(staleAfter) && now.getTime() >= staleAfter, generated, verified, tier, sources,
  };
}
