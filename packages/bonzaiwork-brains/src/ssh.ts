import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { Git } from "./git.ts";
import { knownHostsName, type RemoteLink } from "./remote.ts";

/**
 * SSH with the keys, ~/.ssh/config and agent the user already has (plan
 * §3.2; fase 0 §2). BonzaiWork never reads, copies or stores a key.
 */

/**
 * Published host keys of github.com and gitlab.com, checked against the
 * fingerprints both publish (test/ssh.test.ts). A changed key stops the sync.
 */
export const BUNDLED_KNOWN_HOSTS = [
  "github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl",
  "github.com ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBEmKSENjQEezOmxkZMy7opKgwFB9nkt5YRrYMjNuG5N87uRgg6CLrbo5wAdT/y6v0mKV0U2w0WZ2YB/++Tpockg=",
  "github.com ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCj7ndNxQowgcQnjshcLrqPEiiphnt+VTTvDP6mHBL9j1aNUkY4Ue1gvwnGLVlOhGeYrnZaMgRK6+PKCUXaDbC7qtbW8gIkhL7aGCsOr/C56SJMy/BCZfxd1nWzAOxSDPgVsmerOBYfNqltV9/hWCqBywINIR+5dIg6JTJ72pcEpEjcYgXkE2YEFXV1JHnsKgbLWNlhScqb2UmyRkQyytRLtL+38TGxkxCflmO+5Z8CSSNY7GidjMIZ7Q4zMjA2n1nGrlTDkzwDCsw+wqFPGQA179cnfGWOWRVruj16z6XyvxvjJwbz0wQZ75XK5tKSb7FNyeIEs4TT4jk+S4dhPeAUC5y+bDYirYgM4GC7uEnztnZyaVWQ7B381AK4Qdrwt51ZqExKbQpTUNn+EjqoTwvqNj4kqx5QUCI0ThS/YkOxJCXmPUWZbhjpCg56i+2aB6CmK2JGhn57K5mj0MNdBXA4/WnwH6XoPWJzK5Nyu2zB3nAZp+S5hpQs+p1vN1/wsjk=",
  "gitlab.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAfuCHKVTjquxvt6CM6tdG4SLp1Btn/nOeHHE5UOzRdf",
  "gitlab.com ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBFSMqzJeV9rUzU4kWitGjeR4PWSa29SPqJ1fVkhtj3Hw9xjLVXVYrU9QlYWrOLXBpQ6KWjbjTDTdDkoohFzgbEY=",
  "gitlab.com ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCsj2bNKTBSpIYDEGk9KxsGh3mySTRgMtXL583qmBpzeQ+jqCMRgBqB98u3z++J1sKlXHWfM9dyhSevkMwSbhoR8XIq/U0tCNyokEi/ueaBMCvbcTHhO7FcwzY92WK4Yt0aGROY5qX2UKSeOvuP4D6TPqKF1onrSzH9bx9XUf2lEdWT/ia1NEKjunUqu1xOB/StKDHMoX4/OKyIzuS0q/T1zOATthvasJFoPrAjkohTyaDUz2LN5JoH839hViyEG82yB+MjcFV5MU3N1l1QL3cVUCh93xSaua1N85qivl+siMkPGbO5xR/En4iEY6K2XPASUEMaieWVNTRCtJ4S8H+9",
];

/** The system OpenSSH client: never the MSYS ssh dugite brings on Windows (fase 0 §2.3). */
export function systemSshPath(platform: NodeJS.Platform, environment: NodeJS.ProcessEnv): string {
  if (platform === "win32") {
    const windows = environment.WINDIR ?? environment.windir ?? environment.SystemRoot ?? "C:\\Windows";
    return `${windows}\\System32\\OpenSSH\\ssh.exe`;
  }
  return platform === "darwin" ? "/usr/bin/ssh" : "ssh";
}

