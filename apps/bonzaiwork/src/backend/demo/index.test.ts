import { describe, expect, it } from "vitest";

import { sortAttention, type AttentionItem } from "../types";
import { createDemoBackend } from "./index";

function demo() {
  return createDemoBackend({ empty: false, keyMode: "workspace", engineV2: false, noPreferred: false });
}

const kinds = (items: AttentionItem[]) => items.map((item) => (item.kind === "routine" ? `${item.kind}:${item.reason}` : item.kind));

describe("demo attention.list", () => {
  it("lists what waits, in the order of Voor jou: the agent's decisions first, then failures, then routines", async () => {
    const items = await demo().attention.list();
    expect(kinds(items)).toEqual(["permission", "question", "chat_failed", "routine:needs_attention", "routine:missed"]);
    expect(items[0]).toMatchObject({ projectId: "p-offertes", chatId: "c-index", chatTitle: "Prijsindexatie 2027 doorrekenen", request: { id: "perm-index", scope: "*.md" } });
    expect(items[1]).toMatchObject({ projectId: "p-service", chatId: "c-complaint", request: { id: "q-complaint" } });
    expect(items[2]).toMatchObject({ projectId: "p-finance", chatId: "c-invoices", error: { kind: "budget_exceeded" } });
    expect(items[3]).toMatchObject({ routineId: "r-closing", detail: expect.stringContaining("Mistral Large 3") });
    expect(items[4]).toMatchObject({ routineId: "r-inbox", detail: null });
  });

  it("drops an item once it is answered", async () => {
    const backend = demo();
    await backend.interactions.rejectQuestion("p-service", "c-complaint", "q-complaint");
    const items = await backend.attention.list();
    expect(items.some((item) => item.kind === "question")).toBe(false);
    expect(items.some((item) => item.kind === "permission")).toBe(true);
  });

  it("counts a failed chat in the project summary", async () => {
    const backend = demo();
    expect((await backend.projects.summary("p-finance")).failedCount).toBe(1);
    expect((await backend.projects.summary("p-offertes")).failedCount).toBe(0);
  });
});

describe("sortAttention", () => {
  it("keeps the kinds in brief order and the newest first within a kind", () => {
    const proposal = { id: "x", preference: "Kort.", reason: null, at: 50 };
    const request = { id: "p", chatId: "c", action: "edit", resources: [], canAlways: false, message: null, scope: null };
    const items: AttentionItem[] = [
      { kind: "proposal", proposal, at: 50 },
      { kind: "brain", projectId: "a", state: "conflict", at: 10 },
      { kind: "routine", projectId: "a", routineId: "r1", name: "Gemist", reason: "missed", detail: null, at: 90 },
      { kind: "routine", projectId: "a", routineId: "r2", name: "Kapot", reason: "failed", detail: "Fout", at: 5 },
      { kind: "chat_failed", projectId: "a", chatId: "c1", chatTitle: "Mislukt", error: { kind: "unknown", detail: null }, at: 1 },
      { kind: "question", projectId: "a", chatId: "c2", chatTitle: "Vraag", request: { id: "q", chatId: "c2", fields: [] }, at: 20 },
      { kind: "permission", projectId: "a", chatId: "c3", chatTitle: "Oud", request, at: 10 },
      { kind: "permission", projectId: "a", chatId: "c4", chatTitle: "Nieuw", request, at: 30 },
    ];
    const sorted = sortAttention(items);
    expect(sorted.map((item) => (item.kind === "routine" ? item.routineId : item.kind === "permission" || item.kind === "question" ? item.chatId : item.kind))).toEqual([
      "c4", "c2", "c3", "chat_failed", "r2", "r1", "brain", "proposal",
    ]);
  });
});

describe("demo chats.recent", () => {
  it("merges the newest top-level chats across unarchived projects, newest first, with a preview", async () => {
    const backend = demo();
    const recent = await backend.chats.recent(4);
    expect(recent.map((chat) => chat.id)).toEqual(["c-comp", "c-index", "c-webinar", "c-complaint"]);
    expect(recent.map((chat) => chat.projectId)).toEqual(["p-marketing", "p-offertes", "p-marketing", "p-service"]);
    const webinar = recent.find((chat) => chat.id === "c-webinar");
    expect(webinar?.preview).toMatch(/^De uitnodiging staat in webinar\/uitnodiging-klanten\.md, klaar voor 184 klanten/);
    expect(webinar?.preview?.length).toBeLessThanOrEqual(121);
    const all = await backend.chats.recent(50);
    const ids = all.map((chat) => chat.id);
    expect(ids).not.toContain("c-move");
    expect(ids).not.toContain("c-week-sub");
    expect(all.every((chat, index) => index === 0 || (all[index - 1]?.updatedAt ?? 0) >= chat.updatedAt)).toBe(true);
    expect(all.find((chat) => chat.id === "c-week")).toMatchObject({ routineId: "r-week", preview: expect.stringMatching(/^Week 44: 4 offertes verstuurd, 1 akkoord/) });
    expect(all.find((chat) => chat.id === "c-invoices")?.preview).toBeNull();
    expect(await backend.chats.recent(0)).toEqual([]);
  });

  it("gives the same preview through chats.list", async () => {
    const page = await demo().chats.list("p-offertes", null);
    expect(page.items.find((chat) => chat.id === "c-vandijk")?.preview).toMatch(/^Hier is een voorstel: Onderwerp: Offerte onderhoud en migratie webshop/);
  });
});
