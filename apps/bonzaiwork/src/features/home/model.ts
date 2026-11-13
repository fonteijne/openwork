import type { AttentionItem, Brain, BrainHistoryEntry, Chat, Project, Routine } from "~/backend/types";
import { readLocal, writeLocal } from "~/lib/storage";

/**
 * The pure part of Vandaag (brief §5): which project the composer starts in, how a card is keyed,
 * what "Terwijl je weg was" lists and since when. No React, so it tests in node.
 */

export const LAST_SEEN_KEY = "bonzaiwork.lastSeenAt";
const DAY = 24 * 60 * 60_000;

/** At most this many cards before "Nog n" (brief §5). */
export const MAX_CARDS = 5;
/** At most this many rows in "Terwijl je weg was" (brief §5). */
export const MAX_AWAY_ROWS = 8;
/** At most this many project rows before "Alle projecten" (brief §5). */
export const MAX_PROJECT_ROWS = 5;

/** The composer's project: the one used last when it is still listed, else the first pinned, else the first. */
export function defaultProjectId(lastProjectId: string | null, projects: readonly Project[]): string | null {
  if (lastProjectId && projects.some((project) => project.id === lastProjectId)) return lastProjectId;
  return projects.find((project) => project.pinned)?.id ?? projects[0]?.id ?? null;
}

/** One stable key per card, so a card that was answered can leave before the next poll. */
export function attentionKey(item: AttentionItem): string {
  switch (item.kind) {
    case "permission":
      return `permission:${item.request.id}`;
    case "question":
      return `question:${item.request.id}`;
    case "chat_failed":
      return `failed:${item.chatId}`;
    case "routine":
      return `routine:${item.routineId}:${item.reason}`;
    case "brain":
      return `brain:${item.projectId}:${item.state}`;
    case "proposal":
      return `proposal:${item.proposal.id}`;
    case "world":
      return `world:${item.item.key}`;
  }
}

/** The chat a card is about, for "Chat openen" and the project row's second line. */
export function attentionChat(item: AttentionItem): { chatId: string; title: string } | null {
  return item.kind === "permission" || item.kind === "question" || item.kind === "chat_failed" ? { chatId: item.chatId, title: item.chatTitle } : null;
}

export function attentionProjectId(item: AttentionItem): string | null {
  return item.kind === "proposal" || item.kind === "world" ? null : item.projectId;
}

/** Since when "Terwijl je weg was" counts on this device; a first visit looks back one day. */
export function readLastSeen(now = Date.now()): number {
  const stored = Number(readLocal(LAST_SEEN_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : now - DAY;
}

export function writeLastSeen(at: number): void {
  writeLocal(LAST_SEEN_KEY, String(at));
}

export type AwayRow =
  | { kind: "chat"; key: string; projectId: string; chat: Chat; at: number }
  | { kind: "brain"; key: string; projectId: string; entry: BrainHistoryEntry; at: number };

/**
 * What happened since `lastSeenAt`: chats that finished (not the ones still running, waiting or
 * failed: those are in Bezig and Voor jou) and brain changes by colleagues, newest first.
 */
export function awayRows(input: { chats: readonly Chat[]; history: readonly { brain: Brain; entries: readonly BrainHistoryEntry[] }[]; lastSeenAt: number; ownAuthor: string | null; limit?: number }): AwayRow[] {
  const rows: AwayRow[] = [];
  for (const chat of input.chats) {
    if (chat.parentId || chat.archived || chat.status !== "idle" || chat.updatedAt <= input.lastSeenAt) continue;
    rows.push({ kind: "chat", key: `chat:${chat.id}`, projectId: chat.projectId, chat, at: chat.updatedAt });
  }
  for (const { brain, entries } of input.history) {
    if (brain.status.kind !== "project") continue;
    for (const entry of entries) {
      if (entry.at <= input.lastSeenAt) continue;
      if (entry.author === "Jij" || (input.ownAuthor !== null && entry.author === input.ownAuthor)) continue;
      rows.push({ kind: "brain", key: `brain:${brain.projectId}:${entry.commit}`, projectId: brain.projectId, entry, at: entry.at });
    }
  }
  return rows.sort((a, b) => b.at - a.at).slice(0, input.limit ?? MAX_AWAY_ROWS);
}

/** The next routine that will run, for the line under "Je werkdag" and the empty "Voor jou" line. */
export function nextRoutine(routines: readonly Routine[], now = Date.now()): Routine | null {
  let next: Routine | null = null;
  for (const routine of routines) {
    if (routine.state !== "active" || routine.nextRunAt === null || routine.nextRunAt < now) continue;
    if (!next || (next.nextRunAt ?? 0) > routine.nextRunAt) next = routine;
  }
  return next;
}

/** The one thing in a project that needs the person: its first card (the list is already sorted). */
export function projectNeed(projectId: string, items: readonly AttentionItem[]): AttentionItem | null {
  return items.find((item) => attentionProjectId(item) === projectId) ?? null;
}

/** The text of the last message the person sent, for "Opnieuw" (revert + send). */
export function lastUserText(messages: readonly { role: "user" | "assistant"; id: string; parts: readonly { type: string; text?: string }[] }[]): { id: string; text: string } | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "user") continue;
    const text = message.parts
      .map((part) => (part.type === "text" && typeof part.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
    return { id: message.id, text };
  }
  return null;
}
