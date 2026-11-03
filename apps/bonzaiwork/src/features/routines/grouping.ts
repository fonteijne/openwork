import type { Chat, Routine, RoutineRun } from "~/backend/types";
import { formatDateTime, formatTime } from "~/lib/format";

/**
 * Pure logic of the Routines page (brief §8): which group a routine belongs to, how a run reads
 * as a result, and the name the editor suggests. Kept out of the components so it is testable
 * without a backend.
 */

/** The groups in the order the list shows them. `archived` is not a group: it is a collapsed tail. */
export const GROUP_ORDER = ["attention", "missed", "today", "later", "paused"] as const;
export type RoutineGroupKey = (typeof GROUP_ORDER)[number];

export function isMissed(routine: Routine): boolean {
  return routine.state === "active" && routine.lastRun?.status === "skipped" && routine.lastRun.skippedReason === "app_closed";
}

/** The last run failed and nothing ran since: the person decides whether to run again. */
export function lastRunFailed(routine: Routine): boolean {
  return routine.state === "active" && routine.lastRun?.status === "failed";
}

function sameLocalDay(a: number, b: number): boolean {
  const first = new Date(a);
  const second = new Date(b);
  return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate();
}

/** Aandacht → Gemist → Vandaag → Later → Gepauzeerd; an archived routine gets no group (null). */
export function routineGroup(routine: Routine, now = Date.now()): RoutineGroupKey | null {
  if (routine.state === "archived") return null;
  if (routine.state === "needs_attention" || lastRunFailed(routine)) return "attention";
  if (isMissed(routine)) return "missed";
  if (routine.state === "inactive") return "paused";
  if (routine.nextRunAt !== null && sameLocalDay(routine.nextRunAt, now)) return "today";
  return "later";
}

export type RoutineGroup = { key: RoutineGroupKey; routines: Routine[] };

/**
 * Groups in brief order, empty ones left out. Inside a group: what happened last comes first
 * (attention and missed by the time of the thing that needs you, newest first), the rest by
 * next run, soonest first.
 */
export function groupRoutines(routines: readonly Routine[], now = Date.now()): RoutineGroup[] {
  const buckets = new Map<RoutineGroupKey, Routine[]>();
  for (const routine of routines) {
    const key = routineGroup(routine, now);
    if (!key) continue;
    const bucket = buckets.get(key) ?? [];
    bucket.push(routine);
    buckets.set(key, bucket);
  }
  const attentionAt = (routine: Routine) => routine.lastRun?.finishedAt ?? routine.lastRun?.scheduledAt ?? routine.updatedAt;
  const nextAt = (routine: Routine) => routine.nextRunAt ?? Number.POSITIVE_INFINITY;
  return GROUP_ORDER.flatMap((key) => {
    const bucket = buckets.get(key);
    if (!bucket?.length) return [];
    const sorted = [...bucket].sort((a, b) => {
      if (key === "attention" || key === "missed") return attentionAt(b) - attentionAt(a);
      if (key === "paused") return b.updatedAt - a.updatedAt;
      return nextAt(a) - nextAt(b) || a.name.localeCompare(b.name, "nl");
    });
    return [{ key, routines: sorted }];
  });
}

/** "vandaag om 09:00", "gisteren om 09:00", otherwise "ma 2 nov om 09:00". */
export function whenPhrase(timestamp: number, now = Date.now()): string {
  const time = formatTime(timestamp);
  if (sameLocalDay(timestamp, now)) return `vandaag om ${time}`;
  if (sameLocalDay(timestamp, now - 86_400_000)) return `gisteren om ${time}`;
  if (sameLocalDay(timestamp, now + 86_400_000)) return `morgen om ${time}`;
  const full = formatDateTime(timestamp);
  const split = full.lastIndexOf(" ");
  return split > 0 ? `${full.slice(0, split)} om ${full.slice(split + 1)}` : full;
}

export type RunOutcomeStatus = "queued" | "running" | "waiting" | "done" | "failed" | "missed" | "cancelled";

export type RunOutcome = {
  status: RunOutcomeStatus;
  /** The result as one sentence: the chat's preview, else its title; null when there is none yet. */
  sentence: string | null;
  /** The run's own failure text, for a failed run. */
  error: string | null;
};

/**
 * A run as a result (assessment I-2, contract R2): the chat's preview or title is the sentence;
 * a chat that waits on a decision makes the run "waiting", whatever the run status says.
 */
export function runOutcome(run: RoutineRun, chat: Chat | null | undefined): RunOutcome {
  const sentence = chat ? (chat.preview?.trim() || (chat.untitled ? null : chat.title.trim()) || null) : null;
  if (chat?.status === "waiting") return { status: "waiting", sentence, error: null };
  if (run.status === "skipped") return { status: "missed", sentence: null, error: null };
  if (run.status === "failed") return { status: "failed", sentence, error: run.error };
  if (run.status === "cancelled") return { status: "cancelled", sentence, error: null };
  if (run.status === "queued") return { status: "queued", sentence, error: null };
  if (run.status === "running" || chat?.status === "running") return { status: "running", sentence, error: null };
  if (chat?.status === "failed") return { status: "failed", sentence, error: run.error };
  return { status: "done", sentence, error: null };
}

/** The time a run row shows: when it finished, else started, else was due. */
export function runAt(run: RoutineRun): number {
  return run.finishedAt ?? run.startedAt ?? run.scheduledAt;
}

/**
 * A name from the first words of the opdracht ("Maak een overzicht van alle offertes die…"):
 * the first sentence, at most eight words, no trailing punctuation.
 */
export function suggestName(prompt: string): string {
  const firstLine = prompt.trim().split(/\r?\n/)[0] ?? "";
  const sentence = firstLine.split(/[.!?:;]\s|[.!?:;]$/)[0] ?? "";
  const words = sentence.trim().split(/\s+/).filter(Boolean).slice(0, 8);
  const name = words.join(" ").replace(/[,\-–—]+$/, "").trim();
  return name.length > 60 ? `${name.slice(0, 57).trimEnd()}…` : name;
}
