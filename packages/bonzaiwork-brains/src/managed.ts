import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { TEMPLATE_FILES } from "./template-files.ts";

/**
 * The skills and commands BonzaiWork ships (docs/bonzaiwork/persoonlijk-brein-herzien-onderzoek.md
 * §4.2): written from the build into a folder of their own and linked into the engine's config
 * folder, so they count in every project and change with an update of the app. They are never
 * copied into a brain any more; a brain that still has an older copy keeps using its own (the
 * engine prefers the project's skill on the same name, fase 0 §5).
 */
const SKILLS = "common/.opencode/skills/";
const COMMANDS = "common/.opencode/commands/";
const VENDOR = "vendor/";

/** Template sources that are managed by the app and not part of a brain's own files. */
export function isManagedSource(source: string): boolean {
  return source.startsWith(SKILLS) || source.startsWith(COMMANDS) || source.startsWith(VENDOR);
}

/** Path under the managed folder (`skills/<name>/…`, `commands/<name>.md`) → content. */
export function managedFiles(): Map<string, string> {
  const files = new Map<string, string>();
  for (const [source, content] of TEMPLATE_FILES) {
    if (source.startsWith(SKILLS)) files.set(`skills/${source.slice(SKILLS.length)}`, content);
    else if (source.startsWith(VENDOR)) files.set(`skills/${source.slice(VENDOR.length)}`, content);
    else if (source.startsWith(COMMANDS)) files.set(`commands/${source.slice(COMMANDS.length)}`, content);
  }
  return files;
}

async function listFiles(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(join(root, prefix), { withFileTypes: true }).catch(() => []);
  const found: string[] = [];
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...await listFiles(root, path));
    else found.push(path);
  }
  return found;
}

export type ManagedFolders = { skills: string; commands: string };

/**
 * Makes the folder exactly what this build ships: changed files are written, anything else in it
 * is removed. Unchanged files are left alone, so the engine's file watcher has nothing to do.
 */
export async function writeManaged(root: string): Promise<ManagedFolders> {
  const wanted = managedFiles();
  for (const [path, content] of wanted) {
    const target = join(root, path);
    if (await readFile(target, "utf8").catch(() => null) === content) continue;
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  for (const path of await listFiles(root)) if (!wanted.has(path)) await rm(join(root, path), { force: true });
  return { skills: join(root, "skills"), commands: join(root, "commands") };
}
