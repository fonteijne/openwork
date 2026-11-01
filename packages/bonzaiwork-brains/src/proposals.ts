import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

import { parseRemote } from "./remote.ts";

/**
 * "Via voorstel" (plan §4.4, fase 3): changes go to a branch of their own and
 * become a merge request (GitLab) or pull request (GitHub). BonzaiWork keeps
 * no tokens (B2): GitLab makes the merge request during the SSH push (push
 * options); for GitHub it uses the `gh` the user already has and is signed
 * in with. Without it, the app gives a link to open the proposal by hand.
 */
export type ProposalRequest = { remote: string; branch: string; base: string; title: string; body: string };
export type ProposalLink = { url: string | null; manual: boolean };

export type ProposalService = {
  /** `git push -o` options for this remote (GitLab makes the merge request during the push). */
  pushOptions(request: ProposalRequest): string[];
  /** After the push: the proposal's link, made with `gh` or read from the push output. */
  open(request: ProposalRequest & { pushOutput: string }): Promise<ProposalLink>;
};

export type CommandRunner = (command: string, args: readonly string[], environment: NodeJS.ProcessEnv) => Promise<{ code: number; stdout: string; stderr: string }>;

const runCommand: CommandRunner = (command, args, environment) => new Promise((resolve) => {
  const child = spawn(command, [...args], { env: environment, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let stdout = "";
  let stderr = "";
  const timer = setTimeout(() => child.kill("SIGKILL"), 60_000);
  child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
  child.on("error", (error) => { clearTimeout(timer); resolve({ code: -1, stdout, stderr: error.message }); });
  child.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? -1, stdout, stderr }); });
});

/**
 * The user's `gh`. An app started from the Dock or Finder does not get the
 * shell's PATH, so the usual install places are tried too.
 */
export function findGh(environment: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform): string | null {
  const explicit = environment.BONZAIWORK_GH?.trim();
  if (explicit) return existsSync(explicit) ? explicit : null;
  const name = platform === "win32" ? "gh.exe" : "gh";
  const fromPath = (environment.PATH ?? environment.Path ?? "").split(platform === "win32" ? ";" : delimiter).filter(Boolean).map((dir) => join(dir, name));
  const usual = platform === "darwin" ? ["/opt/homebrew/bin/gh", "/usr/local/bin/gh", "/opt/local/bin/gh"]
    : platform === "win32" ? [join(environment.ProgramFiles ?? "C:\\Program Files", "GitHub CLI", "gh.exe"), join(environment.LOCALAPPDATA ?? "", "Programs", "GitHub CLI", "gh.exe")]
      : ["/usr/bin/gh", "/usr/local/bin/gh", "/home/linuxbrew/.linuxbrew/bin/gh", "/snap/bin/gh"];
  return [...fromPath, ...usual].find((candidate) => existsSync(candidate)) ?? null;
}

/** What gh needs to find its own sign-in (config folder, keychain), and nothing of git's. */
function ghEnvironment(environment: NodeJS.ProcessEnv, gh: string): NodeJS.ProcessEnv {
  const keep = ["HOME", "USER", "LOGNAME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "ProgramData", "SystemRoot", "XDG_CONFIG_HOME", "GH_CONFIG_DIR", "GH_HOST", "LANG", "TMPDIR", "TEMP", "TMP"];
  const picked: NodeJS.ProcessEnv = Object.fromEntries(keep.flatMap((key) => (environment[key] ? [[key, environment[key]]] : [])));
  const system = process.platform === "win32" ? [] : ["/usr/bin", "/bin", "/usr/sbin", "/sbin"];
  return { ...picked, PATH: [gh.replace(/[\\/][^\\/]+$/, ""), ...system, environment.PATH ?? ""].filter(Boolean).join(delimiter), GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1", NO_COLOR: "1" };
}

const isGitHub = (host: string) => host === "github.com" || /(^|\.)github\./i.test(host);

function compareUrl(host: string, path: string, request: ProposalRequest): string {
  return `https://${host}/${path}/compare/${encodeURIComponent(request.base)}...${encodeURIComponent(request.branch)}?expand=1`;
}

export function createProposalService(options: { environment?: NodeJS.ProcessEnv; platform?: NodeJS.Platform; gh?: string | null; run?: CommandRunner } = {}): ProposalService {
  const environment = options.environment ?? process.env;
  const gh = options.gh !== undefined ? options.gh : findGh(environment, options.platform);
  const run = options.run ?? runCommand;
  return {
    pushOptions(request) {
      const link = parseRemote(request.remote);
      if (link.ok && isGitHub(link.link.host)) return [];
      // GitLab (gitlab.com or a team's own server); other servers say they do not support it and get a plain push.
      return ["merge_request.create", `merge_request.target=${request.base}`, `merge_request.title=${request.title.replace(/[\r\n]+/g, " ").slice(0, 200)}`, "merge_request.remove_source_branch"];
    },
    async open(request) {
      const link = parseRemote(request.remote);
      if (!link.ok) return { url: null, manual: true };
      const { host, path } = link.link;
      if (!isGitHub(host)) {
        const made = /https?:\/\/\S+\/-\/merge_requests\/\d+/.exec(request.pushOutput)?.[0];
        if (made) return { url: made, manual: false };
        const fresh = /https?:\/\/\S+\/-\/merge_requests\/new\S*/.exec(request.pushOutput)?.[0];
        return { url: fresh ?? `https://${host}/${path}/-/merge_requests/new?${new URLSearchParams({ "merge_request[source_branch]": request.branch, "merge_request[target_branch]": request.base })}`, manual: true };
      }
      if (!gh) return { url: compareUrl(host, path, request), manual: true };
      const repo = host === "github.com" ? path : `${host}/${path}`;
      const result = await run(gh, ["pr", "create", "--repo", repo, "--head", request.branch, "--base", request.base, "--title", request.title, "--body", request.body], ghEnvironment(environment, gh));
      const url = /https?:\/\/\S+\/pull\/\d+/.exec(`${result.stdout}\n${result.stderr}`)?.[0];
      // "already exists" also names the pull request: the next turn updates it by pushing.
      return url ? { url, manual: false } : { url: compareUrl(host, path, request), manual: true };
    },
  };
}
