import { projectsCopy } from "~/copy/projects";

/** Dates the way the project screens show them: "vr 20 nov", "Vandaag 07:41", "di 3 nov 17:20". */

const LOCALE = "nl-NL";
const dayFormat = new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "numeric", month: "short" });
const dayYearFormat = new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit" });

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** "vr 20 nov" (with the year when it is not this year). */
export function dayLabel(timestamp: number, now = Date.now()): string {
  const sameYear = new Date(timestamp).getFullYear() === new Date(now).getFullYear();
  return (sameYear ? dayFormat : dayYearFormat).format(timestamp).replace(/\./g, "");
}

/** "vr 20 nov 2026" for a field value. */
export function dayLabelYear(timestamp: number): string {
  return dayYearFormat.format(timestamp).replace(/\./g, "");
}

export function timeLabel(timestamp: number): string {
  return timeFormat.format(timestamp);
}

/** "Vandaag 07:41" today, otherwise "do 22 okt". */
export function activityLabel(timestamp: number, now = Date.now()): string {
  if (startOfDay(timestamp) === startOfDay(now)) return projectsCopy.today(timeLabel(timestamp));
  return dayLabel(timestamp, now);
}

/** "di 3 nov 17:20". */
export function dayTimeLabel(timestamp: number, now = Date.now()): string {
  return `${dayLabel(timestamp, now)} ${timeLabel(timestamp)}`;
}

/** "di 16:12" within a week, else "3 nov 16:12": the short stamp before a change line. */
export function changeLabel(timestamp: number, now = Date.now()): string {
  if (startOfDay(timestamp) === startOfDay(now)) return timeLabel(timestamp);
  return dayTimeLabel(timestamp, now);
}

/** A timestamp as the value of `<input type="date">` (local day). */
export function toDateInput(timestamp: number | null): string {
  if (timestamp === null) return "";
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** `<input type="date">` back to a timestamp at 17:00 local, the end of a working day; null when empty. */
export function fromDateInput(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 17, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

export function isPast(timestamp: number, now = Date.now()): boolean {
  return timestamp < now;
}
