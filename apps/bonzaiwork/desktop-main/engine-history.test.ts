import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { engineHistoryDatabase, engineHistoryEnvironment } from "./engine-history";

const stateDir = join("/profile", "BonzaiWork", "bonzaiwork");
const shared = join("/home", "someone", ".local", "share", "opencode", "opencode.db");

describe("engine history", () => {
  test("lives under BonzaiWork's state folder, never in OpenCode's shared data folder", () => {
    expect(engineHistoryDatabase(stateDir)).toBe(join(stateDir, "opencode", "opencode.db"));
    // The server falls back to $XDG_DATA_HOME/opencode/opencode.db when OPENCODE_DB is empty.
    for (const env of [{}, { OPENCODE_DB: "" }, { OPENCODE_DB: "   " }, { XDG_DATA_HOME: join("/home", "someone", ".local", "share") }]) {
      const { OPENCODE_DB } = engineHistoryEnvironment(env, stateDir);
      expect(OPENCODE_DB).toBe(engineHistoryDatabase(stateDir));
      expect(OPENCODE_DB).not.toBe(shared);
    }
  });

  test("an explicit OPENCODE_DB wins", () => {
    expect(engineHistoryEnvironment({ OPENCODE_DB: "/tmp/test-profile/opencode.db" }, stateDir)).toEqual({ OPENCODE_DB: "/tmp/test-profile/opencode.db" });
  });
});
