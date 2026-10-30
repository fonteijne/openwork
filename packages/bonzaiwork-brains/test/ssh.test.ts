import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createGit } from "../src/git.ts";
import { remoteProblemMessage } from "../src/messages.ts";
import { parseRemote } from "../src/remote.ts";
import { BUNDLED_KNOWN_HOSTS, checkConnection, classifyGitError, ensureKnownHosts, sshCommand, systemSshPath, trustHostKeys, type RemoteProblem } from "../src/ssh.ts";

const has = (tool: string) => spawnSync("sh", ["-c", `command -v ${tool}`]).status === 0;

describe("meegeleverde host-sleutels", () => {
  // Fingerprints as GitHub and GitLab publish them in their documentation.
  const published = [
    "SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU", "SHA256:p2QAMXNIC1TJYWeIOttrVc98/R1BUFWu3/LiyKgUfQM",
    "SHA256:uNiVztksCsDhcc0u9e8BujQXVUpKZIDTMczCvj3tD2s", "SHA256:eUXGGm1YGsMAS7vkcx6JOJdOGHPem5gQp4taiCfCLB8",
    "SHA256:HbW3g8zUjNSksFbqTiUWPWg2Bq1x8xdGUrliXFzSnUw", "SHA256:ROQFvPThGrW4RuWLoL9tq9I9zJ42fK4XywyRtbOz/EQ",
  ];
  test.skipIf(!has("ssh-keygen"))("kloppen met de gepubliceerde vingerafdrukken", () => {
    const result = spawnSync("ssh-keygen", ["-l", "-f", "-"], { input: `${BUNDLED_KNOWN_HOSTS.join("\n")}\n`, encoding: "utf8" });
    const fingerprints = result.stdout.trim().split("\n").map((line) => line.split(" ")[1]);
    expect(fingerprints).toEqual(published);
  });

  test("ensureKnownHosts schrijft ze één keer", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kh-"));
    const file = join(dir, "known_hosts");
    await ensureKnownHosts(file);
    await trustHostKeys(file, "[eigen.gitlab]:2222 ssh-ed25519 AAAAC3Nza\n");
    await ensureKnownHosts(file);
    const lines = (await readFile(file, "utf8")).trim().split("\n");
    expect(lines).toHaveLength(BUNDLED_KNOWN_HOSTS.length + 1);
    await rm(dir, { recursive: true, force: true });
  });
});

describe("ssh-commando", () => {
  test("systeem-ssh per platform, nooit die van dugite", () => {
    expect(systemSshPath("win32", { WINDIR: "C:\\Windows" })).toBe("C:\\Windows\\System32\\OpenSSH\\ssh.exe");
    expect(systemSshPath("darwin", {})).toBe("/usr/bin/ssh");
    expect(systemSshPath("linux", {})).toBe("ssh");
  });

  test("paden met spaties en aanhalingstekens blijven heel", () => {
    const command = sshCommand({ platform: "win32", environment: { WINDIR: "C:\\Windows" }, knownHostsFile: "C:\\Users\\Jan's\\AppData\\Roaming\\BonzaiWork\\known_hosts" });
    expect(command).toBe(`'C:/Windows/System32/OpenSSH/ssh.exe' '-o' 'BatchMode=yes' '-o' 'StrictHostKeyChecking=yes' '-o' 'UserKnownHostsFile="C:/Users/Jan'\\''s/AppData/Roaming/BonzaiWork/known_hosts" ~/.ssh/known_hosts' '-o' 'ConnectTimeout=15'`);
    const mac = sshCommand({ platform: "darwin", knownHostsFile: "/Users/jan/Library/Application Support/BonzaiWork/known_hosts" });
    const parsed = spawnSync("sh", ["-c", `for a in ${mac}; do printf '%s\\n' "$a"; done`], { encoding: "utf8" }).stdout.trim().split("\n");
    expect(parsed).toContain('UserKnownHostsFile="/Users/jan/Library/Application Support/BonzaiWork/known_hosts" ~/.ssh/known_hosts');
  });
});

describe("foutmeldingen herkennen (fase 0 §2.1)", () => {
  const cases: Array<[string, RemoteProblem]> = [
    ["No ED25519 host key is known for [127.0.0.1]:2222 and you have requested strict checking.\nHost key verification failed.", "host_unknown"],
    ["@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @\nHost key verification failed.", "host_changed"],
    ["git@gitlab.com: Permission denied (publickey).\nfatal: Could not read from remote repository.", "no_access"],
    ["fatal: '/x.git' does not appear to be a git repository", "not_found"],
    ["ERROR: Repository not found.\nfatal: Could not read from remote repository.", "not_found"],
    ["remote: The project you were looking for could not be found or you don't have permission to view it.", "not_found"],
    ["remote: GitLab: You are not allowed to push code to protected branches on this project.\n ! [remote rejected] main -> main (pre-receive hook declined)\nerror: failed to push some refs", "read_only"],
    ["remote: error: GH006: Protected branch update failed for refs/heads/main.", "read_only"],
    ["ERROR: Permission to team/brein.git denied to jan.", "read_only"],
    [" ! [rejected]        HEAD -> main (fetch first)\nerror: failed to push some refs", "rejected"],
    ["ssh: Could not resolve hostname gitlab.com: Name or service not known", "offline"],
    ["ssh: connect to host 10.0.0.1 port 22: Connection refused", "unreachable"],
    ["error: cannot run ssh: No such file or directory", "ssh_missing"],
    ["iets anders", "unknown"],
  ];
  test.each(cases)("%#", (stderr, expected) => {
    expect(classifyGitError(stderr)).toBe(expected);
  });

  test("elke melding is Nederlands en zegt wat je kunt doen", () => {
    expect(remoteProblemMessage("key_locked", "win32")).toContain("OpenSSH Authentication Agent");
    expect(remoteProblemMessage("key_locked", "darwin")).toContain("sleutelhanger");
    expect(remoteProblemMessage("offline")).toContain("online");
  });
});

