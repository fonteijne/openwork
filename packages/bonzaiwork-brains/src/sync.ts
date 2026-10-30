import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { GitError, type Git, type GitRunOptions } from "./git.ts";
import { checkContract, contentWarnings, isStageContract } from "./icm.ts";
import { describeConcept, isConceptPath, isKnowledgePath, isReserved, KNOWLEDGE, mergeLogs, planKnowledge, renderIndexes, withVerified, type ConceptView, type StagedChange } from "./okf.ts";
import { applyTemplate } from "./template.ts";
import { remoteProblemMessage, SYNC_MESSAGES } from "./messages.ts";
import { scanForSecrets } from "./secrets.ts";
import { classifyGitError, type RemoteProblem } from "./ssh.ts";
import { findTrustItems, personalExcludes, sparsePatterns, untrusted, withLocalExcludes, type TreeEntry, type TrustItem } from "./trust.ts";

/**
 * One brain's synchronisation (plan §2, §4): fetch and update before a turn,
 * record and share after it. Git work for a brain never overlaps; every
 * operation waits for the previous one. The AI never runs git; this does.
 */
export type BrainKind = "project" | "personal";
export type BrainMode = "auto" | "manual" | "read_only";
export type BrainState = "synced" | "syncing" | "behind" | "ahead" | "offline" | "conflict" | "read_only" | "local_only" | "needs_trust" | "error";

/** What BonzaiWork keeps per brain (userData/bonzaiwork/brains.json, never in the repo). */
export type BrainRecord = {
  id: string;
  kind: BrainKind;
  /** The work tree: the project folder. */
  path: string;
  /** Repository folder outside the work tree (personal brain, plan §5.1.1); null: `<path>/.git`. */
  gitDir: string | null;
  mode: BrainMode;
  /** SSH form; null: history only, nothing is ever sent (local_only). */
  remote: string | null;
  branch: string;
  /** Path → blob the user accepted (plan §7.1). */
  trusted: Record<string, string>;
  /** origin/<branch> at the last successful sync: must stay an ancestor of HEAD (plan §7.4, laag 2). */
  lastSyncedRemote: string | null;
  lastSyncAt: number | null;
  /** The .git/config BonzaiWork expects (plan §7.4, laag 4). */
  gitConfig: string | null;
  /** Personal brain: folders the AI never reads or changes (plan §5.1.1). */
  excluded: string[];
};

export type Unshared = { path: string; reason: "not_markdown" | "too_large" };

export type BrainStatus = {
  kind: BrainKind;
  state: BrainState;
  mode: BrainMode;
  remote: string | null;
  branch: string;
  ahead: number;
  behind: number;
  lastSyncAt: number | null;
  conflictFiles: string[];
  /** Who made the other change in a conflict. */
  conflictBy: string | null;
  /** Both versions are in the conflict files for a chat to merge ("Laat de AI het samenvoegen"). */
  merging: boolean;
  /** Dutch; the English git/ssh text only goes to the log. */
  error: string | null;
  /** Items waiting for the user's decision; they are not in the folder (needs_trust). */
  pendingTrust: TrustItem[];
  /** New files that were not shared by themselves (plan §4.3). */
  unshared: Unshared[];
  /** Advice that blocks nothing (a long AGENTS.md, a source put back). */
  warnings: string[];
  /** Personal brain: folders the AI does not open. */
  excluded: string[];
};

export type Author = { name: string; email: string };

export type HistoryEntry = { commit: string; author: string; at: number; title: string; chatId: string | null; files: string[] };

export type BrainSyncOptions = {
  git: Git;
  record: BrainRecord;
  author: () => Author;
  save: (record: BrainRecord) => Promise<void>;
  log?: (level: "info" | "warn" | "error", message: string, fields?: Record<string, unknown>) => void;
  now?: () => number;
  /** Waits before sharing again after being offline; the last one repeats. */
  retryDelaysMs?: readonly number[];
  sizeLimitBytes?: number;
  platform?: NodeJS.Platform;
  /** `generated.by` for the AI's changes: `bonzaiwork/<version>` (plan §6.2). */
  producer?: string;
};

type Problem =
  | { kind: "offline"; message: string }
  | { kind: "read_only"; message: string }
  | { kind: "conflict"; message: string; files: string[]; by: string | null; merging?: boolean }
  | { kind: "error"; message: string; cause: RemoteProblem | "secret" | "content" | "config" | "remote" | "branch" | "history" | "git" };

export type TurnResult = { committed: boolean; shared: boolean; blockedBy?: string };

const CONFLICT_MARKER = /^(<{7}|>{7})( |$)|^={7}$/m;

/** The fixed instruction for "Laat de AI het samenvoegen" (plan §4.5). */
export function mergePrompt(files: readonly string[], by: string | null): string {
  const other = by ?? "een collega";
  return [
    `In dit brein wijzigden jij en ${other} tegelijk dezelfde notities. In deze bestanden staan nu beide versies:`,
    ...files.map((file) => `- \`${file}\``),
    "",
    `Jouw versie staat tussen \`<<<<<<<\` en \`=======\`, die van ${other} tussen \`=======\` en \`>>>>>>>\`.`,
    "Voeg per bestand de twee versies samen tot één goede tekst. Verlies geen informatie: neem alles over wat in een van beide staat. Spreken ze elkaar echt tegen, zet dan beide erin met een korte opmerking.",
    "Haal alle markeringen weg en verander verder niets. Zeg aan het eind in één zin wat je samenvoegde.",
  ].join("\n");
}

const MAX_PUSH_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAYS = [30_000, 120_000, 300_000, 900_000];
const SIZE_LIMIT = 10 * 1024 * 1024;
const SECRET_SCAN_LIMIT = 1024 * 1024;

function splitNul(text: string): string[] {
  return text.split("\0").filter(Boolean);
}

export class BrainSync {
  private record: BrainRecord;
  private readonly git: Git;
  private queue: Promise<unknown> = Promise.resolve();
  private busy = false;
  private problem: Problem | null = null;
  private pending: TrustItem[] = [];
  private unshared: Unshared[] = [];
  private warnings: string[] = [];
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryIndex = 0;
  private disposed = false;

  constructor(private readonly options: BrainSyncOptions) {
    this.record = { ...options.record };
    this.git = options.git;
  }

  get id(): string { return this.record.id; }
  get snapshot(): BrainRecord { return { ...this.record, trusted: { ...this.record.trusted } }; }
  /** MCP servers of untrusted configs: the hooks deny them in the engine too (fase 0 §6.3). */
  get untrustedMcpServers(): string[] { return [...new Set(this.pending.flatMap((item) => item.mcpServers ?? []))].sort(); }

  private get gitDir(): string { return this.record.gitDir ?? join(this.record.path, ".git"); }

