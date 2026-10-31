/**
 * Links in chat answers that point at a file in the project, such as
 * `[Strategie](Notes/Strategie.md)` or an absolute path the agent wrote out.
 * They open in the side panel instead of outside the app.
 */

const MARKDOWN = /\.(md|markdown|mdx)$/i;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const DRIVE = /^[a-z]:\//i;

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function slashes(value: string): string {
  return value.replace(/\\/g, "/");
}

/** `/C:/x` (from a file URL) back to `C:/x`; other paths unchanged. */
function dropDriveSlash(value: string): string {
  return /^\/[a-z]:\//i.test(value) ? value.slice(1) : value;
}

function isAbsolute(value: string): boolean {
  return value.startsWith("/") || DRIVE.test(value);
}

/** Resolve `.` and `..`; null when the path climbs above its root. */
function normalizeSegments(path: string): string | null {
  const out: string[] = [];
  for (const segment of path.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (!out.length) return null;
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.length ? out.join("/") : null;
}

/**
 * A path as the agent or a tool wrote it (absolute, `./relative` or relative)
 * to a path relative to the project folder. Null when it lies outside the
 * project. `baseDir` is the project-relative folder that relative paths start
 * from, such as the folder of the file a link appears in.
 */
export function projectRelativePath(path: string, projectPath: string, baseDir = ""): string | null {
  const target = dropDriveSlash(slashes(path.trim()));
  if (!target) return null;
  if (!isAbsolute(target)) return normalizeSegments(baseDir ? `${baseDir}/${target}` : target);

  const root = slashes(projectPath).replace(/\/+$/, "");
  if (!root) return null;
  // Windows paths compare without regard to case, like the file system does.
  const windows = DRIVE.test(root);
  const same = (a: string, b: string) => (windows ? a.toLowerCase() === b.toLowerCase() : a === b);
  const normalizedTarget = normalizeSegments(target);
  const normalizedRoot = normalizeSegments(root);
  if (!normalizedTarget || !normalizedRoot) return null;
  const prefix = `${normalizedRoot}/`;
  if (normalizedTarget.length <= prefix.length || !same(normalizedTarget.slice(0, prefix.length), prefix)) return null;
  return normalizedTarget.slice(prefix.length);
}

/**
 * The project-relative path of the Markdown file a link points at, or null
 * when the link goes elsewhere (a website, mail, an anchor, a file outside the
 * project or one that is not Markdown).
 */
export function markdownLinkTarget(href: string | null, projectPath: string, baseDir = ""): string | null {
  if (!href) return null;
  let value = href.trim();
  if (!value || value.startsWith("#") || value.startsWith("//")) return null;
  if (SCHEME.test(value) && !DRIVE.test(slashes(value))) {
    if (!/^file:/i.test(value)) return null;
    value = value.replace(/^file:(\/\/[^/]*)?/i, "");
  }
  value = value.replace(/[?#].*$/, "");
  const path = decode(value);
  if (!MARKDOWN.test(path)) return null;
  return projectRelativePath(path, projectPath, baseDir);
}

/** The folder of a project-relative file path, `""` for the project root. */
export function folderOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index > 0 ? path.slice(0, index) : "";
}
