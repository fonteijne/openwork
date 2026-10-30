import { findBrain, type TeamBrain } from "./mcp.ts";

/**
 * Reading another brain asks first (plan §5.2), with the engine's ordinary
 * question; the engine only says `*`, not which brain. Where nobody needs to
 * click (a routine, or a project that may always consult that brain), the
 * server answers it: it finds the brain in the tool call, and allows the read
 * once when that brain is on the list. Anything else waits for the user.
 */
export type EngineRequest = (workspaceId: string, method: string, path: string, body?: unknown) => Promise<{ status: number; body: unknown }>;

const BRAIN_READ = /^breinen_brein_(lezen|zoeken)$/;

type Json = Record<string, unknown>;
const record = (value: unknown): Json | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null);
const text = (value: unknown, key: string): string | null => {
  const found = record(value)?.[key];
  return typeof found === "string" ? found : null;
};
const listOf = (value: unknown): unknown[] => {
  const data = record(value)?.data ?? value;
  return Array.isArray(data) ? data : [];
};

/** The `brein` argument of the tool call a question is about. */
export function brainOfCall(messages: unknown, callId: string | null, action: string): string | null {
  const found: string[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { for (const item of value) visit(item); return; }
    const node = record(value);
    if (!node) return;
    const tool = text(node, "tool") ?? text(node, "name");
    const call = text(node, "callID") ?? text(node, "callId");
    if (tool && (tool === action || tool.endsWith(`_${action}`))) {
      const state = record(node.state);
      let input: unknown = state?.input ?? node.input;
      if (typeof input === "string") { try { input = JSON.parse(input); } catch { input = null; } }
      const brain = text(input, "brein");
      if (brain && (callId === null || call === callId)) found.push(brain);
    }
    for (const child of Object.values(node)) if (typeof child === "object") visit(child);
  };
  visit(messages);
  return found.at(-1) ?? null;
}

/** Answers the open brain-read questions of one chat whose brain is in `allowed` (workspace ids). */
export async function answerBrainReads(input: {
  request: EngineRequest; workspaceId: string; sessionId: string; allowed: readonly string[]; brains: () => Promise<TeamBrain[]>;
  log?: (message: string, fields: Record<string, unknown>) => void;
}): Promise<number> {
  if (!input.allowed.length) return 0;
  const session = encodeURIComponent(input.sessionId);
  const pending = await input.request(input.workspaceId, "GET", `/api/session/${session}/permission`);
  const questions = listOf(pending.body).flatMap((item) => {
    const id = text(item, "id");
    const action = text(item, "action") ?? text(item, "permission");
    return id && action && BRAIN_READ.test(action) ? [{ id, action, callId: text(record(item)?.source, "callID") ?? text(record(item)?.tool, "callID") }] : [];
  });
  if (!questions.length) return 0;
  const messages = await input.request(input.workspaceId, "GET", `/api/session/${session}/message?limit=200`);
  const brains = await input.brains();
  let answered = 0;
  for (const question of questions) {
    const name = brainOfCall(messages.body, question.callId, question.action);
    const brain = name ? findBrain(brains, name) : null;
    if (!brain || !input.allowed.includes(brain.id)) continue;
    await input.request(input.workspaceId, "POST", `/api/session/${session}/permission/${encodeURIComponent(question.id)}/reply`, { decision: "once", reply: "once" });
    input.log?.("brain read allowed without a click", { brain: brain.id, session: input.sessionId });
    answered += 1;
  }
  return answered;
}
