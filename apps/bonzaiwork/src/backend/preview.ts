import type { Message } from "./types";

/**
 * `Chat.preview`: the last assistant text as one plain line, so a row reads as a result
 * (DESIGN.md C4: name the outcome, not the activity). Markdown is stripped, tables and code
 * are skipped, and the line is cut at a word boundary around `limit` characters.
 */

export const PREVIEW_LIMIT = 120;

function stripInline(line: string): string {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[^\w*])[*_]([^*_]+)[*_](?=[^\w*]|$)/g, "$1$2")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Markdown to plain text: one paragraph per line, without headings markers, lists, quotes, tables or code. */
export function plainText(markdown: string): string {
  const lines: string[] = [];
  let inFence = false;
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !line) continue;
    if (/^\|/.test(line) || /^(-{3,}|\*{3,}|_{3,})$/.test(line)) continue;
    const text = stripInline(line.replace(/^#{1,6}\s+/, "").replace(/^>\s?/, "").replace(/^(?:[-*+]|\d+[.)])\s+/, ""));
    if (text) lines.push(text);
  }
  return lines.join(" ");
}

export function cutAt(text: string, limit = PREVIEW_LIMIT): string {
  if (text.length <= limit) return text;
  const head = text.slice(0, limit + 1);
  const space = head.lastIndexOf(" ");
  return `${(space > limit * 0.6 ? head.slice(0, space) : head.slice(0, limit)).replace(/[\s,;:(]+$/, "")}…`;
}

/** The preview of a chat from its history: the last assistant turn that has text; null without one. */
export function chatPreview(messages: readonly Message[], limit = PREVIEW_LIMIT): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "assistant") continue;
    const text = message.parts.map((part) => (part.type === "text" ? part.text : "")).join("\n");
    const plain = plainText(text);
    if (plain) return cutAt(plain, limit);
    if (message.error) return null;
  }
  return null;
}
