/**
 * Keeps the BonzaiWork knowledge base (docs/bonzaiwork/kennisbank) up to date
 * from Claude Code development sessions; registered in .claude/settings.json.
 * Same split as the brains (project-breinen-plan §2, §6.5): what is
 * deterministic is code, the content is written by the agent.
 *
 *   session-start   remember where this session began (HEAD)
 *   stop            when the agent wants to stop:
 *                   1. concepts changed this session get `generated` and a log.md
 *                      line, and every index.md is regenerated (okf.ts, like the app);
 *                   2. the bundle is checked (kennisbank.ts); problems block the stop;
 *                   3. if BonzaiWork code changed and nobody looked at the knowledge base
 *                      for those changes yet, the stop is blocked once with the request
 *                      to record decisions and architecture changes.
 *
 * Never commits, never stages. State lives in the git dir of the worktree
 * (`git rev-parse --git-path bonzaiwork-kennisbank`), never in the repo.
 * Any failure of the hook itself lets the session stop (it must never trap one).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const KB = "docs/bonzaiwork/kennisbank";
const MAX_PROBLEM_BLOCKS = 3;
const MAX_LISTED = 12;

/** Paths whose change can mean an architecture change or a decision. */
const WATCHED = [
  "apps/bonzaiwork/",
  "packages/bonzaiwork-",
  "scripts/bonzaiwork/",
  "docs/bonzaiwork/",
  "PATCHES.md",
  "bonzaiwork.upstream.json",
  ".github/workflows/bonzaiwork.yml",
  ".github/workflows/upstream-sync.yml",
  "apps/desktop/electron-builder.bonzaiwork.mjs",
  "apps/server/src/downstream-hooks.ts",
];
const IGNORED = [`${KB}/`, "scripts/bonzaiwork/kennisbank", "docs/bonzaiwork/screenshots/"];

type HookInput = { session_id?: string; transcript_path?: string; stop_hook_active?: boolean; cwd?: string };
type State = { start: string; reviewed: string | null; processed: Record<string, string>; problemBlocks: number };
type Change = { path: string; status: "A" | "M" | "D" };

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function tryGit(root: string, args: string[]): string | null {
  try { return git(root, args); } catch { return null; }
}

async function readInput(): Promise<HookInput> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  const value: unknown = JSON.parse(text);
  if (typeof value !== "object" || value === null) return {};
  const field = (key: string): unknown => Reflect.get(value, key);
  const str = (key: string) => (typeof field(key) === "string" ? String(field(key)) : undefined);
  return { session_id: str("session_id"), transcript_path: str("transcript_path"), cwd: str("cwd"), stop_hook_active: field("stop_hook_active") === true };
}

function output(value: Record<string, unknown>) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

const hash = (text: string) => createHash("sha256").update(text).digest("hex");

