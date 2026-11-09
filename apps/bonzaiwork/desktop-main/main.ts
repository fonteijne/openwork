import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { app } from "electron";

import { registerPresenceSource } from "@bonzaiwork/agenda/presence";
import { registerDiagnosticsSource } from "@bonzaiwork/feedback";
import { SERVER_ENVIRONMENT_DEFAULTS } from "@bonzaiwork/policy";
import { registerKeyStore } from "@bonzaiwork/litellm/keys";

import { ElectronDiagnosticsSource } from "./diagnostics-source";
import { engineHistoryEnvironment } from "./engine-history";
import { ElectronPresenceSource } from "./presence-source";
import { SafeStorageKeyStore } from "./safe-storage-key-store";

/**
 * BonzaiWork's Electron entry (package.json "main" via the builder config).
 * It configures the process, then hands over to the unmodified upstream
 * shell, so upstream's main process stays mergeable:
 *
 *  - settings baked into the build (LiteLLM URL, default model, key mode, preferred models);
 *  - OpenWork's hosted and free models off;
 *  - the openwork-server hooks module: the LiteLLM-only policy, brains, routines and feedback;
 *  - the OS-keychain key store, registered before the in-process server starts;
 *  - the window, logs and Downloads folder for feedback reports;
 *  - its own engine chat history, apart from any other OpenCode install (engine-history.ts).
 */

const here = dirname(fileURLToPath(import.meta.url));

type BakedSettings = { litellmBaseUrl: string; defaultModel: string | null; keyMode: "user" | "workspace"; preferredModels: string[] | null };

function readBakedSettings(): BakedSettings {
  const parsed: unknown = JSON.parse(readFileSync(join(here, "build-config.json"), "utf8"));
  const field = (name: string): unknown => (typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, name) : undefined);
  const litellmBaseUrl = field("litellmBaseUrl");
  if (typeof litellmBaseUrl !== "string" || !litellmBaseUrl) throw new Error("build-config.json has no litellmBaseUrl.");
  const defaultModel = field("defaultModel");
  const preferredModels = field("preferredModels");
  return {
    litellmBaseUrl,
    defaultModel: typeof defaultModel === "string" && defaultModel ? defaultModel : null,
    keyMode: field("keyMode") === "workspace" ? "workspace" : "user",
    // Older build configs lack the field: the server then keeps the built-in list.
    preferredModels: Array.isArray(preferredModels) ? preferredModels.filter((id): id is string => typeof id === "string") : null,
  };
}

const baked = readBakedSettings();
const environment: Record<string, string> = {
  ...SERVER_ENVIRONMENT_DEFAULTS,
  BONZAIWORK_LITELLM_BASE_URL: baked.litellmBaseUrl,
  BONZAIWORK_KEY_MODE: baked.keyMode,
  ...(baked.defaultModel ? { BONZAIWORK_DEFAULT_MODEL: baked.defaultModel } : {}),
  ...(baked.preferredModels ? { BONZAIWORK_PREFERRED_MODELS: baked.preferredModels.join(",") } : {}),
  OPENWORK_SERVER_HOOKS: pathToFileURL(join(here, "server-hooks.js")).href,
  // The shipped dugite-native git, when this build has one (docs/bonzaiwork/project-breinen-plan.md §3.1).
  ...(existsSync(join(process.resourcesPath ?? "", "git")) ? { BONZAIWORK_GIT_DIRECTORY: join(process.resourcesPath, "git") } : {}),
};
for (const [name, value] of Object.entries(environment)) {
  // Development may override a baked value; a packaged build never sets these itself.
  process.env[name] = process.env[name]?.trim() || value;
}

// Brains (registry, known_hosts, git state) and engine chat history, never in a repository. userData is only final once
// upstream's main.mjs has set it (dev profiles, OPENWORK_ELECTRON_USERDATA, blank-slate launches),
// which it does while it loads; the server and its hooks start after "ready", and this listener
// runs before upstream's whenReady continuation (review #5).
app.once("ready", () => {
  const stateDir = process.env.BONZAIWORK_STATE_DIR?.trim() || join(app.getPath("userData"), "bonzaiwork");
  process.env.BONZAIWORK_STATE_DIR = stateDir;
  // The engine's chat history, set before the server selects it (fonteijne/openwork#34). An
  // explicit OPENCODE_DB is left as it is; for our own file the folder must exist first.
  const { OPENCODE_DB } = engineHistoryEnvironment(process.env, stateDir);
  if (!process.env.OPENCODE_DB?.trim()) mkdirSync(dirname(OPENCODE_DB), { recursive: true, mode: 0o700 });
  process.env.OPENCODE_DB = OPENCODE_DB;
});

registerKeyStore(new SafeStorageKeyStore());
registerDiagnosticsSource(new ElectronDiagnosticsSource());
registerPresenceSource(new ElectronPresenceSource());

// Packaged: <asar>/bonzaiwork/main.mjs next to <asar>/electron/main.mjs.
// Development: apps/bonzaiwork/dist-electron/main.mjs.
const upstreamMain = [join(here, "..", "electron", "main.mjs"), join(here, "..", "..", "desktop", "electron", "main.mjs")]
  .find((candidate) => existsSync(candidate));
if (!upstreamMain) throw new Error("The OpenWork desktop shell (electron/main.mjs) was not found.");
await import(pathToFileURL(upstreamMain).href);
