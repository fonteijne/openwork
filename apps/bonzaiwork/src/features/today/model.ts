import type { CalendarEvent, NeedsYou, Run, Todo } from "~/backend/cockpit";
import { todayCopy } from "~/copy/today";

/**
 * The pure part of Vandaag, the day plan and quick capture: greetings, the hero's summary, due
 * labels, free time and the capture parser. No React, so it tests in node.
 */

const LOCALE = "nl-NL";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const longDate = new Intl.DateTimeFormat(LOCALE, { weekday: "long", day: "numeric", month: "long" });
const shortDate = new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "numeric", month: "short" });
const weekdayLong = new Intl.DateTimeFormat(LOCALE, { weekday: "long" });
const weekdayShort = new Intl.DateTimeFormat(LOCALE, { weekday: "short" });
const clock = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit" });

export function startOfDay(at: number): number {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** "donderdag 5 november" */
export function formatLongDate(at: number): string {
  return longDate.format(at);
}

/** "do 5 nov" (Intl adds a period after short names in some engines: "do. 5 nov."). */
export function formatShortDate(at: number): string {
  return shortDate.format(at).replace(/\./g, "");
}

/** "donderdag" */
export function formatWeekday(at: number): string {
  return weekdayLong.format(at);
}

export function formatClock(at: number): string {
  return clock.format(at);
}

/** "08:52" today, "wo 18:40" this week, "28 okt" before that. */
export function formatSince(at: number, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY);
  if (days === 0) return clock.format(at);
  if (days < 7) return `${weekdayShort.format(at).replace(/\./g, "")} ${clock.format(at)}`;
  return formatShortDate(at);
}

export type DayPart = keyof typeof todayCopy.greeting;

export function dayPart(at: number): DayPart {
  const hour = new Date(at).getHours();
  if (hour < 6) return "night";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

/** "Een stap staat klaar om te controleren, een run heeft een vraag en …": one sentence about the decisions. */
export function decisionsLead(items: readonly Pick<NeedsYou, "kind">[]): string {
  if (items.length === 0) return todayCopy.lead.calm;
  const count = (kind: NeedsYou["kind"]) => items.filter((item) => item.kind === kind).length;
  const parts: string[] = [];
  const review = count("review");
  const question = count("question");
  const approval = count("approval");
  if (review > 0) parts.push(todayCopy.lead.review(review));
  if (question > 0) parts.push(todayCopy.lead.question(question));
  if (approval > 0) parts.push(todayCopy.lead.approval(approval));
  const last = parts.pop() ?? "";
  const sentence = parts.length > 0 ? `${parts.join(", ")}${todayCopy.lead.and}${last}` : last;
  // Dutch capitalises "één" at the start of a sentence as "Eén".
  const capital = sentence.startsWith("één") ? `Eén${sentence.slice(3)}` : `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}`;
  return `${capital}.`;
}

export type DueLabel = { text: string; tone: "overdue" | "today" | "plain" };

/** The trailing label of a to-do: overdue (with a warning), today, a deadline, or no date. */
export function dueLabel(todo: Pick<Todo, "due">, now: number): DueLabel {
  const due = todo.due;
  if (!due) return { text: todayCopy.todos.noDate, tone: "plain" };
  if (due.at < now && startOfDay(due.at) < startOfDay(now)) return { text: todayCopy.todos.overdue(formatShortDate(due.at)), tone: "overdue" };
  if (startOfDay(due.at) === startOfDay(now)) return { text: due.at < now ? todayCopy.todos.overdueShort : todayCopy.todos.dueToday, tone: due.at < now ? "overdue" : "today" };
  return { text: due.kind === "deadline" ? todayCopy.todos.deadline(formatShortDate(due.at)) : todayCopy.todos.dueOn(formatShortDate(due.at)), tone: "plain" };
}

/** Today's list: accepted for today, or due today or earlier, and not done; overdue first, then by date. */
export function todaysTodos(todos: readonly Todo[], now: number): Todo[] {
  const endOfToday = startOfDay(now) + DAY;
  return todos
    .filter((todo) => !todo.done && (todo.today || (todo.due !== null && todo.due.at < endOfToday)))
    .sort((a, b) => (a.due?.at ?? Number.MAX_SAFE_INTEGER) - (b.due?.at ?? Number.MAX_SAFE_INTEGER) || a.createdAt - b.createdAt);
}

/** "7 uur", "6,5 uur", "45 min": open time left today until 18:00 outside the meetings still ahead. */
export function freeTime(events: readonly CalendarEvent[], now: number): { minutes: number; meetings: number } {
  const end = startOfDay(now) + 18 * HOUR;
  if (now >= end) return { minutes: 0, meetings: 0 };
  const ahead = events.filter((event) => !event.proposed && event.end > now && event.start < end);
  const busy = ahead.reduce((sum, event) => sum + (Math.min(event.end, end) - Math.max(event.start, now)), 0);
  return { minutes: Math.max(0, Math.round((end - now - busy) / MINUTE)), meetings: ahead.length };
}

export function formatHours(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 30) / 2;
  return `${hours.toLocaleString(LOCALE)} uur`;
}

