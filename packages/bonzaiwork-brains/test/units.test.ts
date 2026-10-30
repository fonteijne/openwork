import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { bundledGit, createGit } from "../src/git.ts";
import { scanForSecrets } from "../src/secrets.ts";
import { commandRunsShell, mcpServerNames, riskKind, sparsePatterns, withLocalExcludes } from "../src/trust.ts";

describe("geheimenscan (plan §7.2)", () => {
  test("namen en inhoud", () => {
    const hits = scanForSecrets([
      { path: ".env", content: "A=1" },
      { path: "config/.env.production", content: "" },
      { path: ".env.example", content: "A=" },
      { path: "keys/id_ed25519", content: "" },
      { path: "knowledge/a.md", content: "LiteLLM: sk-1234567890abcdefghijklmn" },
      { path: "knowledge/b.md", content: "glpat-abcdefghij0123456789" },
      { path: "knowledge/c.md", content: "Gewone tekst over sk-teams." },
      { path: "knowledge/d.md", content: null },
    ]);
    expect(hits.map((hit) => hit.path)).toEqual([".env", "config/.env.production", "keys/id_ed25519", "knowledge/a.md", "knowledge/b.md"]);
  });
});

describe("vertrouwen", () => {
  test("riskante paden", () => {
    expect(riskKind("opencode.json")).toBe("config");
    expect(riskKind(".opencode/opencode.jsonc")).toBe("config");
    expect(riskKind("sub/opencode.json")).toBeNull();
    expect(riskKind(".opencode/plugin/x.ts")).toBe("plugin");
    expect(riskKind(".opencode/agents/a.md")).toBe("agent");
    expect(riskKind(".opencode/commands/x.md")).toBe("command");
    expect(riskKind("_tools/check.sh")).toBe("script");
    expect(riskKind(".opencode/skills/x/SKILL.md")).toBeNull();
    expect(commandRunsShell("Uit: !`git log`")).toBe(true);
    expect(commandRunsShell("Gebruik `code` en een !")).toBe(false);
  });

  test("MCP-namen uit opencode.json, v1 en v2, met commentaar", () => {
    expect(mcpServerNames(`{ // c\n "mcp": { "b": {}, "a": {}, }, }`)).toEqual(["a", "b"]);
    expect(mcpServerNames(`{"mcp":{"servers":{"x":{}},"timeout":{}}}`)).toEqual(["x"]);
    expect(mcpServerNames("geen json")).toEqual([]);
  });

  test("sparse-patronen en lokale uitsluitingen", () => {
    expect(sparsePatterns([{ path: ".opencode/plugins/[x].js", kind: "plugin", blob: "b" }])).toEqual(["/*", "!/.opencode/plugins/\\[x\\].js"]);
    const once = withLocalExcludes("# eigen regel\n*.log\n");
    expect(withLocalExcludes(once)).toBe(once);
    expect(once.startsWith("# eigen regel\n*.log\n# >>> BonzaiWork")).toBe(true);
    expect(once).toContain("/.opencode/openwork/inbox/");
  });
});

describe("git geïsoleerd (fase 0 §1.3)", () => {
  test("de omgeving en config van de gebruiker tellen niet mee, en alleen SSH (plus file in tests)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "iso-"));
    const git = await createGit({
      stateDirectory: join(dir, "state"),
      environment: { PATH: process.env.PATH ?? "", HOME: dir, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "user.name", GIT_CONFIG_VALUE_0: "Lek", GIT_ASKPASS: "/bin/echo" },
    });
    const config = await git.run(["config", "--get", "user.name"], { cwd: dir });
    expect(config.stdout.trim()).toBe("");
    const https = await git.run(["ls-remote", "https://github.com/example/x.git"], { cwd: dir, timeoutMs: 10_000 });
    expect(https.exitCode).not.toBe(0);
    expect(https.stderr).toMatch(/transport 'https' not allowed/);
    const file = await git.run(["ls-remote", `file://${dir}`], { cwd: dir });
    expect(file.stderr).toMatch(/transport 'file' not allowed/);
    await rm(dir, { recursive: true, force: true });
  });

  test("meegeleverde git: binary en exec-path zoals dugite", () => {
    expect(bundledGit("/app/git", "darwin", "arm64", "/usr/bin")).toEqual({
      binary: "/app/git/bin/git",
      env: { PATH: "/usr/bin", GIT_EXEC_PATH: "/app/git/libexec/git-core", GIT_TEMPLATE_DIR: "/app/git/share/git-core/templates" },
    });
    const windows = bundledGit("C:\\app\\git", "win32", "x64", "C:\\Windows");
    expect(windows.binary.endsWith("git.exe")).toBe(true);
    expect(windows.env.GIT_EXEC_PATH).toContain("ucrt64");
  });
});
