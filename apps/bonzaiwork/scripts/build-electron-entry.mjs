/**
 * Builds BonzaiWork's Electron entry into dist-electron/:
 *   main.mjs           the entry (bundled, `electron` external)
 *   server-hooks.js    the openwork-server hooks module
 *   build-config.json  settings baked into this build (O3: the LiteLLM URL is fixed per build)
 *
 * Required: BONZAIWORK_LITELLM_BASE_URL. Optional: BONZAIWORK_DEFAULT_MODEL,
 * BONZAIWORK_KEY_MODE (user | workspace), BONZAIWORK_PREFERRED_MODELS
 * (comma-separated LiteLLM model ids; unset keeps the built-in list).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(appRoot, "dist-electron");
const repoRoot = resolve(appRoot, "../..");

// Validates exactly as the app will at runtime (Node 24 strips the TypeScript types).
const { readSettings } = await import(resolve(repoRoot, "packages/bonzaiwork-policy/src/index.ts"));
let settings;
try {
  settings = readSettings(process.env);
} catch (error) {
  console.error(`[bonzaiwork] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: appRoot, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
run("bun", ["build", "desktop-main/main.ts", "--outfile", "dist-electron/main.mjs", "--target", "node", "--format", "esm", "--external=electron"]);
run("bun", ["build", "../../packages/bonzaiwork-litellm/src/server-hooks.ts", "--outfile", "dist-electron/server-hooks.js", "--target", "node", "--format", "esm"]);
writeFileSync(resolve(out, "build-config.json"), `${JSON.stringify(settings, null, 2)}\n`);
console.log(`[bonzaiwork] electron entry built for ${settings.litellmBaseUrl} (${settings.keyMode} keys)`);
