import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { createGit, type Git, type GitResult } from "../src/git.ts";
import { BrainSync, type BrainMode, type BrainRecord } from "../src/sync.ts";

/**
 * A bare repository as the "server" and clones as users (plan §11): real git
 * over file://, since SSH plays no part in the sync logic.
 */
export type World = {
  root: string;
  bare: string;
  url: string;
  git: Git;
  /** Commits files straight onto the server, as a teammate outside BonzaiWork would. */
  seed(files: Record<string, string>, message?: string): Promise<void>;
  /** Raw git in a scratch clone (for force-pushes and other things BonzaiWork never does). */
  raw(args: readonly string[], cwd?: string): Promise<GitResult>;
  user(name: string, options?: { mode?: BrainMode; git?: Git; retryDelaysMs?: number[]; sizeLimitBytes?: number }): Promise<User>;
  dispose(): Promise<void>;
};

export type User = {
  sync: BrainSync;
  path: string;
  saved: BrainRecord[];
  write(path: string, content: string): Promise<void>;
};

export async function createWorld(options: { empty?: boolean } = {}): Promise<World> {
  const root = await mkdtemp(join(tmpdir(), "bonzaiwork-brains-"));
  // BONZAIWORK_GIT_DIRECTORY runs the suite on the git the app ships (scripts/bonzaiwork/fetch-git.mjs).
  const git = await createGit({ stateDirectory: join(root, "state"), allowFileProtocol: true, gitDirectory: process.env.BONZAIWORK_GIT_DIRECTORY || undefined });
  const bare = join(root, "server.git");
  await git.ok(["init", "-q", "--bare", "-b", "main", bare], { cwd: root });
  const url = `file://${bare}`;
  const scratch = join(root, "scratch");
  const identity = { "user.name": "Teamlid", "user.email": "teamlid@example.invalid" };
  const raw = (args: readonly string[], cwd = scratch) => git.run(args, { cwd, config: identity });

  const seed: World["seed"] = async (files, message = "seed") => {
    await rm(scratch, { recursive: true, force: true });
    await git.ok(["clone", "-q", url, scratch], { cwd: root });
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(scratch, path)), { recursive: true });
      await writeFile(join(scratch, path), content);
    }
    await git.ok(["add", "-A"], { cwd: scratch });
    await git.ok(["commit", "-q", "-m", message], { cwd: scratch, config: identity });
    await git.ok(["push", "-q", "origin", "HEAD:refs/heads/main"], { cwd: scratch });
  };
  // A plain repository; test/okf.test.ts seeds an OKF bundle where it needs one.
  if (!options.empty) await seed({ "AGENTS.md": "# Team\n" });

  return {
    root, bare, url, git, seed, raw,
    async user(name, userOptions = {}) {
      const path = join(root, name);
      const saved: BrainRecord[] = [];
      const sync = await BrainSync.clone({
        git: userOptions.git ?? git,
        id: name,
        kind: "project",
        mode: userOptions.mode ?? "auto",
        remote: url,
        path,
        author: () => ({ name, email: `${name.toLowerCase()}@example.invalid` }),
        save: async (record) => { saved.push(record); },
        retryDelaysMs: userOptions.retryDelaysMs ?? [60_000],
        ...(userOptions.sizeLimitBytes ? { sizeLimitBytes: userOptions.sizeLimitBytes } : {}),
      });
      await sync.open();
      return {
        sync, path, saved,
        async write(file, content) {
          await mkdir(dirname(join(path, file)), { recursive: true });
          await writeFile(join(path, file), content);
        },
      };
    },
    async dispose() { await rm(root, { recursive: true, force: true }); },
  };
}

/** Wraps a git so that chosen calls fail the way a server or network would. */
export function failing(git: Git, failure: (args: readonly string[]) => GitResult | null): Git {
  return {
    run: async (args, options) => failure(args) ?? git.run(args, options),
    ok: async (args, options) => {
      const injected = failure(args);
      if (injected) throw new Error(injected.stderr);
      return git.ok(args, options);
    },
  };
}

export const fail = (stderr: string): GitResult => ({ exitCode: 1, stdout: "", stderr, timedOut: false });