  private opts(extra: Partial<GitRunOptions> = {}): GitRunOptions {
    return {
      cwd: this.record.path,
      ...(this.record.gitDir ? { gitDir: this.record.gitDir, workTree: this.record.path } : {}),
      ...extra,
    };
  }

  private run(args: readonly string[], extra?: Partial<GitRunOptions>) { return this.git.run(args, this.opts(extra)); }
  private ok(args: readonly string[], extra?: Partial<GitRunOptions>) { return this.git.ok(args, this.opts(extra)); }

  private log(level: "info" | "warn" | "error", message: string, fields?: Record<string, unknown>): void {
    this.options.log?.(level, message, { brain: this.record.id, ...fields });
  }

  private now(): number { return this.options.now?.() ?? Date.now(); }

  private lock<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(async () => {
      this.busy = true;
      try { return await task(); } finally { this.busy = false; }
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async persist(patch: Partial<BrainRecord>): Promise<void> {
    this.record = { ...this.record, ...patch };
    await this.options.save(this.snapshot);
  }

  private async readConfig(): Promise<string | null> {
    return readFile(join(this.gitDir, "config"), "utf8").catch(() => null);
  }

  /** After BonzaiWork itself changed .git/config (clone, sparse-checkout, repair). */
  private async rememberConfig(): Promise<void> {
    await this.persist({ gitConfig: await this.readConfig() });
  }

  private author(): Record<string, string> {
    const { name, email } = this.options.author();
    return { "user.name": name, "user.email": email };
  }

  private fail(cause: RemoteProblem | "git", stderr: string): Problem {
    const problem: Problem = cause === "offline" || cause === "unreachable"
      ? { kind: "offline", message: remoteProblemMessage(cause, this.options.platform) }
      : cause === "read_only"
        ? { kind: "read_only", message: remoteProblemMessage("read_only", this.options.platform) }
        : { kind: "error", cause, message: remoteProblemMessage(cause === "git" ? "unknown" : cause, this.options.platform) };
    this.log(problem.kind === "offline" ? "info" : "warn", "brain sync stopped", { cause, stderr: stderr.trim().slice(-500) });
    return problem;
  }

  /**
   * Plan §7.4, lagen 2 en 4: before any git work, `.git/config`, the remote
   * and the branch are what BonzaiWork left. Anything else could run code
   * (filters, includes) or send work elsewhere, so nothing runs.
   */
  private async guard(): Promise<boolean> {
    if (this.problem?.kind === "error" && ["config", "remote", "branch", "history"].includes(this.problem.cause)) return false;
    const config = await this.readConfig();
    if (this.record.gitConfig !== null && config !== this.record.gitConfig) {
      this.problem = { kind: "error", cause: "config", message: SYNC_MESSAGES.configChanged };
      this.log("warn", "brain .git/config changed outside BonzaiWork");
      return false;
    }
    if (this.record.remote) {
      const url = await this.run(["remote", "get-url", "origin"]);
      if (url.stdout.trim() !== this.record.remote) {
        this.problem = { kind: "error", cause: "remote", message: SYNC_MESSAGES.remoteChanged };
        return false;
      }
    }
    const head = await this.run(["symbolic-ref", "--short", "-q", "HEAD"]);
    if (head.stdout.trim() !== this.record.branch) {
      this.problem = { kind: "error", cause: "branch", message: SYNC_MESSAGES.branchChanged };
      return false;
    }
    return true;
  }

  private async hasCommit(ref: string): Promise<boolean> {
    return (await this.run(["rev-parse", "--verify", "-q", `${ref}^{commit}`])).exitCode === 0;
  }

  private async revParse(ref: string): Promise<string | null> {
    const result = await this.run(["rev-parse", "--verify", "-q", `${ref}^{commit}`]);
    return result.exitCode === 0 ? result.stdout.trim() : null;
  }

  private async isAncestor(ancestor: string, of: string): Promise<boolean> {
    return (await this.run(["merge-base", "--is-ancestor", ancestor, of])).exitCode === 0;
  }

  private remoteRef(): string { return `refs/remotes/origin/${this.record.branch}`; }

  // --- trust ------------------------------------------------------------------

  private async treeEntries(ref: string): Promise<TreeEntry[]> {
    const listing = await this.ok(["ls-tree", "-r", "-z", "--full-tree", ref]);
    return splitNul(listing).flatMap((line) => {
      const match = /^\d+ blob ([0-9a-f]+)\t(.+)$/s.exec(line);
      return match ? [{ blob: match[1], path: match[2] }] : [];
    });
  }

  /**
   * Excludes every untrusted item of `ref` from the folder before that ref
   * lands, so the engine never sees it (fase 0 §6.1). Called before each
   * checkout, fast-forward and rebase.
   */
  private async applyTrust(ref: string): Promise<void> {
    // A personal brain is the user's own folder: nothing in it is someone else's code.
    if (this.record.kind === "personal") {
      this.pending = [];
      return;
    }
    const refs = [ref, ...(await this.hasCommit("HEAD") ? ["HEAD"] : [])];
    const items = new Map<string, TrustItem>();
    for (const source of refs) {
      const found = await findTrustItems(await this.treeEntries(source), (blob) => this.ok(["cat-file", "-p", blob]));
      for (const item of found) if (!items.has(item.path) || source === ref) items.set(item.path, item);
    }
    this.pending = untrusted([...items.values()], this.record.trusted);
    const patterns = sparsePatterns(this.pending);
    await this.ok(["sparse-checkout", "set", "--no-cone", "--stdin"], { input: `${patterns.join("\n")}\n` });
    await this.rememberConfig();
  }

  private async writeLocalExcludes(): Promise<void> {
    const file = join(this.gitDir, "info", "exclude");
    await mkdir(dirname(file), { recursive: true });
    const extra = this.record.kind === "personal" ? personalExcludes(this.record.excluded) : [];
    await writeFile(file, withLocalExcludes(await readFile(file, "utf8").catch(() => ""), extra));
  }

  /** Excluded folders of a personal brain; their files leave the history from now on, not the folder. */
  setExcluded(folders: readonly string[]): Promise<BrainStatus> {
    return this.lock(async () => {
      const excluded = [...new Set(folders.map((folder) => folder.replace(/^\/+|\/+$/g, "")).filter((folder) => folder && !folder.includes("..")))].sort();
      await this.persist({ excluded });
      await this.writeLocalExcludes();
      for (const folder of excluded) await this.run(["rm", "-r", "-q", "--cached", "--ignore-unmatch", "--", folder]);
      if (await this.hasCommit("HEAD") && (await this.run(["diff", "--cached", "--quiet"])).exitCode === 1) {
        await this.ok(["commit", "-q", "--no-verify", "-m", "Mappen uitgesloten\n\nVia BonzaiWork"], { config: this.author() });
      }
      return this.statusNow();
    });
  }

  /** The trust step: these items may load from now on, exactly as they are. */
  trust(paths: readonly string[]): Promise<BrainStatus> {
    return this.lock(async () => {
      const accepted = { ...this.record.trusted };
      for (const item of this.pending) if (paths.includes(item.path)) accepted[item.path] = item.blob;
      await this.persist({ trusted: accepted });
      if (await this.guard() && await this.hasCommit("HEAD")) await this.applyTrust("HEAD");
      return this.statusNow();
    });
  }

  // --- recording --------------------------------------------------------------

  /**
   * Stages what goes along by itself (plan §4.3): changed or deleted files
   * that were shared already, and new Markdown. Other new files and files
   * over the size limit are reported, never staged.
   */
  private async stage(): Promise<{ staged: boolean; blockedBy?: string }> {
    const limit = this.options.sizeLimitBytes ?? SIZE_LIMIT;
    const tracked = splitNul(await this.ok(["ls-files", "-z", "--modified", "--deleted"]));
    const untrackedFiles = splitNul(await this.ok(["ls-files", "-z", "--others", "--exclude-standard"]));
    const unshared: Unshared[] = [];
    const add: string[] = [];
    const tooLarge = async (path: string) => {
      const info = await stat(join(this.record.path, path)).catch(() => null);
      return info !== null && info.size > limit;
    };
    for (const path of [...new Set(tracked)]) {
      if (await tooLarge(path)) unshared.push({ path, reason: "too_large" });
      else add.push(path);
    }
    for (const path of untrackedFiles) {
      if (!/\.md$/i.test(path)) unshared.push({ path, reason: "not_markdown" });
      else if (await tooLarge(path)) unshared.push({ path, reason: "too_large" });
      else add.push(path);
    }
    this.unshared = unshared;
    if (add.length) {
      await this.ok(["add", "-A", "--pathspec-from-file=-", "--pathspec-file-nul"], { input: `${add.join("\0")}\0` });
    }
    const staged = splitNul(await this.ok(["diff", "--cached", "--name-only", "-z", "--diff-filter=AM"]));
    const files = await Promise.all(staged.map(async (path) => {
      const size = Number((await this.run(["cat-file", "-s", `:${path}`])).stdout.trim());
      const content = size <= SECRET_SCAN_LIMIT ? (await this.run(["show", `:${path}`])).stdout : null;
      return { path, content };
    }));
    const [hit] = scanForSecrets(files);
    if (hit) {
      await this.run(["reset", "-q"]);
      return { staged: false, blockedBy: hit.path };
    }
    return { staged: (await this.run(["diff", "--cached", "--quiet"])).exitCode === 1 };
  }

  private async commit(message: string, actor: "ai" | "own", note: string): Promise<{ committed: boolean; blockedBy?: string }> {
    const content = await this.content(actor, note);
    if (content.blockedBy) return { committed: false, blockedBy: content.blockedBy };
    const { staged, blockedBy } = await this.stage();
    if (blockedBy) {
      this.problem = { kind: "error", cause: "secret", message: SYNC_MESSAGES.secret(blockedBy) };
      return { committed: false, blockedBy };
    }
    if (!staged) return { committed: false };
    await this.ok(["commit", "-q", "--no-verify", "-F", "-"], { input: message, config: this.author() });
    if (this.problem?.kind === "error" && (this.problem.cause === "secret" || this.problem.cause === "content")) this.problem = null;
    return { committed: true };
  }

  /** The user's own changes since the last turn (Obsidian, Finder), in a commit of their own. */
  private commitOwn(): Promise<{ committed: boolean; blockedBy?: string }> {
    return this.commit("Eigen wijzigingen\n\nVia BonzaiWork\n", "own", "eigen wijziging");
  }

  private async isFile(path: string): Promise<boolean> {
    return (await stat(join(this.record.path, path)).catch(() => null))?.isFile() ?? false;
  }

  private async inHead(path: string): Promise<boolean> {
    return (await this.run(["cat-file", "-e", `HEAD:${path}`])).exitCode === 0;
  }

  private async writeFiles(files: ReadonlyMap<string, string>): Promise<string[]> {
    const written: string[] = [];
    for (const [path, content] of files) {
      const target = join(this.record.path, path);
      if (await readFile(target, "utf8").catch(() => null) === content) continue;
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);
      written.push(path);
    }
    return written;
  }

  /** index.md for every knowledge folder, as the concepts on disk say. */
  private async regenerateIndexes(): Promise<string[]> {
    return this.writeFiles(await renderIndexes(this.record.path));
  }

  /**
   * OKF and ICM before a commit (plan §6.5): sources stay as they were,
   * concepts must be conformant, `generated` and `log.md` are filled in by
   * BonzaiWork, indexes follow the concepts, stage contracts must be whole.
   * Runs on the work tree; stage() picks the result up.
   */
  private async content(actor: "ai" | "own", note: string): Promise<{ blockedBy?: string }> {
    const changed = await this.changedFiles();
    this.warnings = [];
    const okf = await this.isFile(`${KNOWLEDGE}/index.md`);
    if (okf && changed.some((change) => isKnowledgePath(change.path))) {
      const by = actor === "ai" ? (this.options.producer ?? "bonzaiwork/0.1.0") : this.humanId();
      const at = new Date(this.now()).toISOString().replace(/\.\d{3}Z$/, "Z");
      const plan = await planKnowledge({ root: this.record.path, staged: changed, by, at, note, existed: (path) => this.inHead(path) });
      for (const path of plan.restore) {
        await this.run(["restore", "--source=HEAD", "--staged", "--worktree", "--", path]);
        this.warnings.push(`${path} is een bron en blijft zoals hij was; zet een nieuwe versie als nieuw bestand in references/.`);
      }
      if (plan.invalid.length) {
        const files = plan.invalid.map((item) => item.path);
        this.problem = { kind: "error", cause: "content", message: SYNC_MESSAGES.invalidKnowledge(files) };
        return { blockedBy: files[0] };
      }
      await this.writeFiles(plan.write);
      await this.regenerateIndexes();
    }
    const problems = [];
    for (const change of changed) {
      if (change.status === "D" || !isStageContract(change.path)) continue;
      const text = await readFile(join(this.record.path, change.path), "utf8").catch(() => null);
      if (text !== null) problems.push(...await checkContract(this.record.path, change.path, text));
    }
    if (problems.length) {
      this.problem = { kind: "error", cause: "content", message: SYNC_MESSAGES.brokenWorkflow(problems) };
      return { blockedBy: problems[0].path };
    }
    const readable = await Promise.all(changed.filter((change) => change.status !== "D" && (change.path === "AGENTS.md" || isKnowledgePath(change.path)))
      .map(async (change) => ({ path: change.path, content: await readFile(join(this.record.path, change.path), "utf8").catch(() => "") })));
    this.warnings.push(...contentWarnings(readable).map((warning) => `${warning.path}: ${warning.warning}`));
    return {};
  }

  /** What stage() would share now, with its status: tracked changes and new Markdown. */
  private async changedFiles(): Promise<StagedChange[]> {
    const changes: StagedChange[] = [];
    for (const path of splitNul(await this.ok(["ls-files", "-z", "--modified"]))) {
      changes.push({ path, status: await this.isFile(path) ? "M" : "D" });
    }
    for (const path of splitNul(await this.ok(["ls-files", "-z", "--others", "--exclude-standard"]))) {
      if (/\.md$/i.test(path)) changes.push({ path, status: "A" });
    }
    const seen = new Set<string>();
    return changes.filter((change) => !seen.has(change.path) && seen.add(change.path));
  }

  // --- updating ---------------------------------------------------------------

  private async fetch(): Promise<boolean> {
    const result = await this.run(["fetch", "--quiet", "--no-tags", "origin", `+refs/heads/${this.record.branch}:${this.remoteRef()}`], { timeoutMs: 30_000 });
    if (result.exitCode === 0 && !result.timedOut) return true;
    // A remote without commits yet has no branch to fetch.
    if (/couldn't find remote ref/i.test(result.stderr)) return true;
    this.problem = this.fail(classifyGitError(result.stderr, result.timedOut), result.stderr);
    if (this.problem.kind === "offline") this.scheduleRetry();
    return false;
  }

  private async integrate(): Promise<void> {
    const remote = await this.revParse(this.remoteRef());
    if (!remote) return;
    // Plan §7.4, laag 2: what was shared before must still be in what is shared now.
    const last = this.record.lastSyncedRemote;
    if (last && last !== remote && !await this.isAncestor(last, remote)) {
      this.problem = { kind: "error", cause: "history", message: SYNC_MESSAGES.historyRewritten };
      this.log("warn", "brain remote history was rewritten", { last, remote });
      return;
    }
    await this.applyTrust(this.remoteRef());
    const head = await this.revParse("HEAD");
    if (head && await this.isAncestor(remote, head)) {
      await this.persist({ lastSyncedRemote: remote });
      return;
    }
    if (!head || await this.isAncestor(head, remote)) {
      const merged = await this.run(["merge", "--ff-only", "--autostash", "-q", this.remoteRef()]);
      if (merged.exitCode !== 0) {
        this.problem = { kind: "conflict", message: SYNC_MESSAGES.conflict, files: await this.conflictFiles(), by: await this.lastAuthor() };
        return;
      }
      await this.persist({ lastSyncedRemote: remote });
      return;
    }
    const rebased = await this.run(["rebase", "-q", this.remoteRef()], { config: this.author() });
    if (rebased.exitCode !== 0 && !await this.resolveContentConflicts()) {
      const files = await this.conflictFiles();
      const by = await this.lastAuthor(files);
      await this.run(["rebase", "--abort"]);
      this.problem = { kind: "conflict", message: SYNC_MESSAGES.conflict, files, by };
      this.log("info", "brain update needs the user", { files });
      return;
    }
    await this.persist({ lastSyncedRemote: remote });
  }

  /**
   * The files everyone touches never conflict for the user (plan §4.5):
   * an index.md is generated again, a log.md keeps both sides per date.
   */
  private async resolveContentConflicts(): Promise<boolean> {
    for (let step = 0; step < 50; step += 1) {
      const files = await this.conflictFiles();
      if (!files.length || !files.every((file) => isKnowledgePath(file) && isReserved(file))) return false;
      for (const file of files.filter((path) => path.endsWith("log.md"))) {
        const ours = (await this.run(["show", `:2:${file}`])).stdout;
        const theirs = (await this.run(["show", `:3:${file}`])).stdout;
        await writeFile(join(this.record.path, file), mergeLogs(ours, theirs));
      }
      // Index files: whatever the conflict, they follow the concepts now on disk.
      for (const file of files.filter((path) => path.endsWith("index.md"))) await rm(join(this.record.path, file), { force: true });
      await this.regenerateIndexes();
      await this.ok(["add", "--", ...files]);
      const next = await this.run(["rebase", "--continue"], { config: { ...this.author(), "core.editor": "true" } });
      if (next.exitCode === 0 && !await this.rebaseInProgress()) {
        this.log("info", "brain index/log conflict resolved", { files });
        return true;
      }
    }
    return false;
  }

  private async rebaseInProgress(): Promise<boolean> {
    return (await stat(join(this.gitDir, "rebase-merge")).catch(() => null)) !== null
      || (await stat(join(this.gitDir, "rebase-apply")).catch(() => null)) !== null;
  }

  private async conflictFiles(): Promise<string[]> {
    return splitNul((await this.run(["diff", "--name-only", "-z", "--diff-filter=U"])).stdout);
  }

  private async lastAuthor(files: readonly string[] = []): Promise<string | null> {
    const result = await this.run(["log", "-1", "--format=%an", this.remoteRef(), "--", ...files]);
    return result.stdout.trim() || null;
  }

  /** Brings the folder up to date; local work is recorded first, nothing is lost (plan §4.2). */
  private async update(): Promise<void> {
    if (this.problem?.kind === "conflict") return;
    if (this.record.mode !== "read_only") {
      const own = await this.commitOwn();
      if (own.blockedBy) return;
    }
    // Without a remote there is nothing to fetch: history only (local_only).
    if (!this.record.remote) return;
    if (!await this.fetch()) return;
    if (this.problem?.kind === "offline") this.problem = null;
    await this.integrate();
  }

  // --- sharing ----------------------------------------------------------------

  private scheduleRetry(): void {
    if (this.retryTimer || this.disposed) return;
    const delays = this.options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS;
    const delay = delays[Math.min(this.retryIndex, delays.length - 1)];
    this.retryIndex += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.share().catch(() => undefined);
    }, delay);
    this.retryTimer.unref?.();
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.retryIndex = 0;
  }

