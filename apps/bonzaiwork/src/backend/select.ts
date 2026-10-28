import type { Backend } from "./types";

/**
 * Which backend this window talks to:
 *  - inside the BonzaiWork desktop shell (Electron bridge present): live;
 *  - development with `?server=…&token=…`: live, against a local server;
 *  - anywhere else (a plain browser: development, design reviews): the in-browser demo.
 */
export function wantsLive(): boolean {
  if (typeof window === "undefined") return false;
  if (Reflect.get(window, "__OPENWORK_ELECTRON__") != null) return true;
  const params = new URLSearchParams(window.location.search);
  return import.meta.env.DEV && params.has("server") && params.has("token");
}

export async function createBackend(): Promise<Backend> {
  if (wantsLive()) {
    const { createLiveBackend } = await import("./live");
    return createLiveBackend();
  }
  // Both backends are their own chunk: the demo's seed data never loads in
  // the desktop app, and the live client never loads in the browser demo.
  const { createDemoBackend, readDemoOptions } = await import("./demo");
  return createDemoBackend(readDemoOptions(window.location.search));
}
