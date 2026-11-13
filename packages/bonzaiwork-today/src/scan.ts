import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { formatTodoLine, isProseTodo, normalizeHandle, parseTeam, parseTodoLine, proseLines, setDone, type TeamMember } from "./notation.ts";
import type { BrainKind, DueKind, Todo } from "./types.ts";

/**
 * The to-do index (plan §2.2): every checkbox line in every brain folder, read from disk each
 * time. Plain parsing, no model. Writing changes one line and nothing else in the file.
 */
export type BrainFolder = { id: string; name: string; kind: BrainKind; root: string; excluded: readonly string[]; readOnly: boolean };

/** Where a new to-do goes when no file is named. */
export const TODO_FILE = "taken.md";
/** Parked thoughts, in the personal brain (T5). */
export const INBOX_FILE = "inbox.md";
const TEAM_FILES = ["team.md", "_meta/team.md", "knowledge/team.md"];

const MAX_FILE_BYTES = 512 * 1024;
const MAX_FILES = 5000;
/** Never read: git, the engine's folders, kept copies of a conflict, and the templates. */
const SKIPPED_FOLDERS = new Set(["node_modules", "_bewaard", "_templates"]);

export async function markdownFiles(root: string, excluded: readonly string[]): Promise<string[]> {
  const skip = new Set(excluded.map((folder) => folder.replace(/^\/+|\/+$/g, "").toLowerCase()));
  const files: string[] = [];
  async function walk(relative: string): Promise<void> {
    if (files.length >= MAX_FILES) return;
    const entries = await readdir(join(root, relative), { withFileTypes: true }).catch(() => []);
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".") || SKIPPED_FOLDERS.has(entry.name) || skip.has(path.toLowerCase())) continue;
        await walk(path);
      } else if (entry.isFile() && /\.md$/i.test(entry.name) && files.length < MAX_FILES) {
        files.push(path);
      }
    }
  }
  await walk("");
  return files;
}

async function readSmall(file: string): Promise<string | null> {
  const info = await stat(file).catch(() => null);
  if (!info || info.size > MAX_FILE_BYTES) return null;
  return readFile(file, "utf8").catch(() => null);
}

export function todoId(brainId: string, path: string, text: string, occurrence: number): string {
  const hash = createHash("sha256").update(`${brainId}\0${path}\0${text.toLowerCase()}`).digest("hex").slice(0, 12);
  return occurrence > 1 ? `${hash}-${occurrence}` : hash;
}

type FileTodo = Omit<Todo, "mine" | "brainName" | "brainKind">;

function todosInText(brainId: string, path: string, text: string): FileTodo[] {
  const seen = new Map<string, number>();
  const todos: FileTodo[] = [];
  for (const { line, number } of proseLines(text)) {
    const parsed = parseTodoLine(line);
    if (!parsed) continue;
    const key = parsed.text.toLowerCase();
    const occurrence = (seen.get(key) ?? 0) + 1;
    seen.set(key, occurrence);
    todos.push({ ...parsed, id: todoId(brainId, path, parsed.text, occurrence), brainId, path, line: number });
  }
  return todos;
}

export async function readTeam(root: string): Promise<TeamMember[]> {
  for (const file of TEAM_FILES) {
    const text = await readSmall(join(root, file));
    if (text !== null) return parseTeam(text);
  }
  return [];
}

export type BrainScan = { todos: Todo[]; proseLines: number };

/**
 * One brain's to-dos. `mine`: the line names one of `handles`, or it has no owner and stands in
 * the personal brain. A line without owner in a project brain is team backlog (T3).
 */
export async function scanBrain(brain: BrainFolder, handles: readonly string[]): Promise<BrainScan> {
  const own = new Set(handles.map(normalizeHandle));
  const todos: Todo[] = [];
  let prose = 0;
  for (const path of await markdownFiles(brain.root, brain.excluded)) {
    const text = await readSmall(join(brain.root, path));
    if (text === null) continue;
    for (const todo of todosInText(brain.id, path, text)) {
      const mine = todo.owner ? own.has(todo.owner) : brain.kind === "personal";
      todos.push({ ...todo, brainName: brain.name, brainKind: brain.kind, mine });
    }
    if (path !== INBOX_FILE) for (const { line } of proseLines(text)) if (isProseTodo(line)) prose += 1;
  }
  return { todos, proseLines: prose };
}

