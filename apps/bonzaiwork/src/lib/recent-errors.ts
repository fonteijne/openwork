/**
 * The last few things that went wrong in the UI, for a feedback report
 * (docs/bonzaiwork/feedback.md). Memory only; the server redacts the report
 * before anyone sees it.
 */

const LIMIT = 20;
const entries: string[] = [];
let last = "";

export function recordError(message: string): void {
  const text = message.replace(/\s+/g, " ").trim().slice(0, 500);
  // Retries repeat the same failure; once in a row is enough.
  if (text === last) return;
  last = text;
  entries.push(`${new Date().toISOString()} ${text}`);
  if (entries.length > LIMIT) entries.shift();
}

export function recentErrors(): readonly string[] {
  return entries;
}

function describe(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}${value.stack ? `\n${value.stack.split("\n").slice(1, 4).join("\n")}` : ""}`;
  return String(value);
}

export function watchErrors(): void {
  window.addEventListener("error", (event) => recordError(`error: ${describe(event.error ?? event.message)}`));
  window.addEventListener("unhandledrejection", (event) => recordError(`unhandled rejection: ${describe(event.reason)}`));
}
