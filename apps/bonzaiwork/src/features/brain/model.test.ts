import { describe, expect, it } from "vitest";

import type { BrainHistoryEntry, BrainStatus, ConceptView } from "~/backend/types";

import { attentionKind, brainChip, brainRecovery, conceptChecked, deliverableOf, groupKnowledge, isKnowledgeNote, knowledgeCounts, noteTitle, stageChatTitle, teamOf } from "./model";

const status = (patch: Partial<BrainStatus> = {}): BrainStatus => ({
  kind: "project", state: "synced", mode: "auto", remote: "git@gitlab.com:team/brein.git", branch: "main", ahead: 0, behind: 0, lastSyncAt: 1_000,
  conflictFiles: [], conflictBy: null, merging: false, error: null, repairable: false, fixInNotes: false, pendingTrust: [], unshared: [], warnings: [], excluded: [], proposal: null, outdated: [],
  ...patch,
});

const entry = (author: string, at: number, files: string[] = []): BrainHistoryEntry => ({ commit: `${author}-${at}`, author, at, title: "x", chatId: null, files });

const concept = (patch: Partial<ConceptView> = {}): ConceptView => ({
  type: "Policy", title: null, description: null, tags: [], status: "draft", stale: false, generated: null, verified: [], tier: "unverified", sources: [], ...patch,
});

describe("how a stopped brain starts again (issue 23)", () => {
  it("repairs only a guarded git error; any other stop is retried", () => {
    expect(brainRecovery(status({ state: "error", repairable: true }))).toBe("repair");
    expect(brainRecovery(status({ state: "error" }))).toBe("retry");
    expect(brainRecovery(status({ state: "offline" }))).toBe("retry");
    expect(brainRecovery(status({ state: "error", mode: "read_only" }))).toBeNull();
    expect(brainRecovery(status({ state: "synced" }))).toBeNull();
  });
});

describe("the one reason to act", () => {
  it("is a conflict, parts that can run code, or an error; nothing otherwise", () => {
    expect(attentionKind(status({ state: "conflict" }))).toBe("conflict");
    expect(attentionKind(status({ state: "needs_trust", pendingTrust: [{ path: "opencode.json", kind: "config", mcpServers: [] }] }))).toBe("needs_trust");
    expect(attentionKind(status({ state: "needs_trust" }))).toBeNull();
    expect(attentionKind(status({ state: "error" }))).toBe("error");
    expect(attentionKind(status({ state: "behind", behind: 2 }))).toBeNull();
  });

  it("shows as icon + word: amber for a decision, red for a failure, a lock for read-only", () => {
    expect(brainChip(status({ state: "conflict" })).status).toBe("waiting");
    expect(brainChip(status({ state: "error" })).status).toBe("failed");
    expect(brainChip(status({ state: "read_only" })).status).toBe("locked");
    expect(brainChip(status({ state: "syncing" })).status).toBe("running");
    expect(brainChip(status(), 1_000)).toEqual({ status: "idle", label: "Bijgewerkt zojuist" });
  });
});

describe("the team in the state line", () => {
  it("lists colleagues from the history, newest first, never the user", () => {
    const history = [entry("Jij", 30), entry("Sanne de Vries", 20), entry("Ahmed Yilmaz", 25), entry("Sanne de Vries", 10)];
    expect(teamOf(history, "Jij")).toEqual(["Ahmed Yilmaz", "Sanne de Vries"]);
    expect(teamOf([entry("Lotte", 1), entry("Lotte", 2)], "Lotte")).toEqual([]);
  });
});

describe("knowledge rows", () => {
  it("takes the notes under knowledge/ without the generated files", () => {
    expect(isKnowledgeNote("knowledge/offertes/kortingsbeleid.md")).toBe(true);
    expect(isKnowledgeNote("knowledge/log.md")).toBe(false);
    expect(isKnowledgeNote("knowledge/index.md")).toBe(false);
    expect(isKnowledgeNote("offertes/2026-031.md")).toBe(false);
    expect(noteTitle("knowledge/offertes/kortingsbeleid.md")).toBe("Kortingsbeleid");
    expect(noteTitle("knowledge/producten/pakketten-2026.md")).toBe("Pakketten 2026");
  });

  it("groups by concept type in people words, known types first, titles sorted", () => {
    const groups = groupKnowledge([
      { path: "knowledge/z.md", concept: concept({ type: "Process", title: "Offerte maken" }) },
      { path: "knowledge/b.md", concept: concept({ type: "Policy", title: "Retouren" }) },
      { path: "knowledge/a.md", concept: concept({ type: "Policy", title: "Korting" }) },
      { path: "knowledge/c.md", concept: null },
    ]);
    expect(groups.map((group) => group.label)).toEqual(["Beleid", "Werkwijzen", "Overig"]);
    expect(groups[0]?.items.map((item) => item.concept?.title)).toEqual(["Korting", "Retouren"]);
  });

  it("counts what needs a look: stale notes and notes nobody checked after the last change", () => {
    const checked = concept({ tier: "human", verified: [{ by: "human:Jij", at: null }] });
    expect(conceptChecked(checked)).toBe(true);
    expect(conceptChecked(concept({ tier: "human", stale: true }))).toBe(false);
    expect(knowledgeCounts([{ path: "a", concept: checked }, { path: "b", concept: concept({ stale: true }) }, { path: "c", concept: concept() }])).toEqual({ stale: 1, unverified: 2 });
  });
});

describe("workflow checks name the deliverable", () => {
  const stage = { id: "02_opzet", task: "brief tot conceptofferte", outputs: ["output/conceptofferte.md"], check: { kind: "person" as const, text: "" }, state: "check" as const, failure: null, missing: [] };
  it("asks about the file, not the folder id, and finds the chat by its title", () => {
    expect(deliverableOf(stage)).toBe("conceptofferte.md");
    expect(deliverableOf({ ...stage, outputs: [] })).toBe("opzet");
    expect(stageChatTitle("Offerte maken", stage)).toBe("Offerte maken: opzet");
  });
});