  private async push(): Promise<boolean> {
    if (!this.record.remote || !await this.hasCommit("HEAD")) return false;
    for (let attempt = 0; attempt < MAX_PUSH_ATTEMPTS; attempt += 1) {
      const head = await this.revParse("HEAD");
      if (!head) return false;
      const last = this.record.lastSyncedRemote;
      if (last && !await this.isAncestor(last, head)) {
        this.problem = { kind: "error", cause: "history", message: SYNC_MESSAGES.historyRewritten };
        this.log("warn", "brain history no longer contains the last synced commit", { last, head });
        return false;
      }
      const remote = await this.revParse(this.remoteRef());
      if (remote === head) return true;
      const result = await this.run(["push", "--quiet", "--porcelain", "origin", `HEAD:refs/heads/${this.record.branch}`], { timeoutMs: 60_000 });
      if (result.exitCode === 0 && !result.timedOut) {
        await this.run(["update-ref", this.remoteRef(), head]);
        await this.persist({ lastSyncedRemote: head, lastSyncAt: this.now() });
        this.problem = null;
        this.clearRetry();
        return true;
      }
      const output = `${result.stdout}\n${result.stderr}`;
      const cause = classifyGitError(output, result.timedOut);
      if (cause !== "rejected") {
        this.problem = this.fail(cause, output);
        if (this.problem.kind === "offline") this.scheduleRetry();
        return false;
      }
      // Someone was first: take their work and try again.
      if (!await this.fetch()) return false;
      await this.integrate();
      if (this.problem) return false;
    }
    this.problem = this.fail("rejected", "push rejected after retries");
    return false;
  }

