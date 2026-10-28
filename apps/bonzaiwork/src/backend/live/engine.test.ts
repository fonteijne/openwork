import { describe, expect, it } from "vitest";

import { createTranslator, readChatError, readMessage } from "./engine";

const DIR = "/home/test/BonzaiWork/Offertes";
const at = (type: string, data: Record<string, unknown>) => ({ type, data, location: { directory: DIR }, created: 1_000 });

describe("readMessage", () => {
  it("skips bookkeeping entries and reads assistant turns with tools", () => {
    expect(readMessage({ id: "m0", type: "idle", outcome: "succeeded", time: { created: 1 } }, "s")).toBeNull();
    const message = readMessage(
      {
        id: "m1",
        type: "assistant",
        time: { created: 10, completed: 20 },
        model: { id: "rig-sonnet", providerID: "litellm" },
        content: [
          { type: "tool", id: "call_1", name: "read", state: { status: "completed", input: { path: "prijslijst.md" }, content: [{ type: "text", text: "inhoud" }] }, time: { ran: 11, completed: 12 } },
          { type: "text", text: "Klaar." },
        ],
        tokens: { input: 120, output: 20, reasoning: 0, cache: { read: 0, write: 0 } },
      },
      "s",
    );
    expect(message?.parts).toEqual([
      { type: "tool", id: "call_1", tool: "read", status: "completed", input: { path: "prijslijst.md" }, output: "inhoud", error: null, startedAt: 11, endedAt: 12, childChatId: null },
      { type: "text", id: "m1:0", text: "Klaar." },
    ]);
    expect(message?.model).toBe("rig-sonnet");
    expect(message?.tokens?.input).toBe(120);
  });

  it("shows the words of a user turn, not the hidden context", () => {
    const message = readMessage({ id: "u1", type: "user", time: { created: 5 }, text: "Hallo<attachment>a.pdf</attachment>\n\n<openwork-context>\nAttached files were copied into this worker workspace for tool access:\n- a.pdf (1 KB): x (file:///x)\nUse these paths with Read/Bash/MCP/Docling when a tool needs the file bytes.\n</openwork-context>" }, "s");
    expect(message?.parts).toEqual([
      { type: "text", id: "u1:0", text: "Hallo" },
      { type: "file", id: "u1:file:0", filename: "a.pdf", mime: "application/octet-stream", url: null },
    ]);
  });
});

describe("readChatError", () => {
  it("names what the person can do about a failure", () => {
    expect(readChatError({ type: "aborted", message: "Step interrupted" })).toBeNull();
    expect(readChatError({ data: { statusCode: 401, message: "invalid key" } })?.kind).toBe("key_rejected");
    expect(readChatError({ data: { statusCode: 400, message: "Budget has been exceeded! Current cost: 50" } })?.kind).toBe("budget_exceeded");
    expect(readChatError({ data: { statusCode: 429, message: "Too many requests" } })?.kind).toBe("rate_limited");
    expect(readChatError({ message: "something odd" })?.kind).toBe("unknown");
  });
});

describe("createTranslator", () => {
  it("streams text into one part and re-reads history when the run ends", () => {
    const translate = createTranslator(`${DIR}/`);
    expect(translate(at("session.execution.started", { sessionID: "s" })).events).toEqual([{ type: "chat.status", chatId: "s", status: "running" }]);
    const started = translate(at("session.text.started", { sessionID: "s", messageID: "m", ordinal: 0 }));
    expect(started.events.map((event) => event.type)).toEqual(["message.upserted", "part.upserted"]);
    expect(translate(at("session.text.delta", { sessionID: "s", messageID: "m", ordinal: 0, delta: "Hal" })).events).toEqual([
      { type: "part.delta", chatId: "s", messageId: "m", partId: "m:0", delta: "Hal" },
    ]);
    const ended = translate(at("session.execution.succeeded", { sessionID: "s" }));
    expect(ended.events).toEqual([{ type: "chat.status", chatId: "s", status: "idle" }, { type: "history.changed", chatId: "s" }]);
    expect(ended.refresh).toEqual(["s"]);
    // A straggler after the end is ignored; history is the truth now.
    expect(translate(at("session.text.delta", { sessionID: "s", messageID: "m", ordinal: 0, delta: "x" })).events).toEqual([]);
  });

  it("follows a tool call from input to result, even when later events omit the message", () => {
    const translate = createTranslator(DIR);
    translate(at("session.execution.started", { sessionID: "s" }));
    translate(at("session.tool.input.started", { sessionID: "s", messageID: "m", callID: "c1", name: "shell" }));
    translate(at("session.tool.called", { sessionID: "s", callID: "c1", input: { command: "ls" } }));
    const done = translate(at("session.tool.success", { sessionID: "s", callID: "c1", content: [{ type: "text", text: "a.md" }] }));
    expect(done.events).toEqual([
      { type: "part.upserted", chatId: "s", messageId: "m", part: expect.objectContaining({ id: "c1", tool: "bash", status: "completed", input: { command: "ls" }, output: "a.md" }) },
    ]);
  });

  it("turns permission and question events into requests, and ignores other folders", () => {
    const translate = createTranslator(DIR);
    const asked = translate(at("permission.v2.asked", { id: "p1", sessionID: "s", action: "edit", resources: ["a.md"] }));
    expect(asked.events[0]).toEqual({ type: "permission.asked", request: { id: "p1", chatId: "s", action: "edit", resources: ["a.md"], canAlways: true, message: null } });
    const draft = translate(at("permission.v2.asked", { id: "p2", sessionID: "s", action: "gmail_create_draft_with_attachments", resources: ["offerte.pdf"], save: [] }));
    expect(draft.events[0]).toEqual({ type: "permission.asked", request: expect.objectContaining({ id: "p2", canAlways: false }) });
    expect(asked.events[1]).toEqual({ type: "chat.status", chatId: "s", status: "waiting" });
    const form = translate(at("form.created", { form: { id: "f1", sessionID: "s", metadata: { kind: "question" }, fields: [{ key: "k", type: "string", title: "Toon", options: [{ label: "Zakelijk", value: "formal" }] }] } }));
    expect(form.events[0]?.type).toBe("question.asked");
    expect(translate({ type: "session.execution.started", data: { sessionID: "x" }, location: { directory: "/elders" } }).events).toEqual([]);
  });
});
