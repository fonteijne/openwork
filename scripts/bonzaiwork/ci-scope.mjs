/**
 * Decides whether the BonzaiWork CI has anything to check (docs/bonzaiwork/README.md, "CI").
 * A change that only touches documentation skips the typecheck, tests and packaged build;
 * everything else, and every case this script can't judge, runs the full CI.
 *
 *   node scripts/bonzaiwork/ci-scope.mjs <base> <head>
 *
 * Prints `code=true|false` (append it to $GITHUB_OUTPUT) and the reason on stderr.
 */
import { execFileSync } from "node:child_process";

// Never shipped, never read by a build, test or check. PATCHES.md is not in here:
// check-patches.mjs reads it.
const DOCS_ONLY = [/^docs\//, /^\.github\/ISSUE_TEMPLATE\//, /^(?!PATCHES\.md$)[^/]+\.md$/];

const [base, head] = process.argv.slice(2);
const decide = (code, reason) => {
  console.error(reason);
  console.log(`code=${code}`);
  process.exit(0);
};

// A new branch (all zeros), a dispatch or a force push leaves no usable base.
if (!base || !head || /^0+$/.test(base)) decide(true, "no base commit: full CI");
let files;
try {
  files = execFileSync("git", ["diff", "--name-only", `${base}...${head}`], { encoding: "utf8" })
    .split("\n").filter(Boolean);
} catch {
  decide(true, `can't diff ${base}...${head}: full CI`);
}
const code = files.filter((path) => !DOCS_ONLY.some((pattern) => pattern.test(path)));
if (code.length) decide(true, `${code.length} of ${files.length} changed file(s) need CI, e.g. ${code.slice(0, 5).join(", ")}`);
decide(false, `only documentation changed (${files.length} file(s)): skipping CI`);
