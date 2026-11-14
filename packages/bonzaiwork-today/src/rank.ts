import type { DayItem, Meeting, StartReason, Todo, UpcomingBucket, UpcomingRow } from "./types.ts";

/**
 * The choosing (plan §4, T4): a fixed order picks the to-do for "Start hier", so the person never
 * starts from a list; the agent only writes the reason and the first step. Pure.
 */

const DAY_MS = 24 * 60 * 60_000;

/** The local date of a moment, `YYYY-MM-DD`. */
export function localDate(at: number | Date): string {
  const date = typeof at === "number" ? new Date(at) : at;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Whole days from `from` to `to` (both `YYYY-MM-DD`); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export type Ranked = { todo: Todo; reason: StartReason; rank: number };

/**
 * The person's open to-dos in the order "Start hier" offers them: late, due today, a promise to
 * them that ran out (send a reminder), the day plan's top, due this week, then the rest as found.
 */
export function rankTodos(todos: readonly Todo[], input: { today: string; planTop: readonly string[] }): Ranked[] {
  const ranked = todos.filter((todo) => todo.mine && !todo.done).map((todo, index): Ranked => {
    const days = todo.due ? daysBetween(input.today, todo.due) : null;
    const planned = input.planTop.indexOf(todo.id);
    const order = index / 100_000;
    if (days !== null && todo.dueKind === "waiting") {
      return days <= 0 ? { todo, reason: "waiting_due", rank: 2 + order } : { todo, reason: "oldest", rank: 6 + order };
    }
    if (days !== null && days < 0) return { todo, reason: "overdue", rank: 0 + (days + 10_000) / 100_000 };
    if (days === 0) return { todo, reason: "today", rank: 1 + order };
    if (planned !== -1) return { todo, reason: "plan", rank: 3 + planned / 1000 };
    if (days !== null && days <= 7) return { todo, reason: "soon", rank: 4 + days / 10 + order };
    return { todo, reason: "oldest", rank: 5 + order };
  });
  return ranked.sort((a, b) => a.rank - b.rank);
}

/** The first ranked to-do that was not skipped today. */
export function pickStart(todos: readonly Todo[], input: { today: string; planTop: readonly string[]; skipped: readonly string[] }): Ranked | null {
  const ranked = rankTodos(todos, input);
  return ranked.find((entry) => !input.skipped.includes(entry.todo.id)) ?? ranked[0] ?? null;
}

export function bucketOf(today: string, date: string): UpcomingBucket | null {
  const days = daysBetween(today, date);
  if (days < 0) return "late";
  if (days === 0) return "today";
  if (days <= 7) return "week";
  return days <= 30 ? "later" : null;
}

const BUCKETS: readonly UpcomingBucket[] = ["late", "today", "week", "later"];

/**
 * "Komt eraan": the person's dated to-dos (deadlines and both kinds of promises) and the
 * appointments, soonest first. Appointments that are over are left out.
 */
export function upcomingRows(input: { todos: readonly Todo[]; meetings: readonly Meeting[]; now: number }): UpcomingRow[] {
  const today = localDate(input.now);
  const rows: Array<UpcomingRow & { at: number }> = [];
  for (const todo of input.todos) {
    if (todo.done || !todo.mine || !todo.due) continue;
    const bucket = bucketOf(today, todo.due);
    if (bucket) rows.push({ kind: "todo", key: `todo:${todo.id}`, bucket, date: todo.due, todo, at: Date.parse(`${todo.due}T23:59:00`) });
  }
  for (const meeting of input.meetings) {
    if (meeting.end <= input.now) continue;
    const date = localDate(meeting.start);
    const bucket = bucketOf(today, date);
    if (bucket && bucket !== "late") rows.push({ kind: "meeting", key: `meeting:${meeting.id}`, bucket, date, meeting, at: meeting.start });
  }
  return rows
    .sort((a, b) => BUCKETS.indexOf(a.bucket) - BUCKETS.indexOf(b.bucket) || a.at - b.at)
    .map(({ at: _at, ...row }) => row);
}

/** How long before an appointment its card shows in "Voor jou" (plan §4). */
export const MEETING_LEAD_MS = 30 * 60_000;

/** The appointment card shows from half an hour before the start until the appointment ends. */
export function meetingIsNear(meeting: Meeting, now: number): boolean {
  return !meeting.allDay && meeting.start - MEETING_LEAD_MS <= now && now < meeting.end;
}

/** The cards "Voor jou" shows now: messages and promises always, an appointment only when near. */
export function visibleItems(items: readonly DayItem[], now: number): DayItem[] {
  return items.filter((item) => item.kind !== "meeting" || meetingIsNear(item.meeting, now));
}
