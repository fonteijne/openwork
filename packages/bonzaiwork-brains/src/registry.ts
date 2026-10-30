import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { Author, BrainKind, BrainMode, BrainRecord } from "./sync.ts";

/**
 * Which folders are brains, per user (userData/bonzaiwork/brains.json; plan
 * §3). Trust decisions and sync bookkeeping live here, never in the repo.
 */
type RegistryFile = { version: 1; author: Author | null; brains: BrainRecord[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const KINDS: readonly BrainKind[] = ["project", "personal"];
const MODES: readonly BrainMode[] = ["auto", "manual", "read_only"];

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readRecord(value: unknown): BrainRecord | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.path !== "string" || typeof value.branch !== "string") return null;
  const kind = KINDS.find((candidate) => candidate === value.kind);
  const mode = MODES.find((candidate) => candidate === value.mode);
  if (!kind || !mode) return null;
  const trusted: Record<string, string> = {};
  if (isRecord(value.trusted)) for (const [path, blob] of Object.entries(value.trusted)) if (typeof blob === "string") trusted[path] = blob;
  return {
    id: value.id, kind, path: value.path, gitDir: stringOrNull(value.gitDir), mode, remote: stringOrNull(value.remote),
    branch: value.branch, trusted, lastSyncedRemote: stringOrNull(value.lastSyncedRemote),
    lastSyncAt: typeof value.lastSyncAt === "number" ? value.lastSyncAt : null, gitConfig: stringOrNull(value.gitConfig),
    excluded: Array.isArray(value.excluded) ? value.excluded.filter((folder): folder is string => typeof folder === "string") : [],
  };
}

function readAuthor(value: unknown): Author | null {
  return isRecord(value) && typeof value.name === "string" && typeof value.email === "string" && value.name && value.email
    ? { name: value.name, email: value.email } : null;
}

export class BrainRegistry {
  private data: RegistryFile = { version: 1, author: null, brains: [] };
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly file: string) {}

  async load(): Promise<void> {
    const text = await readFile(this.file, "utf8").catch(() => null);
    if (text === null) return;
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return; }
    if (!isRecord(parsed)) return;
    this.data = {
      version: 1,
      author: readAuthor(parsed.author),
      brains: Array.isArray(parsed.brains) ? parsed.brains.flatMap((entry) => readRecord(entry) ?? []) : [],
    };
  }

  get author(): Author | null { return this.data.author; }
  get brains(): readonly BrainRecord[] { return this.data.brains; }
  find(id: string): BrainRecord | undefined { return this.data.brains.find((brain) => brain.id === id); }

  setAuthor(author: Author): Promise<void> {
    this.data = { ...this.data, author };
    return this.flush();
  }

  upsert(record: BrainRecord): Promise<void> {
    this.data = { ...this.data, brains: [...this.data.brains.filter((brain) => brain.id !== record.id), record] };
    return this.flush();
  }

  remove(id: string): Promise<void> {
    this.data = { ...this.data, brains: this.data.brains.filter((brain) => brain.id !== id) };
    return this.flush();
  }

  /** Serialized, atomic writes: a crash never leaves half a file. */
  private flush(): Promise<void> {
    const snapshot = JSON.stringify(this.data, null, 2);
    const run = this.writing.then(async () => {
      await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
      const temporary = `${this.file}.tmp-${randomBytes(6).toString("hex")}`;
      await writeFile(temporary, `${snapshot}\n`, { mode: 0o600 });
      await rename(temporary, this.file);
    });
    this.writing = run.catch(() => undefined);
    return run;
  }
}
