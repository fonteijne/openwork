/**
 * Packages BonzaiWork: upstream's Electron build steps (server, sidecars,
 * runtime modules), then our UI and entry, then electron-builder with
 * apps/desktop/electron-builder.bonzaiwork.mjs, with the git brains use
 * (scripts/bonzaiwork/fetch-git.mjs). Extra arguments go to
 * electron-builder (e.g. `--dir`, `--linux`, `--mac`).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "../..");
const desktopRoot = resolve(repoRoot, "apps/desktop");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(command, args, cwd, env = {}) {
  console.log(`[bonzaiwork] ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd, stdio: "inherit", env: { ...process.env, ...env }, shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!process.env.BONZAIWORK_LITELLM_BASE_URL?.trim()) {
  console.error("BONZAIWORK_LITELLM_BASE_URL is required: it is baked into the build.");
  process.exit(1);
}
run(process.execPath, [resolve(desktopRoot, "scripts/electron-build.mjs"), ...(process.argv.includes("--server-built") ? ["--server-built"] : [])], desktopRoot);
run(pnpm, ["--filter", "@bonzaiwork/app", "build"], repoRoot, { BONZAIWORK_ELECTRON_BUILD: "1" });
// The git for brains, for this machine or BONZAIWORK_GIT_TARGET (e.g. darwin-x64 when cross-building).
const gitTarget = process.env.BONZAIWORK_GIT_TARGET?.trim();
const fetchedGit = spawnSync(process.execPath, [resolve(repoRoot, "scripts/bonzaiwork/fetch-git.mjs"), ...(gitTarget ? ["--target", gitTarget] : [])], { cwd: repoRoot, stdio: "inherit" });
if (fetchedGit.status !== 0) {
  // Offline: a git fetched earlier for the same target still ships; without one the build stops,
  // because brains do not work without it.
  const shipped = resolve(appRoot, "resources/git/bonzaiwork-git.json");
  const earlier = existsSync(shipped) ? JSON.parse(readFileSync(shipped, "utf8")) : null;
  if (earlier?.target !== (gitTarget || `${process.platform}-${process.arch}`)) {
    console.error("[bonzaiwork] fetching git failed and there is no git for this target yet; connect to the internet and try again.");
    process.exit(fetchedGit.status ?? 1);
  }
  console.warn(`[bonzaiwork] WARNING: fetching git failed; shipping the git fetched earlier (${earlier.source ?? "unknown source"}).`);
}
run(process.execPath, [resolve(appRoot, "scripts/build-electron-entry.mjs")], appRoot);
const builderArgs = process.argv.slice(2).filter((arg) => arg !== "--server-built");
run(pnpm, ["exec", "electron-builder", "--config", "electron-builder.bonzaiwork.mjs", ...builderArgs], desktopRoot);
