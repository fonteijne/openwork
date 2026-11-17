import { localDate } from "./rank.ts";
import type { SlackTodo } from "./types.ts";

/**
 * What a card needs from Slack that the agent cannot be trusted to write: a sender the person can
 * read and a link that opens the message. Pure, so the UI uses the same checks on cards that were
 * stored before the server checked them.
 */
/** A Slack member id as the API gives it (`U020WN463K3`, `W…`; always with a digit), bare or as a mention (`<@U…>`, `@U…`). */
const MEMBER_ID = /^<?@?[UW](?=[A-Z0-9]*\d)[A-Z0-9]{6,}(?:\|[^>]*)?>?$/;

export function isSlackMemberId(value: string): boolean {
  return MEMBER_ID.test(value.trim());
}

/** A web address the person's browser can open: http(s) only, so no `slack://` that needs the desktop app. */
export function openableLink(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/** True for an address on Slack itself (`slack.com` or a workspace such as `team.slack.com`). */
export function isSlackWebLink(value: string): boolean {
  const link = openableLink(value);
  if (!link) return false;
  const host = new URL(link).hostname.toLowerCase();
  return host === "slack.com" || host.endsWith(".slack.com");
}

/** The workspace host of the first message link in a text (`team.slack.com/archives/…`), lower case. */
const WORKSPACE_LINK = /https:\/\/([a-z0-9][a-z0-9-]*(?:\.enterprise)?\.slack\.com)\/archives\//i;

export function slackWorkspaceIn(text: string): string | null {
  return WORKSPACE_LINK.exec(text)?.[1]?.toLowerCase() ?? null;
}

/** Channel and timestamp from a message id as the agent gives it: `C0123:1700000000.000100` (also `/` or a space). */
export function parseSlackMessageId(id: string): { channel: string; ts: string } | null {
  const found = /^([CDG][A-Z0-9]+)[:/ ](\d+\.\d+)$/.exec(id.trim());
  return found?.[1] && found[2] ? { channel: found[1], ts: found[2] } : null;
}

/**
 * The message's permalink as Slack itself writes it: `https://team.slack.com/archives/C…/p<ts without the dot>`,
 * with the thread when the message is a reply in one.
 */
export function slackPermalink(workspace: string, channel: string, ts: string, threadTs: string | null): string {
  const base = `https://${workspace}/archives/${encodeURIComponent(channel)}/p${ts.replace(".", "")}`;
  return threadTs && threadTs !== ts ? `${base}?thread_ts=${encodeURIComponent(threadTs)}&cid=${encodeURIComponent(channel)}` : base;
}

/** An id `slack todos --json` gives and `slack todo_done` takes back: `message:C…:<ts>` or `reminder:Sa…`. */
const TODO_ID = /^(?:message:[CDG][A-Z0-9]+:\d+\.\d+|reminder:[A-Za-z0-9]+)$/;

export function isSlackTodoId(value: string): boolean {
  return TODO_ID.test(value);
}

/**
 * The open to-dos from `slack todos --json`: the text as the person reads it, a due date as a local
 * day, and only a link that opens the message on Slack. Rows that are done or do not fit are left out.
 */
export function parseSlackTodos(output: string): SlackTodo[] {
  let rows: unknown = null;
  try { rows = JSON.parse(output); } catch { rows = null; }
  if (!Array.isArray(rows)) throw new Error("Het Slack-script gaf geen lijst met to-do's.");
  const field = (row: unknown, key: string): unknown => (typeof row === "object" && row !== null ? Reflect.get(row, key) : undefined);
  const words = (row: unknown, key: string): string | null => { const found = field(row, key); return typeof found === "string" && found.trim() ? found.trim() : null; };
  const seconds = (row: unknown, key: string): number | null => { const found = field(row, key); return typeof found === "number" && Number.isFinite(found) && found > 0 ? found : null; };
  return rows.flatMap((row): SlackTodo[] => {
    const id = words(row, "id");
    if (!id || !isSlackTodoId(id) || field(row, "done") === true) return [];
    const kind = id.startsWith("message:") ? "message" : "reminder";
    const link = openableLink(words(row, "link"));
    const due = seconds(row, "due");
    const author = words(row, "author");
    const channel = words(row, "channel");
    return [{
      id, kind, text: (words(row, "text") ?? "").replace(/\s+/g, " ").slice(0, 500), author: author && !isSlackMemberId(author) ? author.slice(0, 120) : null,
      channel: channel && !isSlackMemberId(channel) ? channel.slice(0, 120) : null, due: due === null ? null : localDate(due * 1000),
      link: link && isSlackWebLink(link) ? link : null, createdAt: (seconds(row, "created") ?? 0) * 1000,
    }];
  });
}
