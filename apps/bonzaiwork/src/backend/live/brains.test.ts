import { describe, expect, it } from "vitest";

import { BackendError } from "../types";
import { createBrainsClient, readBrainStatus } from "./brains";
import type { RequestOptions } from "./http";

type Call = { path: string; options: RequestOptions | undefined };

function client(replies: Record<string, unknown>, folder = "/Users/jij/BonzaiWork") {
  const calls: Call[] = [];
  const brains = createBrainsClient(
    async (path, options) => {
      calls.push({ path, options });
      const key = Object.keys(replies).find((prefix) => path.startsWith(prefix));
      const reply = key === undefined ? undefined : replies[key];
      if (reply instanceof Error) throw reply;
      return reply;
    },
    async (target) => target.folderPath ?? `${folder}/${target.name}`,
  );
  return { brains, calls };
}

describe("brain status", () => {
  it("reads every field and fills the gaps", () => {
    expect(readBrainStatus({ state: "behind", kind: "project", behind: 2, remote: "git@gitlab.com:team/brein.git", excluded: ["Dagboek"], pendingTrust: [{ path: "opencode.json", kind: "config", mcpServers: ["crm"] }, { path: "x", kind: "weird" }] })).toEqual({
      kind: "project",
      state: "behind",
      mode: "auto",
      remote: "git@gitlab.com:team/brein.git",
      branch: "main",
      ahead: 0,
      behind: 2,
      lastSyncAt: null,
      conflictFiles: [],
      conflictBy: null,
      merging: false,
      error: null,
      pendingTrust: [{ path: "opencode.json", kind: "config", mcpServers: ["crm"] }],
      unshared: [],
      warnings: [],
      excluded: ["Dagboek"],
      proposal: null,
    });
  });

  it("refuses an unknown state", () => {
    expect(readBrainStatus({ state: "exploded" })).toBeNull();
    expect(readBrainStatus(null)).toBeNull();
  });
});

describe("brains client", () => {
  it("lists brains with their project", async () => {
    const { brains } = client({ "/bonzaiwork/brains": { brains: [{ workspaceId: "w1", path: "/x", status: { state: "synced" } }, { workspaceId: "w2", status: { state: "?" } }] } });
    const listed = await brains.list();
    expect(listed.map((entry) => [entry.projectId, entry.path, entry.status.state])).toEqual([["w1", "/x", "synced"]]);
  });

  it("maps a failed check, and a bad link to the link problem", async () => {
    const unknown = client({ "/bonzaiwork/brains/check-remote": { ok: false, problem: "host_unknown", message: "Onbekend", host: { name: "git.example", fingerprints: ["SHA256:abc"] } } });
    expect(await unknown.brains.checkRemote("git@git.example:a/b.git")).toEqual({
      ok: false, sshUrl: null, name: null, problem: "host_unknown", message: "Onbekend", host: { name: "git.example", fingerprints: ["SHA256:abc"] },
    });
    const bad = client({ "/bonzaiwork/brains/check-remote": new BackendError("link_invalid", "x", 400) });
    expect(await bad.brains.checkRemote("hallo")).toMatchObject({ ok: false, problem: "link" });
  });

  it("clones into the default folder when none was chosen", async () => {
    const { brains, calls } = client({ "/bonzaiwork/brains/clone": { jobId: "job_1" } });
    expect(await brains.clone("git@gitlab.com:team/brein.git", { folderPath: null, name: "Sales" })).toEqual({ jobId: "job_1", folderPath: "/Users/jij/BonzaiWork/Sales" });
    expect(calls[0]?.options?.body).toEqual({ url: "git@gitlab.com:team/brein.git", folderPath: "/Users/jij/BonzaiWork/Sales" });
    expect(calls[0]?.options?.host).toBe(true);
  });

  it("waits for a clone job to finish", async () => {
    const { brains } = client({ "/bonzaiwork/brains/jobs/": { state: "failed", error: "Geen toegang" } });
    expect(await brains.job("job_1")).toEqual({ state: "failed", error: "Geen toegang", status: null });
  });

  it("reads a concept and the author settings", async () => {
    const { brains } = client({
      "/bonzaiwork/brains/w1/concept": { concept: { type: "Concept", title: "Korting", status: "stable", stale: true, tier: "human", verified: [{ by: "Sanne", at: "2026-10-01" }], sources: [{ title: "Prijslijst" }] } },
      "/bonzaiwork/brains/settings": { author: null, suggested: { name: "Jij", email: "jij@example.com" } },
    });
    expect(await brains.concept("w1", "knowledge/korting.md")).toMatchObject({ title: "Korting", status: "stable", stale: true, tier: "human", sources: [{ title: "Prijslijst" }] });
    expect(await brains.author()).toEqual({ author: null, suggested: { name: "Jij", email: "jij@example.com" } });
  });
});
