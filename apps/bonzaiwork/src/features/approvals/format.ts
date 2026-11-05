/** Date formats the approvals, Library and Activity screens share (nl-NL). */

const LOCALE = "nl-NL";

function once<T>(build: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= build());
}

const longDay = once(() => new Intl.DateTimeFormat(LOCALE, { weekday: "long", day: "numeric", month: "long" }));
const time = once(() => new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit" }));
const seconds = once(() => new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
const weekdayShort = once(() => new Intl.DateTimeFormat(LOCALE, { weekday: "short" }));
const dayMonth = once(() => new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short" }));
const dayMonthYear = once(() => new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric" }));

/** "donderdag 5 november · 16:05" */
export function longDayTime(timestamp: number): string {
  return `${longDay().format(timestamp)} · ${time().format(timestamp)}`;
}

/** "do 16:09" */
export function weekdayTime(timestamp: number): string {
  return `${weekdayShort().format(timestamp).replace(".", "")} ${time().format(timestamp)}`;
}

/** "16:08:12" */
export function timeWithSeconds(timestamp: number): string {
  return seconds().format(timestamp);
}

/** "4 nov", or "4 feb 2027" in another year. */
export function shortDay(timestamp: number, now = Date.now()): string {
  return new Date(timestamp).getFullYear() === new Date(now).getFullYear() ? dayMonth().format(timestamp) : dayMonthYear().format(timestamp);
}

/** "wo 4 nov" */
export function weekdayDay(timestamp: number): string {
  return `${weekdayShort().format(timestamp).replace(".", "")} ${dayMonth().format(timestamp)}`;
}

/** Joins names Dutch-style: "Fleur", "Fleur en Ruben", "Fleur, Ruben en Lars". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} en ${names[names.length - 1] ?? ""}`;
}

/** Splits a title so its last word can carry the serif accent: ["Checklist privacy", "klantgegevens"]. */
export function splitLastWord(title: string): [string, string] {
  const index = title.trimEnd().lastIndexOf(" ");
  if (index < 0) return ["", title];
  return [title.slice(0, index + 1), title.slice(index + 1)];
}
