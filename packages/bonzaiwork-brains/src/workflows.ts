import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, posix } from "node:path";

import { CHECK, INPUTS, OUTPUTS, section, WORKFLOWS } from "./icm.ts";

/**
 * Workflows in the app (plan §6.5): found on disk, their status read from
 * disk (`output/` and `check.md`), a stage started only when its inputs are
 * there, and the next stage only after the check said `pass`. No database:
 * what is in the folder is the truth.
 */
export type CheckKind = "person" | "model" | "script";
export type StageState = "waiting" | "ready" | "check" | "done" | "failed";

export type Stage = {
  id: string;
  task: string;
  contract: string;
  working: string[];
  references: string[];
  outputs: string[];
  check: { kind: CheckKind; text: string };
  state: StageState;
  /** `fail: <waarom>` from check.md. */
  failure: string | null;
  missing: string[];
};

export type Workflow = { name: string; title: string; task: string; stages: Stage[]; runs: string[] };

const SAFE = /^[\w.-]+$/;
const STAGE = /^\d{2}_[\w.-]+$/;

const exists = async (path: string) => (await stat(path).catch(() => null)) !== null;

async function nonEmpty(path: string): Promise<boolean> {
  const info = await stat(path).catch(() => null);
  if (!info) return false;
  if (info.isFile()) return info.size > 0;
  const entries = await readdir(path).catch(() => []);
  return entries.some((entry) => !entry.startsWith("."));
}

function heading(text: string): { title: string; task: string } {
  const line = /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? "";
  const [title, ...rest] = line.split(/\s+[-–]\s+/);
  return { title: title?.trim() ?? "", task: rest.join(" - ").trim() };
}

