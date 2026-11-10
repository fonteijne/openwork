import { mkdir, open, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  brainPaths, compareVersions, HARNESS_VERSION, harnessItems, itemKey, knownItem, readManifest, readStamp, shippedVersion, stampedFiles,
  type HarnessItem, type HarnessItemKind, type HarnessManifest,
} from "@bonzaiwork/harness";

/**
 * The harness in BonzaiWork (docs/bonzaiwork/brein-harnas-plan.md §1.3): the
 * shipped skills, commands and agent, plus the user's own skills and commands
 * from the personal brain, composed into what the engine's config folder
 * holds for every project; and the check that finds an outdated copy of a
 * harness item in a project brain (H3).
 */
export type HarnessSource = "bundled" | "repo" | "personal";

/**
 * A team's own repository of skills, commands and agents (brein-harnas-plan
 * §2.1): the checked-out folder (what the user trusted) and its `harness.json`.
 */
export type TeamHarness = { root: string; manifest: HarnessManifest };

export type HarnessView = {
  kind: HarnessItemKind;
  name: string;
  source: HarnessSource;
  version: string | null;
  description: string;
  /** Folder (skill) or file (command, agent) on disk. */
  path: string;
};

export type ComposedHarness = {
  version: string;
  items: HarnessView[];
  /** Skill name → folder to link into `<OPENCODE_CONFIG_DIR>/skills/<name>`. */
  skills: Record<string, string>;
  /** Command name → file content for `<OPENCODE_CONFIG_DIR>/command/<name>.md` (a copy: fase 0 E4). */
  commands: Record<string, string>;
  /** Agent name → file content for `<OPENCODE_CONFIG_DIR>/agent/<name>.md`. */
  agents: Record<string, string>;
};

export type OutdatedItem = {
  kind: HarnessItemKind;
  name: string;
  /** The shipped version the copy is (unchanged), or the version its stamp says (changed); null: unknown. */
  from: string | null;
  to: string;
  /** The team changed the copy: no shipped version matches it. */
  modified: boolean;
};

function frontmatterDescription(content: string): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  const line = match?.[1].split(/\r?\n/).find((entry) => entry.startsWith("description:"));
  return line ? line.slice("description:".length).trim().replace(/^["']|["']$/g, "") : "";
}

const TEXT_PROBE = 8 * 1024;

/** A text file: no NUL in its first 8 KiB (a script in a skill is text; an image is not). */
export async function isTextFile(path: string): Promise<boolean> {
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) return false;
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(Math.min(TEXT_PROBE, info.size));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return !buffer.subarray(0, bytesRead).includes(0);
  } finally {
    await handle.close();
  }
}

/** Every text file under a folder, path relative to it. */
async function readTree(root: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  async function walk(dir: string, prefix: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const path = join(dir, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path, relative);
      else if (entry.isFile() && await isTextFile(path)) files.set(relative, await readFile(path, "utf8"));
    }
  }
  await walk(root, "");
  return files;
}

/** Skills, commands and (optionally) agents in a folder laid out like the harness: `skills/<name>/SKILL.md`, `commands/<name>.md`, `agents/<name>.md`. */
async function folderItems(base: { skills: string; commands: string; agents: string | null }, source: HarnessSource, version: string | null): Promise<HarnessView[]> {
  const items: HarnessView[] = [];
  for (const entry of await readdir(base.skills, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    const skill = await readFile(join(base.skills, entry.name, "SKILL.md"), "utf8").catch(() => null);
    if (skill === null) continue;
    items.push({ kind: "skill", name: entry.name, source, version, description: frontmatterDescription(skill), path: join(base.skills, entry.name) });
  }
  for (const [kind, dir] of [["command", base.commands], ["agent", base.agents]] as const) {
    if (!dir) continue;
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const content = await readFile(join(dir, entry.name), "utf8").catch(() => null);
      if (content === null) continue;
      items.push({ kind, name: entry.name.slice(0, -3), source, version, description: frontmatterDescription(content), path: join(dir, entry.name) });
    }
  }
  return items;
}

/** The user's own skills and commands in the personal brain (`.opencode/skills/<name>/SKILL.md`, `.opencode/commands/<name>.md`); never agents (they would need trust). */
export function personalItems(personalRoot: string): Promise<HarnessView[]> {
  return folderItems({ skills: join(personalRoot, ".opencode", "skills"), commands: join(personalRoot, ".opencode", "commands"), agents: null }, "personal", null);
}

/** The team repository's items: only what is checked out, so only what the user trusted (agents wait for "Toestaan"). */
export function repoItems(repo: TeamHarness): Promise<HarnessView[]> {
  return folderItems({ skills: join(repo.root, "skills"), commands: join(repo.root, "commands"), agents: join(repo.root, "agents") }, "repo", repo.manifest.version);
}

