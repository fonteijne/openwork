import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { appendLog, renderIndexes } from "./okf.ts";
import { TEMPLATE_FILES } from "./template-files.ts";

/**
 * The brain template (plan §6.1, §6.6, §6.7): `AGENTS.md` as the ICM entry,
 * `_meta/`, `_templates/`, an OKF bundle in `knowledge/`, `workflows/`, and
 * the skills and commands for ingesting, recording, maintenance and making
 * workflows. Writes only what is missing: an existing note is never
 * replaced, an existing `AGENTS.md` gets the routing added below it.
 */
export type TemplateKind = "project" | "personal";

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

export async function applyTemplate(root: string, input: { kind: TemplateKind; name: string; description: string; now: Date }): Promise<TemplateResult> {
  const written: string[] = [];
  let extendedAgents = false;
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
        extendedAgents = true;
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
