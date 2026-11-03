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

/** A line that is only a heading: `# Kop`, or wholly bold (`**Opvallend**`). */
function isHeading(line: string): boolean {
  return /^#{1,6}\s+/.test(line) || /^(\*\*|__)[^*_]+\1:?$/.test(line);
}

/**
 * How one paragraph joins the next, so the line reads as sentences (C4) and not as one run-on:
 * a heading takes ": " (". " when it already holds a colon), a paragraph without closing
 * punctuation takes ". ", and one that ends in ":", "," or ";" simply continues.
 */
function joiner(text: string, heading: boolean): string {
  if (/[:,;]$/.test(text)) return " ";
  if (/[.!?…)"”]$/.test(text)) return " ";
  return heading && !text.includes(":") ? ": " : ". ";
}

/** Markdown to plain text: paragraphs joined as sentences, without heading markers, lists, quotes, tables or code. */
export function plainText(markdown: string): string {
  let out = "";
  let pending = "";
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
    if (!text) continue;
    out += pending + text;
    pending = joiner(text, isHeading(line));
  }
  return out;
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