  // --- the moments of plan §2 -------------------------------------------------

  /**
   * UserPromptSubmit: just before a turn. Records the user's own changes and
   * updates the folder; never while a chat in this project runs (the caller
   * checks).
   */
  prepareTurn(): Promise<BrainStatus> {
    return this.lock(async () => {
      if (await this.guard()) await this.update();
      return this.statusNow();
    });
  }

  /** Periodic or on opening: fetch only, so the status can say "behind". */
  fetchOnly(): Promise<BrainStatus> {
    return this.lock(async () => {
      if (this.record.remote && await this.guard() && await this.fetch() && this.problem?.kind === "offline") this.problem = null;
      return this.statusNow();
    });
  }

  /** Stop: every chat in the project is quiet. Records the turn and, in auto mode, shares it. */
  finishTurn(turn: { title: string; chatId: string }): Promise<TurnResult & { status: BrainStatus }> {
    return this.lock(async () => {
      if (this.record.mode === "read_only" || !await this.guard()) return { committed: false, shared: false, status: await this.statusNow() };
      const title = turn.title.replace(/\s+/g, " ").trim() || "Chat";
      // A merge in progress is finished first, and only when no file holds two versions any more.
      if (await this.mergeInProgress() && !await this.finishMerge(turn.chatId)) return { committed: false, shared: false, status: await this.statusNow() };
      const result = await this.commit(`${title}\n\nVia BonzaiWork\n\nBonzaiWork-Chat: ${turn.chatId}\n`, "ai", title);
      let shared = false;
      if (!result.blockedBy && this.record.mode === "auto" && this.problem?.kind !== "conflict") shared = await this.push();
      return { ...result, shared, status: await this.statusNow() };
    });
  }

