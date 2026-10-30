import { stat } from "node:fs/promises";
import { join, posix } from "node:path";

/**
 * Workflows in ICM (plan §6.3, §6.5): the structure check before a commit.
 * A stage contract (`workflows/<name>/<NN_stage>/CONTEXT.md`) has Inputs,
 * Process, Outputs and exactly one Check, and every reference path in it
 * exists. The AI follows the contracts; this only keeps them whole.
 */
export const WORKFLOWS = "workflows";

const STAGE_CONTRACT = /^workflows\/[^/]+\/\d{2}_[^/]+\/CONTEXT\.md$/;

export function isStageContract(path: string): boolean {
  return STAGE_CONTRACT.test(path);
}

// ICM's own headings, plus the Dutch ones a team may write.
const SECTIONS: ReadonlyArray<{ name: string; heading: RegExp }> = [
  { name: "Inputs", heading: /^##\s+(inputs|invoer)\s*$/im },
  { name: "Process", heading: /^##\s+(process|werkwijze|stappen)\s*$/im },
  { name: "Outputs", heading: /^##\s+(outputs|uitvoer)\s*$/im },
  { name: "Check", heading: /^##\s+(check|controle)\s*$/im },
];
export const [INPUTS, , OUTPUTS, CHECK] = SECTIONS;

export type ContractProblem = { path: string; problem: string };

export function section(text: string, heading: RegExp): string {
  const match = heading.exec(text);
  if (!match) return "";
  const rest = text.slice(match.index + match[0].length);
  const next = /^##\s/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

/** Reference inputs: `- Reference (…): \`path\`` lines, relative to the stage folder. */
export function referencePaths(contract: string): string[] {
  const inputs = section(contract, INPUTS.heading);
  return inputs.split("\n")
    .filter((line) => /^\s*[-*]\s*(reference|referentie|example|voorbeeld)\b/i.test(line))
    .flatMap((line) => [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim()))
    .filter((path) => path && !/[{}]/.test(path) && !/^[a-z]+:\/\//i.test(path));
}

async function exists(path: string): Promise<boolean> {
  return (await stat(path).catch(() => null)) !== null;
}

/** Problems that block the commit, in plain Dutch for "Actie nodig". */
export async function checkContract(root: string, path: string, contract: string): Promise<ContractProblem[]> {
  const problems: ContractProblem[] = [];
  for (const { name, heading } of SECTIONS) {
    if (!heading.test(contract)) problems.push({ path, problem: `de sectie ${name} ontbreekt` });
  }
  const checks = contract.match(new RegExp(CHECK.heading.source, "gim"))?.length ?? 0;
  if (checks > 1) problems.push({ path, problem: "er is meer dan één Check" });
  const stage = posix.dirname(path);
  for (const reference of referencePaths(contract)) {
    const target = posix.normalize(posix.join(stage, reference));
    if (target.startsWith("..")) { problems.push({ path, problem: `${reference} valt buiten het brein` }); continue; }
    if (!await exists(join(root, target))) problems.push({ path, problem: `${reference} bestaat niet` });
  }
  return problems;
}

export type ContentWarning = { path: string; warning: string };

/** Only warnings: links from knowledge to workflows (wrong way), and a long AGENTS.md. */
export function contentWarnings(files: ReadonlyArray<{ path: string; content: string }>): ContentWarning[] {
  const warnings: ContentWarning[] = [];
  for (const file of files) {
    if (file.path === "AGENTS.md" && file.content.split("\n").length > 60) {
      warnings.push({ path: file.path, warning: "AGENTS.md is langer dan 60 regels; zet inhoud in een map en laat hier alleen de route staan" });
    }
    if (file.path.startsWith("knowledge/") && /\]\((?:\.\.\/)+workflows\//.test(file.content)) {
      warnings.push({ path: file.path, warning: "kennis verwijst naar een werkwijze; dat hoort andersom" });
    }
  }
  return warnings;
}