export type WriteResult = { ok: true; todo: FileTodo } | { ok: false; reason: "not_found" | "read_only" | "changed" };

/** Ticks or clears one to-do. The line is found again by its id, so an edit elsewhere in the file is fine. */
export async function setTodoDone(brain: BrainFolder, id: string, path: string, done: boolean): Promise<WriteResult> {
  if (brain.readOnly) return { ok: false, reason: "read_only" };
  const file = join(brain.root, path);
  const text = await readSmall(file);
  if (text === null) return { ok: false, reason: "not_found" };
  const todo = todosInText(brain.id, path, text).find((entry) => entry.id === id);
  if (!todo) return { ok: false, reason: "not_found" };
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const next = setDone(lines[todo.line - 1] ?? "", done);
  if (next === null) return { ok: false, reason: "changed" };
  lines[todo.line - 1] = next;
  await writeFile(file, lines.join(newline));
  return { ok: true, todo: { ...todo, done } };
}

/** Appends a to-do to `taken.md` (made when it is not there yet) and gives it back as indexed. */
export async function addTodo(brain: BrainFolder, input: { text: string; owner: string | null; due: string | null; dueKind: DueKind | null }): Promise<WriteResult> {
  if (brain.readOnly) return { ok: false, reason: "read_only" };
  const file = join(brain.root, TODO_FILE);
  const current = (await readSmall(file)) ?? "# Taken\n";
  const line = formatTodoLine(input);
  const text = `${current.replace(/\s+$/, "")}\n${/\[[ xX]\]/.test(current) ? "" : "\n"}${line}\n`;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text);
  const added = todosInText(brain.id, TODO_FILE, text).filter((entry) => entry.text === parseTodoLine(line)?.text).at(-1);
  return added ? { ok: true, todo: added } : { ok: false, reason: "changed" };
}

export type InboxEntry = { id: string; text: string; line: number };

const inboxId = (line: string) => createHash("sha256").update(line).digest("hex").slice(0, 10);

/** The parked thoughts: every list item of `inbox.md`. */
export async function readInbox(root: string): Promise<InboxEntry[]> {
  const text = await readSmall(join(root, INBOX_FILE));
  if (text === null) return [];
  const entries: InboxEntry[] = [];
  for (const { line, number } of proseLines(text)) {
    const item = /^\s*[-*+]\s+(.*\S)\s*$/.exec(line)?.[1];
    if (item) entries.push({ id: inboxId(line), text: item, line: number });
  }
  return entries;
}

/** "Parkeren" (T5): one line at the end of the inbox, with the moment it was parked. */
export async function parkThought(root: string, thought: string, now: Date): Promise<InboxEntry> {
  const file = join(root, INBOX_FILE);
  const current = (await readSmall(file)) ?? "# Inbox\n\nGeparkeerde gedachten. De avondronde deelt ze in.\n";
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const line = `- ${thought.replace(/\s+/g, " ").trim()} _(geparkeerd ${stamp})_`;
  await writeFile(file, `${current.replace(/\s+$/, "")}\n${/^\s*[-*+]\s+/m.test(current) ? "" : "\n"}${line}\n`);
  const entries = await readInbox(root);
  return entries.at(-1) ?? { id: inboxId(line), text: line.slice(2), line: 0 };
}

/** Removes one parked thought once the evening round filed it. */
export async function removeInboxEntry(root: string, id: string): Promise<boolean> {
  const file = join(root, INBOX_FILE);
  const text = await readSmall(file);
  if (text === null) return false;
  const entry = (await readInbox(root)).find((candidate) => candidate.id === id);
  if (!entry) return false;
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  lines.splice(entry.line - 1, 1);
  await writeFile(file, lines.join(newline));
  return true;
}
