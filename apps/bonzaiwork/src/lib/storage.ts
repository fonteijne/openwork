/**
 * localStorage that never throws (private windows, blocked site data). Only for
 * per-device conveniences: theme, remembered panel state, drafts.
 */
export function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Unavailable storage only loses the convenience.
  }
}

export function readLocalJson(key: string): unknown {
  const raw = readLocal(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeLocalJson(key: string, value: unknown): void {
  writeLocal(key, JSON.stringify(value));
}
