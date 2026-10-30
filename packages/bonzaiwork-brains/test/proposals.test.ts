import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createProposalService, findGh, type ProposalRequest, type ProposalService } from "../src/proposals.ts";
import { createWorld, type World } from "./world.ts";

let world: World | null = null;
const cleanup: string[] = [];
afterEach(async () => {
  await world?.dispose();
  world = null;
  for (const dir of cleanup.splice(0)) await rm(dir, { recursive: true, force: true });
});

const onServer = async (w: World, ref: string, path: string) => (await w.git.run(["show", `${ref}:${path}`], { cwd: w.bare })).stdout;

describe("via voorstel (plan §4.4)", () => {
  test("delen gaat naar een eigen branch met een voorstel; samengevoegd volgt de map weer het team", async () => {
    world = await createWorld();
    await world.seed({ "knowledge/a.md": "a\n" });
    const opened: ProposalRequest[] = [];
    const fake: ProposalService = {
      pushOptions: () => ["merge_request.create"],
      open: async (request) => { opened.push(request); return { url: "https://gitlab.example/team/brein/-/merge_requests/7", manual: false }; },
    };
    const anna = await world.user("Anna", { mode: "proposal", proposals: fake });
    await anna.write("knowledge/b.md", "b\n");
    const first = await anna.sync.finishTurn({ title: "Retourbeleid", chatId: "ses_1" });
    expect(first.shared).toBe(true);
    expect(first.status.proposal).toMatchObject({ url: "https://gitlab.example/team/brein/-/merge_requests/7", manual: false });
    const branch = first.status.proposal?.branch ?? "";
    expect(branch).toMatch(/^bonzaiwork\/anna\/\d{8}-\d{4}$/);
    // The shared branch did not change; the proposal holds the turn. A file:// server has no push options: plain push.
    expect(await onServer(world, "main", "knowledge/b.md")).toBe("");
    expect(await onServer(world, branch, "knowledge/b.md")).toBe("b\n");
    expect(opened[0]).toMatchObject({ branch, base: "main", title: "Retourbeleid" });

    // A next turn updates the same proposal.
    await anna.write("knowledge/c.md", "c\n");
    const second = await anna.sync.finishTurn({ title: "Nog een", chatId: "ses_2" });
    expect(second.status.proposal?.branch).toBe(branch);
    expect(opened.length).toBe(1);
    expect(await onServer(world, branch, "knowledge/c.md")).toBe("c\n");

    // A teammate also changed main, then the proposal was squash-merged.
    await world.seed({ "knowledge/z.md": "z\n" }, "ander werk");
    await world.raw(["fetch", "-q", "origin", branch]);
    await world.raw(["merge", "-q", "--squash", "FETCH_HEAD"]);
    await world.raw(["commit", "-q", "-m", "Voorstel van Anna"]);
    await world.raw(["push", "-q", "origin", "HEAD:refs/heads/main"]);
    const after = await anna.sync.prepareTurn();
    expect(after.proposal).toBeNull();
    expect(after.state).toBe("synced");
    expect(after.ahead).toBe(0);
  });

  test("GitHub via de gh van de gebruiker; zonder gh een link om zelf te openen", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gh-"));
    cleanup.push(dir);
    const gh = join(dir, "gh");
    await writeFile(gh, "#!/bin/sh\necho \"$@\" > \"$(dirname \"$0\")/args\"\necho https://github.com/team/brein/pull/12\n");
    await chmod(gh, 0o755);
    const request: ProposalRequest = { remote: "git@github.com:team/brein.git", branch: "bonzaiwork/anna/20261030-1200", base: "main", title: "Retourbeleid", body: "- Retourbeleid" };
    const service = createProposalService({ gh, environment: { HOME: dir, PATH: "/usr/bin:/bin" } });
    expect(service.pushOptions(request)).toEqual([]);
    expect(await service.open({ ...request, pushOutput: "" })).toEqual({ url: "https://github.com/team/brein/pull/12", manual: false });
    expect(await Bun.file(join(dir, "args")).text()).toBe("pr create --repo team/brein --head bonzaiwork/anna/20261030-1200 --base main --title Retourbeleid --body - Retourbeleid\n");
    const without = createProposalService({ gh: null });
    expect(await without.open({ ...request, pushOutput: "" })).toEqual({ url: "https://github.com/team/brein/compare/main...bonzaiwork%2Fanna%2F20261030-1200?expand=1", manual: true });
    expect(findGh({ BONZAIWORK_GH: gh })).toBe(gh);
    expect(findGh({ PATH: dir }, "linux")).toBe(gh);
  });

  test("GitLab: het merge request komt uit de push", async () => {
    const service = createProposalService({ gh: null });
    const request: ProposalRequest = { remote: "git@gitlab.com:team/brein.git", branch: "bonzaiwork/anna/x", base: "main", title: "Retour\nbeleid", body: "" };
    expect(service.pushOptions(request)).toEqual(["merge_request.create", "merge_request.target=main", "merge_request.title=Retour beleid", "merge_request.remove_source_branch"]);
    expect(await service.open({ ...request, pushOutput: "remote: View merge request for bonzaiwork/anna/x:\nremote:   https://gitlab.com/team/brein/-/merge_requests/3\n" })).toEqual({ url: "https://gitlab.com/team/brein/-/merge_requests/3", manual: false });
    expect((await service.open({ ...request, pushOutput: "" })).manual).toBe(true);
  });
});
