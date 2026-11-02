/**
 * What the Electron entry knows and the server does not: how long the system has had no keyboard or
 * mouse input, and whether a BonzaiWork window has focus (plan §5.3). Registered on a global symbol
 * before the in-process server starts, like the KeyStore.
 */
export interface PresenceSource {
  systemIdleSeconds(): number;
  windowFocused(): boolean;
}

export const PRESENCE_SOURCE_GLOBAL = Symbol.for("bonzaiwork.presenceSource");

function isPresenceSource(value: unknown): value is PresenceSource {
  if (typeof value !== "object" || value === null) return false;
  return ["systemIdleSeconds", "windowFocused"].every((name) => typeof Reflect.get(value, name) === "function");
}

export function registerPresenceSource(source: PresenceSource): void {
  Reflect.set(globalThis, PRESENCE_SOURCE_GLOBAL, source);
}

export function registeredPresenceSource(): PresenceSource | null {
  const value: unknown = Reflect.get(globalThis, PRESENCE_SOURCE_GLOBAL);
  return isPresenceSource(value) ? value : null;
}