  /** "Wijzigingen delen" (manual mode), "Opnieuw proberen", and the offline retry. */
  share(): Promise<BrainStatus> {
    return this.lock(async () => {
      if (this.record.mode === "read_only" || !await this.guard()) return this.statusNow();
      if (this.problem?.kind === "conflict" && !(this.problem.merging && await this.finishMerge(null))) return this.statusNow();
      if (this.problem?.kind === "read_only" || this.problem?.kind === "offline") this.problem = null;
      const own = await this.commitOwn();
      if (!own.blockedBy) await this.push();
      return this.statusNow();
    });
  }

  /**
   * "Laat de AI het samenvoegen" (plan §4.5): merges the team's version without
   * committing, so both versions stand in the conflicting notes (between
   * <<<<<<< and >>>>>>>). A chat merges them; the turn's end finishes the merge.
   * index.md and log.md are merged here, as always.
   */
  startAiMerge(): Promise<{ files: string[]; by: string | null; prompt: string | null; status: BrainStatus }> {
    return this.lock(async () => {
      if (this.problem?.kind !== "conflict") return { files: [], by: null, prompt: null, status: await this.statusNow() };
      if (!await this.mergeInProgress()) {
        await this.run(["merge", "--no-ff", "--no-commit", "-q", this.remoteRef()], { config: this.author() });
        await this.mergeReserved();
      }
      const files = await this.conflictFiles();
      const by = this.problem.by ?? await this.lastAuthor(files);
      if (!files.length) {
        await this.finishMerge(null);
        if (this.record.mode === "auto") await this.push();
        return { files: [], by, prompt: null, status: await this.statusNow() };
      }
      this.problem = { kind: "conflict", message: SYNC_MESSAGES.merging, files, by, merging: true };
      this.log("info", "brain conflict handed to a chat", { files });
      return { files, by, prompt: mergePrompt(files, by), status: await this.statusNow() };
    });
  }

  private async mergeInProgress(): Promise<boolean> {
    return (await stat(join(this.gitDir, "MERGE_HEAD")).catch(() => null)) !== null;
  }

  /** index.md follows the concepts, log.md keeps both sides (as in a rebase). */
  private async mergeReserved(): Promise<void> {
    const files = (await this.conflictFiles()).filter((file) => isKnowledgePath(file) && isReserved(file));
    if (!files.length) return;
    for (const file of files.filter((path) => path.endsWith("log.md"))) {
      const ours = (await this.run(["show", `:2:${file}`])).stdout;
      const theirs = (await this.run(["show", `:3:${file}`])).stdout;
      await writeFile(join(this.record.path, file), mergeLogs(ours, theirs));
    }
    for (const file of files.filter((path) => path.endsWith("index.md"))) await rm(join(this.record.path, file), { force: true });
    await this.regenerateIndexes();
    await this.ok(["add", "--", ...files]);
  }

  /** Commits the merge once no conflicting note still holds two versions; false while one does. */
  private async finishMerge(chatId: string | null): Promise<boolean> {
    const files = await this.conflictFiles();
    const left: string[] = [];
    for (const file of files) {
      const content = await readFile(join(this.record.path, file), "utf8").catch(() => "");
      if (CONFLICT_MARKER.test(content)) left.push(file);
    }
    if (left.length) {
      const by = this.problem?.kind === "conflict" ? this.problem.by : null;
      this.problem = { kind: "conflict", message: SYNC_MESSAGES.mergeUnfinished(left.length), files: left, by, merging: true };
      return false;
    }
    if (files.length) await this.ok(["add", "--", ...files]);
    const trailer = chatId ? `\n\nBonzaiWork-Chat: ${chatId}` : "";
    await this.ok(["commit", "-q", "--no-verify", "-m", `Samengevoegd met de versie van het team\n\nVia BonzaiWork${trailer}\n`], { config: this.author() });
    await this.persist({ lastSyncedRemote: await this.revParse(this.remoteRef()) });
    this.problem = null;
    this.log("info", "brain merge finished", { files });
    return true;
  }

