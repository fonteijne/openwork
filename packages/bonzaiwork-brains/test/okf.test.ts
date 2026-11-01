import { afterEach, describe, expect, test } from "bun:test";
import { readdir, readFile, rm, mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { checkContract, contentWarnings, referencePaths } from "../src/icm.ts";
import { appendLog, describeConcept, mergeLogs, parseConcept, renderIndex, withGenerated, withVerified } from "../src/okf.ts";
import { TEMPLATE_FILES } from "../src/template-files.ts";
import { applyTemplate, templateTargets } from "../src/template.ts";
import { createWorld, type World } from "./world.ts";

let world: World | undefined;
afterEach(async () => { await world?.dispose(); world = undefined; });

const concept = (type: string, title: string, extra = "") => `---\ntype: ${type}\ntitle: ${title}\ndescription: Over ${title.toLowerCase()}.\n${extra}---\n# ${title}\n`;

describe("OKF", () => {
  test("conformiteit (spec §11)", () => {
    expect(parseConcept("# geen kop").ok).toBe(false);
    expect(parseConcept("---\ntitle: x\n---\n").ok === false && parseConcept("---\ntitle: x\n---\n")).toMatchObject({ problem: "no_type" });
    expect(parseConcept("---\ntype: [\n---\n")).toMatchObject({ ok: false, problem: "invalid_yaml" });
    expect(parseConcept(concept("Process", "Offerteproces"))).toMatchObject({ ok: true, concept: { type: "Process", title: "Offerteproces" } });
  });

  test("generated en verified laten onbekende sleutels, volgorde en commentaar staan", () => {
    const text = "---\ntype: Process # het soort\nx-team: sales\ntags: [a, b]\n---\n# Body\n";
    const updated = withGenerated(text, "bonzaiwork/0.1.0", "2026-10-30T10:00:00Z");
    expect(updated).toBe("---\ntype: Process # het soort\nx-team: sales\ntags: [a, b]\ngenerated: {by: bonzaiwork/0.1.0, at: 2026-10-30T10:00:00Z}\n---\n# Body\n");
    const again = withGenerated(updated, "human:anna", "2026-10-31T09:00:00Z");
    expect(again.match(/generated/g)?.length).toBe(1);
    expect(again).toContain("by: human:anna");
    const verified = withVerified(concept("Process", "X", "status: draft\n"), "human:anna", "2026-10-30T11:00:00Z");
    expect(parseConcept(verified)).toMatchObject({ ok: true, concept: { status: "stable" } });
    expect(verified).toContain("- by: human:anna");
  });

  test("index.md volgens spec §8, root met alleen okf_version", () => {
    expect(renderIndex({
      root: true,
      folders: [{ name: "offertes", concepts: 2 }],
      concepts: [
        { file: "b.md", title: "Kortingsbeleid", description: "Wanneer korting mag.", type: "Policy" },
        { file: "a.md", title: "Offerteproces", description: null, type: "Process" },
      ],
    })).toBe('---\nokf_version: "0.2"\n---\n\n# Mappen\n\n* [Offertes](offertes/index.md) - 2 concepten\n\n# Policy\n\n* [Kortingsbeleid](b.md) - Wanneer korting mag.\n\n# Process\n\n* [Offerteproces](a.md)\n');
    expect(renderIndex({ root: false, folders: [], concepts: [] }).startsWith("#")).toBe(true);
  });

  test("log.md: nieuwste datum boven, samenvoegen verliest niets (spec §9)", () => {
    const first = appendLog(null, "2026-10-29", [{ label: "Creation", title: "A", link: "a.md", note: "chat 1" }]);
    const ours = appendLog(first, "2026-10-30", [{ label: "Update", title: "A", link: "a.md", note: "chat 2" }]);
    const theirs = appendLog(first, "2026-10-30", [{ label: "Creation", title: "B", link: "sub/b.md", note: "chat 3" }]);
    expect(ours).toBe("# Logboek\n\n## 2026-10-30\n* **Update**: [A](a.md) - chat 2\n\n## 2026-10-29\n* **Creation**: [A](a.md) - chat 1\n");
    const merged = mergeLogs(ours, theirs);
    expect(merged).toContain("* **Update**: [A](a.md) - chat 2");
    expect(merged).toContain("* **Creation**: [B](sub/b.md) - chat 3");
    expect(merged.match(/chat 1/g)?.length).toBe(1);
    expect(merged.indexOf("2026-10-30")).toBeLessThan(merged.indexOf("2026-10-29"));
  });
});

describe("ICM", () => {
  test("een stapcontract heeft Inputs, Process, Outputs en één Check, en zijn references bestaan", async () => {
    const root = await mkdtemp(join(tmpdir(), "icm-"));
    await mkdir(join(root, "knowledge/offertes"), { recursive: true });
    await writeFile(join(root, "knowledge/offertes/offerteproces.md"), concept("Process", "Offerteproces"));
    const good = "# 02_opzet - x\n\n## Inputs\n- Working (deze run): `../01_intake/output/brief.md`\n- Reference (elke run): `../../../knowledge/offertes/offerteproces.md`\n\n## Process\n1. x\n\n## Outputs\n- `a.md` -> `output/`\n\n## Check\nDe gebruiker leest het.\n";
    expect(referencePaths(good)).toEqual(["../../../knowledge/offertes/offerteproces.md"]);
    expect(await checkContract(root, "workflows/offerte/02_opzet/CONTEXT.md", good)).toEqual([]);
    const bad = good.replace("offerteproces.md`", "weg.md`").replace("## Check\nDe gebruiker leest het.\n", "");
    expect((await checkContract(root, "workflows/offerte/02_opzet/CONTEXT.md", bad)).map((item) => item.problem)).toEqual([
      "de sectie Check ontbreekt", "../../../knowledge/offertes/weg.md bestaat niet",
    ]);
    expect(contentWarnings([{ path: "AGENTS.md", content: "x\n".repeat(70) }, { path: "knowledge/a.md", content: "[w](../workflows/x/CONTEXT.md)" }])).toHaveLength(2);
    await rm(root, { recursive: true, force: true });
  });
});

describe("sjabloon", () => {
  test("het manifest bevat elk bestand uit templates/", async () => {
    const root = join(import.meta.dir, "../templates");
    const files: string[] = [];
    async function walk(dir: string) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) await walk(path);
        else files.push(relative(root, path));
      }
    }
    await walk(root);
    expect([...TEMPLATE_FILES.keys()].sort()).toEqual(files.filter((file) => file !== "vendor/README.md").sort());
    expect([...templateTargets("project").keys()]).toContain(".opencode/skills/icm-architect/SKILL.md");
    expect([...templateTargets("personal").keys()]).toContain("_meta/voorkeuren.md");
    for (const [path, content] of TEMPLATE_FILES) if (path.includes("commands/")) expect(content).not.toMatch(/!`/);
  });

  test("een lege map wordt een conform brein; bestaande notities blijven", async () => {
    const root = await mkdtemp(join(tmpdir(), "tpl-"));
    await writeFile(join(root, "AGENTS.md"), "# Mijn vault\n\nEigen regels.\n");
    await writeFile(join(root, "Dagboek.md"), "privé");
    const result = await applyTemplate(root, { kind: "personal", name: "Mijn brein", description: "", now: new Date("2026-10-30T10:00:00Z") });
    expect(result.extendedAgents).toBe(true);
    const agents = await readFile(join(root, "AGENTS.md"), "utf8");
    expect(agents.startsWith("# Mijn vault\n\nEigen regels.\n\n## Waar alles staat")).toBe(true);
    expect(await readFile(join(root, "Dagboek.md"), "utf8")).toBe("privé");
    expect(result.written).toContain("knowledge/index.md");
    expect(await readFile(join(root, "knowledge/index.md"), "utf8")).toContain('okf_version: "0.2"');
    expect(await readFile(join(root, "knowledge/log.md"), "utf8")).toContain("## 2026-10-30");
    expect((await applyTemplate(root, { kind: "personal", name: "x", description: "", now: new Date() })).written).toEqual([]);
    await rm(root, { recursive: true, force: true });
  });
});

describe("OKF in de sync", () => {
  async function okfWorld() {
    const w = await createWorld({ empty: true });
    const scratch = join(w.root, "tpl");
    await mkdir(scratch, { recursive: true });
    await applyTemplate(scratch, { kind: "project", name: "Sales", description: "Kennis van sales.", now: new Date("2026-10-29T09:00:00Z") });
    const files: Record<string, string> = {};
    async function walk(dir: string) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) await walk(path);
        else files[relative(scratch, path)] = await readFile(path, "utf8");
      }
    }
    await walk(scratch);
    files["knowledge/references/2026-10-29-kickoff.md"] = "---\ntype: Reference\ntitle: Kickoff\n---\nNotulen.\n";
    await w.seed(files);
    return w;
  }

  test("AI-concept krijgt generated van BonzaiWork, eigen werk human:, index en log volgen", async () => {
    world = await okfWorld();
    const a = await world.user("Anna");
    await mkdir(join(a.path, "knowledge/offertes"), { recursive: true });
    await a.write("knowledge/offertes/eigen.md", concept("Policy", "Kortingsbeleid"));
    await a.sync.prepareTurn();
    await a.write("knowledge/offertes/offerteproces.md", concept("Process", "Offerteproces", "status: draft\n"));
    const turn = await a.sync.finishTurn({ title: "Offerte vastleggen", chatId: "ses_1" });
    expect(turn.shared).toBe(true);
    const show = (path: string) => world?.git.ok(["show", `main:${path}`], { cwd: world.bare }) ?? Promise.resolve("");
    expect(await show("knowledge/offertes/offerteproces.md")).toMatch(/generated: \{by: bonzaiwork\/0\.1\.0, at: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\}/);
    expect(await show("knowledge/offertes/eigen.md")).toContain("by: human:anna");
    expect(await show("knowledge/offertes/index.md")).toContain("* [Offerteproces](offerteproces.md) - Over offerteproces.");
    expect(await show("knowledge/index.md")).toContain("* [Offertes](offertes/index.md) - 2 concepten");
    const log = await show("knowledge/log.md");
    expect(log).toContain("* **Creation**: [Offerteproces](offertes/offerteproces.md) - Offerte vastleggen");
    expect(log).toContain("* **Creation**: [Kortingsbeleid](offertes/eigen.md) - eigen wijziging");
  });

  test("een concept zonder type blokkeert; een gewijzigde bron wordt teruggezet", async () => {
    world = await okfWorld();
    const a = await world.user("Anna");
    await a.write("knowledge/kapot.md", "# Geen kop\n");
    const blocked = await a.sync.finishTurn({ title: "x", chatId: "s" });
    expect(blocked).toMatchObject({ committed: false, blockedBy: "knowledge/kapot.md" });
    expect(blocked.status.error).toContain("type");
    await a.write("knowledge/kapot.md", concept("Decision", "Kapot"));
    await a.write("knowledge/references/2026-10-29-kickoff.md", "---\ntype: Reference\ntitle: Kickoff\n---\nAnders.\n");
    const turn = await a.sync.finishTurn({ title: "x", chatId: "s" });
    expect(turn.shared).toBe(true);
    expect(turn.status.warnings[0]).toContain("bron");
    expect(await readFile(join(a.path, "knowledge/references/2026-10-29-kickoff.md"), "utf8")).toContain("Notulen.");
  });

  test("index.md en log.md geven nooit een conflict voor de gebruiker", async () => {
    world = await okfWorld();
    const a = await world.user("Anna");
    const b = await world.user("Bram");
    await a.write("knowledge/a.md", concept("Process", "A"));
    await a.sync.finishTurn({ title: "A", chatId: "s1" });
    await b.write("knowledge/b.md", concept("Process", "B"));
    const turn = await b.sync.finishTurn({ title: "B", chatId: "s2" });
    expect(turn.status.state).toBe("synced");
    const index = await world.git.ok(["show", "main:knowledge/index.md"], { cwd: world.bare });
    expect(index).toContain("[A](a.md)");
    expect(index).toContain("[B](b.md)");
    const log = await world.git.ok(["show", "main:knowledge/log.md"], { cwd: world.bare });
    expect(log).toContain("[A](a.md) - A");
    expect(log).toContain("[B](b.md) - B");
  });

  test("een kapot stapcontract blokkeert; een lange AGENTS.md waarschuwt alleen", async () => {
    world = await okfWorld();
    const a = await world.user("Anna");
    await a.write("workflows/offerte/01_intake/CONTEXT.md", "# 01_intake\n\n## Inputs\n- Reference (elke run): `../../../knowledge/weg.md`\n\n## Process\n1. x\n\n## Outputs\n- `a.md`\n");
    const blocked = await a.sync.finishTurn({ title: "w", chatId: "s" });
    expect(blocked.committed).toBe(false);
    expect(blocked.status.error).toContain("de sectie Check ontbreekt");
    await a.write("workflows/offerte/01_intake/CONTEXT.md", "# 01_intake\n\n## Inputs\n- Reference (elke run): `../../../knowledge/index.md`\n\n## Process\n1. x\n\n## Outputs\n- `a.md`\n\n## Check\nDe gebruiker.\n");
    await a.write("AGENTS.md", `${"regel\n".repeat(70)}`);
    const turn = await a.sync.finishTurn({ title: "w", chatId: "s" });
    expect(turn.shared).toBe(true);
    expect(turn.status.warnings.some((warning) => warning.includes("60 regels"))).toBe(true);
  });
});

describe("Klopt, inrichten en de vertrouwenstrede", () => {
  test("describeConcept: trede, status en verlopen (spec §5.3–§5.5)", () => {
    const now = new Date("2026-10-30T12:00:00Z");
    const base = concept("Policy", "Prijzen", "stale_after: 2026-10-01T00:00:00Z\ngenerated: {by: bonzaiwork/0.1.0, at: 2026-10-30T10:00:00Z}\n");
    expect(describeConcept(base, now)).toMatchObject({ tier: "unverified", status: "stable", stale: true, generated: { by: "bonzaiwork/0.1.0" } });
    const checked = withVerified(base, "human:anna", "2026-10-30T11:00:00Z");
    expect(describeConcept(checked, now)?.tier).toBe("human");
    const changedAfter = withGenerated(checked, "bonzaiwork/0.1.0", "2026-10-30T11:30:00Z");
    expect(describeConcept(changedAfter, now)?.tier).toBe("human_before_change");
    expect(describeConcept(withVerified(base, "process:nightly", "2026-10-30T11:00:00Z").replace("status: stable\n", ""), now)?.tier).toBe("machine");
  });

  test("Klopt zet verified, laat generated staan en deelt", async () => {
    world = await createWorld({ empty: true });
    const a = await world.user("Anna");
    const setUp = await a.sync.setUp({ name: "Sales", description: "Wat sales weet." });
    expect(setUp.written).toContain("_meta/schema.md");
    expect(setUp.status.state).toBe("synced");
    expect(await world.git.ok(["show", "main:AGENTS.md"], { cwd: world.bare })).toContain("# Sales\n\nWat sales weet.");
    await a.write("knowledge/prijzen.md", concept("Policy", "Prijzen", "status: draft\n"));
    await a.sync.finishTurn({ title: "Prijzen", chatId: "s" });
    const result = await a.sync.verify("knowledge/prijzen.md");
    expect(result.concept).toMatchObject({ tier: "human", status: "stable", generated: { by: "bonzaiwork/0.1.0" } });
    expect(await world.git.ok(["log", "-1", "--format=%s", "main"], { cwd: world.bare })).toBe("Nagekeken: Prijzen\n");
    expect(await a.sync.concept("../buiten.md")).toBeNull();
  });
});