/** The team repository's `harness.json`, when the folder holds one that reads. */
export async function readTeamHarness(root: string): Promise<TeamHarness | null> {
  const text = await readFile(join(root, "harness.json"), "utf8").catch(() => null);
  if (text === null) return null;
  try {
    const manifest = readManifest(JSON.parse(text));
    return manifest ? { root, manifest } : null;
  } catch {
    return null;
  }
}

/**
 * Writes the shipped harness to `<state>/harness/<version>/` (only what differs)
 * and removes older versions, so a skill junction always points at a real
 * folder of exactly this version.
 */
export async function materializeHarness(stateDirectory: string): Promise<string> {
  const base = join(stateDirectory, "harness");
  const target = join(base, HARNESS_VERSION);
  for (const item of harnessItems()) {
    const paths = brainPaths(item);
    for (const [path, content] of item.files) {
      const inside = paths.get(path)?.replace(/^\.opencode\//, "") ?? "";
      const file = join(target, inside);
      if (await readFile(file, "utf8").catch(() => null) === content) continue;
      await mkdir(dirname(file), { recursive: true, mode: 0o700 });
      await writeFile(file, content, { mode: 0o600 });
    }
  }
  for (const entry of await readdir(base, { withFileTypes: true }).catch(() => [])) {
    if (entry.isDirectory() && entry.name !== HARNESS_VERSION) await rm(join(base, entry.name), { recursive: true, force: true }).catch(() => undefined);
  }
  return target;
}

/** Bundled items, then the team repository's, then the user's own: a later source wins a name clash. */
export async function composeHarness(input: { stateDirectory: string; personalRoot: string | null; repo?: TeamHarness | null }): Promise<ComposedHarness> {
  const root = await materializeHarness(input.stateDirectory);
  const items: HarnessView[] = [];
  const skills: Record<string, string> = {};
  const commands: Record<string, string> = {};
  const agents: Record<string, string> = {};
  for (const item of harnessItems()) {
    const path = item.kind === "skill" ? join(root, "skills", item.name) : join(root, item.kind === "command" ? "commands" : "agents", `${item.name}.md`);
    items.push({ kind: item.kind, name: item.name, source: "bundled", version: HARNESS_VERSION, description: item.description, path });
    if (item.kind === "skill") skills[item.name] = path;
    else if (item.kind === "command") commands[item.name] = item.files.get(`${item.name}.md`) ?? "";
    else agents[item.name] = item.files.get(`${item.name}.md`) ?? "";
  }
  const layer = async (views: HarnessView[]) => {
    for (const view of views) {
      const index = items.findIndex((item) => item.kind === view.kind && item.name === view.name);
      if (index >= 0) items.splice(index, 1);
      items.push(view);
      if (view.kind === "skill") skills[view.name] = view.path;
      else if (view.kind === "command") commands[view.name] = await readFile(view.path, "utf8").catch(() => "");
      else agents[view.name] = await readFile(view.path, "utf8").catch(() => "");
    }
  };
  if (input.repo) await layer(await repoItems(input.repo));
  if (input.personalRoot) await layer(await personalItems(input.personalRoot));
  items.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  return { version: HARNESS_VERSION, items, skills, commands, agents };
}

/** What provides an item for project brains right now: the team repository when it has it, else the bundle. */
type Provided = { source: "bundled" | "repo"; version: string; item: HarnessItem };

async function providedItem(kind: HarnessItemKind, name: string, repo: TeamHarness | null): Promise<Provided | null> {
  if (repo && knownItem(kind, name, repo.manifest)) {
    const files = kind === "skill"
      ? await readTree(join(repo.root, "skills", name))
      : new Map((await readFile(join(repo.root, kind === "command" ? "commands" : "agents", `${name}.md`), "utf8").then((content) => [[`${name}.md`, content]] as const).catch(() => [])));
    if (files.size) return { source: "repo", version: repo.manifest.version, item: { kind, name, files, description: frontmatterDescription(files.get(kind === "skill" ? "SKILL.md" : `${name}.md`) ?? "") } };
  }
  const bundled = harnessItems().find((item) => item.kind === kind && item.name === name);
  return bundled ? { source: "bundled", version: HARNESS_VERSION, item: bundled } : null;
}

/** A brain's copy of a harness item, when it is one of ours (a stamp, or a fingerprint the bundle or the team repository shipped). */
async function copyOf(root: string, kind: HarnessItemKind, name: string, repo: TeamHarness | null): Promise<{ files: Map<string, string>; from: string | null; modified: boolean } | null> {
  if (!knownItem(kind, name) && !(repo && knownItem(kind, name, repo.manifest))) return null;
  const files = kind === "skill"
    ? await readTree(join(root, ".opencode", "skills", name))
    : new Map((await readFile(join(root, ".opencode", kind === "command" ? "commands" : "agents", `${name}.md`), "utf8").then((content) => [[`${name}.md`, content]] as const).catch(() => [])));
  if (!files.size) return null;
  const shipped = shippedVersion(kind, name, files) ?? (repo ? shippedVersion(kind, name, files, repo.manifest) : null);
  const entry = files.get(kind === "skill" ? "SKILL.md" : `${name}.md`) ?? "";
  const stamp = readStamp(entry);
  if (shipped === null && !stamp) return null;
  return { files, from: shipped ?? stamp?.version ?? null, modified: shipped === null };
}

/**
 * Which harness copies in a project brain are older than what provides them now (H3): the team
 * repository's version for its items, the bundle's for the rest; minus "Zo laten" for that version.
 */
export async function outdatedItems(root: string, dismissed: Readonly<Record<string, string>> = {}, repo: TeamHarness | null = null): Promise<OutdatedItem[]> {
  const outdated: OutdatedItem[] = [];
  const candidates: Array<{ kind: HarnessItemKind; name: string }> = [];
  for (const entry of await readdir(join(root, ".opencode", "skills"), { withFileTypes: true }).catch(() => [])) if (entry.isDirectory()) candidates.push({ kind: "skill", name: entry.name });
  for (const entry of await readdir(join(root, ".opencode", "commands"), { withFileTypes: true }).catch(() => [])) if (entry.isFile() && entry.name.endsWith(".md")) candidates.push({ kind: "command", name: entry.name.slice(0, -3) });
  for (const { kind, name } of candidates) {
    const provided = await providedItem(kind, name, repo);
    if (!provided) continue;
    const copy = await copyOf(root, kind, name, repo);
    if (!copy) continue;
    if (copy.from !== null && compareVersions(copy.from, provided.version) >= 0) continue;
    if (dismissed[itemKey(kind, name)] === provided.version) continue;
    outdated.push({ kind, name, from: copy.from, to: provided.version, modified: copy.modified });
  }
  return outdated.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
}

/** Writes the current version of these items into the brain (replacing the copy). Returns the paths written. */
export async function updateItems(root: string, names: ReadonlyArray<{ kind: HarnessItemKind; name: string }>, repo: TeamHarness | null = null): Promise<string[]> {
  const written: string[] = [];
  for (const { kind, name } of names) {
    const provided = await providedItem(kind, name, repo);
    if (!provided || kind === "agent") continue;
    if (kind === "skill") await rm(join(root, ".opencode", "skills", name), { recursive: true, force: true });
    const paths = brainPaths(provided.item);
    for (const [path, content] of stampedFiles(provided.item, provided.version)) {
      const target = paths.get(path);
      if (!target) continue;
      await mkdir(dirname(join(root, target)), { recursive: true });
      await writeFile(join(root, target), content);
      written.push(target);
    }
  }
  return written;
}

/** Removes the brain's copies of these items; the harness then provides them. Returns the paths removed. */
export async function removeItems(root: string, names: ReadonlyArray<{ kind: HarnessItemKind; name: string }>, repo: TeamHarness | null = null): Promise<string[]> {
  const removed: string[] = [];
  for (const { kind, name } of names) {
    if (!knownItem(kind, name) && !(repo && knownItem(kind, name, repo.manifest))) continue;
    const target = kind === "skill" ? `.opencode/skills/${name}` : `.opencode/${kind === "command" ? "commands" : "agents"}/${name}.md`;
    if (!await stat(join(root, target)).catch(() => null)) continue;
    await rm(join(root, target), { recursive: true, force: true });
    removed.push(target);
  }
  return removed;
}

/** The brain's copy and the version that provides it now, side by side, for "Verschillen bekijken". */
export async function itemVersions(root: string, kind: HarnessItemKind, name: string, repo: TeamHarness | null = null): Promise<{ copy: Map<string, string>; shipped: Map<string, string>; to: string } | null> {
  const provided = await providedItem(kind, name, repo);
  const copy = await copyOf(root, kind, name, repo);
  if (!provided || !copy) return null;
  return { copy: copy.files, shipped: stampedFiles(provided.item, provided.version), to: provided.version };
}

/**
 * A line diff without a library (longest common subsequence per file), in
 * unified form: enough for the Details column, never for a merge.
 */
export function unifiedDiff(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>): string {
  const out: string[] = [];
  for (const path of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const a = (before.get(path) ?? "").split("\n");
    const b = (after.get(path) ?? "").split("\n");
    if (a.join("\n") === b.join("\n")) continue;
    out.push(`--- ${before.has(path) ? `a/${path}` : "/dev/null"}`, `+++ ${after.has(path) ? `b/${path}` : "/dev/null"}`);
    const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
    for (let i = a.length - 1; i >= 0; i -= 1) {
      for (let j = b.length - 1; j >= 0; j -= 1) table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
    let i = 0;
    let j = 0;
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) { out.push(` ${a[i]}`); i += 1; j += 1; } else if (i < a.length && (j >= b.length || table[i + 1][j] >= table[i][j + 1])) { out.push(`-${a[i]}`); i += 1; } else { out.push(`+${b[j]}`); j += 1; }
    }
  }
  return out.join("\n");
}
