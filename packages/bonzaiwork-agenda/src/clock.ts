/**
 * Quarter hours in the computer's local time (plan §2.1). Every real time zone offset is a multiple
 * of 15 minutes, so a local quarter boundary is also a 15-minute boundary in UTC: rounding the epoch
 * time is DST-safe, and a day with a clock change simply has 92 or 100 quarters.
 *
 * A quarter's key is its local start time, "2026-11-02T10:15". When the clock goes back, the hour
 * after the change repeats the same wall-clock times; those quarters get their UTC offset in the key
 * ("2026-10-25T02:15+01:00"), so every key in a day is unique.
 */
export const QUARTER_MS = 15 * 60_000;

const pad = (value: number) => String(value).padStart(2, "0");
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const KEY = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?:([+-])(\d{2}):(\d{2}))?$/;

export function quarterStart(ms: number): number {
  return Math.floor(ms / QUARTER_MS) * QUARTER_MS;
}

/** "+01:00" for the local offset at that moment. */
export function offsetText(ms: number): string {
  const minutes = -new Date(ms).getTimezoneOffset();
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  return `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}

/** Local calendar date "2026-11-02" of a moment. */
export function dateOf(ms: number): string {
  const local = new Date(ms);
  return `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;
}

/** Local wall-clock time "10:15" of a moment. */
export function timeOf(ms: number): string {
  const local = new Date(ms);
  return `${pad(local.getHours())}:${pad(local.getMinutes())}`;
}

/** Local "2026-11-02T17:31:00+01:00" for documents. */
export function isoLocal(ms: number): string {
  const local = new Date(ms);
  return `${dateOf(ms)}T${timeOf(ms)}:${pad(local.getSeconds())}${offsetText(ms)}`;
}

/** The key of the quarter that holds `ms`. */
export function quarterKey(ms: number): string {
  const start = quarterStart(ms);
  const local = new Date(start);
  const wall = new Date(local.getFullYear(), local.getMonth(), local.getDate(), local.getHours(), local.getMinutes()).getTime();
  const base = `${dateOf(start)}T${timeOf(start)}`;
  // The wall-clock time names an earlier moment too: this is the repeated hour after the clock went back.
  return wall === start ? base : `${base}${offsetText(start)}`;
}

/** The start (ms) of a quarter key, or null when the key is not a quarter that exists in local time. */
export function keyStart(key: string): number | null {
  const match = KEY.exec(key);
  if (!match) return null;
  const [, year, month, day, hour, minute, sign, offsetHours, offsetMinutes] = match;
  let start: number;
  if (sign) {
    const offset = (Number(offsetHours) * 60 + Number(offsetMinutes)) * (sign === "-" ? -1 : 1);
    start = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)) - offset * 60_000;
  } else {
    start = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)).getTime();
  }
  return Number.isFinite(start) && quarterKey(start) === key && quarterStart(start) === start ? start : null;
}

export function isDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const utc = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return utc.getUTCFullYear() === Number(year) && utc.getUTCMonth() === Number(month) - 1 && utc.getUTCDate() === Number(day);
}

/** Calendar arithmetic on "YYYY-MM-DD", independent of the time zone. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days));
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`;
}

/** Days from `from` to `to`, both included; empty when `to` is before `from`. */
export function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
}

/** 0 = Monday … 6 = Sunday. */
export function weekday(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return (new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)).getUTCDay() + 6) % 7;
}

/** Monday and Sunday of the week that holds `date`. */
export function weekOf(date: string): { from: string; to: string } {
  const from = addDays(date, -weekday(date));
  return { from, to: addDays(from, 6) };
}

/** Local midnight at the start of a date (ms). A zone that skips midnight starts at the first time that exists. */
export function dayStart(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1).getTime();
}

/** Starts of every quarter of a local day: 96, or 92/100 on a day the clock changes. */
export function quartersOfDay(date: string): number[] {
  const starts: number[] = [];
  const end = dayStart(addDays(date, 1));
  for (let start = dayStart(date); start < end; start += QUARTER_MS) starts.push(start);
  return starts;
}

/** The IANA zone of this process ("Europe/Amsterdam"), for documents. */
export function timeZoneName(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
