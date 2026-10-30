import { join } from "node:path";

import { app, BrowserWindow } from "electron";

import type { DiagnosticsSource } from "@bonzaiwork/feedback";

/**
 * Window, logs and Downloads for a feedback report (docs/bonzaiwork/feedback.md).
 * Log paths follow upstream: apps/desktop/electron/runtime.mjs
 * (resolveOpenworkServerLogFile) and startup-log.mjs.
 */
export class ElectronDiagnosticsSource implements DiagnosticsSource {
  async captureWindow(): Promise<Uint8Array | null> {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed() && candidate.isVisible());
    if (!window || window.isDestroyed()) return null;
    const image = await window.webContents.capturePage();
    return image.isEmpty() ? null : image.toPNG();
  }

  logFiles(): string[] {
    const logs = join(app.getPath("userData"), "logs");
    return [process.env.OPENWORK_SERVER_LOG_FILE?.trim() || join(logs, "openwork-server.log"), join(logs, "desktop-startup.log")];
  }

  saveDirectory(): string {
    return app.getPath("downloads");
  }
}
