import { describe, expect, it } from "vitest";

import type { AttentionItem, Brain, BrainHistoryEntry, Chat, Project, Routine } from "~/backend/types";

import { attentionKey, awayRows, defaultProjectId, lastUserText, nextRoutine, projectNeed } from "./model";

const project = (id: string, pinned = false): Project => ({
  id,
  name: id,
  path: `/p/${id}`,
  description: null,
  color: "jade",
  icon: "folder",
  pinned,
  archivedAt: null,
  key: { hasKey: true, keyHint: "…1234" },
  defaultModel: null,
  allowedModels: null,
});

const chat = (id: string, projectId: string, updatedAt: number, extra: Partial<Chat> = {}): Chat => ({
  id,
  projectId,
  title: id,
  untitled: false,
  createdAt: updatedAt - 1000,
  updatedAt,
  model: null,
  parentId: null,
  groupId: null,
  pinned: false,
  archived: false,
  note: null,
  status: "idle",
  revertMessageId: null,
  routineId: null,
  preview: null,
  ...extra,
});

const brain = (projectId: string, kind: "project" | "personal" = "project"): Brain => ({
  projectId,
  path: `/b/${projectId}`,
  status: {
    kind,
    state: "synced",
    mode: "auto",
    remote: null,
    branch: "main",
    ahead: 0,
    behind: 0,
    lastSyncAt: null,
    conflictFiles: [],
    conflictBy: null,
    merging: false,
    error: null,
    repairable: false,
    fixInNotes: false,
    pendingTrust: [],
    unshared: [],
    warnings: [],
    excluded: [],
    proposal: null,
  },
});

const entry = (commit: string, author: string, at: number): BrainHistoryEntry => ({ commit, author, at, title: commit, chatId: null, files: [] });

describe("defaultProjectId", () => {
  it("prefers the project used last when it is still listed", () => {
    expect(defaultProjectId("b", [project("a", true), project("b")])).toBe("b");
  });
  it("falls back to the first pinned project, then the first", () => {
    expect(defaultProjectId("gone", [project("a"), project("b", true)])).toBe("b");
    expect(defaultProjectId(null, [project("a"), project("b")])).toBe("a");
    expect(defaultProjectId(null, [])).toBeNull();
  });
});

describe("attentionKey", () => {
  it("keys a routine by its reason, so a missed and a failed run are two cards", () => {
    const base = { kind: "routine" as const, projectId: "p", routineId: "r", name: "r", detail: null, model: null, at: 1 };
    expect(attentionKey({ ...base, reason: "missed" })).not.toBe(attentionKey({ ...base, reason: "failed" }));
  });
});

describe("awayRows", () => {
  const now = 1_000_000;
  it("lists finished chats and colleagues' brain changes since lastSeenAt, newest first, capped", () => {
    const chats = [
      chat("old", "p", now - 500),
      chat("new", "p", now - 100),
      chat("running", "p", now - 50, { status: "running" }),
      chat("sub", "p", now - 40, { parentId: "new" }),
      chat("newer", "p", now - 10),
    ];
    const history = [
      { brain: brain("p"), entries: [entry("mine", "Jij", now - 5), entry("theirs", "Sanne", now - 20), entry("earlier", "Sanne", now - 900)] },
      { brain: brain("me", "personal"), entries: [entry("personal", "Ahmed", now - 1)] },
    ];
    const rows = awayRows({ chats, history, lastSeenAt: now - 200, ownAuthor: null });
    expect(rows.map((row) => row.key)).toEqual(["chat:newer", "brain:p:theirs", "chat:new"]);
    expect(awayRows({ chats, history, lastSeenAt: now - 200, ownAuthor: null, limit: 2 })).toHaveLength(2);
  });
  it("skips the person's own history entries by their author name", () => {
    const history = [{ brain: brain("p"), entries: [entry("c", "Kim", 10)] }];
    expect(awayRows({ chats: [], history, lastSeenAt: 0, ownAuthor: "Kim" })).toEqual([]);
  });
});

describe("nextRoutine", () => {
  const routine = (id: string, state: Routine["state"], nextRunAt: number | null): Routine => ({
    id,
    projectId: "p",
    name: id,
    prompt: "",
    model: null,
    schedule: { kind: "daily", timezone: "Europe/Amsterdam", hour: 9, minute: 0 },
    state,
    needsAttentionReason: null,
    nextRunAt,
    lastRun: null,
    createdAt: 0,
    updatedAt: 0,
    brains: [],
  });
  it("picks the soonest active routine in the future", () => {
    const soonest = routine("b", "active", 200);
    expect(nextRoutine([routine("a", "active", 300), soonest, routine("c", "inactive", 100), routine("d", "active", 50)], 100)).toBe(soonest);
    expect(nextRoutine([], 100)).toBeNull();
  });
});

describe("projectNeed", () => {
  it("returns the first card of that project, never a proposal", () => {
    const items: AttentionItem[] = [
      { kind: "proposal", proposal: { id: "x", preference: "p", reason: null, at: 1 }, at: 1 },
      { kind: "chat_failed", projectId: "p", chatId: "c", chatTitle: "c", error: { kind: "unknown", detail: null }, at: 1 },
    ];
    expect(projectNeed("p", items)?.kind).toBe("chat_failed");
    expect(projectNeed("q", items)).toBeNull();
  });
});

describe("lastUserText", () => {
  it("finds the last user message and joins its text parts", () => {
    const messages = [
      { id: "u1", role: "user" as const, parts: [{ type: "text", text: "eerste" }] },
      { id: "a1", role: "assistant" as const, parts: [{ type: "text", text: "antwoord" }] },
      { id: "u2", role: "user" as const, parts: [{ type: "file" }, { type: "text", text: "tweede" }] },
      { id: "a2", role: "assistant" as const, parts: [] },
    ];
    expect(lastUserText(messages)).toEqual({ id: "u2", text: "tweede" });
    expect(lastUserText([])).toBeNull();
  });
});
