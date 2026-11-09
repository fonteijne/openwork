import { join } from "node:path";

/**
 * BonzaiWork's own OpenCode chat history (fonteijne/openwork#34).
 *
 * Since upstream v0.18.65 (#6979) the OpenWork server no longer copies older
 * history into its own `opencode.db`. Without existing v2 history it hands the
 * engine `OPENCODE_DB`, or else the database shared with every other OpenCode
 * install (`$XDG_DATA_HOME/opencode/opencode.db`), and converts that one to v2
 * in place (apps/server/src/opencode-history.ts). BonzaiWork is a closed
 * environment: it must neither show chats from a separate OpenCode CLI or
 * desktop app nor convert their database. So the entry always sets
 * `OPENCODE_DB` to a file under BonzaiWork's state folder.
 *
 * History that BonzaiWork itself already has stays where it is: the server
 * keeps using its own v2 database (`<runtime>/opencode-v2/state/opencode.db`)
 * as soon as that holds chats, whatever `OPENCODE_DB` says.
 */
export function engineHistoryDatabase(stateDir: string): string {
  return join(stateDir, "opencode", "opencode.db");
}

/**
 * The `OPENCODE_DB` the server and its engines get. An explicit value wins:
 * development, tests and upstream's blank-slate profile point it elsewhere on purpose.
 */
export function engineHistoryEnvironment(env: NodeJS.ProcessEnv, stateDir: string): { OPENCODE_DB: string } {
  return { OPENCODE_DB: env.OPENCODE_DB?.trim() || engineHistoryDatabase(stateDir) };
}
