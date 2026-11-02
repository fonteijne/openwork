#!/usr/bin/env node
/**
 * Fetches the git BonzaiWork ships for brains (docs/bonzaiwork/project-breinen-plan.md §3.1):
 * dugite-native, the build GitHub Desktop uses, checked against a pinned checksum and pruned
 * of what we never use (Git Credential Manager, LFS, HTTP transport helpers, docs, the MSYS
 * ssh on Windows). The result goes to apps/bonzaiwork/resources/git, which
 * electron-builder.bonzaiwork.mjs ships as `<resources>/git`.
 *
 *   node scripts/bonzaiwork/fetch-git.mjs [--target darwin-arm64] [--out <dir>] [--tarball <file>] [--keep-https]
 *
 * --target   platform-arch to fetch (default: this machine). One target per build, like the engine.
 * --tarball  use a downloaded tarball instead of fetching it (its checksum is still checked).
 * --keep-https  keep git-remote-http(s); without it the shipped git cannot use HTTPS at all (B2).
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** dugite-native v2.56.0-2 (git 2.56.0), from dugite@3.3.2's script/embedded-git.json. */
const RELEASE = "https://github.com/desktop/dugite-native/releases/download/v2.56.0-2";
const BUILDS = {
  "darwin-arm64": { name: "dugite-native-v2.56.0-a44aeca-macOS-arm64.tar.gz", sha256: "1110de343de11cc6f469b782b60f36217b9199b5e06875dd65baa26dd60563c7" },
  "darwin-x64": { name: "dugite-native-v2.56.0-a44aeca-macOS-x64.tar.gz", sha256: "52cc663281e1ec2f1d76ba781193ca4847e62dbbf767f6c99ec9ec5b978a7659" },
  "linux-x64": { name: "dugite-native-v2.56.0-a44aeca-ubuntu-x64.tar.gz", sha256: "1efd8ce0516b670b6b6d0f49ecaf395ceb8cf7fff3f5857259763d97a1238df9" },
  "linux-arm64": { name: "dugite-native-v2.56.0-a44aeca-ubuntu-arm64.tar.gz", sha256: "d5ce120515bf3013a014e6a918aa87ec0f7a6f5f9687c48d50127e637cb9b6c2" },
  "win32-x64": { name: "dugite-native-v2.56.0-a44aeca-windows-x64.tar.gz", sha256: "f1e17876337d7be143e5d51976da36643d65528125cfbc14d57f171de0fd5f14" },
  "win32-arm64": { name: "dugite-native-v2.56.0-a44aeca-windows-arm64.tar.gz", sha256: "1834e7817589f25f97ae0f309ef4733578a6b8dbd438ed29f898d075e6ead4c2" },
};

/** What we never run (fase 0 §1.1). Matched against file and folder names anywhere in the tree. */
const PRUNE = [
  /^git-credential-manager/i, /^git-credential-helper-selector/i, /^gcmcore/i, /^msalruntime/i,
  /^(System|Microsoft|Avalonia|SkiaSharp|HarfBuzzSharp|Tmds|Atlassian|GitHub|GitLab)\b.*\.(dll|dylib|so|pdb|json)$/i,
  /^lib(coreclr|clrjit|hostfxr|hostpolicy|System\.|Skia|HarfBuzz|av_libglesv2|mscordaccore|mscordbi)/i,
  /^av_libglesv2/i, /^libSkiaSharp/i, /^libHarfBuzzSharp/i, /\.deps\.json$/i, /\.runtimeconfig\.json$/i,
  /^git-lfs/i, /^scalar/i, /^git-daemon/i, /^git-http-backend/i, /^git-http-push/i, /^git-imap-send/i,
  /^(MicroCom|WindowsBase|mscorlib|netstandard)\b.*\.dll$/i, /^lib(clrgc|AvaloniaNative)/i, /^createdump$/, /^uninstall\.sh$/,
  /^git-instaweb/i, /^git-gui/i, /^gitk/i, /^git-cvs/i, /^git-svn/i, /^git-p4/i, /^git-send-email/i,
];
const PRUNE_FOLDERS = [/^share\/(locale|doc|man|gitweb|gitk|git-gui|perl5)$/, /\/share\/(locale|doc|man|gitweb|gitk|git-gui)$/, /\/lib\/ssh$/];
const HTTPS = [/^git-remote-https?(\.exe)?$/i, /^git-remote-ftps?(\.exe)?$/i, /^git-http-fetch(\.exe)?$/i];
/** Never the MSYS ssh: the system ssh has the user's keys and agent (fase 0 §2.3). */
const WINDOWS_SSH = [/^ssh(-add|-agent|-keygen|-keyscan|-pkcs11-helper|-sk-helper)?\.exe$/i, /^scp\.exe$/i, /^sftp\.exe$/i];
/** Language packs of the .NET runtime GCM brings. */
const CULTURE = /^[a-z]{2}(-[A-Za-z]{2,4})?$/;

