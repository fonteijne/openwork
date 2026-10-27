import { app, safeStorage } from "electron";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { scopeKey, type KeyScope, type KeyStore } from "@bonzaiwork/litellm/keys";

/**
 * LiteLLM keys encrypted with the OS keychain (Electron safeStorage: Keychain
 * on macOS, DPAPI on Windows, libsecret/kwallet on Linux). The file holds
 * only ciphertext; the decryption key never leaves the OS keychain.
 */
export class SafeStorageKeyStore implements KeyStore {
  private writes: Promise<void> = Promise.resolve();

  /** False when the OS offers no real keychain (Linux without a secret service): keys then stay in memory. */
  get persistent(): boolean {
    if (!app.isReady() || !safeStorage.isEncryptionAvailable()) return false;
    return process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text";
  }

  private readonly memory = new Map<string, string>();

  private file(): string {
    return join(app.getPath("userData"), "bonzaiwork", "litellm-keys.json");
  }

  private async readAll(): Promise<Record<string, string>> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.file(), "utf8"));
      if (typeof parsed !== "object" || parsed === null) return {};
      return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    } catch {
      return {};
    }
  }

  private update(change: (all: Record<string, string>) => void): Promise<void> {
    const run = this.writes.then(async () => {
      const all = await this.readAll();
      change(all);
      const target = this.file();
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      const temporary = `${target}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify(all), { mode: 0o600 });
      await rename(temporary, target);
    });
    this.writes = run.catch(() => undefined);
    return run;
  }

  async get(scope: KeyScope): Promise<string | null> {
    await app.whenReady();
    if (!this.persistent) return this.memory.get(scopeKey(scope)) ?? null;
    const sealed = (await this.readAll())[scopeKey(scope)];
    if (!sealed) return null;
    try {
      return safeStorage.decryptString(Buffer.from(sealed, "base64"));
    } catch {
      return null;
    }
  }

  async set(scope: KeyScope, key: string): Promise<void> {
    await app.whenReady();
    if (!this.persistent) {
      this.memory.set(scopeKey(scope), key);
      return;
    }
    const sealed = safeStorage.encryptString(key).toString("base64");
    await this.update((all) => { all[scopeKey(scope)] = sealed; });
  }

  async delete(scope: KeyScope): Promise<void> {
    await app.whenReady();
    this.memory.delete(scopeKey(scope));
    if (this.persistent) await this.update((all) => { delete all[scopeKey(scope)]; });
  }
}
