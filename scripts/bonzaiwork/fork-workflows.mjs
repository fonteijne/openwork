/**
 * Keeps upstream's workflows off in the fork (docs/bonzaiwork/README.md, "CI").
 * Upstream ships ±50 workflows that publish, need their secrets or wait forever
 * for their Blacksmith runners. Every workflow not in ENABLED is disabled, and
 * with --cancel-sha its runs for that commit (the dev mirror push) are cancelled.
 * Disabling is a repository setting, so this never touches files or merges.
 *
 *   GITHUB_TOKEN=… GITHUB_REPOSITORY=owner/repo node scripts/bonzaiwork/fork-workflows.mjs \
 *     [--cancel-sha <sha>] [--report <file>] [--dry-run]
 */
import { appendFileSync } from "node:fs";
import { parseArgs } from "node:util";

const ENABLED = new Set([
  ".github/workflows/bonzaiwork.yml",
  ".github/workflows/upstream-sync.yml",
  ".github/workflows/codeql.yml",
  ".github/workflows/warden-quick.yml",
  ".github/workflows/features-check.yml",
]);

const { values: args } = parseArgs({
  options: {
    "cancel-sha": { type: "string" },
    report: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});
const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
if (!token || !repo) {
  console.error("GITHUB_TOKEN and GITHUB_REPOSITORY are required");
  process.exit(2);
}

async function api(method, path) {
  const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" },
  });
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
  return response.status === 204 || response.status === 202 ? null : response.json();
}

// Dynamic workflows (CodeQL default setup, Dependabot) have no file under .github/workflows.
const isOwnedFile = (path) => path.startsWith(".github/workflows/");

const { workflows } = await api("GET", "/actions/workflows?per_page=100");
const disabled = [];
for (const workflow of workflows) {
  if (workflow.state !== "active" || !isOwnedFile(workflow.path) || ENABLED.has(workflow.path)) continue;
  if (!args["dry-run"]) await api("PUT", `/actions/workflows/${workflow.id}/disable`);
  disabled.push(`${workflow.name} (\`${workflow.path}\`)`);
  console.log(`disabled ${workflow.path}`);
}

if (args["cancel-sha"]) {
  const { workflow_runs: runs } = await api("GET", `/actions/runs?head_sha=${args["cancel-sha"]}&per_page=100`);
  for (const run of runs) {
    const path = run.path.split("@")[0];
    if (run.status === "completed" || !isOwnedFile(path) || ENABLED.has(path)) continue;
    if (!args["dry-run"]) await api("POST", `/actions/runs/${run.id}/cancel`).catch((error) => console.warn(String(error)));
    console.log(`cancelled run ${run.id} (${path})`);
  }
}

if (args.report && disabled.length) appendFileSync(args.report, `${disabled.join("\n")}\n`);
