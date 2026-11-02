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

/** What the UI reports (plan §5.3): the open project on every route change; in a browser also focus and input. */
export type PresenceReport = { workspaceId: string | null; focused?: boolean; lastInputAt?: number };

/** No input for this long and you are not at the computer (plan §2.2). */
export const IDLE_LIMIT_SECONDS = 60;
/** A browser signal older than this says nothing any more (it comes once a minute). */
const UI_SIGNAL_STALE_MS = 2.5 * 60_000;

type PresenceOptions = {
  now: () => number;
  enabled: () => boolean;
  /** The desktop source, looked up on every sample (registered before the server starts). */
  source?: () => PresenceSource | null;
  addPresence: (workspaceId: string, at: number) => void;
};

/**
 * One measurement per minute: the BonzaiWork window has focus, there was keyboard or mouse input in
 * the last 60 seconds, and a project is open in the app → one presence minute for that project in
 * this quarter. On the desktop focus and idle time come from Electron; in a browser (development)
 * from the UI's own signal.
 */
export function createPresence(options: PresenceOptions) {
  const source = options.source ?? registeredPresenceSource;
  let workspaceId: string | null = null;
  let ui: { focused: boolean | null; lastInputAt: number | null; at: number } | null = null;

  function present(at: number): boolean {
    const desktop = source();
    if (desktop) {
      try {
        return desktop.windowFocused() && desktop.systemIdleSeconds() < IDLE_LIMIT_SECONDS;
      } catch {
        return false;
      }
    }
    if (!ui || at - ui.at > UI_SIGNAL_STALE_MS || ui.focused !== true || ui.lastInputAt === null) return false;
    return at - ui.lastInputAt < IDLE_LIMIT_SECONDS * 1000;
  }

  return {
    report(input: PresenceReport) {
      workspaceId = input.workspaceId;
      if (input.focused !== undefined || input.lastInputAt !== undefined) {
        ui = { focused: input.focused ?? ui?.focused ?? null, lastInputAt: input.lastInputAt ?? ui?.lastInputAt ?? null, at: options.now() };
      }
    },
    /** The project open in the app, as last reported. */
    get workspaceId() { return workspaceId; },
    /** One measurement; returns the project that got a presence minute, if any. */
    sample(): string | null {
      const at = options.now();
      if (!options.enabled() || !workspaceId || !present(at)) return null;
      options.addPresence(workspaceId, at);
      return workspaceId;
    },
  };
}

export type Presence = ReturnType<typeof createPresence>;