/** "4 u 45 min" for the plan's lead. */
export function formatSpan(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} u` : `${hours} u ${rest} min`;
}

/** The run rows of "Bezig met": working now, or finished in the last day. */
export function runsInProgress(runs: readonly Run[], now: number): Run[] {
  return runs
    .filter((run) => run.status === "working" || ((run.status === "done" || run.status === "issues") && now - run.updatedAt < DAY))
    .sort((a, b) => (a.status === "working" ? 0 : 1) - (b.status === "working" ? 0 : 1) || b.updatedAt - a.updatedAt);
}

// ---------------------------------------------------------------------------
// Quick capture
// ---------------------------------------------------------------------------

const WEEKDAYS: Record<string, number> = { zondag: 0, maandag: 1, dinsdag: 2, woensdag: 3, donderdag: 4, vrijdag: 5, zaterdag: 6 };

/** A day word ("morgen", "vrijdag") as the start of that day; the next such weekday, never today. */
export function dayFromWord(word: string, now: number): number | null {
  const lower = word.toLowerCase();
  const today = startOfDay(now);
  if (lower === "vandaag") return today;
  if (lower === "morgen") return startOfDay(today + DAY + HOUR);
  if (lower === "overmorgen") return startOfDay(today + 2 * DAY + HOUR);
  const weekday = WEEKDAYS[lower];
  if (weekday === undefined) return null;
  const ahead = (weekday - new Date(now).getDay() + 7) % 7 || 7;
  return startOfDay(today + ahead * DAY + HOUR);
}

export type CaptureToken = { kind: "project"; token: string; projectId: string; name: string } | { kind: "date"; token: string; at: number };

export type CaptureParse = { tokens: CaptureToken[]; waitingName: string | null };

/**
 * What a capture line means: `#<project-name-prefix>` names a project, a Dutch day word a start
 * day, and "Vraag <naam> …" suggests a waiting-for. Tokens the person turned back into text
 * (`ignored`) are skipped. Only the first project and the first day count.
 */
export function parseCapture(
  text: string,
  input: { projects: readonly { id: string; name: string }[]; people: readonly string[]; now: number; ignored?: ReadonlySet<string> },
): CaptureParse {
  const tokens: CaptureToken[] = [];
  const ignored = input.ignored ?? new Set<string>();
  const words = text.split(/\s+/).filter(Boolean);
  for (const raw of words) {
    const word = raw.replace(/[.,;:!?]+$/, "");
    if (ignored.has(word.toLowerCase())) continue;
    if (word.startsWith("#") && word.length > 1 && !tokens.some((token) => token.kind === "project")) {
      const prefix = word.slice(1).toLowerCase();
      const project = input.projects.find((entry) => entry.name.toLowerCase().replace(/\s+/g, "").startsWith(prefix) || entry.name.toLowerCase().split(/\s+/).some((part) => part.startsWith(prefix)));
      if (project) tokens.push({ kind: "project", token: word, projectId: project.id, name: project.name });
      continue;
    }
    if (!tokens.some((token) => token.kind === "date")) {
      const at = dayFromWord(word, input.now);
      if (at !== null) tokens.push({ kind: "date", token: word, at });
    }
  }
  const asked = /^vraag\s+(\p{L}[\p{L}-]*)/iu.exec(text.trim());
  const first = asked?.[1] ?? null;
  const waitingName = first ? (input.people.find((name) => name.split(/\s+/)[0]?.toLowerCase() === first.toLowerCase()) ?? `${first.charAt(0).toUpperCase()}${first.slice(1)}`) : null;
  return { tokens, waitingName };
}
