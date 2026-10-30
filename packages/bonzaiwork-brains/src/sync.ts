import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { GitError, type Git, type GitRunOptions } from "./git.ts";
import { remoteProblemMessage, SYNC_MESSAGES } from "./messages.ts";
import { scanForSecrets } from "./secrets.ts";
import { classifyGitError, type RemoteProblem } from "./ssh.ts";
import { findTrustItems, sparsePatterns, untrusted, withLocalExcludes, type TreeEntry, type TrustItem } from "./trust.ts";

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
  /** Dutch; the English git/ssh text only goes to the log. */
  error: string | null;
  /** Items waiting for the user's decision; they are not in the folder (needs_trust). */
  pendingTrust: TrustItem[];
  /** New files that were not shared by themselves (plan §4.3). */
  unshared: Unshared[];
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
};

type Problem =
  | { kind: "offline"; message: string }
  | { kind: "read_only"; message: string }
  | { kind: "conflict"; message: string; files: string[]; by: string | null }
  | { kind: "error"; message: string; cause: RemoteProblem | "secret" | "config" | "remote" | "branch" | "history" | "git" };

export type TurnResult = { committed: boolean; shared: boolean; blockedBy?: string };

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
    await writeFile(file, withLocalExcludes(await readFile(file, "utf8").catch(() => "")));
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

  private async commit(message: string): Promise<{ committed: boolean; blockedBy?: string }> {
    const { staged, blockedBy } = await this.stage();
    if (blockedBy) {
      this.problem = { kind: "error", cause: "secret", message: SYNC_MESSAGES.secret(blockedBy) };
      return { committed: false, blockedBy };
    }
    if (!staged) return { committed: false };
    await this.ok(["commit", "-q", "--no-verify", "-F", "-"], { input: message, config: this.author() });
    if (this.problem?.kind === "error" && this.problem.cause === "secret") this.problem = null;
    return { committed: true };
  }

  /** The user's own changes since the last turn (Obsidian, Finder), in a commit of their own. */
  private commitOwn(): Promise<{ committed: boolean; blockedBy?: string }> {
    return this.commit("Eigen wijzigingen\n\nVia BonzaiWork\n");
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
    if (rebased.exitCode !== 0) {
      const files = await this.conflictFiles();
      const by = await this.lastAuthor(files);
      await this.run(["rebase", "--abort"]);
      this.problem = { kind: "conflict", message: SYNC_MESSAGES.conflict, files, by };
      this.log("info", "brain update needs the user", { files });
      return;
    }
    await this.persist({ lastSyncedRemote: remote });
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
    if (!this.record.remote) return;
    if (this.problem?.kind === "conflict") return;
    if (this.record.mode !== "read_only") {
      const own = await this.commitOwn();
      if (own.blockedBy) return;
    }
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
      const result = await this.commit(`${title}\n\nVia BonzaiWork\n\nBonzaiWork-Chat: ${turn.chatId}\n`);
      let shared = false;
      if (!result.blockedBy && this.record.mode === "auto" && this.problem?.kind !== "conflict") shared = await this.push();
      return { ...result, shared, status: await this.statusNow() };
    });
  }

  /** "Wijzigingen delen" (manual mode), "Opnieuw proberen", and the offline retry. */
  share(): Promise<BrainStatus> {
    return this.lock(async () => {
      if (this.record.mode === "read_only" || this.problem?.kind === "conflict" || !await this.guard()) return this.statusNow();
      if (this.problem?.kind === "read_only" || this.problem?.kind === "offline") this.problem = null;
      const own = await this.commitOwn();
      if (!own.blockedBy) await this.push();
      return this.statusNow();
    });
  }

  /**
   * "Bewaar mijn versie apart" (plan §4.5): the local commits go to a branch
   * of their own on the server, the folder returns to the shared version.
   */
  keepMineApart(): Promise<{ branch: string | null; status: BrainStatus }> {
    return this.lock(async () => {
      if (this.problem?.kind !== "conflict") return { branch: null, status: await this.statusNow() };
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
      if (this.problem?.kind === "error" && this.problem.cause !== "history") this.problem = null;
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
      error: problem?.message ?? null,
      pendingTrust: this.pending,
      unshared: this.unshared,
    };
  }

  /** Called once after loading a brain: applies trust to what is checked out and remembers nothing new. */
  open(): Promise<BrainStatus> {
    return this.lock(async () => {
      await this.writeLocalExcludes();
      if (await this.guard() && await this.hasCommit("HEAD")) {
        const ref = await this.hasCommit(this.remoteRef()) ? this.remoteRef() : "HEAD";
        await this.applyTrust(ref);
      }
      return this.statusNow();
    });
  }

  // --- adding a brain ---------------------------------------------------------

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
        record: { id: input.id, kind: input.kind, path: input.path, gitDir: null, mode: input.mode, remote: input.remote, branch, trusted: {}, lastSyncedRemote: null, lastSyncAt: null, gitConfig: null },
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
  constructor(readonly problem: RemoteProblem | "not_empty", message: string) {
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
