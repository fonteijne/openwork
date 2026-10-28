import type { RoutineSchedule } from "~/backend/types";

/**
 * Routine schedules: next occurrences and a plain-Dutch description.
 *
 * Same semantics as OpenWork's `@openwork/types/automation-schedule` (which the
 * routines planner in packages/bonzaiwork-* uses server-side): wall-clock
 * times in the schedule's IANA zone; a time that daylight saving skips moves
 * to the first valid minute after the gap; a repeated time runs once, at its
 * first instant. The UI only uses this for previews and the demo backend.
 */

const DAY_MS = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timezone: string): Intl.DateTimeFormat {
  let existing = formatters.get(timezone);
  if (!existing) {
    existing = new Intl.DateTimeFormat("en-US-u-ca-gregory", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timezone, existing);
  }
  return existing;
}

type LocalDate = { year: number; month: number; day: number };

function localParts(timestamp: number, timezone: string): LocalDate & { hour: number; minute: number } {
  const values: Record<string, number> = {};
  for (const part of zoneFormatter(timezone).formatToParts(new Date(timestamp))) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return {
    year: values.year ?? 1970,
    month: values.month ?? 1,
    day: values.day ?? 1,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0,
  };
}

function wallKey(value: { year: number; month: number; day: number; hour: number; minute: number }): number {
  return Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute);
}

function offsetAt(timestamp: number, timezone: string): number {
  const minute = Math.floor(timestamp / 60_000) * 60_000;
  return wallKey(localParts(minute, timezone)) - minute;
}

/** The instant a wall-clock time happens in `timezone`, or the first minute after a DST gap. */
export function resolveWallTime(date: LocalDate, hour: number, minute: number, timezone: string): number {
  const nominal = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  const candidates = [...new Set([
    nominal - offsetAt(nominal - 14 * 3_600_000, timezone),
    nominal - offsetAt(nominal, timezone),
    nominal - offsetAt(nominal + 14 * 3_600_000, timezone),
  ])].sort((a, b) => a - b);
  const exact = candidates.find((candidate) => wallKey(localParts(candidate, timezone)) === nominal);
  if (exact !== undefined) return exact;
  // Skipped by a DST gap: the first instant whose wall time is past the nominal one.
  let low = candidates[0] ?? nominal;
  let high = candidates.at(-1) ?? nominal;
  while (high - low > 60_000) {
    const middle = low + Math.floor((high - low) / 120_000) * 60_000;
    if (wallKey(localParts(middle, timezone)) > nominal) high = middle;
    else low = middle;
  }
  return high;
}

function addDays(date: LocalDate, days: number): LocalDate {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

function weekday(date: LocalDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

function timesOfDay(schedule: Exclude<RoutineSchedule, { kind: "once" }>): { hour: number; minute: number }[] {
  if (schedule.kind !== "interval") return [{ hour: schedule.hour, minute: schedule.minute }];
  const times: { hour: number; minute: number }[] = [];
  for (let hour = schedule.startHour; hour < schedule.endHour; hour += Math.max(1, schedule.everyHours)) times.push({ hour, minute: 0 });
  return times;
}

function runsOn(schedule: Exclude<RoutineSchedule, { kind: "once" }>, day: number): boolean {
  return schedule.kind === "daily" || schedule.daysOfWeek.includes(day);
}

/** The next `count` occurrences strictly after `after` (at most a year ahead). */
export function nextOccurrences(schedule: RoutineSchedule, after: number, count = 5): number[] {
  if (schedule.kind === "once") return schedule.at > after ? [schedule.at] : [];
  const start = localParts(after, schedule.timezone);
  const result: number[] = [];
  for (let offset = 0; offset < 370 && result.length < count; offset += 1) {
    const date = addDays(start, offset);
    if (!runsOn(schedule, weekday(date))) continue;
    for (const time of timesOfDay(schedule)) {
      const at = resolveWallTime(date, time.hour, time.minute, schedule.timezone);
      if (at <= after || result.includes(at)) continue;
      result.push(at);
      if (result.length >= count) break;
    }
  }
  return result;
}

export function nextOccurrence(schedule: RoutineSchedule, after: number): number | null {
  return nextOccurrences(schedule, after, 1)[0] ?? null;
}

/** The latest occurrence in (after, now], if one was missed. Older backlog is never replayed. */
export function missedOccurrence(schedule: RoutineSchedule, after: number, now: number): number | null {
  return nextOccurrences(schedule, after, 5).filter((at) => at <= now).at(-1) ?? null;
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

const DAY_NAMES = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const DAY_SHORT = ["zo", "ma", "di", "wo", "do", "vr", "za"];
export const WEEKDAYS = [1, 2, 3, 4, 5];
/** Monday first, the Dutch week. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function dayName(day: number): string {
  return DAY_NAMES[day] ?? "";
}

export function dayShort(day: number): string {
  return DAY_SHORT[day] ?? "";
}

function clock(hour: number, minute = 0): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function listWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} en ${words.at(-1)}`;
}

function daysPhrase(days: number[]): string {
  const sorted = WEEK_ORDER.filter((day) => days.includes(day));
  if (sorted.length === 7) return "elke dag";
  if (sorted.length === 5 && WEEKDAYS.every((day) => sorted.includes(day))) return "elke werkdag";
  if (sorted.length === 2 && sorted.includes(0) && sorted.includes(6)) return "elk weekend";
  return `elke ${listWords(sorted.map(dayName))}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

let deviceZone: string | null = null;

export function localTimezone(): string {
  if (deviceZone) return deviceZone;
  try {
    deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    deviceZone = "UTC";
  }
  return deviceZone;
}

const onceFormatters = new Map<string, Intl.DateTimeFormat>();

function onceFormatter(timezone: string): Intl.DateTimeFormat {
  let existing = onceFormatters.get(timezone);
  if (!existing) {
    existing = new Intl.DateTimeFormat("nl-NL", { timeZone: timezone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    onceFormatters.set(timezone, existing);
  }
  return existing;
}

/**
 * "Elke werkdag om 09:00", "Elke 2 uur tussen 09:00 en 17:00 op werkdagen",
 * "Eenmalig op di 4 nov om 10:00". Names the zone only when it is not the
 * device's own.
 */
export function describeSchedule(schedule: RoutineSchedule, deviceZone = localTimezone()): string {
  const zone = schedule.timezone === deviceZone ? "" : ` (${schedule.timezone.replace(/_/g, " ")})`;
  if (schedule.kind === "once") {
    const at = onceFormatter(schedule.timezone).format(schedule.at);
    return `Eenmalig op ${at.replace(",", " om")}${zone}`;
  }
  if (schedule.kind === "daily") return `Elke dag om ${clock(schedule.hour, schedule.minute)}${zone}`;
  if (schedule.kind === "weekly") return `${capitalize(daysPhrase(schedule.daysOfWeek))} om ${clock(schedule.hour, schedule.minute)}${zone}`;
  const every = schedule.everyHours === 1 ? "Elk uur" : `Elke ${schedule.everyHours} uur`;
  const window = schedule.startHour === 0 && schedule.endHour === 24 ? "" : ` tussen ${clock(schedule.startHour)} en ${clock(schedule.endHour)}`;
  const phrase = daysPhrase(schedule.daysOfWeek);
  const days = phrase === "elke dag" ? "" : phrase === "elke werkdag" ? " op werkdagen" : ` op ${phrase.replace(/^elke? /, "")}`;
  return `${every}${window}${days}${zone}`;
}
