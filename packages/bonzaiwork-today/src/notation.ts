import type { DueKind } from "./types.ts";

/**
 * The to-do notation (plan §2.1): a Markdown checkbox with an optional `@owner` and one date.
 *
 *     - [ ] Offerte sturen @sam 📅 2026-11-20
 *     - [ ] Reactie van de leverancier op het voorstel @sam ⏳ 2026-11-19
 *
 * Pure: the server, the UI and the demo backend read lines the same way.
 */
export type ParsedTodo = { done: boolean; text: string; owner: string | null; due: string | null; dueKind: DueKind | null };

const CHECKBOX = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]\s+(.*\S)\s*$/;
/** `@name` after a space or at the start, so the `@` of an e-mail address never counts. */
const OWNER = /(^|\s)@([\p{L}\p{N}][\p{L}\p{N}._-]*)/u;
const DATE = /(📅|⏳)️?\s*(\d{4}-\d{2}-\d{2})/u;

export const DEADLINE_MARK = "📅";
export const WAITING_MARK = "⏳";

export function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** A handle as it is compared: lower case, without the `@` and trailing punctuation. */
export function normalizeHandle(value: string): string {
  return value.trim().replace(/^@/, "").replace(/[.,;:!?]+$/, "").toLowerCase();
}

export function parseTodoLine(line: string): ParsedTodo | null {
  const match = CHECKBOX.exec(line);
  if (!match) return null;
  let body = match[3] ?? "";
  const date = DATE.exec(body);
  const due = date && isDate(date[2] ?? "") ? date[2] ?? null : null;
  if (date && due) body = body.replace(date[0], " ");
  const owner = OWNER.exec(body);
  if (owner) body = body.replace(owner[0], " ");
  const text = body.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return {
    done: match[2] !== " ", text,
    owner: owner ? normalizeHandle(owner[2] ?? "") || null : null,
    due, dueKind: due ? (date?.[1] === WAITING_MARK ? "waiting" : "deadline") : null,
  };
}

/** One line in the notation; the text never keeps a line break or a second checkbox. */
export function formatTodoLine(todo: { text: string; owner?: string | null; due?: string | null; dueKind?: DueKind | null; done?: boolean }): string {
  const text = todo.text.replace(/\s+/g, " ").replace(/^\s*(?:[-*+]\s+)?\[[ xX]\]\s*/, "").trim();
  const owner = todo.owner ? ` @${normalizeHandle(todo.owner)}` : "";
  const due = todo.due && isDate(todo.due) ? ` ${todo.dueKind === "waiting" ? WAITING_MARK : DEADLINE_MARK} ${todo.due}` : "";
  return `- [${todo.done ? "x" : " "}] ${text}${owner}${due}`;
}

/** The same line with the box ticked or cleared; null when it is not a checkbox line. */
export function setDone(line: string, done: boolean): string | null {
  const match = CHECKBOX.exec(line);
  if (!match) return null;
  return line.replace(/\[([ xX])\]/, done ? "[x]" : "[ ]");
}

/** A line that reads like a to-do but is not a checkbox yet (T9). */
const PROSE = /^\s*(?:[-*+]\s+)?(?:\*\*)?(?:to[- ]?do|actie(?:punt)?|nog doen|te doen|follow[- ]?up|opvolgen)(?:\*\*)?\s*[:：-]\s*\S/i;

export function isProseTodo(line: string): boolean {
  return !CHECKBOX.test(line) && PROSE.test(line);
}

/** The lines of a Markdown text that are not inside a fenced code block, with their 1-based number. */
export function* proseLines(text: string): Generator<{ line: string; number: number }> {
  let fence: string | null = null;
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const mark = /^\s*(```+|~~~+)/.exec(line)?.[1];
    if (mark) {
      if (fence === null) fence = mark[0] ?? null;
      else if (mark[0] === fence) fence = null;
      continue;
    }
    if (fence === null) yield { line, number: index + 1 };
  }
}

export type TeamMember = { handle: string; name: string | null; email: string | null };

/**
 * `team.md` (plan §7): one member per line with a `@name`, and the name or e-mail the brain's
 * history knows them by. A table row, a list item or a plain line all read the same.
 */
export function parseTeam(text: string): TeamMember[] {
  const members: TeamMember[] = [];
  for (const { line } of proseLines(text)) {
    const handle = OWNER.exec(line);
    if (!handle) continue;
    const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.exec(line)?.[0] ?? null;
    let rest = line.replace(handle[0], " ");
    if (email) rest = rest.replace(email, " ");
    const name = rest.replace(/[|<>()[\]*_`:–—-]+/g, " ").replace(/\s+/g, " ").trim() || null;
    const key = normalizeHandle(handle[2] ?? "");
    if (key && !members.some((member) => member.handle === key)) members.push({ handle: key, name, email: email?.toLowerCase() ?? null });
  }
  return members;
}

const slug = (value: string) => value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * The handles that are the person at this laptop: the one they chose, the `team.md` rows that
 * carry their git name or e-mail, and otherwise their first name.
 */
export function ownHandles(input: { handle: string | null; author: { name: string; email: string } | null; teams: readonly TeamMember[] }): string[] {
  const found = new Set<string>();
  if (input.handle) found.add(normalizeHandle(input.handle));
  const author = input.author;
  if (author) {
    const name = author.name.trim().toLowerCase();
    const email = author.email.trim().toLowerCase();
    for (const member of input.teams) {
      if ((member.email && member.email === email) || (member.name && member.name.toLowerCase() === name)) found.add(member.handle);
    }
    if (!found.size) {
      const first = slug(author.name.trim().split(/\s+/)[0] ?? "");
      if (first) found.add(first);
    }
  }
  return [...found].filter(Boolean).sort();
}
