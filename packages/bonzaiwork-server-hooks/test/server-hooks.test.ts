import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { engineHistoryDatabase } from "../src/engine-history.ts";
import { createCombinedHooks } from "../src/server-hooks.ts";

test("één module met de routes en policies van beide", () => {
  const hooks = createCombinedHooks({ litellm: { settings: { litellmBaseUrl: "https://litellm.example.invalid", defaultModel: null, keyMode: "user", preferredModels: [] } } });
  expect(hooks.allowedProviderIds).toEqual(["litellm"]);
  const paths = hooks.routes.map((route) => `${route.method} ${route.path}`);
  expect(paths).toContain("GET /bonzaiwork/status");
  expect(paths).toContain("POST /bonzaiwork/brains/:workspaceId/pull");
  expect(paths).toContain("GET /bonzaiwork/agenda/day");
  expect(paths).toContain("POST /bonzaiwork/agenda/booking-doc/save");
  expect(hooks.enginePolicies()[0]).toEqual({ action: "tool.use", resource: "shell:git *", effect: "deny" });
});

test("engine v2 gets BonzaiWork's own history database, never OpenCode's shared one (#34)", () => {
  const state = mkdtempSync(join(tmpdir(), "bonzaiwork-history-"));
  try {
    const environment = { BONZAIWORK_STATE_DIR: state, HOME: "/home/someone", XDG_DATA_HOME: "/home/someone/.local/share" };
    const hooks = createCombinedHooks({ environment, litellm: { settings: { litellmBaseUrl: "https://litellm.example.invalid", defaultModel: null, keyMode: "user", preferredModels: [] } } });
    const database = hooks.engineHistoryDatabase();
    expect(database).toBe(join(state, "opencode", "opencode.db"));
    expect(database).not.toBe(join(environment.XDG_DATA_HOME, "opencode", "opencode.db"));
    // The engine creates the file; the hook makes sure its folder is there.
    expect(statSync(join(state, "opencode")).isDirectory()).toBe(true);
    expect(existsSync(database)).toBe(false);
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
  // Headless (no Electron entry): under ~/.bonzaiwork, like the brains and routines state.
  expect(engineHistoryDatabase({ HOME: "/home/someone" })).toBe(join("/home/someone", ".bonzaiwork", "opencode", "opencode.db"));
});