// Against a real sshd, like scripts/bonzaiwork/spikes/brains/ssh-matrix.sh.
const SSHD = ["/usr/sbin/sshd", "/usr/bin/sshd"].find((path) => existsSync(path));
function sshdStarts(): boolean {
  if (!SSHD || !["ssh", "ssh-keygen", "ssh-keyscan"].every(has)) return false;
  const probe = spawnSync("sh", ["-c", `d=$(mktemp -d) && ssh-keygen -q -t ed25519 -N '' -f "$d/k" && "${SSHD}" -t -f /dev/null -h "$d/k"; s=$?; rm -rf "$d"; exit $s`]);
  return probe.status === 0;
}
const sshdUsable = sshdStarts();

describe.skipIf(!sshdUsable)("tegen een echte sshd", () => {
  let dir = "";
  let sshd: ChildProcess | undefined;
  const port = 22_000 + Math.floor(Math.random() * 2000);
  const user = spawnSync("whoami", { encoding: "utf8" }).stdout.trim();

  const keygen = (file: string, passphrase = "") => spawnSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", passphrase, "-f", file, "-C", "test"]);

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "sshd-"));
    await mkdir(join(dir, "home/.ssh"), { recursive: true, mode: 0o700 });
    if (process.getuid?.() === 0) await mkdir("/run/sshd", { recursive: true });
    keygen(join(dir, "host"));
    keygen(join(dir, "home/.ssh/id_ed25519"));
    keygen(join(dir, "locked"), "geheim");
    keygen(join(dir, "other"));
    await writeFile(join(dir, "authorized_keys"), `${await readFile(join(dir, "home/.ssh/id_ed25519.pub"), "utf8")}${await readFile(join(dir, "locked.pub"), "utf8")}`);
    spawnSync("git", ["init", "-q", "--bare", join(dir, "repo.git")]);
    sshd = spawn(SSHD ?? "sshd", ["-D", "-e", "-f", "/dev/null", "-p", String(port), "-h", join(dir, "host"),
      "-o", `AuthorizedKeysFile=${join(dir, "authorized_keys")}`, "-o", "PermitRootLogin=prohibit-password", "-o", "StrictModes=no",
      "-o", "PasswordAuthentication=no", "-o", "KbdInteractiveAuthentication=no", "-o", `PidFile=${join(dir, "sshd.pid")}`], { stdio: "ignore" });
    await Bun.sleep(500);
  });

  afterAll(async () => {
    sshd?.kill();
    await rm(dir, { recursive: true, force: true });
  });

  const setup = async (identity: string | null) => {
    const knownHostsFile = join(dir, "bw_known_hosts");
    const options = {
      knownHostsFile, userKnownHostsFile: join(dir, "user_known_hosts"),
      environment: { PATH: process.env.PATH ?? "", HOME: join(dir, "home") },
      extraOptions: identity ? ["-o", "IdentitiesOnly=yes", "-i", identity] : [],
    };
    const git = await createGit({ stateDirectory: join(dir, "state"), sshCommand: sshCommand(options), environment: options.environment });
    const parsed = parseRemote(`ssh://${user}@127.0.0.1:${port}${join(dir, "repo.git")}`);
    if (!parsed.ok) throw new Error("bad remote");
    return { git, options: { ...options, cwd: dir }, remote: parsed.link };
  };

  test("onbekende host → vingerafdruk; na bevestigen → verbonden", async () => {
    const { git, options, remote } = await setup(join(dir, "home/.ssh/id_ed25519"));
    await writeFile(options.knownHostsFile, "");
    const first = await checkConnection(git, remote, options);
    expect(first.ok).toBe(false);
    if (first.ok) return;
    expect(first.problem).toBe("host_unknown");
    expect(first.host?.fingerprints[0]).toMatch(/SHA256:\S+ \[127\.0\.0\.1\]:\d+ \(ED25519\)/);
    await trustHostKeys(options.knownHostsFile, first.host?.lines ?? "");
    const second = await checkConnection(git, remote, options);
    expect(second).toEqual({ ok: true, defaultBranch: null, empty: true });
  });

  test("vergrendelde sleutel en geen toegang zijn uit elkaar te houden", async () => {
    const locked = await setup(join(dir, "locked"));
    const lockedCheck = await checkConnection(locked.git, locked.remote, locked.options);
    expect(lockedCheck.ok === false && lockedCheck.problem).toBe("key_locked");
    const other = await setup(join(dir, "other"));
    const otherCheck = await checkConnection(other.git, other.remote, other.options);
    expect(otherCheck.ok === false && otherCheck.problem).toBe("no_access");
  });
});
