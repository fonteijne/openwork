import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { SERVER_ENVIRONMENT_DEFAULTS } from "@bonzaiwork/policy";
import { registerKeyStore } from "@bonzaiwork/litellm/keys";

import { SafeStorageKeyStore } from "./safe-storage-key-store";

/**
 * BonzaiWork's Electron entry (package.json "main" via the builder config).
 * It configures the process, then hands over to the unmodified upstream
 * shell, so upstream's main process stays mergeable:
 *
 *  - settings baked into the build (LiteLLM URL, default model, key mode);
 *  - OpenWork's hosted and free models off;
 *  - the openwork-server hooks module that installs the LiteLLM-only policy;
 *  - the OS-keychain key store, registered before the in-process server starts.
 */

const here = dirname(fileURLToPath(import.meta.url));

type BakedSettings = { litellmBaseUrl: string; defaultModel: string | null; keyMode: "user" | "workspace" };

function readBakedSettings(): BakedSettings {
  const parsed: unknown = JSON.parse(readFileSync(join(here, "build-config.json"), "utf8"));
  const field = (name: string): unknown => (typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, name) : undefined);
  const litellmBaseUrl = field("litellmBaseUrl");
  if (typeof litellmBaseUrl !== "string" || !litellmBaseUrl) throw new Error("build-config.json has no litellmBaseUrl.");
  const defaultModel = field("defaultModel");
  return {
    litellmBaseUrl,
    defaultModel: typeof defaultModel === "string" && defaultModel ? defaultModel : null,
    keyMode: field("keyMode") === "workspace" ? "workspace" : "user",
  };
}

const baked = readBakedSettings();
const environment: Record<string, string> = {
  ...SERVER_ENVIRONMENT_DEFAULTS,
  BONZAIWORK_LITELLM_BASE_URL: baked.litellmBaseUrl,
  BONZAIWORK_KEY_MODE: baked.keyMode,
  ...(baked.defaultModel ? { BONZAIWORK_DEFAULT_MODEL: baked.defaultModel } : {}),
  OPENWORK_SERVER_HOOKS: pathToFileURL(join(here, "server-hooks.js")).href,
};
for (const [name, value] of Object.entries(environment)) {
  // Development may override a baked value; a packaged build never sets these itself.
  process.env[name] = process.env[name]?.trim() || value;
}

registerKeyStore(new SafeStorageKeyStore());

// Packaged: <asar>/bonzaiwork/main.mjs next to <asar>/electron/main.mjs.
// Development: apps/bonzaiwork/dist-electron/main.mjs.
const upstreamMain = [join(here, "..", "electron", "main.mjs"), join(here, "..", "..", "desktop", "electron", "main.mjs")]
  .find((candidate) => existsSync(candidate));
if (!upstreamMain) throw new Error("The OpenWork desktop shell (electron/main.mjs) was not found.");
await import(pathToFileURL(upstreamMain).href);
