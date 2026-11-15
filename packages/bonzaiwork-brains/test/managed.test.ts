import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { managedFiles, writeManaged } from "../src/managed.ts";
import { createBrainsServerHooks, type BrainsHost } from "../src/server-hooks.ts";

const cleanup: string[] = [];
let hooks: ReturnType<typeof createBrainsServerHooks> | null = null;
afterEach(async () => {
  hooks?.stop();
  hooks = null;
  for (const path of cleanup.splice(0)) await rm(path, { recursive: true, force: true });
});

async function temp(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  cleanup.push(path);
  return path;
}

type Context = { instructions: string | null; skillsDirectory: string | null; commandsDirectory?: string | null };

function fakeHost(workspaces: Array<{ id: string; path: string }>): BrainsHost & { context: Context | null } {
  const host: BrainsHost & { context: Context | null } = {
    port: 4242, readOnly: false, context: null, engineConfigDirectory: "/engine/config",
    workspaces: () => workspaces,
    reloadEngineProviders: async () => {},
    onSessionActivity: () => () => {},
    runningSessions: async () => [],
    sessionInfo: async (id) => ({ id, title: "Chat", parentId: null }),
    updateEngineMcp: async () => true,
    setEngineGlobalContext: async (input) => { host.context = input; },
    log: () => {},
  };
  return host;
}

describe("skills en commando's uit de app", () => {
  test("de map is precies wat de build levert: nieuw geschreven, gewijzigd hersteld, vreemd weggehaald", async () => {
    const root = await temp("managed-");
    const folders = await writeManaged(root);
    expect(folders).toEqual({ skills: join(root, "skills"), commands: join(root, "commands") });
    const files = [...managedFiles().keys()];
    expect(files).toEqual(expect.arrayContaining([
      "skills/okf-ingest/SKILL.md", "skills/okf-query/SKILL.md", "skills/okf-lint/SKILL.md",
      "skills/icm-architect/SKILL.md", "skills/icm-architect/references/core.md", "skills/icm-architect/LICENSE",
      "commands/verwerk.md", "commands/vastleggen.md", "commands/onderhoud.md", "commands/werkwijze.md",
    ]));
    for (const path of files) expect(existsSync(join(root, path))).toBe(true);

    // An older build left a changed skill and a skill that no longer ships; someone added a file.
    await writeFile(join(root, "skills/okf-query/SKILL.md"), "oud");
    await mkdir(join(root, "skills/verdwenen"), { recursive: true });
    await writeFile(join(root, "skills/verdwenen/SKILL.md"), "---\nname: verdwenen\n---\n");
    await writeFile(join(root, "commands/eigen.md"), "eigen");
    await writeManaged(root);
    expect(await readFile(join(root, "skills/okf-query/SKILL.md"), "utf8")).toBe(managedFiles().get("skills/okf-query/SKILL.md") ?? "");
    expect(existsSync(join(root, "skills/verdwenen/SKILL.md"))).toBe(false);
    expect(existsSync(join(root, "commands/eigen.md"))).toBe(false);
  });

  test("de skills werken in elk project: het brein van het project, anders het persoonlijke brein; geen shell in een commando", () => {
    const files = managedFiles();
    for (const name of ["okf-ingest", "okf-query", "okf-lint"]) {
      const skill = files.get(`skills/${name}/SKILL.md`) ?? "";
      expect(skill).toContain("knowledge/index.md");
      expect(skill).toContain("persoonlijk_brein_lezen");
    }
    for (const [path, content] of files) if (path.startsWith("commands/")) expect(content).not.toMatch(/!`/);
  });

  test("in elke chat, ook zonder persoonlijk brein; de eigen skills van een brein tellen niet meer mee", async () => {
    const state = await temp("state-");
    const vault = await temp("vault-");
    await mkdir(join(vault, ".opencode/skills/eigen"), { recursive: true });
    await writeFile(join(vault, ".opencode/skills/eigen/SKILL.md"), "---\nname: eigen\ndescription: eigen\n---\n");
    const host = fakeHost([{ id: "ws_mijn", path: vault }]);
    hooks = createBrainsServerHooks({ stateDirectory: state, environment: { PATH: process.env.PATH ?? "", HOME: state } });
    await hooks.start(host);
    expect(host.context).toMatchObject({ skillsDirectory: join(state, "managed", "skills"), commandsDirectory: join(state, "managed", "commands") });
    expect(existsSync(join(state, "managed/skills/okf-query/SKILL.md"))).toBe(true);

    const register = hooks.routes.find((route) => route.method === "PUT" && route.path === "/bonzaiwork/brains/:workspaceId");
    const response = await register?.handle(new Request("http://x", { method: "PUT", body: JSON.stringify({ kind: "personal" }) }), { workspaceId: "ws_mijn" });
    expect(response?.status).toBe(200);
    expect(host.context?.skillsDirectory).toBe(join(state, "managed", "skills"));
    // The template writes knowledge and preferences, and leaves the skills to the app.
    expect(existsSync(join(vault, "_meta/voorkeuren.md"))).toBe(true);
    expect(existsSync(join(vault, ".opencode/skills/okf-query"))).toBe(false);
    expect(existsSync(join(vault, ".opencode/commands"))).toBe(false);

    const settings = hooks.routes.find((route) => route.method === "GET" && route.path === "/bonzaiwork/brains/settings");
    expect(await (await settings?.handle(new Request("http://x"), {}))?.json()).toMatchObject({ managedSkills: true });
  });

  test("BONZAIWORK_MANAGED_SKILLS=0: zoals het was, de skills van het persoonlijke brein in elk project en een kopie in het brein", async () => {
    const state = await temp("state-");
    const vault = await temp("vault-");
    const host = fakeHost([{ id: "ws_mijn", path: vault }]);
    hooks = createBrainsServerHooks({ stateDirectory: state, environment: { PATH: process.env.PATH ?? "", HOME: state, BONZAIWORK_MANAGED_SKILLS: "0" } });
    await hooks.start(host);
    expect(host.context).toMatchObject({ skillsDirectory: null, commandsDirectory: null });
    expect(existsSync(join(state, "managed"))).toBe(false);
    expect(hooks.enginePolicies().some((policy) => policy.effect === "allow")).toBe(false);

    const register = hooks.routes.find((route) => route.method === "PUT" && route.path === "/bonzaiwork/brains/:workspaceId");
    await register?.handle(new Request("http://x", { method: "PUT", body: JSON.stringify({ kind: "personal" }) }), { workspaceId: "ws_mijn" });
    expect(existsSync(join(vault, ".opencode/skills/okf-query/SKILL.md"))).toBe(true);
    expect(existsSync(join(vault, ".opencode/commands/verwerk.md"))).toBe(true);
    expect(host.context?.skillsDirectory).toBe(join(vault, ".opencode", "skills"));
    const settings = hooks.routes.find((route) => route.method === "GET" && route.path === "/bonzaiwork/brains/settings");
    expect(await (await settings?.handle(new Request("http://x"), {}))?.json()).toMatchObject({ managedSkills: false });
  });
});
