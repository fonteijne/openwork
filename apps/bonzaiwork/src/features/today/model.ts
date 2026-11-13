import { sortAttention, type AttentionItem, type DayItem, type Meeting, type Project, type TodayChatStart, type UpcomingBucket, type UpcomingRow } from "~/backend/types";

/**
 * The pure part of the personal agent's sections on Vandaag (docs/bonzaiwork/persoonlijke-agent-plan.md
 * §4): how the world's cards join "Voor jou", how "Komt eraan" is grouped and how a date reads.
 */

/** At most this many rows in "Komt eraan" before "Nog n". */
export const MAX_UPCOMING_ROWS = 6;

/** "Voor jou" with the world's cards in their place: after what stops an agent, before the rest. */
export function withWorld(items: readonly AttentionItem[], world: readonly DayItem[]): AttentionItem[] {
  return sortAttention([...items, ...world.map((item): AttentionItem => ({ kind: "world", item, at: item.at }))]);
}

const DAY = new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short" });
const TIME = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" });

/** "ma 16 nov" for a `YYYY-MM-DD`; the text itself when it is no date. */
export function formatDay(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : DAY.format(parsed).replace(/\./g, "");
}

export function meetingTime(meeting: Meeting): string | null {
  return meeting.allDay ? null : `${TIME.format(meeting.start)}–${TIME.format(meeting.end)}`;
}

export function minutesUntil(at: number, now: number): number {
  return Math.ceil((at - now) / 60_000);
}

export type UpcomingGroup = { bucket: UpcomingBucket; rows: UpcomingRow[] };

/** The rows per bucket, in the server's order; empty buckets are left out. */
export function groupUpcoming(rows: readonly UpcomingRow[]): UpcomingGroup[] {
  const groups: UpcomingGroup[] = [];
  for (const row of rows) {
    const last = groups.at(-1);
    if (last && last.bucket === row.bucket) last.rows.push(row);
    else groups.push({ bucket: row.bucket, rows: [row] });
  }
  return groups;
}

/** At most this many rows in "Komt eraan" when it shares one column with everything else. */
export const MAX_UPCOMING_NOW = 3;

/** What cannot wait: the rows that are late or today (the server lists them first), at most three. */
export function upcomingNow(rows: readonly UpcomingRow[]): UpcomingRow[] {
  return rows.filter((row) => row.bucket === "late" || row.bucket === "today").slice(0, MAX_UPCOMING_NOW);
}

/** One block of focused work; past it the line says so. */
export const FOCUS_BLOCK_MINUTES = 25;

/** Whole minutes a focus has run. */
export function focusMinutes(startedAt: number, now: number): number {
  return Math.max(0, Math.floor((now - startedAt) / 60_000));
}

/** The project a chat from Vandaag starts in, when it is still listed. */
export function startProject(start: TodayChatStart, projects: readonly Project[]): Project | null {
  return projects.find((project) => project.id === start.projectId) ?? null;
}
