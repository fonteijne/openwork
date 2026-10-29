/**
 * Writes the body of an upstream-sync PR (docs/bonzaiwork/README.md, "Upstream
 * automatisch syncen"): what upstream changed since the last sync and what has
 * to happen before the merge into main. Plain git, no network.
 *
 *   node scripts/bonzaiwork/upstream-sync-report.mjs --base <sha> --head <sha>
 *     [--conflicts <file>] [--patches <file> --patches-exit <code>] [--disabled <file>]
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    base: { type: "string" },
    head: { type: "string" },
    upstream: { type: "string", default: "different-ai/openwork" },
    conflicts: { type: "string" },
    patches: { type: "string" },
    "patches-exit": { type: "string" },
    disabled: { type: "string" },
  },
});
if (!args.base || !args.head) {
  console.error("usage: upstream-sync-report.mjs --base <sha> --head <sha>");
  process.exit(2);
}

// Upstream files our layer leans on without patching them. A change here does
// not conflict, but can still break the packaged app or the LiteLLM-only policy.
const WATCH = [
  ["apps/desktop/electron/main.mjs", "de BonzaiWork-entry laadt deze ongewijzigd (`desktop-main/main.ts`)"],
  ["apps/desktop/electron/updater.mjs", "updater-feed staat op upstream (werkstroom C)"],
  ["apps/desktop/electron-builder.yml", "`electron-builder.bonzaiwork.mjs` leest deze in"],
  ["apps/desktop/package.json", "verpakken van de desktop-app"],
  ["apps/server/src/openwork-runtime-config.ts", "provider-mirror; de gate verhuisde hier al eens naartoe"],
  ["apps/server/src/opencode-models-url.ts", "modelcatalogus-URL (geen verkeer naar openworklabs.com)"],
  ["apps/server/src/free-auto/settings.ts", "`@bonzaiwork/policy` spiegelt deze instellingen"],
  ["apps/server/src/cli.ts", "e2e en dev starten de server via deze CLI"],
  ["constants.json", "engineversies: e2e en smoketest moeten opnieuw slagen"],
  ["apps/server/src/opencode-v2-artifacts.json", "v2-engine-binaries"],
  ["pnpm-workspace.yaml", "workspace en catalog-versies"],
  ["package.json", "root-scripts, `packageManager`, engines"],
];
const MAX_COMMITS = 300;

const git = (...argv) => execFileSync("git", argv, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
const lines = (text) => text.split("\n").filter(Boolean);
const readList = (path) => (path && existsSync(path) ? lines(readFileSync(path, "utf8")) : []);
const short = (sha) => sha.slice(0, 9);
const range = `${args.base}..${args.head}`;

const commits = lines(git("log", "--no-merges", "--format=%h\t%s", range)).map((line) => line.split("\t"));
const changed = new Map(
  lines(git("diff", "--name-status", "--no-renames", args.base, args.head)).map((line) => {
    const [status, path] = line.split("\t");
    return [path, status];
  }),
);
const touchedBy = (path) => lines(git("log", "--no-merges", "--format=%h %s", range, "--", path));
const stat = (path) => git("diff", "--shortstat", args.base, args.head, "--", path).replace(/^ /, "") || "–";

const patched = existsSync("PATCHES.md")
  ? [...readFileSync("PATCHES.md", "utf8").matchAll(/^\|\s*`([^`]+)`/gm)].map((match) => match[1])
  : [];
const patchedChanged = patched.filter((path) => changed.has(path));
const watchChanged = WATCH.filter(([path]) => changed.has(path));
const workflows = [...changed].filter(([path]) => path.startsWith(".github/workflows/"));
const manifests = [...changed].filter(([path]) => path.endsWith("/package.json") && !path.startsWith("ee/"));
const conflicts = readList(args.conflicts);
const disabled = readList(args.disabled);
const patchesOutput = args.patches && existsSync(args.patches) ? readFileSync(args.patches, "utf8").trim() : "";
const patchesOk = args["patches-exit"] === "0";
const compare = `https://github.com/${args.upstream}/compare/${args.base}...${args.head}`;
const statusWord = { A: "nieuw", M: "gewijzigd", D: "verwijderd" };

const out = [];
const push = (...text) => out.push(...text);

push(
  `Upstream \`dev\` van \`${args.upstream}\` van \`${short(args.base)}\` naar \`${short(args.head)}\` ([vergelijken](${compare})).`,
  "Automatisch aangemaakt door `.github/workflows/upstream-sync.yml`.",
  "",
  "| | |",
  "|---|---|",
  `| Upstream-commits | ${commits.length} |`,
  `| Gewijzigde bestanden | ${changed.size} |`,
  `| Merge in \`main\` | ${conflicts.length ? `**${conflicts.length} conflict(en)**, niet gemerged` : "schoon"} |`,
  `| PATCHES-check | ${conflicts.length ? "niet gedraaid (eerst conflicten oplossen)" : patchesOk ? "groen" : "**faalt**"} |`,
  `| Gepatchte upstream-bestanden die upstream wijzigde | ${patchedChanged.length} |`,
  `| Raakvlakken (watchlist) gewijzigd | ${watchChanged.length} |`,
  `| Workflows gewijzigd | ${workflows.length} |`,
  "",
);

push("## Wat moet er gebeuren om te mergen", "");
const todo = [];
if (conflicts.length) {
  todo.push(
    `Conflicten oplossen in ${conflicts.map((path) => `\`${path}\``).join(", ")}: check deze branch uit, \`git merge origin/main\`, los op, werk \`bonzaiwork.upstream.json\` bij naar \`${short(args.head)}\` en draai \`node scripts/bonzaiwork/check-patches.mjs\`.`,
  );
}
for (const path of patchedChanged) todo.push(`Onze patch in \`${path}\` naast de upstream-wijziging leggen (zie hieronder) en \`PATCHES.md\` bijwerken als de hook verschoof.`);
if (!conflicts.length && !patchesOk) todo.push("PATCHES-check groen maken (uitvoer hieronder).");
for (const [path, why] of watchChanged) todo.push(`\`${path}\` nalopen: ${why}.`);
if (workflows.some(([, status]) => status === "A")) todo.push("Nieuwe upstream-workflows: controleren of ze uit staan (zie \"Workflows\").");
todo.push(
  "BonzaiWork-CI groen: typecheck, unit-tests, engine-E2E en de verpakte smoketest.",
  "`Stand:` in `docs/bonzaiwork/README.md` bijwerken naar deze upstream-commit.",
);
push(...todo.map((item) => `- [ ] ${item}`), "");

if (conflicts.length) {
  push(
    "## Conflicten",
    "",
    "Deze branch staat op upstream `dev` zelf, zodat GitHub de conflicten toont. Na het oplossen bevat hij de merge-commit.",
    "",
    ...conflicts.map((path) => `- \`${path}\``),
    "",
  );
}

if (patchedChanged.length) {
  push("## Gepatchte upstream-bestanden die upstream wijzigde", "");
  for (const path of patchedChanged) {
    push(`### \`${path}\``, "", `Upstream: ${stat(path)}`, "", ...touchedBy(path).map((commit) => `- ${commit}`), "");
  }
}

if (watchChanged.length) {
  push("## Raakvlakken (watchlist)", "", "| Bestand | Waarom | Upstream | Commits |", "|---|---|---|---|");
  for (const [path, why] of watchChanged) {
    const touched = touchedBy(path);
    push(`| \`${path}\` | ${why} | ${stat(path)} | ${touched.slice(0, 5).map((commit) => commit.split(" ")[0]).join(", ")}${touched.length > 5 ? " …" : ""} |`);
  }
  push("");
}

if (manifests.length) {
  push("## Gewijzigde package-manifests", "", ...manifests.map(([path, status]) => `- \`${path}\` (${statusWord[status] ?? status})`), "");
}

if (workflows.length || disabled.length) {
  push("## Workflows", "");
  push(...workflows.map(([path, status]) => `- \`${path}\` (${statusWord[status] ?? status})`));
  if (disabled.length) {
    push("", "Uitgezet door deze run (alleen de workflows in `scripts/bonzaiwork/fork-workflows.mjs` blijven aan):", "", ...disabled.map((name) => `- ${name}`));
  }
  push("");
}

if (patchesOutput) push("## PATCHES-check", "", "```", patchesOutput, "```", "");

push(
  `<details><summary>Upstream-commits (${commits.length})</summary>`,
  "",
  ...commits.slice(0, MAX_COMMITS).map(([sha, subject]) => `- ${sha} ${subject}`),
  ...(commits.length > MAX_COMMITS ? [`- … en ${commits.length - MAX_COMMITS} meer, zie de vergelijking hierboven`] : []),
  "",
  "</details>",
);

console.log(out.join("\n"));