function option(name) {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] : undefined;
}

async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function download(url, file) {
  console.log(`[fetch-git] ${url}`);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`download failed: HTTP ${response.status}`);
  // Via a temporary name: a broken-off download never looks like a cached tarball.
  await writeFile(`${file}.partial`, Buffer.from(await response.arrayBuffer()));
  await rename(`${file}.partial`, file);
}

async function prune(root, { windows, keepHttps }) {
  let removed = 0;
  async function walk(folder, relative) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      const drop =
        PRUNE.some((pattern) => pattern.test(entry.name)) ||
        (!keepHttps && HTTPS.some((pattern) => pattern.test(entry.name))) ||
        (windows && WINDOWS_SSH.some((pattern) => pattern.test(entry.name))) ||
        (entry.isDirectory() && (PRUNE_FOLDERS.some((pattern) => pattern.test(rel)) || (CULTURE.test(entry.name) && rel.includes("libexec/git-core"))));
      if (drop) {
        await rm(path, { recursive: true, force: true });
        removed += 1;
      } else if (entry.isDirectory() && !(await lstat(path)).isSymbolicLink()) {
        await walk(path, rel);
      }
    }
  }
  await walk(root, "");
  return removed;
}

function size(folder) {
  const result = spawnSync("du", ["-sk", folder], { encoding: "utf8" });
  return result.status === 0 ? `${Math.round(Number(result.stdout.split(/\s/)[0]) / 1024)} MB` : "?";
}

async function main() {
  const target = option("--target") ?? `${process.platform}-${process.arch}`;
  const build = BUILDS[target];
  if (!build) throw new Error(`no git for ${target}; known: ${Object.keys(BUILDS).join(", ")}`);
  const out = resolve(option("--out") ?? join(repoRoot, "apps/bonzaiwork/resources/git"));
  const keepHttps = process.argv.includes("--keep-https");
  const cache = join(repoRoot, "apps/bonzaiwork/resources/.cache");
  await mkdir(cache, { recursive: true });

  const given = option("--tarball");
  const tarball = given ? resolve(given) : join(cache, build.name);
  if (!existsSync(tarball)) await download(`${RELEASE}/${build.name}`, tarball);
  let actual = await sha256(tarball);
  if (actual !== build.sha256 && !given) {
    // A damaged cache (an older broken download) is fetched once more, never used.
    console.log(`[fetch-git] cached ${build.name} does not match its checksum; downloading it again`);
    await rm(tarball, { force: true });
    await download(`${RELEASE}/${build.name}`, tarball);
    actual = await sha256(tarball);
  }
  if (actual !== build.sha256) {
    throw new Error(`checksum mismatch for ${build.name}: expected ${build.sha256}, got ${actual}`);
  }

  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  // bsdtar on macOS and Windows 10+, GNU tar on Linux; all read .tar.gz.
  const extracted = spawnSync("tar", ["-xzf", tarball, "-C", out], { stdio: "inherit" });
  if (extracted.status !== 0) throw new Error("extracting failed");
  const removed = await prune(out, { windows: target.startsWith("win32"), keepHttps });
  await writeFile(join(out, "bonzaiwork-git.json"), `${JSON.stringify({ source: `${RELEASE}/${build.name}`, sha256: build.sha256, target, https: keepHttps }, null, 2)}\n`);

  const binary = target.startsWith("win32") ? join(out, "cmd", "git.exe") : join(out, "bin", "git");
  if (!existsSync(binary)) throw new Error(`no git binary at ${binary}`);
  if (target === `${process.platform}-${process.arch}`) {
    const version = spawnSync(binary, ["--version"], { encoding: "utf8", env: { PATH: process.env.PATH ?? "", GIT_EXEC_PATH: target.startsWith("win32") ? "" : join(out, "libexec", "git-core") } });
    if (version.status !== 0) throw new Error(`the pruned git does not run: ${version.stderr}`);
    console.log(`[fetch-git] ${version.stdout.trim()}`);
  }
  console.log(`[fetch-git] ${target} → ${out} (${size(out)}, ${removed} items pruned${keepHttps ? "" : ", no HTTPS"})`);
}

main().catch((error) => {
  console.error(`[fetch-git] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
