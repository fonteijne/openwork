import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { appendLog, renderIndexes } from "./okf.ts";
import { TEMPLATE_FILES } from "./template-files.js";

/**
 * The brain template (plan §6.1, §6.6, §6.7): `AGENTS.md` as the ICM entry,
 * `_meta/`, `_templates/`, an OKF bundle in `knowledge/`, `workflows/`, and
 * the skills and commands for ingesting, recording, maintenance and making
 * workflows. Writes only what is missing: an existing note is never
 * replaced, an existing `AGENTS.md` gets the routing added below it.
 *
 * The project boilerplate (`templates/project/`) is the starter every new
 * project gets; a project brain gets it too, with the brain basis above added
 * (the routing goes below the boilerplate's `AGENTS.md`). The personal brain
 * never gets it. `BONZAIWORK_PROJECT_BOILERPLATE=uit` turns it off, without a
 * new release: new projects start empty again and brains get the old template.
 */
export type TemplateKind = "project" | "personal";

const BOILERPLATE = "project/";

/** On unless BONZAIWORK_PROJECT_BOILERPLATE is uit, off, nee, no, false or 0. */
export function boilerplateEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  const value = environment.BONZAIWORK_PROJECT_BOILERPLATE?.trim().toLowerCase();
  return !value || !["uit", "off", "nee", "no", "false", "0"].includes(value);
}

/** Where each boilerplate file goes in a new project: as it is in templates/project/. */
export function boilerplateTargets(): Map<string, string> {
  const targets = new Map<string, string>();
  for (const source of TEMPLATE_FILES.keys()) if (source.startsWith(BOILERPLATE)) targets.set(source.slice(BOILERPLATE.length), source);
  return targets;
}

/** What a folder may hold and still count as new: OS clutter and the engine's own `.opencode/`. */
const NOT_CONTENT = new Set([".opencode", ".DS_Store", "Thumbs.db", "desktop.ini"]);

/** A folder that is missing or holds nothing of the person's own. */
export async function isNewFolder(root: string): Promise<boolean> {
  const entries = await readdir(root).catch(() => null);
  return entries === null || entries.every((name) => NOT_CONTENT.has(name));
}

/**
 * `{{name}}` and `{{description}}` in Markdown only: other files (an Obsidian plugin, a theme) are
 * copied byte for byte. An empty description takes its line with it.
 */
function fillBoilerplate(target: string, text: string, values: { name: string; description: string }): string {
  if (!target.toLowerCase().endsWith(".md")) return text;
  const name = values.name.trim() || "Project";
  const description = values.description.trim();
  const withDescription = description ? text : text.replace(/^[ \t]*\{\{description\}\}[ \t]*\r?\n(?:[ \t]*\r?\n)?/m, "");
  return fill(withDescription, { name, description });
}

async function writeMissing(root: string, values: { name: string; description: string }, written: string[]): Promise<void> {
  for (const [target, source] of boilerplateTargets()) {
    const path = join(root, target);
    if (await stat(path).catch(() => null)) continue;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, fillBoilerplate(target, TEMPLATE_FILES.get(source) ?? "", values));
    written.push(target);
  }
}

/** Writes the boilerplate files that are missing; an existing file is never replaced. */
export async function applyBoilerplate(root: string, values: { name: string; description: string }): Promise<string[]> {
  const written: string[] = [];
  await writeMissing(root, values, written);
  return written.sort();
}

const INSTRUCTIONS_HEADING = "## Projectinstructies";

/** A starter's instructions below the boilerplate's `AGENTS.md`, once. */
export async function addInstructions(root: string, instructions: string): Promise<void> {
  const text = instructions.trim();
  if (!text) return;
  const path = join(root, "AGENTS.md");
  const existing = await readFile(path, "utf8").catch(() => null);
  if (existing?.includes(INSTRUCTIONS_HEADING)) return;
  await writeFile(path, existing === null ? `${text}\n` : `${existing.trimEnd()}\n\n${INSTRUCTIONS_HEADING}\n\n${text}\n`);
}

/** Where each template file goes in a brain of this kind. */
export function templateTargets(kind: TemplateKind): Map<string, string> {
  const targets = new Map<string, string>();
  for (const source of TEMPLATE_FILES.keys()) {
    if (source.startsWith("common/")) targets.set(source.slice("common/".length), source);
    else if (source.startsWith(kind === "project" ? "team/" : "personal/")) targets.set(source.slice(source.indexOf("/") + 1), source);
    else if (source.startsWith("vendor/")) targets.set(`.opencode/skills/${source.slice("vendor/".length)}`, source);
  }
  return targets;
}

function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match);
}

const ROUTING_HEADING = "## Waar alles staat";

export type TemplateResult = { written: string[]; extendedAgents: boolean };

export async function applyTemplate(root: string, input: { kind: TemplateKind; name: string; description: string; now: Date; boilerplate?: boolean }): Promise<TemplateResult> {
  const written: string[] = [];
  let extendedAgents = false;
  // The boilerplate first: its AGENTS.md then gets the brain's routing below it, like one of their own.
  const withBoilerplate = input.kind === "project" && input.boilerplate === true;
  if (withBoilerplate) await writeMissing(root, { name: input.name.trim() || "Brein", description: input.description.trim() || "Waar dit brein over gaat en voor wie." }, written);
  const boilerplateAgents = withBoilerplate && written.includes("AGENTS.md");
  const values = { name: input.name.trim() || "Brein", description: input.description.trim() || "Waar dit brein over gaat en voor wie." };
  for (const [target, source] of templateTargets(input.kind)) {
    const content = fill(TEMPLATE_FILES.get(source) ?? "", values);
    const path = join(root, target);
    const existing = await readFile(path, "utf8").catch(() => null);
    if (existing !== null) {
      // An AGENTS.md of their own stays; the routing is added once below it.
      if (target === "AGENTS.md" && !existing.includes(ROUTING_HEADING)) {
        const routing = content.slice(content.indexOf(ROUTING_HEADING));
        await writeFile(path, `${existing.trimEnd()}\n\n${routing}`);
        // Their own AGENTS.md was extended; the boilerplate's is simply part of the template.
        extendedAgents = !boilerplateAgents;
      }
      continue;
    }
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
    written.push(target);
  }
  for (const folder of ["knowledge/references", "workflows"]) await mkdir(join(root, folder), { recursive: true });
  const logPath = join(root, "knowledge/log.md");
  if (!await stat(logPath).catch(() => null)) {
    await writeFile(logPath, appendLog(null, input.now.toISOString().slice(0, 10), [{ label: "Creation", title: "Kennis", link: "index.md", note: "brein ingericht" }]));
    written.push("knowledge/log.md");
  }
  for (const [path, content] of await renderIndexes(root)) {
    const target = join(root, path);
    if (await readFile(target, "utf8").catch(() => null) === content) continue;
    await writeFile(target, content);
    if (!written.includes(path)) written.push(path);
  }
  return { written: written.sort(), extendedAgents };
}
