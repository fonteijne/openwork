import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

/**
 * BonzaiWork's own OpenCode chat history (fonteijne/openwork#34).
 *
 * Since upstream v0.18.65 (#6979) the server no longer copies older history
 * into its own v2 database (`<runtime>/opencode-v2/state/opencode.db`). While
 * that has no chats it selects `OPENCODE_DB`, or else the database every
 * OpenCode install shares (`$XDG_DATA_HOME/opencode/opencode.db`), and the v2
 * engine converts that one in place (apps/server/src/opencode-history.ts).
 * BonzaiWork is a closed environment: it must not show chats from a separate
 * OpenCode CLI or app, nor convert their database. The `engineHistoryDatabase`
 * hook hands v2 this file instead. Existing BonzaiWork chats stay where they
 * are: the server keeps its own v2 database as soon as that holds chats.
 *
 * Only for v2: a process-wide `OPENCODE_DB` would also reach engine v1, which
 * then cannot open the file v2 created, and upstream's fallback to a private
 * v1 database is off whenever `OPENCODE_DB` is set.
 */
export function engineHistoryDatabase(environment: NodeJS.ProcessEnv = process.env): string {
  // userData/bonzaiwork in the app (the Electron entry sets it on "ready"); ~/.bonzaiwork headless.
  const stateDirectory = environment.BONZAIWORK_STATE_DIR?.trim() || join(environment.HOME?.trim() || homedir(), ".bonzaiwork");
  return join(resolve(stateDirectory), "opencode", "opencode.db");
}

/** The hook: the engine creates the file, but its folder must exist. */
export function prepareEngineHistoryDatabase(environment: NodeJS.ProcessEnv = process.env): string {
  const database = engineHistoryDatabase(environment);
  mkdirSync(dirname(database), { recursive: true, mode: 0o700 });
  return database;
}
