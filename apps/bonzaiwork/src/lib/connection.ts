import { openworkServerInfo, openworkServerRestart, type OpenworkServerInfo } from "@/app/lib/desktop";
import { isElectronRuntime } from "@/app/lib/runtime-env";

/** How the UI reaches the local openwork-server. */
export type ServerConnection = {
  baseUrl: string;
  /** Owner (or client) token for regular routes. */
  token: string;
  /** Host token for key management; null when the server did not hand one out. */
  hostToken: string | null;
};

function fromInfo(info: OpenworkServerInfo | null | undefined): ServerConnection | null {
  const baseUrl = info?.baseUrl?.trim();
  const token = info?.ownerToken?.trim() || info?.clientToken?.trim();
  if (!info?.running || !baseUrl || !token) return null;
  return { baseUrl, token, hostToken: info.hostToken?.trim() || null };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The Electron shell starts the server in-process; we only read its address
 * and tokens, restarting it once when it is not running yet. Development in a
 * plain browser passes them in the query string (never in a build).
 */
export async function connectToLocalServer(): Promise<ServerConnection> {
  if (!isElectronRuntime()) {
    const query = new URLSearchParams(window.location.search);
    const baseUrl = import.meta.env.DEV ? query.get("server") : null;
    const token = import.meta.env.DEV ? query.get("token") : null;
    if (!baseUrl || !token) throw new Error("Geen lokale server: start BonzaiWork vanuit de desktop-app.");
    return { baseUrl, token, hostToken: query.get("hostToken") };
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const ready = fromInfo(await openworkServerInfo().catch(() => null));
    if (ready) return ready;
    if (attempt === 0) {
      const restarted = fromInfo(await openworkServerRestart({ diagnosticsCause: "bonzaiwork-startup" }).catch(() => null));
      if (restarted) return restarted;
    }
    await wait(500);
  }
  throw new Error("De lokale server is niet gestart.");
}
