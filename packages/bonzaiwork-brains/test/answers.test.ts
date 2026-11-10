import { expect, test } from "bun:test";

import { answerBrainReads, answerConversationReads, brainOfCall } from "../src/answers.ts";
import type { TeamBrain } from "../src/mcp.ts";

const brains: TeamBrain[] = [
  { id: "ws_sales", name: "Sales", description: "", root: "/b/Sales", lastSyncAt: null },
  { id: "ws_service", name: "Klantenservice", description: "", root: "/b/Service", lastSyncAt: null },
];

test("alleen een vraag voor een brein op de lijst wordt beantwoord, één keer", async () => {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const request = async (_workspaceId: string, method: string, path: string, body?: unknown) => {
    calls.push({ method, path, body });
    if (path.endsWith("/permission")) return { status: 200, body: { data: [
      { id: "per_1", action: "breinen_brein_lezen", resources: ["*"], source: { type: "tool", callID: "call_a" } },
      { id: "per_2", action: "breinen_brein_zoeken", resources: ["*"], source: { type: "tool", callID: "call_b" } },
      { id: "per_3", action: "bash", resources: ["*"] },
    ] } };
    if (path.includes("/message")) return { status: 200, body: { data: [{ info: { id: "msg_1" }, parts: [
      { type: "tool", tool: "breinen_brein_lezen", callID: "call_a", state: { status: "pending", input: { brein: "sales-brein", pad: "knowledge/log.md" } } },
      { type: "tool", tool: "breinen_brein_zoeken", callID: "call_b", state: { status: "pending", input: JSON.stringify({ brein: "Klantenservice", vraag: "x" }) } },
    ] }] } };
    return { status: 204, body: null };
  };
  expect(await answerBrainReads({ request, workspaceId: "ws_x", sessionId: "ses_1", allowed: ["ws_sales"], brains: async () => brains })).toBe(1);
  const replies = calls.filter((entry) => entry.path.endsWith("/reply"));
  expect(replies).toEqual([{ method: "POST", path: "/api/session/ses_1/permission/per_1/reply", body: { decision: "once", reply: "once" } }]);
  expect(await answerBrainReads({ request, workspaceId: "ws_x", sessionId: "ses_1", allowed: [], brains: async () => brains })).toBe(0);
  expect(brainOfCall({ parts: [{ tool: "breinen_brein_lezen", callID: "c", state: { input: { brein: "Sales" } } }] }, "other", "breinen_brein_lezen")).toBeNull();
});

test("gesprekken lezen: toegestaan in Jouw brein, geweigerd elders, altijd zonder kaart", async () => {
  const calls: Array<{ path: string; body: unknown }> = [];
  const request = async (_workspaceId: string, method: string, path: string, body?: unknown) => {
    if (method === "POST") calls.push({ path, body });
    if (path.endsWith("/permission")) return { status: 200, body: { data: [
      { id: "per_1", action: "breinen_gesprekken_lezen", resources: ["*"] },
      { id: "per_2", action: "breinen_brein_lezen", resources: ["*"] },
    ] } };
    return { status: 204, body: null };
  };
  expect(await answerConversationReads({ request, workspaceId: "ws_mijn", sessionId: "ses_1", allow: true })).toBe(1);
  expect(calls).toEqual([{ path: "/api/session/ses_1/permission/per_1/reply", body: { decision: "once", reply: "once" } }]);
  calls.length = 0;
  expect(await answerConversationReads({ request, workspaceId: "ws_sales", sessionId: "ses_2", allow: false })).toBe(1);
  expect(calls).toEqual([{ path: "/api/session/ses_2/permission/per_1/reply", body: { decision: "reject", reply: "reject" } }]);
});
