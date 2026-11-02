import { addDays, dateOf, dutchDuration, quarterKey, quartersOfDay, QUARTER_MS, timeOf, weekOf, type DayView } from "@bonzaiwork/agenda/model";

import { copy } from "~/copy";

/**
 * Display helpers for the agenda panel (plan §9.2): times, durations and days in nl-NL. The clock
 * and the durations are the server's own (packages/bonzaiwork-agenda), so the panel and the booking
 * document always say the same.
 */

export const MAX_PERIOD_DAYS = 31;

export { dateOf, dutchDuration, timeOf };

/** "09:00–10:45". */
export function timeRange(start: number, end: number): string {
  return `${timeOf(start)}–${timeOf(end)}`;
}

const weekdayDate = new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short" });

/** "Vandaag", "Gisteren", or "ma 2 nov". */
export function dayTitle(date: string, today: string): string {
  if (date === today) return copy.agenda.today;
  if (date === addDays(today, -1)) return copy.agenda.yesterday;
  const [year, month, day] = date.split("-").map(Number);
  return weekdayDate.format(new Date(year ?? 0, (month ?? 1) - 1, day ?? 1)).replace(".", "");
}

/** Minutes to book on a day: everything that is not away (plan §2.3). */
export function minutesToBook(day: DayView | undefined): number {
  return day?.totals.reduce((total, entry) => total + entry.minutes, 0) ?? 0;
}

export type PeriodKind = "today" | "yesterday" | "week" | "lastWeek" | "custom";

/** "Deze week" is Monday up to today; "Vorige week" Monday to Sunday (plan §7.4). */
export function periodFor(kind: Exclude<PeriodKind, "custom">, today: string): { from: string; to: string } {
  switch (kind) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const yesterday = addDays(today, -1);
      return { from: yesterday, to: yesterday };
    }
    case "week":
      return { from: weekOf(today).from, to: today };
    case "lastWeek":
      return weekOf(addDays(today, -7));
  }
}

export type QuarterOption = { value: string; label: string };

/**
 * The quarters of a day for "Van" (their start) and "Tot" (their end). In the repeated hour after the
 * clock goes back the key carries the offset; the label then says so too.
 */
export function quarterOptions(date: string): { from: QuarterOption[]; to: QuarterOption[] } {
  const starts = quartersOfDay(date);
  const suffix = (key: string) => (/[+-]\d{2}:\d{2}$/.test(key) ? ` (${key.slice(-6)})` : "");
  return {
    from: starts.map((start) => {
      const key = quarterKey(start);
      return { value: key, label: `${timeOf(start)}${suffix(key)}` };
    }),
    to: starts.map((start) => {
      const key = quarterKey(start);
      const end = timeOf(start + QUARTER_MS);
      return { value: key, label: `${end === "00:00" ? "24:00" : end}${suffix(key)}` };
    }),
  };
}

/** The quarter of `now` when the day is today, else the first quarter of the working day. */
export function defaultQuarter(date: string, now: number): string {
  if (dateOf(now) === date) return quarterKey(now);
  const [year, month, day] = date.split("-").map(Number);
  return quarterKey(new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 9, 0).getTime());
}

/** "<ENTITY_ID_A> Project A, ontwikkeling" for search and lists. */
export function postText(post: { entityId: string; label: string | null }): string {
  return post.label ? `${post.entityId} ${post.label}` : post.entityId;
}
