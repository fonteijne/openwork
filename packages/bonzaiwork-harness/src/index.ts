import { createHash } from "node:crypto";

import manifest from "../harness.json" with { type: "json" };
import { HARNESS_FILES } from "./files.ts";

/**
 * The harness BonzaiWork ships (docs/bonzaiwork/brein-harnas-plan.md): skills,
 * commands and the agent Brein, versioned with the app. The brains package
 * links them into the engine's config folder for every project, writes them
 * into project brains (so a brain works without BonzaiWork too) and recognises
 * an unchanged copy of any version by its fingerprint (H3).
 */
export type HarnessItemKind = "skill" | "command" | "agent";

export type HarnessItem = {
  kind: HarnessItemKind;
  name: string;
  /** Files of this item: path inside the item (skills) or the one file name, with content. */
  files: ReadonlyMap<string, string>;
  /** The first line of the description in the frontmatter, for lists. */
  description: string;
};

export const HARNESS_VERSION: string = manifest.version;
export { HARNESS_FILES };

type ManifestItem = { versions: Record<string, string>; removed?: boolean };
/** `harness.json`: the version and, per item, the fingerprint of every version ever shipped. */
export type HarnessManifest = { version: string; items: Record<string, ManifestItem> };
export const BUNDLED_MANIFEST: HarnessManifest = { version: manifest.version, items: manifest.items };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A `harness.json` from elsewhere (a team's repository): the same shape, read defensively. */
export function readManifest(value: unknown): HarnessManifest | null {
  if (!isRecord(value) || typeof value.version !== "string" || !value.version.trim()) return null;
  const items: Record<string, ManifestItem> = {};
  if (isRecord(value.items)) {
    for (const [key, item] of Object.entries(value.items)) {
      if (!isRecord(item) || !isRecord(item.versions)) continue;
      const versions = Object.fromEntries(Object.entries(item.versions).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
      items[key] = { versions, ...(item.removed === true ? { removed: true } : {}) };
    }
  }
  return { version: value.version.trim(), items };
}

/** A prompt the harness ships (`harness/prompts/<name>.md`), for a routine the app plans. */
export function harnessPrompt(name: string): string | null {
  return HARNESS_FILES.get(`prompts/${name}.md`) ?? null;
}

function frontmatterDescription(content: string): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  const line = match?.[1].split(/\r?\n/).find((entry) => entry.startsWith("description:"));
  return line ? line.slice("description:".length).trim().replace(/^["']|["']$/g, "") : "";
}

/** Every item the shipped harness holds, skills first, each name once. */
export function harnessItems(): HarnessItem[] {
  const skills = new Map<string, Map<string, string>>();
  const items: HarnessItem[] = [];
  for (const [path, content] of HARNESS_FILES) {
    const [kind, name, ...rest] = path.split("/");
    if (kind === "skills" && name && rest.length) {
      const files = skills.get(name) ?? new Map<string, string>();
      files.set(rest.join("/"), content);
      skills.set(name, files);
    } else if ((kind === "commands" || kind === "agents") && name?.endsWith(".md") && rest.length === 0) {
      items.push({ kind: kind === "commands" ? "command" : "agent", name: name.slice(0, -3), files: new Map([[name, content]]), description: frontmatterDescription(content) });
    }
  }
  const skillItems = [...skills.entries()].map(([name, files]): HarnessItem => ({ kind: "skill", name, files, description: frontmatterDescription(files.get("SKILL.md") ?? "") }));
  return [...skillItems, ...items].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
}

export const itemKey = (kind: HarnessItemKind, name: string): string => `${kind}:${name}`;

const STAMP = /^(---\r?\n[\s\S]*?)^harness:[^\n]*\r?\n([\s\S]*?^---)/m;

/** The `harness: <name>@<version>` frontmatter line a copy carries, if any. */
export function readStamp(content: string): { name: string; version: string } | null {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)?.[1] ?? "";
  const match = /^harness:\s*([^@\s]+)@(\S+)\s*$/m.exec(front);
  return match ? { name: match[1], version: match[2] } : null;
}

/** Content without the stamp line, so a stamped copy and the shipped file compare equal. */
export function stripStamp(content: string): string {
  return content.replace(STAMP, "$1$2");
}

/**
 * Fingerprint of an item's files (sorted by path, stamps stripped): the same
 * rule scripts/manifest.mjs records per version in harness.json.
 */
export function itemFingerprint(files: ReadonlyMap<string, string>): string {
  const hash = createHash("sha256");
  for (const path of [...files.keys()].sort()) hash.update(`${path}\0${stripStamp(files.get(path) ?? "")}\0`);
  return hash.digest("hex");
}

/** Which shipped version a copy is, byte for byte (stamps aside); null when it was changed or is not ours. */
export function shippedVersion(kind: HarnessItemKind, name: string, files: ReadonlyMap<string, string>, manifest: HarnessManifest = BUNDLED_MANIFEST): string | null {
  const versions = manifest.items[itemKey(kind, name)]?.versions ?? {};
  const fingerprint = itemFingerprint(files);
  return Object.entries(versions).find(([, hash]) => hash === fingerprint)?.[0] ?? null;
}

/** True when this harness ever shipped an item of this name (a brain's copy can then be ours). */
export function knownItem(kind: HarnessItemKind, name: string, manifest: HarnessManifest = BUNDLED_MANIFEST): boolean {
  return itemKey(kind, name) in manifest.items;
}

/**
 * The item's files for a brain folder: the Markdown entry file gets
 * `harness: <name>@<version>` in its frontmatter, so the copy says where it
 * came from even when read outside BonzaiWork.
 */
export function stampedFiles(item: HarnessItem, version: string = HARNESS_VERSION): Map<string, string> {
  const entry = item.kind === "skill" ? "SKILL.md" : `${item.name}.md`;
  const stamped = new Map(item.files);
  const content = stamped.get(entry);
  if (content !== undefined) {
    const line = `harness: ${item.name}@${version}`;
    const match = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(stripStamp(content));
    stamped.set(entry, match
      ? `---\n${match[1].trimEnd()}\n${line}\n---\n${stripStamp(content).slice(match[0].length)}`
      : `---\n${line}\n---\n${content}`);
  }
  return stamped;
}

/** Where an item's files go inside a brain folder. */
export function brainPaths(item: HarnessItem): Map<string, string> {
  const base = item.kind === "skill" ? `.opencode/skills/${item.name}` : item.kind === "command" ? ".opencode/commands" : ".opencode/agents";
  return new Map([...item.files.keys()].map((path) => [path, `${base}/${path}`]));
}

/** Versions in order: "1.2.0" before "1.10.0"; a non-numeric part compares as text. */
export function compareVersions(a: string, b: string): number {
  const parts = (value: string) => value.split(".").map((part) => (/^\d+$/.test(part) ? Number(part) : part));
  const left = parts(a);
  const right = parts(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const x = left[index] ?? 0;
    const y = right[index] ?? 0;
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return x - y;
    return String(x) < String(y) ? -1 : 1;
  }
  return 0;
}