  /**
   * "Bewaar mijn versie apart" (plan §4.5): the local commits go to a branch
   * of their own on the server, the folder returns to the shared version.
   */
  keepMineApart(): Promise<{ branch: string | null; status: BrainStatus }> {
    return this.lock(async () => {
      if (this.problem?.kind !== "conflict") return { branch: null, status: await this.statusNow() };
      if (await this.mergeInProgress()) await this.run(["merge", "--abort"]);
      const { name, email } = this.options.author();
      const who = (email.split("@")[0] || name).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "gebruiker";
      const stamp = new Date(this.now()).toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
      const branch = `bonzaiwork/${who}/${stamp}`;
      const pushed = await this.run(["push", "--quiet", "origin", `HEAD:refs/heads/${branch}`], { timeoutMs: 60_000 });
      if (pushed.exitCode !== 0) {
        this.log("warn", "could not keep the local version apart", { stderr: pushed.stderr.trim().slice(-300) });
        return { branch: null, status: await this.statusNow() };
      }
      await this.applyTrust(this.remoteRef());
      await this.ok(["reset", "-q", "--hard", this.remoteRef()]);
      await this.persist({ lastSyncedRemote: await this.revParse(this.remoteRef()) });
      this.problem = null;
      return { branch, status: await this.statusNow() };
    });
  }

  /** "Herstellen": puts back the remote, branch and config BonzaiWork expects. */
  repair(): Promise<BrainStatus> {
    return this.lock(async () => {
      if (this.record.gitConfig !== null) await writeFile(join(this.gitDir, "config"), this.record.gitConfig);
      if (this.record.remote) await this.run(["remote", "set-url", "origin", this.record.remote]);
      const head = await this.run(["symbolic-ref", "--short", "-q", "HEAD"]);
      if (head.stdout.trim() !== this.record.branch) await this.run(["checkout", "-q", this.record.branch]);
      await this.rememberConfig();
      // A rewritten history is checked again on the next update: it stays stopped until the
      // shared history contains what was shared before (the administrator put it back).
      if (this.problem?.kind === "error") this.problem = null;
      return this.statusNow();
    });
  }

  setMode(mode: BrainMode): Promise<BrainStatus> {
    return this.lock(async () => {
      await this.persist({ mode });
      return this.statusNow();
    });
  }

  /** Read-only, so it does not wait: "syncing" while an operation runs. */
  status(): Promise<BrainStatus> {
    return this.statusNow(this.busy);
  }

  dispose(): void {
    this.disposed = true;
    this.clearRetry();
  }

  private humanId(): string {
    const { email, name } = this.options.author();
    return `human:${(email.split("@")[0] || name).replace(/\s+/g, ".")}`;
  }

  /** The trust step and status of one concept, for the sidebar. */
  async concept(path: string): Promise<ConceptView | null> {
    if (!isConceptPath(path) || path.includes("..")) return null;
    const text = await readFile(join(this.record.path, path), "utf8").catch(() => null);
    return text === null ? null : describeConcept(text, new Date(this.now()));
  }

  /**
   * "Klopt" (plan §6.2): the user confirms a concept. Its own commit, so
   * `generated` stays who wrote it; shared right away in auto mode.
   */
  verify(path: string): Promise<{ concept: ConceptView | null; status: BrainStatus }> {
    return this.lock(async () => {
      const view = await this.concept(path);
      if (!view || this.record.mode === "read_only" || !await this.guard()) return { concept: view, status: await this.statusNow() };
      const own = await this.commitOwn();
      if (own.blockedBy) return { concept: view, status: await this.statusNow() };
      const target = join(this.record.path, path);
      const at = new Date(this.now()).toISOString().replace(/\.\d{3}Z$/, "Z");
      await writeFile(target, withVerified(await readFile(target, "utf8"), this.humanId(), at));
      await this.ok(["add", "--", path]);
      await this.ok(["commit", "-q", "--no-verify", "-F", "-", "--", path], { input: `Nagekeken: ${view.title ?? path}\n\nVia BonzaiWork\n`, config: this.author() });
      if (this.record.mode === "auto") await this.push();
      return { concept: await this.concept(path), status: await this.statusNow() };
    });
  }

  /** "Zet deze notitie terug": the file as it was before `commit`, as a commit of its own. */
  restoreFile(commit: string, path: string): Promise<BrainStatus> {
    return this.lock(async () => {
      if (!/^[0-9a-f]{7,64}$/.test(commit) || path.includes("..") || !await this.guard()) return this.statusNow();
      await this.commitOwn();
      const before = await this.run(["cat-file", "-e", `${commit}^:${path}`]);
      if (before.exitCode === 0) await this.ok(["checkout", `${commit}^`, "--", path]);
      else await this.run(["rm", "-q", "--", path]);
      if ((await this.run(["diff", "--cached", "--quiet"])).exitCode === 1) {
        await this.ok(["commit", "-q", "--no-verify", "-F", "-"], { input: `Teruggezet: ${path}\n\nVia BonzaiWork\n`, config: this.author() });
        if (this.record.mode === "auto") await this.push();
      }
      return this.statusNow();
    });
  }

  /** "Draai deze beurt terug": undoes one commit with a new one; history keeps both. */
  revertCommit(commit: string): Promise<BrainStatus> {
    return this.lock(async () => {
      if (!/^[0-9a-f]{7,64}$/.test(commit) || !await this.guard()) return this.statusNow();
      await this.commitOwn();
      const subject = (await this.run(["log", "-1", "--format=%s", commit])).stdout.trim();
      const reverted = await this.run(["revert", "--no-commit", commit], { config: this.author() });
      if (reverted.exitCode !== 0) {
        await this.run(["revert", "--abort"]);
        this.warnings = [SYNC_MESSAGES.revertConflict];
        return this.statusNow();
      }
      await this.ok(["commit", "-q", "--no-verify", "-F", "-"], { input: `Teruggedraaid: ${subject}\n\nVia BonzaiWork\n`, config: this.author() });
      if (this.record.mode === "auto") await this.push();
      return this.statusNow();
    });
  }

  /**
   * Links a private repository to a brain that had history only (plan
   * §5.1): add the origin and send the history; then the same sync as a
   * project brain. The repository must be empty or have this history.
   */
  attachRemote(remote: string): Promise<BrainStatus> {
    return this.lock(async () => {
      if (this.record.remote || !await this.guard()) return this.statusNow();
      await this.commitOwn();
      await this.ok(["remote", "add", "origin", remote]);
      await this.persist({ remote, lastSyncedRemote: null });
      await this.rememberConfig();
      if (await this.fetch()) {
        if (await this.hasCommit(this.remoteRef())) await this.integrate();
        if (!this.problem) await this.push();
      }
      return this.statusNow();
    });
  }

