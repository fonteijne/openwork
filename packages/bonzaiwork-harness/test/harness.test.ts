import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import manifest from "../harness.json" with { type: "json" };
import { brainPaths, compareVersions, HARNESS_FILES, HARNESS_VERSION, harnessItems, itemFingerprint, knownItem, readStamp, shippedVersion, stampedFiles, stripStamp } from "../src/index.ts";

const root = join(import.meta.dir, "..");

describe("het harnas", () => {
  test("src/files.ts en harness.json zijn actueel (pnpm --filter @bonzaiwork/harness manifest)", async () => {
    const files: string[] = [];
    async function walk(dir: string) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) await walk(path);
        else files.push(relative(join(root, "harness"), path).split("\\").join("/"));
      }
    }
    await walk(join(root, "harness"));
    expect([...HARNESS_FILES.keys()].sort()).toEqual(files.sort());
    const check = spawnSync(process.execPath, [join(root, "scripts/manifest.mjs"), "--check"], { encoding: "utf8" });
    expect(check.status, check.stderr).toBe(0);
  });

  test("elk onderdeel heeft een vingerafdruk voor de huidige versie, en commando's draaien geen shell", () => {
    const items = harnessItems();
    expect(items.map((item) => `${item.kind}:${item.name}`)).toEqual(expect.arrayContaining([
      "skill:okf-query", "skill:okf-ingest", "skill:okf-lint", "skill:icm-architect", "skill:brein-mensen",
      "command:verwerk", "command:vastleggen", "command:onderhoud", "command:werkwijze", "command:onthoud",
      "agent:brein",
    ]));
    for (const item of items) {
      expect(shippedVersion(item.kind, item.name, item.files)).toBe(HARNESS_VERSION);
      expect(item.description.length).toBeGreaterThan(0);
      if (item.kind === "command") for (const content of item.files.values()) expect(content).not.toMatch(/!`/);
    }
    expect(manifest.version).toBe(HARNESS_VERSION);
  });

  test("een kopie met stempel is dezelfde versie; een aangepaste kopie is van niemand", () => {
    const item = harnessItems().find((entry) => entry.kind === "skill" && entry.name === "okf-query");
    if (!item) throw new Error("okf-query ontbreekt");
    const stamped = stampedFiles(item);
    const skill = stamped.get("SKILL.md") ?? "";
    expect(readStamp(skill)).toEqual({ name: "okf-query", version: HARNESS_VERSION });
    expect(skill.startsWith("---\nname: okf-query\n")).toBe(true);
    expect(stripStamp(skill)).toBe(item.files.get("SKILL.md") ?? "");
    expect(itemFingerprint(stamped)).toBe(itemFingerprint(item.files));
    expect(shippedVersion("skill", "okf-query", stamped)).toBe(HARNESS_VERSION);
    const changed = new Map(stamped);
    changed.set("SKILL.md", `${skill}\nEigen regel van het team.\n`);
    expect(shippedVersion("skill", "okf-query", changed)).toBeNull();
    expect(knownItem("skill", "okf-query")).toBe(true);
    expect(knownItem("skill", "eigen-skill")).toBe(false);
    // Stamping twice does not stack lines.
    expect(stampedFiles({ ...item, files: stamped }).get("SKILL.md")).toBe(skill);
    expect(brainPaths(item).get("SKILL.md")).toBe(".opencode/skills/okf-query/SKILL.md");
    const command = harnessItems().find((entry) => entry.kind === "command" && entry.name === "verwerk");
    expect(command && brainPaths(command).get("verwerk.md")).toBe(".opencode/commands/verwerk.md");
    expect(command && readStamp(stampedFiles(command).get("verwerk.md") ?? "")).toEqual({ name: "verwerk", version: HARNESS_VERSION });
  });

  test("versies vergelijken", () => {
    expect(compareVersions("1.2.0", "1.10.0")).toBeLessThan(0);
    expect(compareVersions("2.0.0", "1.99.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });
});
