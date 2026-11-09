/**
 * Fase 0 of docs/bonzaiwork/brein-harnas-plan.md, E6: can a brain of kind
 * "project" keep its history outside the folder (`gitDir` in the state
 * directory) without a remote, the way the personal brain does today? Needed
 * for H5: the old personal brain becomes an ordinary brain project.
 *
 *   cd packages/bonzaiwork-brains && bun test ../../scripts/bonzaiwork/spikes/brains/e6-gitdir.test.ts
 */
import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createGit } from "../../../../packages/bonzaiwork-brains/src/git.ts";
import { BrainSync, type BrainRecord } from "../../../../packages/bonzaiwork-brains/src/sync.ts";

const cleanup: string[] = [];
afterEach(async () => { for (const dir of cleanup.splice(0)) await rm(dir, { recursive: true, force: true }); });

test("E6: a personal brain's record re-registered as kind project keeps its history and stays local_only", async () => {
  const root = await mkdtemp(join(tmpdir(), "e6-"));
  cleanup.push(root);
  const git = await createGit({ stateDirectory: join(root, "state"), allowFileProtocol: true });
  const saved: BrainRecord[] = [];
  const common = { git, author: () => ({ name: "Ik", email: "ik@example.invalid" }), save: async (record: BrainRecord) => { saved.push(record); }, retryDelaysMs: [60_000] };
  const path = join(root, "Mijn brein");
  const gitDir = join(root, "state", "history", "oud.git");

  // 1. Today's personal brain: history outside the folder, a note committed from a turn.
  const personal = await BrainSync.initLocal({ ...common, id: "oud", path, gitDir });
  await personal.open();
  await writeFile(join(path, "AGENTS.md"), "# Mijn brein\n");
  await writeFile(join(path, "notitie.md"), "# Notitie\nIets geleerd.\n");
  await personal.finishTurn({ title: "Eerste beurt", chatId: "chat_1" });
  const before = await personal.history();
  expect(before.length).toBeGreaterThan(0);
  expect(existsSync(join(path, ".git"))).toBe(false);
  expect((await personal.statusNow()).state).toBe("local_only");

  // 2. H5: the same record, now kind "project" (what the migration writes to brains.json).
  const record: BrainRecord = { ...personal.snapshot, kind: "project" };
  const project = new BrainSync({ ...common, record });
  await project.open();
  const status = await project.statusNow();
  expect(status.kind).toBe("project");
  expect(status.state).toBe("local_only");
  expect(status.remote).toBeNull();
  expect((await project.history()).map((entry) => entry.title)).toEqual(before.map((entry) => entry.title));

  // 3. It still records turns locally, nothing is sent, no .git appears in the folder.
  await writeFile(join(path, "notitie.md"), "# Notitie\nIets geleerd, en meer.\n");
  await project.finishTurn({ title: "Tweede beurt", chatId: "chat_2" });
  const after = await project.history();
  expect(after.length).toBe(before.length + 1);
  expect(after[0]?.title).toBe("Tweede beurt");
  expect(existsSync(join(path, ".git"))).toBe(false);
  expect((await project.statusNow()).state).toBe("local_only");

  // 4. A plain git in the folder does not see it (nothing for the user to trip over), the state dir does.
  const plain = await git.run(["rev-parse", "--git-dir"], { cwd: path });
  expect(plain.exitCode).not.toBe(0);
  expect(existsSync(join(gitDir, "HEAD"))).toBe(true);
});