  /** Sets up the brain template where it is missing (an empty repository), then shares it. */
  setUp(input: { name: string; description: string }): Promise<{ written: string[]; status: BrainStatus }> {
    return this.lock(async () => {
      if (!await this.guard()) return { written: [], status: await this.statusNow() };
      const result = await applyTemplate(this.record.path, { kind: this.record.kind, name: input.name, description: input.description, now: new Date(this.now()) });
      await this.commit("Brein ingericht\n\nVia BonzaiWork\n", "own", "brein ingericht");
      if (this.record.mode === "auto") await this.push();
      return { written: result.written, status: await this.statusNow() };
    });
  }

  /** The same brain under another id (a clone gets its workspace id once registered). */
  rebind(id: string): BrainSync {
    this.dispose();
    return new BrainSync({ ...this.options, record: { ...this.snapshot, id } });
  }

  /** Latest commits for "Geschiedenis": who, what, when, from which chat. */
  async history(limit = 30): Promise<HistoryEntry[]> {
    if (!await this.hasCommit("HEAD")) return [];
    // Record separator first: --name-only prints each commit's files after its header.
    const format = "%x1e%H%x1f%an%x1f%at%x1f%s%x1f%(trailers:key=BonzaiWork-Chat,valueonly,separator=)";
    const output = await this.ok(["log", `-n${Math.max(1, Math.min(limit, 200))}`, `--format=${format}`, "--name-only", "HEAD"]);
    return output.split("\x1e").map((chunk) => chunk.replace(/^\n+/, "")).filter(Boolean).map((chunk) => {
      const [header, ...rest] = chunk.split("\n");
      const [commit, author, at, title, chat] = header.split("\x1f");
      const files = rest.join("\n").split("\n").filter(Boolean);
      return { commit, author, at: Number(at) * 1000, title, chatId: chat?.trim() || null, files };
    });
  }

  private async statusNow(busy = false): Promise<BrainStatus> {
    let ahead = 0;
    let behind = 0;
    if (await this.hasCommit("HEAD")) {
      if (await this.hasCommit(this.remoteRef())) {
        const counts = (await this.run(["rev-list", "--left-right", "--count", `HEAD...${this.remoteRef()}`])).stdout.trim().split(/\s+/);
        ahead = Number(counts[0]) || 0;
        behind = Number(counts[1]) || 0;
      } else if (this.record.remote) {
        ahead = Number((await this.run(["rev-list", "--count", "HEAD"])).stdout.trim()) || 0;
      }
    }
    const problem = this.problem;
    const state: BrainState = busy && !problem ? "syncing"
      : problem?.kind === "conflict" ? "conflict"
        : problem?.kind === "error" ? "error"
          : problem?.kind === "read_only" ? "read_only"
            : problem?.kind === "offline" ? "offline"
              : this.pending.length ? "needs_trust"
                : !this.record.remote ? "local_only"
                  : this.record.mode === "read_only" ? (behind ? "behind" : "read_only")
                    : ahead ? "ahead" : behind ? "behind" : "synced";
    return {
      kind: this.record.kind,
      state,
      mode: this.record.mode,
      remote: this.record.remote,
      branch: this.record.branch,
      ahead,
      behind,
      lastSyncAt: this.record.lastSyncAt,
      conflictFiles: problem?.kind === "conflict" ? problem.files : [],
      conflictBy: problem?.kind === "conflict" ? problem.by : null,
      merging: problem?.kind === "conflict" && problem.merging === true,
      error: problem?.message ?? null,
      pendingTrust: this.pending,
      unshared: this.unshared,
      warnings: this.warnings,
      excluded: [...this.record.excluded],
    };
  }

  /** Called once after loading a brain: applies trust to what is checked out and remembers nothing new. */
  open(): Promise<BrainStatus> {
    return this.lock(async () => {
      await this.writeLocalExcludes();
      if (await this.mergeInProgress()) {
        const files = await this.conflictFiles();
        this.problem = { kind: "conflict", message: SYNC_MESSAGES.merging, files, by: await this.lastAuthor(files), merging: true };
      }
      if (await this.guard() && await this.hasCommit("HEAD")) {
        const ref = await this.hasCommit(this.remoteRef()) ? this.remoteRef() : "HEAD";
        await this.applyTrust(ref);
      }
      return this.statusNow();
    });
  }

  // --- adding a brain ---------------------------------------------------------

  /**
   * A personal brain in a folder that stays where it is (plan §5.1.1): the
   * history lives outside it (`gitDir`, in userData), no `.git` in the
   * vault, Markdown only, nothing ever sent until a remote is linked.
   */
  static async initLocal(input: Omit<BrainSyncOptions, "record"> & { id: string; path: string; gitDir: string; excluded?: readonly string[] }): Promise<BrainSync> {
    await mkdir(input.path, { recursive: true });
    await mkdir(dirname(input.gitDir), { recursive: true });
    const fresh = await readdir(input.gitDir).catch(() => null) === null;
    const sync = new BrainSync({
      ...input,
      record: {
        id: input.id, kind: "personal", path: input.path, gitDir: input.gitDir, mode: "auto", remote: null, branch: "main",
        trusted: {}, lastSyncedRemote: null, lastSyncAt: null, gitConfig: null, excluded: [...(input.excluded ?? [])],
      },
    });
    if (fresh) await sync.ok(["init", "-q", "-b", "main"]);
    await sync.writeLocalExcludes();
    await sync.rememberConfig();
    return sync;
  }

  /** What is in the folder now is the user's own: it counts as trusted (it ran before BonzaiWork anyway). */
  private async trustWhatIsThere(): Promise<void> {
    if (!await this.hasCommit("HEAD")) return;
    const items = await findTrustItems(await this.treeEntries("HEAD"), (blob) => this.ok(["cat-file", "-p", blob]));
    await this.persist({ trusted: { ...this.record.trusted, ...Object.fromEntries(items.map((item) => [item.path, item.blob])) } });
  }