/** Single-quoted for the POSIX shell git runs GIT_SSH_COMMAND through (MSYS sh on Windows too). */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/** ssh_config quoting inside one -o value. */
function configQuote(value: string): string {
  return `"${value.replaceAll("\\", "/")}"`;
}

export type SshOptions = {
  /** BonzaiWork's own known_hosts (userData/bonzaiwork/known_hosts), checked before the user's. */
  knownHostsFile: string;
  platform?: NodeJS.Platform;
  environment?: NodeJS.ProcessEnv;
  /** Tests: another ssh binary or the user's known_hosts elsewhere. */
  sshPath?: string;
  userKnownHostsFile?: string;
  extraOptions?: readonly string[];
  connectTimeoutSeconds?: number;
};

export function sshArguments(options: SshOptions): string[] {
  const user = options.userKnownHostsFile ?? "~/.ssh/known_hosts";
  return [
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=yes",
    "-o", `UserKnownHostsFile=${configQuote(options.knownHostsFile)} ${user.startsWith("~") ? user : configQuote(user)}`,
    "-o", `ConnectTimeout=${options.connectTimeoutSeconds ?? 15}`,
    ...(options.extraOptions ?? []),
  ];
}

/** GIT_SSH_COMMAND for {@link createGit}. */
export function sshCommand(options: SshOptions): string {
  const platform = options.platform ?? process.platform;
  const binary = (options.sshPath ?? systemSshPath(platform, options.environment ?? process.env)).replaceAll("\\", "/");
  return [binary, ...sshArguments(options)].map(shellQuote).join(" ");
}

/** Writes the bundled keys once; the user's confirmed hosts are appended after them. */
export async function ensureKnownHosts(file: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const current = await readFile(file, "utf8").catch(() => "");
  const missing = BUNDLED_KNOWN_HOSTS.filter((line) => !current.includes(line));
  if (missing.length) await writeFile(file, `${current}${current && !current.endsWith("\n") ? "\n" : ""}${missing.join("\n")}\n`);
}

/** Stores the keys of a host after the user compared its fingerprint (`trust-host` route). */
export async function trustHostKeys(file: string, scannedLines: string): Promise<void> {
  const lines = scannedLines.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  if (lines.length) await appendFile(file, `${lines.join("\n")}\n`);
}

type Exec = { exitCode: number; stdout: string; stderr: string };

function exec(binary: string, args: readonly string[], input: string, timeoutMs: number, environment: NodeJS.ProcessEnv): Promise<Exec> {
  return new Promise((resolve) => {
    const child = spawn(binary, args, { env: environment, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timer); resolve({ exitCode: -1, stdout, stderr: error.message }); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ exitCode: code ?? -1, stdout, stderr }); });
    child.stdin.on("error", () => { /* closed early */ });
    child.stdin.end(input);
  });
}

function sibling(sshPath: string, tool: string): string {
  // ssh-keyscan and ssh-keygen live next to ssh (System32\OpenSSH, /usr/bin).
  return sshPath.includes("/") || sshPath.includes("\\")
    ? join(dirname(sshPath), sshPath.endsWith(".exe") ? `${tool}.exe` : tool)
    : tool;
}

export type ScannedHost = { lines: string; fingerprints: string[] };

/** The keys an unknown host offers and their SHA256 fingerprints, for the confirmation step. */
export async function scanHostKeys(remote: Pick<RemoteLink, "host" | "port">, options: SshOptions): Promise<ScannedHost | null> {
  const platform = options.platform ?? process.platform;
  const environment = options.environment ?? process.env;
  const ssh = options.sshPath ?? systemSshPath(platform, environment);
  const scan = await exec(sibling(ssh, "ssh-keyscan"), ["-T", "10", ...(remote.port ? ["-p", String(remote.port)] : []), "-t", "ed25519,ecdsa,rsa", remote.host], "", 20_000, environment);
  const lines = scan.stdout.split("\n").filter((line) => line.trim() && !line.startsWith("#")).join("\n");
  if (!lines) return null;
  const keygen = await exec(sibling(ssh, "ssh-keygen"), ["-l", "-f", "-"], `${lines}\n`, 10_000, environment);
  const fingerprints = keygen.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  return { lines, fingerprints };
}