async function loadState(file: string, head: string): Promise<State> {
  const text = await readFile(file, "utf8").catch(() => null);
  if (text) {
    const value: unknown = JSON.parse(text);
    if (typeof value === "object" && value !== null) {
      const start = Reflect.get(value, "start");
      const reviewed = Reflect.get(value, "reviewed");
      const processed = Reflect.get(value, "processed");
      const problemBlocks = Reflect.get(value, "problemBlocks");
      return {
        start: typeof start === "string" ? start : head,
        reviewed: typeof reviewed === "string" ? reviewed : null,
        processed: typeof processed === "object" && processed !== null
          ? Object.fromEntries(Object.entries(processed).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
          : {},
        problemBlocks: typeof problemBlocks === "number" ? problemBlocks : 0,
      };
    }
  }
  return { start: head, reviewed: null, processed: {}, problemBlocks: 0 };
}

/** Everything that differs from where the session began: commits, working tree and new files. */
function changesSince(root: string, start: string): Change[] {
  const changes: Change[] = [];
  for (const line of (tryGit(root, ["diff", "--name-status", "--no-renames", start]) ?? "").split("\n").filter(Boolean)) {
    const [status, path] = line.split("\t");
    if (path) changes.push({ path, status: status === "A" ? "A" : status === "D" ? "D" : "M" });
  }
  for (const path of (tryGit(root, ["ls-files", "--others", "--exclude-standard"]) ?? "").split("\n").filter(Boolean)) {
    changes.push({ path, status: "A" });
  }
  return changes;
}

const isWatched = (path: string) => WATCHED.some((prefix) => path.startsWith(prefix)) && !IGNORED.some((prefix) => path.startsWith(prefix));

/** The model of the session, from its transcript; the actor in `generated.by`. */
async function sessionModel(transcript: string | undefined): Promise<string> {
  const text = transcript ? await readFile(transcript, "utf8").catch(() => "") : "";
  const models = [...text.matchAll(/"model"\s*:\s*"(claude-[^"]+)"/g)].map((match) => match[1]);
  return models.at(-1) ?? "claude-code";
}

/** appendLog keeps every line; a session that edits a concept twice should log it once per day. */
function dedupeLog(text: string): string {
  const seen = new Set<string>();
  return text.split("\n").filter((line) => {
    if (/^##\s/.test(line)) { seen.clear(); return true; }
    if (!line.startsWith("* ")) return true;
    if (seen.has(line)) return false;
    seen.add(line);
    return true;
  }).join("\n");
}

async function maintain(root: string, state: State, changes: Change[], input: HookInput): Promise<{ problems: string[]; written: string[] }> {
  const okf = await import("../../packages/bonzaiwork-brains/src/okf.ts");
  const kb = join(root, KB);
  const prefix = `${KB}/`;
  const pending: Array<{ path: string; status: Change["status"]; digest: string }> = [];
  for (const change of changes) {
    if (!change.path.startsWith(prefix)) continue;
    const path = change.path.slice(prefix.length);
    if (!okf.isConceptPath(path)) continue;
    const text = await readFile(join(kb, path), "utf8").catch(() => null);
    const digest = text === null ? "deleted" : hash(text);
    if (state.processed[path] === digest) continue;
    pending.push({ path, status: text === null ? "D" : change.status, digest });
  }
  const problems: string[] = [];
  const written: string[] = [];
  if (pending.length) {
    const branch = tryGit(root, ["branch", "--show-current"]) || "detached HEAD";
    const plan = await okf.planKnowledge({
      root: kb,
      staged: pending.map(({ path, status }) => ({ path, status })),
      by: await sessionModel(input.transcript_path),
      at: new Date().toISOString(),
      note: `sessie op ${branch}`,
      existed: async (path) => tryGit(root, ["cat-file", "-e", `${state.start}:${KB}/${path}`]) !== null,
    });
    for (const path of plan.restore) problems.push(`${path}: references/ is immutable; add a new source instead of changing this one`);
    for (const { path, problem, line } of plan.invalid) problems.push(`${path}: not OKF-conformant (${problem}${line ? `, line ${line}` : ""})`);
    for (const [path, content] of plan.write) {
      await writeFile(join(kb, path), path.endsWith("log.md") ? dedupeLog(content) : content);
      written.push(path);
    }
    if (!plan.invalid.length) {
      for (const { path } of pending) {
        const text = await readFile(join(kb, path), "utf8").catch(() => null);
        state.processed[path] = text === null ? "deleted" : hash(text);
      }
    }
  }
  const { checkKnowledgeBase } = await import("./kennisbank.ts");
  const result = await checkKnowledgeBase({ write: true });
  return { problems: [...new Set([...problems, ...result.problems])], written: [...new Set([...written, ...result.written])] };
}

function fingerprint(root: string, start: string, paths: string[]): string {
  const diff = tryGit(root, ["diff", start, "--", ...paths]) ?? "";
  const untracked = paths.filter((path) => tryGit(root, ["ls-files", "--error-unmatch", path]) === null)
    .map((path) => { try { return `${path}\n${execFileSync("git", ["hash-object", path], { cwd: root, encoding: "utf8" })}`; } catch { return path; } });
  return hash([diff, ...untracked].join("\n"));
}

function reviewRequest(paths: string[]): string {
  const listed = paths.slice(0, MAX_LISTED).map((path) => `- ${path}`).join("\n");
  const more = paths.length > MAX_LISTED ? `\n- … en nog ${paths.length - MAX_LISTED}` : "";
  return [
    "Kennisbank BonzaiWork: deze sessie veranderde BonzaiWork-bestanden:",
    `${listed}${more}`,
    "",
    "Kijk vóór je afrondt of de kennisbank (docs/bonzaiwork/kennisbank/) moet meegaan. Let ook op wat in dit gesprek besloten is, niet alleen op de diff:",
    "- Een besluit genomen of een eerder besluit veranderd? Voeg een Decision toe of werk hem bij (sjabloon: _templates/besluit.md; een vervangen besluit wordt status: deprecated met een link naar de opvolger).",
    "- Een onderdeel anders gaan werken, verplaatst of nieuw? Werk het System-concept in knowledge/architectuur/ bij.",
    "- Volg _meta/schema.md: bronnen in `sources` met voetnoten. Een bron kan ook een codebestand of een plan in docs/bonzaiwork/ zijn.",
    "- log.md, `generated` en index.md doet deze hook zelf; niet met de hand aanpassen. Niet committen.",
    "Valt er niets vast te leggen (een bugfix of polish zonder nieuwe keuze), zeg dat dan in één zin en rond af.",
  ].join("\n");
}

async function main() {
  const mode = process.argv[2];
  const input = await readInput();
  const root = tryGit(input.cwd ?? process.cwd(), ["rev-parse", "--show-toplevel"]);
  if (!root || !existsSync(join(root, KB, "knowledge"))) return;
  const head = tryGit(root, ["rev-parse", "HEAD"]);
  if (!head) return;
  const dir = join(root, git(root, ["rev-parse", "--git-path", "bonzaiwork-kennisbank"]));
  const file = join(dir, `${(input.session_id ?? "zonder-sessie").replace(/[^A-Za-z0-9_-]/g, "_")}.json`);
  await mkdir(dir, { recursive: true });
  const state = await loadState(file, head);

  if (mode === "session-start") {
    // Only what changes during this session counts: concepts that already differ from HEAD
    // (uncommitted work from before) are taken as they are.
    for (const change of changesSince(root, state.start)) {
      if (!change.path.startsWith(`${KB}/knowledge/`) || !change.path.endsWith(".md")) continue;
      const path = change.path.slice(KB.length + 1);
      const text = await readFile(join(root, change.path), "utf8").catch(() => null);
      state.processed[path] ??= text === null ? "deleted" : hash(text);
    }
    await writeFile(file, JSON.stringify(state));
    return;
  }
  if (mode !== "stop") throw new Error(`unknown mode ${mode ?? "(none)"}; use session-start or stop`);

  const changes = changesSince(root, state.start);
  const reasons: string[] = [];
  let maintenance: { problems: string[]; written: string[] } = { problems: [], written: [] };
  try {
    maintenance = await maintain(root, state, changes, input);
  } catch (error) {
    output({ systemMessage: `Kennisbank-hook kon de kennisbank niet bijwerken (${error instanceof Error ? error.message : String(error)}). Draai \`pnpm install --filter @bonzaiwork/brains...\` en \`bun scripts/bonzaiwork/kennisbank.ts --write\`.` });
    await writeFile(file, JSON.stringify(state));
    return;
  }
  if (maintenance.problems.length && state.problemBlocks < MAX_PROBLEM_BLOCKS) {
    state.problemBlocks += 1;
    reasons.push(`Kennisbank BonzaiWork: de controle vond ${maintenance.problems.length} probleem/problemen. Los ze op (zie docs/bonzaiwork/kennisbank/_meta/schema.md):\n${maintenance.problems.slice(0, 20).map((line) => `- ${line}`).join("\n")}`);
  }

  const watched = [...new Set(changes.map((change) => change.path).filter(isWatched))].sort();
  if (watched.length) {
    const current = fingerprint(root, state.start, watched);
    if (current !== state.reviewed) {
      state.reviewed = current;
      reasons.push(reviewRequest(watched));
    }
  }
  await writeFile(file, JSON.stringify(state));

  if (reasons.length) output({ decision: "block", reason: reasons.join("\n\n") });
  else if (maintenance.written.length) output({ systemMessage: `Kennisbank bijgewerkt: ${maintenance.written.map((path) => path.replace(/^knowledge\//, "")).join(", ")}` });
}

main().catch((error: unknown) => {
  output({ systemMessage: `Kennisbank-hook overgeslagen: ${error instanceof Error ? error.message : String(error)}` });
});
