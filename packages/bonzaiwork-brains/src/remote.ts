/**
 * Repository links (plan §3.2). People paste what their browser shows; git
 * only ever gets the SSH form. Nothing here opens a connection.
 */
export type RemoteLink = {
  /** What git uses: `git@host:path.git`, or `ssh://user@host:port/path.git` for another port. */
  sshUrl: string;
  host: string;
  port: number | null;
  user: string;
  /** `team/brein`, GitLab subgroups included, without `.git`. */
  path: string;
  /** Last path segment: the default folder name. */
  name: string;
};

export type RemoteParse = { ok: true; link: RemoteLink } | { ok: false; reason: "empty" | "unsupported" | "credentials" | "invalid" };

// GitHub and GitLab pages under a repository: /tree/main, /-/tree/main, /blob/..., /issues, ...
const REPO_PAGE = /\/(?:-\/)?(?:tree|blob|commits?|issues|pulls?|merge_requests|wiki|wikis|releases|tags|branches|actions|pipelines|settings)(?:\/.*)?$/;
const SEGMENT = /^[A-Za-z0-9._-]+$/;

function cleanPath(raw: string): string | null {
  const trimmed = raw.replace(/^\/+/, "").replace(/\/+$/, "").replace(REPO_PAGE, "").replace(/\/+$/, "").replace(/\.git$/, "");
  const segments = trimmed.split("/");
  if (segments.length < 2 || !segments.every((segment) => SEGMENT.test(segment) && segment !== "." && segment !== "..")) return null;
  return segments.join("/");
}

function link(user: string, host: string, port: number | null, path: string): RemoteLink {
  const lowerHost = host.toLowerCase();
  const sshUrl = port === null || port === 22
    ? `${user}@${lowerHost}:${path}.git`
    : `ssh://${user}@${lowerHost}:${port}/${path}.git`;
  return { sshUrl, host: lowerHost, port: port === 22 ? null : port, user, path, name: path.split("/").at(-1) ?? path };
}

const HOST = /^[A-Za-z0-9.-]+$/;

export function parseRemote(input: string): RemoteParse {
  const value = input.trim();
  if (!value) return { ok: false, reason: "empty" };

  // scp-like: git@gitlab.com:team/brein.git
  const scp = /^([A-Za-z0-9._-]+)@([A-Za-z0-9.-]+):(?!\/\/)(.+)$/.exec(value);
  if (scp) {
    const [, user, host, rawPath] = scp;
    const path = cleanPath(rawPath);
    return path && HOST.test(host) ? { ok: true, link: link(user, host, null, path) } : { ok: false, reason: "invalid" };
  }

  let url: URL;
  try {
    url = new URL(value.includes("://") ? value : `https://${value}`);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (url.password) return { ok: false, reason: "credentials" };
  if (!HOST.test(url.hostname)) return { ok: false, reason: "invalid" };
  const path = cleanPath(decodeURIComponent(url.pathname));
  if (!path) return { ok: false, reason: "invalid" };

  if (url.protocol === "ssh:" || url.protocol === "git+ssh:") {
    const port = url.port ? Number(url.port) : null;
    return { ok: true, link: link(url.username || "git", url.hostname, port, path) };
  }
  if (url.protocol === "https:" || url.protocol === "http:") {
    // A token in the link (https://oauth2:glpat-…@host/…) must never be kept.
    if (url.username) return { ok: false, reason: "credentials" };
    // Browser link: same host and path over SSH on its standard port. The web
    // port says nothing about the SSH port of a self-hosted GitLab.
    return { ok: true, link: link("git", url.hostname, null, path) };
  }
  return { ok: false, reason: "unsupported" };
}

/** `host` or `[host]:port`, as known_hosts and ssh-keyscan write it. */
export function knownHostsName(remote: Pick<RemoteLink, "host" | "port">): string {
  return remote.port === null ? remote.host : `[${remote.host}]:${remote.port}`;
}
