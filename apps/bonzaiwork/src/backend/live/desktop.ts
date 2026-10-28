import { field, rec, str, type Json } from "./read";

/**
 * The OpenWork desktop shell's preload bridge (`window.__OPENWORK_ELECTRON__`),
 * the same one upstream's apps/app/src/app/lib/desktop.ts uses. Only the
 * commands BonzaiWork needs, each checked at runtime.
 */

type Invoke = (command: string, ...args: unknown[]) => Promise<unknown>;

function bridge(): Json | null {
  return typeof window === "undefined" ? null : rec(Reflect.get(window, "__OPENWORK_ELECTRON__"));
}

function invoker(): Invoke | null {
  const invoke = bridge()?.invokeDesktop;
  if (typeof invoke !== "function") return null;
  return (command, ...args) => Promise.resolve(Reflect.apply(invoke, undefined, [command, ...args]));
}

export function hasDesktopBridge(): boolean {
  return invoker() !== null;
}

export type ServerInfo = { baseUrl: string; token: string; hostToken: string | null };

function toServerInfo(value: unknown): ServerInfo | null {
  if (field(value, "running") !== true) return null;
  const baseUrl = str(value, "baseUrl")?.trim();
  const token = str(value, "ownerToken")?.trim() || str(value, "clientToken")?.trim();
  if (!baseUrl || !token) return null;
  return { baseUrl, token, hostToken: str(value, "hostToken")?.trim() || null };
}

export async function readServerInfo(): Promise<ServerInfo | null> {
  const invoke = invoker();
  if (!invoke) return null;
  return toServerInfo(await invoke("openworkServerInfo").catch(() => null));
}

export async function restartServer(): Promise<ServerInfo | null> {
  const invoke = invoker();
  if (!invoke) return null;
  return toServerInfo(await invoke("openworkServerRestart", { diagnosticsCause: "bonzaiwork-startup" }).catch(() => null));
}

export async function pickDirectory(title: string): Promise<string | null> {
  const invoke = invoker();
  if (!invoke) return null;
  const picked = await invoke("pickDirectory", { title });
  if (typeof picked === "string") return picked;
  if (Array.isArray(picked) && typeof picked[0] === "string") return picked[0];
  return null;
}

export async function revealItem(path: string): Promise<void> {
  await invoker()?.("__revealItemInDir", path);
}
