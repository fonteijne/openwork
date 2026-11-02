import { app, BrowserWindow, powerMonitor } from "electron";

import type { PresenceSource } from "@bonzaiwork/agenda/presence";

/**
 * Presence for the agenda (docs/bonzaiwork/agenda-manager-plan.md §5.3): system idle time and
 * whether a BonzaiWork window has focus. The server runs in this Electron process and samples this
 * once a minute. powerMonitor only works after "ready"; before that nobody is present.
 */
export class ElectronPresenceSource implements PresenceSource {
  systemIdleSeconds(): number {
    return app.isReady() ? powerMonitor.getSystemIdleTime() : Number.POSITIVE_INFINITY;
  }

  windowFocused(): boolean {
    return app.isReady() && BrowserWindow.getFocusedWindow() !== null;
  }
}
