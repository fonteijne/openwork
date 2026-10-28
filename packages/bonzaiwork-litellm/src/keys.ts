/**
 * LiteLLM virtual keys (workstream B4). Keys live only in a KeyStore: the OS
 * keychain through Electron safeStorage in the desktop app, memory in tests
 * and headless development. Never in config, env or log files.
 */

export type KeyScope = { kind: "user" } | { kind: "workspace"; workspaceId: string };

export interface KeyStore {
  get(scope: KeyScope): Promise<string | null>;
  set(scope: KeyScope, key: string): Promise<void>;
  delete(scope: KeyScope): Promise<void>;
  /** Whether keys survive a restart (false for the in-memory development store). */
  readonly persistent: boolean;
}

export interface KeyResolver {
  resolve(input: { workspaceId: string; userId: string }): Promise<string | null>;
}

export function scopeKey(scope: KeyScope): string {
  return scope.kind === "user" ? "user" : `workspace:${scope.workspaceId}`;
}

export class MemoryKeyStore implements KeyStore {
  readonly persistent = false;
  private readonly keys = new Map<string, string>();
  async get(scope: KeyScope) { return this.keys.get(scopeKey(scope)) ?? null; }
  async set(scope: KeyScope, key: string) { this.keys.set(scopeKey(scope), key); }
  async delete(scope: KeyScope) { this.keys.delete(scopeKey(scope)); }
}

/** One key for the person, whatever the workspace (O1: per user). */
export class PerUserKeyResolver implements KeyResolver {
  constructor(private readonly store: KeyStore) {}
  resolve() { return this.store.get({ kind: "user" }); }
}

/** One key per workspace (O1: per project). A workspace without its own key has none. */
export class PerWorkspaceKeyResolver implements KeyResolver {
  constructor(private readonly store: KeyStore) {}
  resolve(input: { workspaceId: string }) { return this.store.get({ kind: "workspace", workspaceId: input.workspaceId }); }
}

/** The Electron entry registers its safeStorage store here before the embedded server starts. */
export const KEY_STORE_GLOBAL = Symbol.for("bonzaiwork.keyStore");

function isKeyStore(value: unknown): value is KeyStore {
  if (typeof value !== "object" || value === null) return false;
  return ["get", "set", "delete"].every((name) => typeof Reflect.get(value, name) === "function")
    && typeof Reflect.get(value, "persistent") === "boolean";
}

export function registeredKeyStore(): KeyStore | null {
  const value: unknown = Reflect.get(globalThis, KEY_STORE_GLOBAL);
  return isKeyStore(value) ? value : null;
}

export function registerKeyStore(store: KeyStore): void {
  Reflect.set(globalThis, KEY_STORE_GLOBAL, store);
}

const KEY_LIKE = /\b(?:sk|bwk_local)[-_][A-Za-z0-9_-]{6,}/g;

/** Removes the given secrets, and anything shaped like a key, from text bound for logs or the engine. */
export function redactSecrets(text: string, secrets: readonly (string | null | undefined)[]): string {
  let result = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 4) result = result.split(secret).join("[redacted]");
  }
  return result.replace(KEY_LIKE, "[redacted]");
}
