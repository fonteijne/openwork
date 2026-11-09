import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { addInstructions, applyBoilerplate, applyTemplate, boilerplateEnabled, boilerplateTargets, isNewFolder } from "../src/template.ts";

const BOILERPLATE = join(import.meta.dir, "../templates/project");

async function files(root: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else found.push(relative(root, path));
    }
  }
  await walk(root);
  return found.sort();
}

async function withFolder(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "boilerplate-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("projectboilerplate", () => {
  test("aan, tenzij BONZAIWORK_PROJECT_BOILERPLATE uit staat", () => {
    expect(boilerplateEnabled({})).toBe(true);
    expect(boilerplateEnabled({ BONZAIWORK_PROJECT_BOILERPLATE: "" })).toBe(true);
    expect(boilerplateEnabled({ BONZAIWORK_PROJECT_BOILERPLATE: "aan" })).toBe(true);
    for (const value of ["uit", "UIT", " off ", "nee", "no", "false", "0"]) expect(boilerplateEnabled({ BONZAIWORK_PROJECT_BOILERPLATE: value })).toBe(false);
  });

  test("een nieuw project krijgt elk bestand, verborgen mappen en niet-Markdown precies zoals ze zijn", () => withFolder(async (root) => {
    const written = await applyBoilerplate(root, { name: "Offertes", description: "" });
    expect(written).toEqual(await files(BOILERPLATE));
    expect(written).toEqual([...boilerplateTargets().keys()].sort());
    for (const path of [".gitignore", ".obsidian/app.json", ".obsidian/themes/Minimal/theme.css", ".obsidian/plugins/obsidian-style-settings/main.js", ".claude/skills/compile-source/SKILL.md"]) {
      expect(await readFile(join(root, path), "utf8")).toBe(await readFile(join(BOILERPLATE, path), "utf8"));
    }
    const agents = await readFile(join(root, "AGENTS.md"), "utf8");
    expect(agents.startsWith("# Offertes\n\n## Agent entry point\n")).toBe(true);
    expect(agents).not.toContain("{{");
  }));

  test("een bestaand bestand blijft staan", () => withFolder(async (root) => {
    await writeFile(join(root, "README.md"), "# Van mij\n");
    const written = await applyBoilerplate(root, { name: "X", description: "Over X." });
    expect(written).not.toContain("README.md");
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("# Van mij\n");
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toStartWith("# X\n\nOver X.\n\n## Agent entry point");
  }));

  test("alleen een map zonder eigen inhoud is nieuw", () => withFolder(async (root) => {
    expect(await isNewFolder(join(root, "bestaat-niet"))).toBe(true);
    await mkdir(join(root, ".opencode", "openwork"), { recursive: true });
    await writeFile(join(root, ".DS_Store"), "");
    expect(await isNewFolder(root)).toBe(true);
    await writeFile(join(root, "notities.md"), "# Notities\n");
    expect(await isNewFolder(root)).toBe(false);
  }));

  test("de instructies van een starter komen één keer onder AGENTS.md", () => withFolder(async (root) => {
    await applyBoilerplate(root, { name: "Offertes", description: "" });
    await addInstructions(root, "Schrijf in de u-vorm.");
    await addInstructions(root, "Nog een keer.");
    const agents = await readFile(join(root, "AGENTS.md"), "utf8");
    expect(agents).toContain("## Agent entry point");
    expect(agents.trimEnd().endsWith("## Projectinstructies\n\nSchrijf in de u-vorm.")).toBe(true);
    expect(agents).not.toContain("Nog een keer.");
  }));

  test("een projectbrein krijgt de boilerplate plus de breinbasis, met de route onder AGENTS.md", () => withFolder(async (root) => {
    const result = await applyTemplate(root, { kind: "project", name: "Marketing", description: "", now: new Date("2026-11-09T10:00:00Z"), boilerplate: true });
    expect(result.extendedAgents).toBe(false);
    for (const path of ["CLAUDE.md", "wiki/index.md", ".obsidian/app.json", "knowledge/index.md", "knowledge/log.md", "_meta/schema.md", ".opencode/skills/okf-ingest/SKILL.md", ".opencode/skills/icm-architect/SKILL.md"]) {
      expect(result.written).toContain(path);
    }
    const agents = await readFile(join(root, "AGENTS.md"), "utf8");
    expect(agents).toStartWith("# Marketing\n\nWaar dit brein over gaat en voor wie.\n\n## Agent entry point");
    expect(agents).toContain("## Waar alles staat");
    expect(agents.split("\n").length).toBeLessThanOrEqual(60);
    // The boilerplate's own wiki index is not one of the brain's generated knowledge indexes.
    expect(await readFile(join(root, "wiki/index.md"), "utf8")).toBe(await readFile(join(BOILERPLATE, "wiki/index.md"), "utf8"));
  }));

  test("uitgezet, of een persoonlijk brein: het sjabloon zonder boilerplate", () => withFolder(async (root) => {
    await applyTemplate(join(root, "team"), { kind: "project", name: "Sales", description: "", now: new Date(), boilerplate: false });
    expect(await readFile(join(root, "team", "AGENTS.md"), "utf8")).toStartWith("# Sales\n");
    expect((await readdir(join(root, "team"))).includes("CLAUDE.md")).toBe(false);
    await applyTemplate(join(root, "mij"), { kind: "personal", name: "Mijn brein", description: "", now: new Date(), boilerplate: true });
    expect((await readdir(join(root, "mij"))).includes("CLAUDE.md")).toBe(false);
    expect((await readdir(join(root, "team"))).includes("wiki")).toBe(false);
  }));
});