function paths(lines: string, kind: RegExp): string[] {
  return lines.split("\n")
    .filter((line) => kind.test(line))
    .flatMap((line) => [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim()))
    .filter((path) => path && !/[{}<>]/.test(path) && !/^[a-z]+:\/\//i.test(path));
}

/** `- \`brief.md\` -> \`output/\`` gives `output/brief.md`. */
function outputPaths(contract: string): string[] {
  return section(contract, OUTPUTS.heading).split("\n")
    .flatMap((line) => {
      const names = [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim());
      const file = names.find((name) => !name.endsWith("/"));
      return file && !/[{}<>]/.test(file) ? [file.startsWith("output/") ? file : `output/${posix.basename(file)}`] : [];
    });
}

function checkKind(text: string): CheckKind {
  if (/\bscript\b/i.test(text)) return "script";
  if (/\b(klein\s+)?model\b|\bAI\b/i.test(text)) return "model";
  return "person";
}

async function readCheck(stageDir: string): Promise<{ verdict: "pass" | "fail" | null; reason: string | null }> {
  const text = await readFile(join(stageDir, "check.md"), "utf8").catch(() => null);
  if (text === null) return { verdict: null, reason: null };
  const first = text.trim().split("\n")[0]?.trim() ?? "";
  if (/^pass\b/i.test(first)) return { verdict: "pass", reason: null };
  if (/^fail\b/i.test(first)) return { verdict: "fail", reason: first.replace(/^fail:?\s*/i, "") || null };
  return { verdict: null, reason: null };
}

async function readStage(root: string, workflow: string, id: string, previousDone: boolean): Promise<Stage | null> {
  const contract = `${WORKFLOWS}/${workflow}/${id}/CONTEXT.md`;
  const text = await readFile(join(root, contract), "utf8").catch(() => null);
  if (text === null) return null;
  const inputs = section(text, INPUTS.heading);
  const stageDir = join(root, WORKFLOWS, workflow, id);
  const working = paths(inputs, /^\s*[-*]\s*(working|werk)/i);
  const references = paths(inputs, /^\s*[-*]\s*(reference|referentie)/i);
  const outputs = outputPaths(text);
  const checkText = section(text, CHECK.heading).trim();
  const missing: string[] = [];
  for (const input of [...working, ...references]) {
    const target = posix.normalize(posix.join(WORKFLOWS, workflow, id, input));
    if (target.startsWith("..") || !await nonEmpty(join(root, target))) missing.push(input);
  }
  const produced = outputs.length
    ? (await Promise.all(outputs.map((output) => nonEmpty(join(stageDir, output))))).every(Boolean)
    : await nonEmpty(join(stageDir, "output"));
  const check = await readCheck(stageDir);
  const state: StageState = check.verdict === "fail" ? "failed"
    : produced && check.verdict === "pass" ? "done"
      : produced ? "check"
        : previousDone && !missing.length ? "ready" : "waiting";
  return { id, task: heading(text).task || heading(text).title, contract, working, references, outputs, check: { kind: checkKind(checkText), text: checkText }, state, failure: check.reason, missing };
}

export async function readWorkflow(root: string, name: string): Promise<Workflow | null> {
  if (!SAFE.test(name)) return null;
  const folder = join(root, WORKFLOWS, name);
  const overview = await readFile(join(folder, "CONTEXT.md"), "utf8").catch(() => null);
  if (overview === null) return null;
  const ids = (await readdir(folder, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory() && STAGE.test(entry.name)).map((entry) => entry.name).sort();
  const stages: Stage[] = [];
  for (const id of ids) {
    const stage = await readStage(root, name, id, stages.every((done) => done.state === "done"));
    if (stage) stages.push(stage);
  }
  const runs = (await readdir(join(folder, "_runs"), { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse();
  const { title, task } = heading(overview);
  return { name, title: title || name, task, stages, runs };
}

/** Every workflow of a brain: `workflows/<name>/CONTEXT.md` (plan §6.5, "Vinden"). */
export async function listWorkflows(root: string): Promise<Workflow[]> {
  const entries = await readdir(join(root, WORKFLOWS), { withFileTypes: true }).catch(() => []);
  const found: Workflow[] = [];
  for (const entry of entries.filter((item) => item.isDirectory() && SAFE.test(item.name) && !item.name.startsWith("_")).sort((a, b) => a.name.localeCompare(b.name))) {
    const workflow = await readWorkflow(root, entry.name);
    if (workflow && workflow.stages.length) found.push(workflow);
  }
  return found;
}

export type StageStart = { ok: true; title: string; prompt: string } | { ok: false; missing: string[]; reason: "missing_input" | "not_ready" | "not_found" };

/**
 * A stage as a new chat (plan §6.5): only when every input is there and the
 * stage before it passed. The prompt names the contract and the exact inputs.
 */
export async function startStage(root: string, name: string, id: string): Promise<StageStart> {
  const workflow = await readWorkflow(root, name);
  const index = workflow?.stages.findIndex((stage) => stage.id === id) ?? -1;
  const stage = workflow?.stages[index];
  if (!workflow || !stage) return { ok: false, missing: [], reason: "not_found" };
  if (stage.missing.length) return { ok: false, missing: stage.missing, reason: "missing_input" };
  if (workflow.stages.slice(0, index).some((before) => before.state !== "done")) return { ok: false, missing: [], reason: "not_ready" };
  const base = `${WORKFLOWS}/${name}/${id}`;
  // A new attempt: the previous verdict no longer applies.
  await rm(join(root, base, "check.md"), { force: true });
  const resolve = (path: string) => posix.normalize(posix.join(base, path));
  const prompt = [
    `Voer stap \`${id}\` van de werkwijze ${workflow.title} uit: ${stage.task}.`,
    "",
    `Lees eerst het contract \`${stage.contract}\` en volg het. Lees alleen deze invoer:`,
    ...[...stage.working, ...stage.references].map((path) => `- \`${resolve(path)}\``),
    "",
    `Schrijf de uitvoer in \`${base}/output/\`${stage.outputs.length ? ` (${stage.outputs.map((output) => `\`${posix.basename(output)}\``).join(", ")})` : ""}. Lees geen andere stappen of eerdere runs.`,
  ].join("\n");
  return { ok: true, title: `${workflow.title}: ${id.replace(/^\d{2}_/, "")}`, prompt };
}

/** A person's verdict (plan §6.5): check.md, first line `pass` or `fail: <waarom>`. */
export async function recordCheck(root: string, name: string, id: string, input: { verdict: "pass" | "fail"; reason: string | null; by: string; at: Date }): Promise<Stage | null> {
  if (!SAFE.test(name) || !STAGE.test(id)) return null;
  const stageDir = join(root, WORKFLOWS, name, id);
  if (!await exists(join(stageDir, "CONTEXT.md"))) return null;
  const first = input.verdict === "pass" ? "pass" : `fail: ${(input.reason ?? "afgekeurd").replace(/\s+/g, " ").trim()}`;
  await writeFile(join(stageDir, "check.md"), `${first}\n\nGecontroleerd door ${input.by}, ${input.at.toISOString().slice(0, 16).replace("T", " ")}.\n`);
  return (await readWorkflow(root, name))?.stages.find((stage) => stage.id === id) ?? null;
}

/** The prompt for a check by a model: answer the contract's Check and write check.md. */
export async function modelCheckPrompt(root: string, name: string, id: string): Promise<string | null> {
  const stage = (await readWorkflow(root, name))?.stages.find((candidate) => candidate.id === id);
  if (!stage) return null;
  const base = `${WORKFLOWS}/${name}/${id}`;
  return [
    `Controleer stap \`${id}\` van deze werkwijze. De controle uit het contract \`${stage.contract}\`:`,
    "",
    stage.check.text,
    "",
    `Lees de uitvoer in \`${base}/output/\` en wat de controle noemt, niets anders.`,
    `Schrijf daarna \`${base}/check.md\` met als eerste regel precies \`pass\`, of \`fail: <waarom in één zin>\`. Pas de uitvoer zelf niet aan.`,
  ].join("\n");
}

/** A new run (plan §6.5): the previous one moves to `_runs/<datum>-<onderwerp>/` (local only). */
export async function newRun(root: string, name: string, subject: string, at: Date): Promise<string | null> {
  const workflow = await readWorkflow(root, name);
  if (!workflow) return null;
  const slug = subject.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "run";
  const stamp = at.toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
  const target = join(root, WORKFLOWS, name, "_runs", `${stamp}-${slug}`);
  let moved = false;
  for (const stage of workflow.stages) {
    const stageDir = join(root, WORKFLOWS, name, stage.id);
    for (const item of ["output", "check.md"]) {
      if (!await exists(join(stageDir, item))) continue;
      if (item === "output" && !await nonEmpty(join(stageDir, item))) continue;
      await mkdir(join(target, stage.id), { recursive: true });
      await rename(join(stageDir, item), join(target, stage.id, item));
      moved = true;
    }
    await mkdir(join(stageDir, "output"), { recursive: true });
  }
  return moved ? posix.basename(target) : null;
}
