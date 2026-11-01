import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Every git call BonzaiWork makes (plan §3.1, §7.4; fase 0 §1.3, §6.5).
 *
 * Git runs isolated from whatever the user's machine configures: a built
 * environment instead of process.env (no GIT_CONFIG_*, GIT_ASKPASS, ...), no
 * system or global config of the user, and command-line options that come
 * before the repository's own config so a hook, fsmonitor or signing setting
 * in `.git` never runs code. Only ssh:// remotes work (B2); file:// only when
 * a test asks for it.
 */
export type GitResult = { exitCode: number; stdout: string; stderr: string; timedOut: boolean };

export type GitRunOptions = {
  cwd: string;
  input?: string;
  timeoutMs?: number;
  /** Repository folder outside the work tree (personal brain, plan §5.1.1). */
  gitDir?: string;
  workTree?: string;
  /** Extra `-c key=value` options for this call only. */
  config?: Record<string, string>;
};

export type Git = {
  run(args: readonly string[], options: GitRunOptions): Promise<GitResult>;
  /** Runs and throws a {@link GitError} unless git exits 0. */
  ok(args: readonly string[], options: GitRunOptions): Promise<string>;
};

export type GitOptions = {
  /** The dugite-native folder shipped with the app; git from PATH when absent (development, tests). */
  gitDirectory?: string;
  /** BonzaiWork's own git state (userData/bonzaiwork/git): its global config and an empty hooks folder. */
  stateDirectory: string;
  /** GIT_SSH_COMMAND, see ssh.ts. */
  sshCommand?: string;
  /** Tests only: allow file:// remotes. */
  allowFileProtocol?: boolean;
  environment?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  arch?: string;
  timeoutMs?: number;
};

export class GitError extends Error {
  constructor(readonly args: readonly string[], readonly result: GitResult) {
    super(`git ${args[0] ?? ""} failed (${result.timedOut ? "timeout" : `exit ${result.exitCode}`}): ${result.stderr.trim().split("\n").slice(-3).join(" ")}`);
    this.name = "GitError";
  }
}

// What git needs from the machine; nothing that changes what git does.
const INHERITED = [
  "PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "LC_CTYPE", "TZ",
  "SSH_AUTH_SOCK", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "USERPROFILE", "HOMEDRIVE", "HOMEPATH",
  "APPDATA", "LOCALAPPDATA", "ProgramData",
];

/** Options every call gets; command-line `-c` wins over the repository's `.git/config`. */
export function safetyConfig(hooksDirectory: string, allowFileProtocol = false): Record<string, string> {
  return {
    "core.hooksPath": hooksDirectory,
    "core.fsmonitor": "false",
    "core.autocrlf": "false",
    "core.quotePath": "false",
    "commit.gpgsign": "false",
    "tag.gpgsign": "false",
    "filter.lfs.required": "false",
    "filter.lfs.clean": "",
    "filter.lfs.smudge": "",
    "filter.lfs.process": "",
    "credential.helper": "",
    "advice.updateSparsePath": "false",
    "protocol.allow": "never",
    "protocol.ssh.allow": "always",
    ...(allowFileProtocol ? { "protocol.file.allow": "always" } : {}),
  };
}

/** Binary and environment for the shipped dugite-native folder, as dugite itself sets them up. */
export function bundledGit(directory: string, platform: NodeJS.Platform, arch: string, path: string): { binary: string; env: Record<string, string> } {
  if (platform === "win32") {
    const sub = arch === "arm64" ? "clangarm64" : arch === "x64" ? "ucrt64" : "mingw32";
    return {
      binary: join(directory, "cmd", "git.exe"),
      env: {
        PATH: `${join(directory, sub, "bin")};${join(directory, sub, "usr", "bin")};${path}`,
        GIT_EXEC_PATH: join(directory, sub, "libexec", "git-core"),
      },
    };
  }
  return {
    binary: join(directory, "bin", "git"),
    env: {
      PATH: path,
      GIT_EXEC_PATH: join(directory, "libexec", "git-core"),
      GIT_TEMPLATE_DIR: join(directory, "share", "git-core", "templates"),
      ...(platform === "linux" ? { PREFIX: directory } : {}),
    },
  };
}

export async function createGit(options: GitOptions): Promise<Git> {
  const platform = options.platform ?? process.platform;
  const source = options.environment ?? process.env;
  const hooks = join(options.stateDirectory, "no-hooks");
  const globalConfig = join(options.stateDirectory, "gitconfig");
  await mkdir(hooks, { recursive: true });
  // An empty global config: user.name/email are passed per commit.
  await writeFile(globalConfig, "", { flag: "a" });

  const inherited: Record<string, string> = {};
  for (const name of INHERITED) {
    // Windows spells some names differently (Path, windir); match any case.
    const key = Object.keys(source).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    const value = key === undefined ? undefined : source[key];
    if (value !== undefined) inherited[name] = value;
  }
  const bundled = options.gitDirectory
    ? bundledGit(options.gitDirectory, platform, options.arch ?? process.arch, inherited.PATH ?? "")
    : null;
  const binary = bundled?.binary ?? "git";
  const baseEnv: Record<string, string> = {
    ...inherited,
    ...bundled?.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_OPTIONAL_LOCKS: "0",
    LC_ALL: "C",
    ...(options.sshCommand ? { GIT_SSH_COMMAND: options.sshCommand } : {}),
  };
  const always = safetyConfig(hooks, options.allowFileProtocol);

  const run: Git["run"] = (args, runOptions) => new Promise((resolve) => {
    const config = { ...always, ...runOptions.config };
    const prefix = Object.entries(config).flatMap(([key, value]) => ["-c", `${key}=${value}`]);
    const env = {
      ...baseEnv,
      ...(runOptions.gitDir ? { GIT_DIR: runOptions.gitDir } : {}),
      ...(runOptions.workTree ? { GIT_WORK_TREE: runOptions.workTree } : {}),
    };
    const child = spawn(binary, [...prefix, ...args], { cwd: runOptions.cwd, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, runOptions.timeoutMs ?? options.timeoutMs ?? 60_000);
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ exitCode: -1, stdout, stderr: `${stderr}${error.message}`, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? -1, stdout, stderr, timedOut });
    });
    child.stdin.on("error", () => { /* git may exit before reading its input */ });
    child.stdin.end(runOptions.input ?? "");
  });

  return {
    run,
    async ok(args, runOptions) {
      const result = await run(args, runOptions);
      if (result.exitCode !== 0 || result.timedOut) throw new GitError(args, result);
      return result.stdout;
    },
  };
}