  /**
   * "Als brein synchroniseren" (plan §4.1): a project folder that is a git
   * repository with an SSH remote becomes a project brain as it is. Nothing is
   * cloned or moved; what it holds now counts as trusted.
   */
  static async adopt(input: Omit<BrainSyncOptions, "record"> & { id: string; path: string; mode: BrainMode; allowFileProtocol?: boolean }): Promise<BrainSync> {
    const base = { cwd: input.path };
    const top = await input.git.run(["rev-parse", "--show-toplevel"], base);
    const gitDir = await input.git.run(["rev-parse", "--git-dir"], base);
    if (top.exitCode !== 0 || gitDir.stdout.trim() !== ".git") {
      throw new BrainCloneError("no_repository", "Deze map is geen git-repository (of hoort bij een andere map).");
    }
    const remote = (await input.git.run(["remote", "get-url", "origin"], base)).stdout.trim();
    if (!/^(git@|ssh:\/\/)/.test(remote) && !(input.allowFileProtocol && remote.startsWith("file://"))) {
      throw new BrainCloneError("not_ssh", "Deze repository heeft geen SSH-link. BonzaiWork deelt alleen via SSH.");
    }
    const branch = (await input.git.run(["symbolic-ref", "--short", "-q", "HEAD"], base)).stdout.trim();
    if (!branch) throw new BrainCloneError("no_repository", "Deze repository staat niet op een branch.");
    const sync = new BrainSync({
      ...input,
      record: { id: input.id, kind: "project", path: input.path, gitDir: null, mode: input.mode, remote, branch, trusted: {}, lastSyncedRemote: null, lastSyncAt: null, gitConfig: null, excluded: [] },
    });
    await sync.writeLocalExcludes();
    await sync.trustWhatIsThere();
    if (await sync.hasCommit(sync.remoteRef()) && await sync.isAncestor(sync.remoteRef(), "HEAD")) {
      await sync.persist({ lastSyncedRemote: await sync.revParse(sync.remoteRef()) });
    }
    await sync.rememberConfig();
    return sync;
  }

  /**
   * "Deel als nieuw brein": a project folder without git goes into an empty
   * repository. History starts here; what is in the folder counts as trusted.
   */
  static async publish(input: Omit<BrainSyncOptions, "record"> & { id: string; path: string; remote: string; timeoutMs?: number }): Promise<BrainSync> {
    if (await stat(join(input.path, ".git")).catch(() => null)) {
      throw new BrainCloneError("already_repository", "Deze map is al een git-repository; kies Als brein synchroniseren.");
    }
    const listed = await input.git.run(["ls-remote", "--heads", input.remote], { cwd: input.path, timeoutMs: input.timeoutMs ?? 60_000 });
    if (listed.exitCode !== 0 || listed.timedOut) {
      const problem = classifyGitError(listed.stderr, listed.timedOut);
      throw new BrainCloneError(problem, remoteProblemMessage(problem, input.platform));
    }
    if (listed.stdout.trim()) throw new BrainCloneError("remote_not_empty", "Deze repository is niet leeg. Haal hem op als gedeeld brein, of kies een lege repository.");
    const sync = new BrainSync({
      ...input,
      record: { id: input.id, kind: "project", path: input.path, gitDir: null, mode: "auto", remote: input.remote, branch: "main", trusted: {}, lastSyncedRemote: null, lastSyncAt: null, gitConfig: null, excluded: [] },
    });
    await sync.ok(["init", "-q", "-b", "main"]);
    await sync.ok(["remote", "add", "origin", input.remote]);
    await sync.writeLocalExcludes();
    await sync.rememberConfig();
    return sync;
  }

  /** After publish: the first commit, trust for what was there, and the first push. */
  firstShare(input: { name: string; description: string }): Promise<BrainStatus> {
    return this.lock(async () => {
      await applyTemplate(this.record.path, { kind: "project", name: input.name, description: input.description, now: new Date(this.now()) });
      await this.commit("Brein gedeeld\n\nVia BonzaiWork\n", "own", "brein gedeeld");
      await this.trustWhatIsThere();
      await this.push();
      return this.statusNow();
    });
  }

  /**
   * Plan §4.1: a full clone without checkout, the untrusted items excluded,
   * then the checkout. On failure nothing half is left behind.
   */
  static async clone(input: Omit<BrainSyncOptions, "record"> & {
    id: string; kind: BrainKind; mode: BrainMode; remote: string; path: string; timeoutMs?: number;
  }): Promise<BrainSync> {
    const existing = await readdir(input.path).catch(() => null);
    if (existing && existing.length) throw new BrainCloneError("not_empty", "Deze map bestaat al en is niet leeg. Kies een andere map.");
    const created = existing === null;
    const parent = dirname(input.path);
    await mkdir(parent, { recursive: true });
    const cloned = await input.git.run(["clone", "--quiet", "--no-checkout", "--origin", "origin", input.remote, input.path], { cwd: parent, timeoutMs: input.timeoutMs ?? 600_000 });
    if (cloned.exitCode !== 0 || cloned.timedOut) {
      await cleanUp(input.path, created);
      const problem = classifyGitError(cloned.stderr, cloned.timedOut);
      input.log?.("warn", "brain clone failed", { problem, stderr: cloned.stderr.trim().slice(-500) });
      throw new BrainCloneError(problem, remoteProblemMessage(problem, input.platform));
    }
    try {
      const base = { cwd: input.path };
      const head = await input.git.run(["symbolic-ref", "--short", "-q", "refs/remotes/origin/HEAD"], base);
      const branch = head.stdout.trim().replace(/^origin\//, "") || "main";
      const sync = new BrainSync({
        ...input,
        record: { id: input.id, kind: input.kind, path: input.path, gitDir: null, mode: input.mode, remote: input.remote, branch, trusted: {}, lastSyncedRemote: null, lastSyncAt: null, gitConfig: null, excluded: [] },
      });
      await sync.writeLocalExcludes();
      const remoteRef = `refs/remotes/origin/${branch}`;
      if ((await input.git.run(["rev-parse", "--verify", "-q", remoteRef], base)).exitCode === 0) {
        await sync.applyTrust(remoteRef);
        await input.git.ok(["checkout", "-q", "--no-track", "-B", branch, remoteRef], base);
        await sync.persist({ lastSyncedRemote: (await input.git.ok(["rev-parse", remoteRef], base)).trim(), lastSyncAt: input.now?.() ?? Date.now() });
      } else {
        // An empty repository: the first turn creates the first commit.
        await input.git.ok(["symbolic-ref", "HEAD", `refs/heads/${branch}`], base);
        await input.git.ok(["sparse-checkout", "set", "--no-cone", "--stdin"], { ...base, input: "/*\n" });
      }
      await sync.rememberConfig();
      return sync;
    } catch (error) {
      await cleanUp(input.path, created);
      if (error instanceof GitError) input.log?.("error", "brain clone setup failed", { stderr: error.result.stderr.trim().slice(-500) });
      throw new BrainCloneError("unknown", remoteProblemMessage("unknown", input.platform));
    }
  }
}

export class BrainCloneError extends Error {
  constructor(readonly problem: RemoteProblem | "not_empty" | "no_repository" | "not_ssh" | "remote_not_empty" | "already_repository", message: string) {
    super(message);
    this.name = "BrainCloneError";
  }
}

async function cleanUp(path: string, created: boolean): Promise<void> {
  if (created) {
    await rm(path, { recursive: true, force: true });
    return;
  }
  // The folder was there and empty: empty it again.
  for (const entry of await readdir(path).catch(() => [])) await rm(join(path, entry), { recursive: true, force: true });
}
