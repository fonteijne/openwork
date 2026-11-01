import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { listWorkflows, modelCheckPrompt, newRun, recordCheck, startStage } from "../src/workflows.ts";

const cleanup: string[] = [];
afterEach(async () => { for (const dir of cleanup.splice(0)) await rm(dir, { recursive: true, force: true }); });

const stage = (id: string, task: string, inputs: string[], output: string, check: string) => `# ${id} - ${task}

Eén taak: ${task}.

## Inputs
${inputs.join("\n")}

Do NOT load: andere stappen.

## Process
1. Ontbreekt een invoer of is hij leeg, stop en zeg welke.

## Outputs
- \`${output}\` -> \`output/\`

## Check
${check}
`;

async function brain(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "workflows-"));
  cleanup.push(root);
  const files: Record<string, string> = {
    "knowledge/offertes/kortingsbeleid.md": "---\ntype: Policy\n---\n# Korting\n",
    "workflows/CONTEXT.md": "# Werkwijzen\n",
    "workflows/offerte-maken/CONTEXT.md": "# Offerte maken - van aanvraag naar gecontroleerde offerte\n",
    "workflows/offerte-maken/01_intake/CONTEXT.md": stage("01_intake", "aanvraag tot brief", ["- Working (deze run): `../../../_inbox/aanvraag.md`"], "brief.md", "De gebruiker leest de brief na."),
    "workflows/offerte-maken/02_opzet/CONTEXT.md": stage("02_opzet", "brief tot conceptofferte", ["- Working (deze run): `../01_intake/output/brief.md`", "- Reference (elke run): `../../../knowledge/offertes/kortingsbeleid.md`"], "conceptofferte.md", "Een klein model beantwoordt: staat elke korting binnen het beleid? Schrijft `check.md`."),
  };
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  return root;
}

describe("werkwijzen in de app (plan §6.5)", () => {
  test("vinden, status van schijf, invoer eerst, volgende stap pas na pass", async () => {
    const root = await brain();
    let [workflow] = await listWorkflows(root);
    expect(workflow).toMatchObject({ name: "offerte-maken", title: "Offerte maken", task: "van aanvraag naar gecontroleerde offerte" });
    expect(workflow?.stages.map((item) => [item.id, item.state, item.check.kind])).toEqual([["01_intake", "waiting", "person"], ["02_opzet", "waiting", "model"]]);
    expect(workflow?.stages[0]?.missing).toEqual(["../../../_inbox/aanvraag.md"]);

    // A missing input stops the stage before it starts, and says which.
    expect(await startStage(root, "offerte-maken", "01_intake")).toEqual({ ok: false, missing: ["../../../_inbox/aanvraag.md"], reason: "missing_input" });
    await mkdir(join(root, "_inbox"), { recursive: true });
    await writeFile(join(root, "_inbox/aanvraag.md"), "Graag een offerte.\n");
    const started = await startStage(root, "offerte-maken", "01_intake");
    expect(started.ok && started.prompt).toContain("`workflows/offerte-maken/01_intake/CONTEXT.md`");
    expect(started.ok && started.prompt).toContain("- `_inbox/aanvraag.md`");
    expect(started.ok && started.title).toBe("Offerte maken: intake");
    expect(await startStage(root, "offerte-maken", "02_opzet")).toMatchObject({ ok: false });

    // The chat wrote the output: the stage waits for the person's check.
    await mkdir(join(root, "workflows/offerte-maken/01_intake/output"), { recursive: true });
    await writeFile(join(root, "workflows/offerte-maken/01_intake/output/brief.md"), "Brief\n");
    [workflow] = await listWorkflows(root);
    expect(workflow?.stages[0]?.state).toBe("check");
    expect(workflow?.stages[1]?.state).toBe("waiting");

    const failed = await recordCheck(root, "offerte-maken", "01_intake", { verdict: "fail", reason: "klantnaam ontbreekt", by: "Anna", at: new Date("2026-10-30T10:00:00Z") });
    expect(failed).toMatchObject({ state: "failed", failure: "klantnaam ontbreekt" });
    const passed = await recordCheck(root, "offerte-maken", "01_intake", { verdict: "pass", reason: null, by: "Anna", at: new Date("2026-10-30T10:05:00Z") });
    expect(passed?.state).toBe("done");
    expect(await readFile(join(root, "workflows/offerte-maken/01_intake/check.md"), "utf8")).toStartWith("pass\n");
    [workflow] = await listWorkflows(root);
    expect(workflow?.stages[1]?.state).toBe("ready");
    const second = await startStage(root, "offerte-maken", "02_opzet");
    expect(second.ok && second.prompt).toContain("- `knowledge/offertes/kortingsbeleid.md`");
    expect(second.ok && second.prompt).toContain("- `workflows/offerte-maken/01_intake/output/brief.md`");
    expect(await modelCheckPrompt(root, "offerte-maken", "02_opzet")).toContain("`workflows/offerte-maken/02_opzet/check.md`");
  });

  test("een nieuwe run zet de vorige apart; onveilige namen werken niet", async () => {
    const root = await brain();
    await mkdir(join(root, "workflows/offerte-maken/01_intake/output"), { recursive: true });
    await writeFile(join(root, "workflows/offerte-maken/01_intake/output/brief.md"), "Brief\n");
    await writeFile(join(root, "workflows/offerte-maken/01_intake/check.md"), "pass\n");
    const run = await newRun(root, "offerte-maken", "Bakkerij De Linde", new Date("2026-10-30T09:15:00Z"));
    expect(run).toBe("20261030-0915-bakkerij-de-linde");
    expect(await readdir(join(root, "workflows/offerte-maken/01_intake/output"))).toEqual([]);
    expect(await readFile(join(root, `workflows/offerte-maken/_runs/${run}/01_intake/output/brief.md`), "utf8")).toBe("Brief\n");
    const [workflow] = await listWorkflows(root);
    expect(workflow?.runs).toEqual([run ?? ""]);
    expect(workflow?.stages[0]?.state).toBe("waiting");
    expect(await startStage(root, "../x", "01_intake")).toMatchObject({ ok: false, reason: "not_found" });
    expect(await recordCheck(root, "offerte-maken", "../../x", { verdict: "pass", reason: null, by: "A", at: new Date() })).toBeNull();
  });
});
