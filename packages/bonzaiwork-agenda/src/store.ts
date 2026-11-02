import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { isDate } from "./clock.ts";
import { defaultSettings, emptyDay, parseDay, parseSettings } from "./parse.ts";
import type { AgendaDay, AgendaSettings } from "./types.ts";

/**
 * The agenda on disk (plan §5.1): `agenda/settings.json` and one file per day in `agenda/days/`.
 * Every write is atomic (temporary file, then rename) with mode 0600, and writes take turns in one
 * queue. A file that cannot be read as JSON is moved aside (`*.corrupt-<time>`) and read as empty,
 * so the next write never destroys what was there.
 */
export type AgendaStore = {
  readonly directory: string;
  readSettings(): Promise<AgendaSettings>;
  writeSettings(settings: AgendaSettings): Promise<void>;
  readDay(date: string): Promise<AgendaDay>;
  writeDay(day: AgendaDay): Promise<void>;
};

type Log = (level: "info" | "warn" | "error", message: string, fields?: Record<string, unknown>) => void;

export function createAgendaStore(options: { directory: string; log: Log; now?: () => number }): AgendaStore {
  const directory = options.directory;
  const now = options.now ?? Date.now;
  let queue: Promise<void> = Promise.resolve();

  const settingsFile = join(directory, "settings.json");
  const dayFile = (date: string) => {
    if (!isDate(date)) throw new Error(`Invalid date ${date}`);
    return join(directory, "days", `${date}.json`);
  };

  async function readJson(file: string): Promise<{ found: false } | { found: true; value: unknown }> {
    let content: string;
    try {
      content = await readFile(file, "utf8");
    } catch {
      return { found: false };
    }
    try {
      return { found: true, value: JSON.parse(content) };
    } catch (error) {
      const aside = `${file}.corrupt-${now()}`;
      await rename(file, aside).catch(() => undefined);
      options.log("warn", "Agenda file could not be read; starting empty", { file, movedTo: aside, error: String(error) });
      return { found: false };
    }
  }

  function write(file: string, value: unknown): Promise<void> {
    const next = queue.then(async () => {
      await mkdir(dirname(file), { recursive: true, mode: 0o700 });
      const temporary = `${file}.tmp-${randomBytes(4).toString("hex")}`;
      await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
      // An existing umask can narrow the mode, never widen it; make sure it is 0600.
      await chmod(temporary, 0o600);
      await rename(temporary, file);
    });
    queue = next.catch((error: unknown) => options.log("error", "Agenda could not be saved", { file, error: String(error) }));
    return next;
  }

  return {
    directory,
    async readSettings() {
      const read = await readJson(settingsFile);
      return read.found ? parseSettings(read.value) : defaultSettings();
    },
    writeSettings: (settings) => write(settingsFile, settings),
    async readDay(date) {
      const read = await readJson(dayFile(date));
      return read.found ? parseDay(read.value, date) : emptyDay(date);
    },
    writeDay: (day) => write(dayFile(day.date), day),
  };
}
