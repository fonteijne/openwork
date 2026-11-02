import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

/**
 * What the Electron entry knows and the server does not: the app window, where
 * upstream writes its logs, and the person's Downloads folder. Registered
 * before the in-process server starts, like the KeyStore.
 */
export interface DiagnosticsSource {
  /** PNG of the app window as the person sees it, or null when there is none. */
  captureWindow(): Promise<Uint8Array | null>;
  /** Log files worth attaching; missing ones are skipped. */
  logFiles(): string[];
  /** Where saved feedback goes. */
  saveDirectory(): string;
}

export const DIAGNOSTICS_SOURCE_GLOBAL = Symbol.for("bonzaiwork.diagnosticsSource");

function isDiagnosticsSource(value: unknown): value is DiagnosticsSource {
  if (typeof value !== "object" || value === null) return false;
  return ["captureWindow", "logFiles", "saveDirectory"].every((name) => typeof Reflect.get(value, name) === "function");
}

export function registerDiagnosticsSource(source: DiagnosticsSource): void {
  Reflect.set(globalThis, DIAGNOSTICS_SOURCE_GLOBAL, source);
}

export function registeredDiagnosticsSource(): DiagnosticsSource | null {
  const value: unknown = Reflect.get(globalThis, DIAGNOSTICS_SOURCE_GLOBAL);
  return isDiagnosticsSource(value) ? value : null;
}

/** Headless development and tests: no window, the server log when one is configured. */
export const headlessDiagnosticsSource: DiagnosticsSource = {
  captureWindow: async () => null,
  logFiles: () => {
    const serverLog = process.env.OPENWORK_SERVER_LOG_FILE?.trim();
    return serverLog ? [serverLog] : [];
  },
  saveDirectory: () => {
    const downloads = join(homedir(), "Downloads");
    return existsSync(downloads) ? downloads : tmpdir();
  },
};
