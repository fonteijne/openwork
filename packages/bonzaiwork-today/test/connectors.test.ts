import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { ConnectorError, createMs365, isMcpUrl } from "../src/connectors.ts";

/**
 * A stand-in for an MS365 MCP server that already runs, for example in a container on localhost:
 * Streamable HTTP with a session id, answers as an event stream or as JSON.
 */
type Call = { method: string; session: string | null; protocol: string | null; name?: string; args?: Record<string, unknown> };

const NOW = Date.parse("2026-11-16T08:00:00Z");
const events = { value: [{ id: "evt-1", subject: "Klantoverleg", start: { dateTime: "2026-11-16T09:00:00.0000000", timeZone: "UTC" }, end: { dateTime: "2026-11-16T10:00:00.0000000", timeZone: "UTC" } }] };
const mails = [{ id: "mail-1", from: "Robin <robin@example.invalid>", subject: "Offerte akkoord?", text: "Kun je vandaag laten weten of de offerte akkoord is?" }];

let server: Server;
let url: string;
let calls: Call[];
let sessions: Set<string>;
let mode: { stream: boolean; status: number | null };
let deleted: string[];

const body = async (request: IncomingMessage): Promise<string> => {
  let text = "";
  for await (const chunk of request) text += String(chunk);
  return text;
};

const send = (response: ServerResponse, id: unknown, result: unknown, session: string | null) => {
  const message = JSON.stringify({ jsonrpc: "2.0", id, result });
  const headers: Record<string, string> = session ? { "mcp-session-id": session } : {};
  if (mode.stream) {
    response.writeHead(200, { ...headers, "content-type": "text/event-stream" });
    // A notification before the answer, and the stream stays open: the client must stop on the answer.
    response.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", method: "notifications/message", params: { level: "info" } })}\n\n`);
    response.write(`event: message\ndata: ${message}\n\n`);
    return;
  }
  response.writeHead(200, { ...headers, "content-type": "application/json" });
  response.end(message);
};

const text = (value: unknown) => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }] });

beforeEach(async () => {
  calls = [];
  sessions = new Set();
  deleted = [];
  mode = { stream: true, status: null };
  server = createServer((request, response) => {
    void (async () => {
      const session = typeof request.headers["mcp-session-id"] === "string" ? request.headers["mcp-session-id"] : null;
      if (request.method === "DELETE") {
        if (session) { deleted.push(session); sessions.delete(session); }
        response.writeHead(200).end();
        return;
      }
      const message = JSON.parse(await body(request));
      const params = message.params ?? {};
      calls.push({ method: message.method, session, protocol: typeof request.headers["mcp-protocol-version"] === "string" ? request.headers["mcp-protocol-version"] : null, name: params.name, args: params.arguments });
      if (mode.status) { response.writeHead(mode.status).end(); return; }
      if (message.method === "initialize") {
        const id = `s-${sessions.size + deleted.length + 1}`;
        sessions.add(id);
        send(response, message.id, { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "fake", version: "0" } }, id);
        return;
      }
      if (!session || !sessions.has(session)) { response.writeHead(404).end(); return; }
      if (message.id === undefined) { response.writeHead(202).end(); return; }
      if (params.name === "get-calendar-view") return send(response, message.id, text(events), null);
      if (params.name === "read-mail-text") return send(response, message.id, text(mails), null);
      if (params.name === "reply-mail-message") return send(response, message.id, params.arguments["message-id"] === "mail-1" ? text("") : { ...text("Message not found"), isError: true }, null);
      send(response, message.id, { ...text(`Unknown tool ${params.name}`), isError: true }, null);
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  url = `http://127.0.0.1:${address.port}/mcp`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("MS365 over HTTP", () => {
  test("an address is a server that already runs; a command is not", () => {
    expect(isMcpUrl("http://localhost:3000/mcp")).toBe(true);
    expect(isMcpUrl("  https://ms365.local/mcp ")).toBe(true);
    expect(isMcpUrl("npx -y @softeria/ms-365-mcp-server")).toBe(false);
    expect(isMcpUrl("http://localhost:3000/mcp --flag")).toBe(false);
  });

  test("reads the calendar and mail over an event stream, in one session", async () => {
    const ms365 = createMs365({ command: () => url, timeoutMs: 2_000 });
    try {
      const meetings = await ms365.events(NOW, NOW + 86_400_000);
      expect(meetings).toMatchObject([{ id: "evt-1", title: "Klantoverleg", start: Date.parse("2026-11-16T09:00:00Z") }]);
      expect(await ms365.unread(5)).toMatchObject([{ id: "mail-1", subject: "Offerte akkoord?" }]);
      expect(calls.map((call) => call.method)).toEqual(["initialize", "notifications/initialized", "tools/call", "tools/call"]);
      expect(calls[0]?.session).toBeNull();
      expect(calls.slice(1).every((call) => call.session === "s-1" && call.protocol === "2025-06-18")).toBe(true);
    } finally {
      ms365.dispose();
    }
  });

  test("a JSON answer works too, and a reply goes out with the message id", async () => {
    mode.stream = false;
    const ms365 = createMs365({ command: () => url, timeoutMs: 2_000 });
    try {
      await ms365.reply("mail-1", "Hoi Robin, akkoord.");
      expect(calls.at(-1)).toMatchObject({ name: "reply-mail-message", args: { "message-id": "mail-1", body: { comment: "Hoi Robin, akkoord." } } });
      await expect(ms365.reply("mail-2", "x")).rejects.toThrow("Message not found");
    } finally {
      ms365.dispose();
    }
  });

  test("a session the server forgot is started again once", async () => {
    const ms365 = createMs365({ command: () => url, timeoutMs: 2_000 });
    try {
      await ms365.events(NOW, NOW + 1);
      sessions.clear();
      expect(await ms365.events(NOW, NOW + 86_400_000)).toHaveLength(1);
      expect(calls.filter((call) => call.method === "initialize")).toHaveLength(2);
      expect(calls.at(-1)?.session).toBe("s-2");
    } finally {
      ms365.dispose();
    }
  });

  test("a server that asks for a sign-in says so", async () => {
    mode.status = 401;
    const ms365 = createMs365({ command: () => url, timeoutMs: 2_000 });
    const error = await ms365.check().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConnectorError);
    expect(error).toMatchObject({ code: "refused" });
    expect(String(error)).toContain("vraagt om inloggen (401)");
    ms365.dispose();
  });

  test("an address where nothing listens is not reachable, and the setting is read on every call", async () => {
    let target = "http://127.0.0.1:9/mcp";
    const ms365 = createMs365({ command: () => target, timeoutMs: 2_000 });
    try {
      await expect(ms365.check()).rejects.toThrow("niet bereikbaar");
      target = url;
      expect(await ms365.check()).toBe("1 afspraak in de komende 24 uur");
    } finally {
      ms365.dispose();
    }
  });

  test("dispose ends the session", async () => {
    const ms365 = createMs365({ command: () => url, timeoutMs: 2_000 });
    await ms365.events(NOW, NOW + 1);
    ms365.dispose();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(deleted).toEqual(["s-1"]);
  });
});
