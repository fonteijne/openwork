/** Dutch formatting for dates, durations, tokens and money. */

const LOCALE = "nl-NL";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Intl formatters are costly to build: each one is made on first use, then reused. */
function once<T>(build: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= build());
}

const relative = once(() => new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" }));
const shortDate = once(() => new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short" }));
const shortDateYear = once(() => new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric" }));
const dateTime = once(() => new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }));
const timeOnly = once(() => new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit" }));
const integer = once(() => new Intl.NumberFormat(LOCALE));
const compact = once(() => new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 }));
const money = new Map<string, Intl.NumberFormat>();

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** "zojuist", "5 minuten geleden", "gisteren", "12 okt". */
export function relativeTime(timestamp: number, now = Date.now()): string {
  const diff = timestamp - now;
  const abs = Math.abs(diff);
  if (abs < 45_000) return "zojuist";
  if (abs < HOUR) return relative().format(Math.round(diff / MINUTE), "minute");
  if (abs < 6 * HOUR || startOfDay(timestamp) === startOfDay(now)) return relative().format(Math.round(diff / HOUR), "hour");
  const days = Math.round((startOfDay(timestamp) - startOfDay(now)) / DAY);
  if (Math.abs(days) < 7) return relative().format(days, "day");
  const sameYear = new Date(timestamp).getFullYear() === new Date(now).getFullYear();
  return (sameYear ? shortDate() : shortDateYear()).format(timestamp);
}

/** "di 28 okt 09:00" */
export function formatDateTime(timestamp: number): string {
  return dateTime().format(timestamp).replace(",", "");
}

/** "vandaag 09:00", "morgen 14:30", otherwise the full date and time. */
export function formatWhen(timestamp: number, now = Date.now()): string {
  const days = Math.round((startOfDay(timestamp) - startOfDay(now)) / DAY);
  const time = timeOnly().format(timestamp);
  if (days === 0) return `vandaag ${time}`;
  if (days === 1) return `morgen ${time}`;
  if (days === -1) return `gisteren ${time}`;
  return formatDateTime(timestamp);
}

export function formatTime(timestamp: number): string {
  return timeOnly().format(timestamp);
}

/** "8 s", "1 min 19 s", "2 u 5 min". */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const rest = seconds % 60;
    return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes ? `${hours} u ${restMinutes} min` : `${hours} u`;
}

export function formatNumber(value: number): string {
  return integer().format(value);
}

/** "12,3K" for big counts, exact below 10.000. */
export function formatTokens(value: number): string {
  return value < 10_000 ? integer().format(value) : compact().format(value);
}

export function formatMoney(value: number, currency: string): string {
  const digits = value < 10 ? 2 : 0;
  const key = `${currency}:${digits}`;
  let formatter = money.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE, { style: "currency", currency, maximumFractionDigits: digits });
    money.set(key, formatter);
  }
  return formatter.format(value);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString(LOCALE, { maximumFractionDigits: 1 })} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString(LOCALE, { maximumFractionDigits: 1 })} MB`;
}

/** "3 chats", "1 chat". */
export function plural(count: number, one: string, many: string): string {
  return `${integer().format(count)} ${count === 1 ? one : many}`;
}
