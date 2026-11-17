/**
 * Checks the BonzaiWork knowledge base (docs/bonzaiwork/kennisbank/AGENTS.md):
 * OKF conformance with the app's own code (packages/bonzaiwork-brains/src/okf.ts),
 * the bundle's schema (_meta/schema.md), relative links, sources, footnotes and
 * the generated index.md per folder.
 *
 *   bun scripts/bonzaiwork/kennisbank.ts           check; exit 1 on a problem
 *   bun scripts/bonzaiwork/kennisbank.ts --write   regenerate index.md first
 *
 * kennisbank-hook.ts calls checkKnowledgeBase() at the end of a Claude Code session.
 */
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { KNOWLEDGE, isConceptPath, parseConcept, renderIndexes } from "../../packages/bonzaiwork-brains/src/okf.ts";

const repo = fileURLToPath(new URL("../..", import.meta.url));
export const KNOWLEDGE_BASE = "docs/bonzaiwork/kennisbank";
const root = join(repo, KNOWLEDGE_BASE);

const TYPES = new Set(["System", "Process", "Decision", "Policy", "Glossary Term", "Reference"]);
const STATUSES = new Set(["draft", "stable", "deprecated"]);
const DECISION_STATUSES = new Set(["genomen", "voorlopig", "open"]);
const DECISION_HEADINGS = ["## Context", "## Besluit", "## Gevolgen"];

let problems: string[] = [];
const report = (path: string, message: string) => problems.push(`${path}: ${message}`);

async function markdownFiles(folder: string): Promise<string[]> {
  const entries = await readdir(join(root, folder), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const path = folder ? `${folder}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await markdownFiles(path));
    else if (entry.isFile() && /\.md$/i.test(entry.name)) files.push(path);
  }
  return files;
}

function withoutCode(text: string): string {
  return text.replace(/^```[\s\S]*?^```/gm, "").replace(/`[^`\n]*`/g, "");
}

function body(text: string): string {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/, "");
}

function checkTarget(path: string, target: string, what: string) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) return;
  if (target.startsWith("/")) { report(path, `${what} is absolute: ${target}`); return; }
  const file = decodeURI(target.replace(/#.*$/, ""));
  if (!existsSync(resolve(root, dirname(path), file))) report(path, `${what} does not exist: ${target}`);
}

function checkLinks(path: string, text: string) {
  for (const match of withoutCode(text).matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) checkTarget(path, match[1], "link");
  if (/\[\[[^\]]+\]\]/.test(withoutCode(text))) report(path, "uses a [[wikilink]]; use a relative Markdown link");
}

function checkFootnotes(path: string, text: string, sourceIds: Set<string>) {
  const plain = withoutCode(body(text));
  const defined = new Set([...plain.matchAll(/^\[\^([^\]]+)\]:/gm)].map((match) => match[1]));
  const used = new Set([...plain.matchAll(/\[\^([^\]]+)\](?!:)/g)].map((match) => match[1]));
  for (const id of used) {
    if (!defined.has(id)) report(path, `footnote [^${id}] has no definition`);
    if (!sourceIds.has(id)) report(path, `footnote [^${id}] is not a sources[].id`);
  }
  for (const id of defined) if (!used.has(id)) report(path, `footnote [^${id}] is defined but not used`);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

let decisionIds = new Map<string, string>();

function checkConcept(path: string, content: string) {
  const parsed = parseConcept(content);
  if (!parsed.ok) { report(path, `not OKF-conformant (${parsed.problem}${parsed.line ? `, line ${parsed.line}` : ""})`); return; }
  const { concept } = parsed;
  const data = concept.data;
  if (!TYPES.has(concept.type)) report(path, `type "${concept.type}" is not in _meta/schema.md`);
  if (!concept.title) report(path, "no title");
  if (!concept.description) report(path, "no description");
  if (!concept.status || !STATUSES.has(concept.status)) report(path, `status must be one of ${[...STATUSES].join(", ")}`);
  const generated = data.generated;
  if (typeof generated !== "object" || generated === null || !text(Reflect.get(generated, "by"))) report(path, "no generated.by");

  const sourceIds = new Set<string>();
  if (concept.type === "Reference") {
    const resource = text(data.resource);
    if (!resource) report(path, "a Reference needs a resource");
    else checkTarget(path, resource, "resource");
  } else {
    const sources = Array.isArray(data.sources) ? data.sources : [];
    if (!sources.length) report(path, "no sources");
    for (const source of sources) {
      const id = typeof source === "object" && source !== null ? text(Reflect.get(source, "id")) : null;
      const resource = typeof source === "object" && source !== null ? text(Reflect.get(source, "resource")) : null;
      if (!id || !resource) { report(path, "every source needs an id and a resource"); continue; }
      sourceIds.add(id);
      checkTarget(path, resource, `source ${id}`);
    }
    const resource = text(data.resource);
    if (resource) checkTarget(path, resource, "resource");
  }

  if (concept.type === "Decision") {
    const id = text(data.decision_id);
    if (!id) report(path, "a Decision needs a decision_id");
    else if (decisionIds.has(id)) report(path, `decision_id ${id} is also used in ${decisionIds.get(id)}`);
    else decisionIds.set(id, path);
    const status = text(data.decision_status);
    if (!status || !DECISION_STATUSES.has(status)) report(path, `decision_status must be one of ${[...DECISION_STATUSES].join(", ")}`);
    for (const heading of DECISION_HEADINGS) {
      if (!new RegExp(`^${heading}\\s*$`, "m").test(content)) report(path, `missing heading "${heading}"`);
    }
  }
  checkFootnotes(path, content, sourceIds);
}

export type CheckResult = { problems: string[]; concepts: number; decisions: number; indexes: number; written: string[] };

/** Checks the whole bundle; with `write`, regenerates every out-of-date index.md first. */
export async function checkKnowledgeBase(options: { write: boolean }): Promise<CheckResult> {
  problems = [];
  decisionIds = new Map();
  const written: string[] = [];
  const indexes = await renderIndexes(root);
  for (const [path, expected] of indexes) {
    const current = await readFile(join(root, path), "utf8").catch(() => null);
    if (current === expected) continue;
    if (options.write) { await writeFile(join(root, path), expected); written.push(path); }
    else report(path, current === null ? "missing; run with --write" : "out of date; run with --write");
  }
  if (!existsSync(join(root, KNOWLEDGE, "log.md"))) report(`${KNOWLEDGE}/log.md`, "missing");

  const files = await markdownFiles("");
  for (const path of files) {
    if (path.startsWith("_templates/")) continue;
    const content = await readFile(join(root, path), "utf8");
    checkLinks(path, content);
    if (isConceptPath(path)) checkConcept(path, content);
  }
  return { problems, concepts: files.filter(isConceptPath).length, decisions: decisionIds.size, indexes: indexes.size, written };
}

if (import.meta.main) {
  const write = process.argv.includes("--write");
  const result = await checkKnowledgeBase({ write });
  if (result.problems.length) {
    console.error(`${KNOWLEDGE_BASE}: ${result.problems.length} problem(s)\n${result.problems.map((line) => `  ${line}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${KNOWLEDGE_BASE}: ${result.concepts} concepts, ${result.decisions} decisions, ${result.indexes} indexes${write ? " (written)" : ""}: ok`);
}