export type RemoteProblem =
  | "host_unknown" | "host_changed" | "no_access" | "key_locked" | "not_found" | "read_only"
  | "rejected" | "unreachable" | "offline" | "ssh_missing" | "unknown";

/** Recognises git/ssh stderr (LC_ALL=C), most specific first (fase 0 §2.1). */
export function classifyGitError(stderr: string, timedOut = false): RemoteProblem {
  if (/REMOTE HOST IDENTIFICATION HAS CHANGED/.test(stderr)) return "host_changed";
  if (/host key is known for|Host key verification failed/i.test(stderr)) return "host_unknown";
  if (/cannot run .*ssh|ssh(?:\.exe)?: (?:command )?not found|spawn .*ssh.* ENOENT/i.test(stderr)) return "ssh_missing";
  if (/Permission denied \(publickey/i.test(stderr)) return "no_access";
  if (/You are not allowed to (?:force )?push|protected branch|GH006|pre-receive hook declined|Permission to .* denied|access denied|denied to /i.test(stderr)) return "read_only";
  if (/does not appear to be a git repository|Repository not found|could not be found|project you were looking for/i.test(stderr)) return "not_found";
  if (/\[rejected\]|non-fast-forward|fetch first|Updates were rejected/i.test(stderr)) return "rejected";
  if (/Could not resolve hostname|Name or service not known|nodename nor servname|Temporary failure in name resolution|Network is unreachable/i.test(stderr)) return "offline";
  if (timedOut || /Connection refused|Connection timed out|Operation timed out|No route to host|Connection reset|Connection closed by/i.test(stderr)) return "unreachable";
  return "unknown";
}

export type ConnectionCheck =
  | { ok: true; defaultBranch: string | null; empty: boolean }
  | { ok: false; problem: RemoteProblem; detail: string; host?: ScannedHost | null };

/**
 * "Verbinding testen" (plan §3.2): `git ls-remote` over SSH. When access is
 * denied, one `ssh -v` run tells a locked key (the server accepted a key the
 * client then could not use) from a key without access (fase 0 §2.1.1).
 */
export async function checkConnection(git: Git, remote: RemoteLink, options: SshOptions & { cwd: string }): Promise<ConnectionCheck> {
  const result = await git.run(["ls-remote", "--symref", remote.sshUrl, "HEAD"], { cwd: options.cwd, timeoutMs: 30_000 });
  if (result.exitCode === 0 && !result.timedOut) {
    const branch = /^ref: refs\/heads\/(\S+)\s+HEAD$/m.exec(result.stdout)?.[1] ?? null;
    return { ok: true, defaultBranch: branch, empty: result.stdout.trim() === "" };
  }
  let problem = classifyGitError(result.stderr, result.timedOut);
  if (problem === "no_access" && await keyLocked(remote, options)) problem = "key_locked";
  const host = problem === "host_unknown" ? await scanHostKeys(remote, options) : undefined;
  return { ok: false, problem, detail: result.stderr.trim().split("\n").slice(-3).join("\n"), ...(host === undefined ? {} : { host }) };
}

async function keyLocked(remote: RemoteLink, options: SshOptions): Promise<boolean> {
  const platform = options.platform ?? process.platform;
  const environment = options.environment ?? process.env;
  const ssh = options.sshPath ?? systemSshPath(platform, environment);
  const args = ["-v", "-T", ...sshArguments(options), ...(remote.port ? ["-p", String(remote.port)] : []), `${remote.user}@${remote.host}`];
  const probe = await exec(ssh, args, "", 25_000, environment);
  // Only the pattern is used; the debug output (paths, fingerprints) is never logged.
  return /Server accepts key/.test(probe.stderr) && /Permission denied/.test(probe.stderr);
}

export { knownHostsName };
