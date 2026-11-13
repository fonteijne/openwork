import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";

import type { Meeting } from "./types.ts";

/**
 * The two local connections (plan §3, T8): the MS365 MCP server the person already runs (stdio) and
 * their Slack CLI. BonzaiWork starts them itself and offers the agent a small, read-only set of
 * tools on top; a reply is only ever sent here, after the person's click (T7). Nothing goes
 * through the OpenWork cloud (E6).
 */
type Json = Record<string, unknown>;
const record = (value: unknown): Json | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null);
const str = (value: unknown, key: string): string | null => {
  const found = record(value)?.[key];
  return typeof found === "string" ? found : null;
};

/** Splits a command line into words; quotes keep spaces together. No shell ever reads it. */
export function splitCommand(command: string): string[] {
  const words: string[] = [];
  let current = "";
  let quote: string | null = null;
  let open = false;
  for (const char of command.trim()) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      open = true;
    } else if (/\s/.test(char)) {
      if (current || open) words.push(current);
      current = "";
      open = false;
    } else {
      current += char;
    }
  }
  if (current || open) words.push(current);
  return words;
}

export class ConnectorError extends Error {
  constructor(readonly code: "not_configured" | "failed" | "timeout" | "refused", message: string) {
    super(message);
  }
}

// --- MCP over stdio ----------------------------------------------------------------

type Pending = { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> };

/** A minimal MCP client: newline-delimited JSON-RPC on the child's stdin and stdout. */
export class McpStdioClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private ready: Promise<void> | null = null;
  private buffer = "";
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(private readonly options: { command: () => string; environment?: NodeJS.ProcessEnv; platform?: NodeJS.Platform; timeoutMs?: number; log?: (message: string, fields: Record<string, unknown>) => void }) {}

  private startedWith = "";

  private start(): Promise<void> {
    const command = this.options.command().trim();
    if (this.ready && this.startedWith === command) return this.ready;
    this.dispose();
    const [file, ...args] = splitCommand(command);
    if (!file) return Promise.reject(new ConnectorError("not_configured", "Er is geen opdracht ingesteld voor de MS365-koppeling."));
    this.startedWith = command;
    const platform = this.options.platform ?? process.platform;
    // npx and other .cmd shims on Windows only start through the shell; the words stay separate arguments.
    const child = spawn(file, args, { env: this.options.environment ?? process.env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true, shell: platform === "win32" });
    this.child = child;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.read(chunk));
    child.stderr.on("data", () => undefined);
    const stop = (reason: string) => {
      if (this.child !== child) return;
      this.child = null;
      this.ready = null;
      for (const [id, entry] of this.pending) {
        clearTimeout(entry.timer);
        entry.reject(new ConnectorError("failed", reason));
        this.pending.delete(id);
      }
    };
    child.on("error", (error) => stop(`De MS365-koppeling start niet: ${error.message}`));
    child.on("exit", (code) => stop(`De MS365-koppeling is gestopt (code ${code ?? "?"}).`));
    this.ready = (async () => {
      await this.request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "bonzaiwork", version: "0.1.0" } });
      this.send({ jsonrpc: "2.0", method: "notifications/initialized" });
    })();
    this.ready.catch(() => { if (this.child === child) this.dispose(); });
    return this.ready;
  }

  private read(chunk: string): void {
    this.buffer += chunk;
    let end = this.buffer.indexOf("\n");
    while (end !== -1) {
      const line = this.buffer.slice(0, end).trim();
      this.buffer = this.buffer.slice(end + 1);
      end = this.buffer.indexOf("\n");
      if (!line.startsWith("{")) continue;
      let message: Json | null = null;
      try { message = record(JSON.parse(line)); } catch { message = null; }
      const id = message?.id;
      if (!message || typeof id !== "number") continue;
      const entry = this.pending.get(id);
      if (!entry) continue;
      this.pending.delete(id);
      clearTimeout(entry.timer);
      if (message.error !== undefined) entry.reject(new ConnectorError("failed", str(message.error, "message") ?? "De MS365-koppeling gaf een fout."));
      else entry.resolve(message.result);
    }
  }

  private send(message: Json): void {
    this.child?.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private request(method: string, params: Json): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ConnectorError("timeout", "De MS365-koppeling antwoordde niet op tijd."));
      }, this.options.timeoutMs ?? 45_000);
      timer.unref?.();
      this.pending.set(id, { resolve, reject, timer });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  /** Calls one tool and gives back its text; a tool error is thrown with the server's own words. */
  async call(name: string, args: Json): Promise<string> {
    await this.start();
    const result = record(await this.request("tools/call", { name, arguments: args }));
    const content = Array.isArray(result?.content) ? result.content : [];
    const text = content.map((part) => str(part, "text") ?? "").filter(Boolean).join("\n");
    if (result?.isError === true) throw new ConnectorError("refused", text.slice(0, 600) || `${name} mislukte.`);
    return text;
  }

  dispose(): void {
    const child = this.child;
    this.child = null;
    this.ready = null;
    child?.kill();
  }
}

// --- MS365: calendar and mail --------------------------------------------------------

export type MailSummary = { id: string; from: string; subject: string; received: string | null; text: string; link: string | null };

function parseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
}

/** The rows of a Graph list answer, however the server wrapped it. */
function rows(value: unknown): Json[] {
  const list: unknown = Array.isArray(value) ? value : record(value)?.value ?? record(value)?.messages ?? record(value)?.data;
  return Array.isArray(list) ? list.flatMap((entry) => { const row = record(entry); return row ? [row] : []; }) : [];
}

/** Graph gives `{ dateTime, timeZone }`; without a zone, or with UTC, the time is UTC. */
function graphTime(value: unknown): number | null {
  const text = str(value, "dateTime") ?? (typeof value === "string" ? value : null);
  if (!text) return null;
  const zone = (str(value, "timeZone") ?? "UTC").toLowerCase();
  const hasOffset = /(?:z|[+-]\d{2}:?\d{2})$/i.test(text);
  const parsed = Date.parse(hasOffset || (zone !== "utc" && zone !== "etc/utc" && zone !== "gmt") ? text : `${text}Z`);
  return Number.isNaN(parsed) ? null : parsed;
}

const address = (value: unknown): string | null => {
  const email = record(record(value)?.emailAddress);
  return str(email, "name") ?? str(email, "address") ?? (typeof value === "string" ? value : null);
};

export function parseEvents(text: string): Meeting[] {
  return rows(parseJson(text)).flatMap((row): Meeting[] => {
    const id = str(row, "id");
    const start = graphTime(row.start);
    const end = graphTime(row.end);
    if (!id || start === null || end === null || row.isCancelled === true) return [];
    return [{
      id, title: str(row, "subject")?.trim() || "Afspraak", start, end, allDay: row.isAllDay === true,
      location: str(row.location, "displayName")?.trim() || null, organizer: address(row.organizer), link: str(row, "webLink"),
    }];
  }).sort((a, b) => a.start - b.start);
}

export function parseMails(text: string, maxChars: number): MailSummary[] {
  return rows(parseJson(text)).flatMap((row): MailSummary[] => {
    const id = str(row, "id");
    if (!id) return [];
    const body = str(row, "text") ?? str(row, "bodyPreview") ?? str(row.body, "content") ?? "";
    return [{
      id, from: address(row.from) ?? "onbekend", subject: str(row, "subject")?.trim() || "(geen onderwerp)",
      received: str(row, "received") ?? str(row, "receivedDateTime"), text: body.replace(/\s+\n/g, "\n").trim().slice(0, maxChars), link: str(row, "webLink"),
    }];
  });
}

export type Ms365 = ReturnType<typeof createMs365>;

export function createMs365(options: { command: () => string; environment?: NodeJS.ProcessEnv; platform?: NodeJS.Platform; timeoutMs?: number }) {
  const client = new McpStdioClient(options);
  return {
    /** The appointments between two moments, in start order. */
    async events(from: number, to: number): Promise<Meeting[]> {
      return parseEvents(await client.call("get-calendar-view", {
        startDateTime: new Date(from).toISOString(), endDateTime: new Date(to).toISOString(), top: 50,
        select: "id,subject,start,end,isAllDay,location,organizer,webLink,isCancelled", orderby: "start/dateTime",
      }));
    },
    /** The newest unread mail of the inbox, as text without quoted history where the server can. */
    async unread(limit: number): Promise<MailSummary[]> {
      const top = Math.max(1, Math.min(limit, 20));
      try {
        return parseMails(await client.call("read-mail-text", { folderId: "inbox", top, filter: "isRead eq false", maxChars: 1500 }), 1500);
      } catch (error) {
        if (error instanceof ConnectorError && error.code !== "refused") throw error;
        // An older server without the triage tool: the previews are enough to decide.
        return parseMails(await client.call("list-mail-messages", {
          filter: "isRead eq false", top, orderby: "receivedDateTime desc", select: "id,subject,from,receivedDateTime,bodyPreview,webLink",
        }), 1500);
      }
    },
    async message(id: string): Promise<MailSummary | null> {
      try {
        return parseMails(await client.call("read-mail-text", { messageIds: [id], maxChars: 8000 }), 8000)[0] ?? null;
      } catch (error) {
        if (error instanceof ConnectorError && error.code !== "refused") throw error;
        const single = record(parseJson(await client.call("get-mail-message", { "message-id": id })));
        return single ? parseMails(JSON.stringify([single]), 8000)[0] ?? null : null;
      }
    },
    /** Sends a reply to the sender. Only called after the person's click (T7). */
    async reply(messageId: string, text: string): Promise<void> {
      await client.call("reply-mail-message", { "message-id": messageId, body: { comment: text } });
    },
    async check(): Promise<string> {
      const now = Date.now();
      const found = await this.events(now, now + 24 * 60 * 60_000);
      return `${found.length} ${found.length === 1 ? "afspraak" : "afspraken"} in de komende 24 uur`;
    },
    dispose: () => client.dispose(),
  };
}

// --- Slack: the person's own CLI -----------------------------------------------------

export type SlackCli = ReturnType<typeof createSlackCli>;

const SLACK_OUTPUT_LIMIT = 24_000;

export function createSlackCli(options: { command: () => string; environment?: NodeJS.ProcessEnv; platform?: NodeJS.Platform; timeoutMs?: number }) {
  function run(args: readonly string[], input: string | null): Promise<{ code: number; stdout: string; stderr: string }> {
    const [file, ...base] = splitCommand(options.command());
    if (!file) return Promise.reject(new ConnectorError("not_configured", "Er is geen Slack-script ingesteld."));
    return new Promise((resolve, reject) => {
      const platform = options.platform ?? process.platform;
      const child = spawn(file, [...base, ...args], { env: options.environment ?? process.env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true, shell: platform === "win32" });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => { child.kill(); reject(new ConnectorError("timeout", "Het Slack-script antwoordde niet op tijd.")); }, options.timeoutMs ?? 60_000);
      timer.unref?.();
      child.stdout.setEncoding("utf8").on("data", (chunk: string) => { if (stdout.length < 2_000_000) stdout += chunk; });
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => { if (stderr.length < 20_000) stderr += chunk; });
      child.on("error", (error) => { clearTimeout(timer); reject(new ConnectorError("failed", `Het Slack-script start niet: ${error.message}`)); });
      child.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? 1, stdout, stderr }); });
      child.stdin.on("error", () => undefined);
      child.stdin.end(input ?? "");
    });
  }

  /** A read command's output for the agent: the script's own JSON, cut where it gets long. */
  async function read(args: readonly string[]): Promise<string> {
    const result = await run(args, null);
    if (result.code !== 0) throw new ConnectorError("refused", (result.stderr || result.stdout).trim().slice(0, 600) || "Het Slack-script gaf een fout.");
    const text = result.stdout.trim();
    return text.length > SLACK_OUTPUT_LIMIT ? `${text.slice(0, SLACK_OUTPUT_LIMIT)}\n… (ingekort)` : text;
  }

  return {
    unreads: (limit: number, mentionsOnly: boolean) => read(["unreads", "--json", "--limit", String(Math.max(1, Math.min(limit, 30))), ...(mentionsOnly ? ["--mentions-only"] : [])]),
    history: (channel: string, since: string | null, limit: number) => read(["history", channel, "--json", ...(since ? ["--since", since] : ["--limit", String(Math.max(1, Math.min(limit, 50)))])]),
    thread: (url: string) => read(["get_thread", url, "--json"]),
    search: (query: string, limit: number) => read(["search", query, "--json", "--limit", String(Math.max(1, Math.min(limit, 20)))]),
    /** Posts in a thread, or as a new message when there is no thread. Only after the person's click (T7). */
    async send(channel: string, threadTs: string | null, text: string): Promise<void> {
      // The same id on a retry lets Slack drop the double.
      const id = randomUUID();
      const args = threadTs
        ? ["reply", channel, threadTs, "--text-stdin", "--client-msg-id", id, "--json"]
        : ["post_message", channel, "--text-stdin", "--client-msg-id", id, "--json"];
      const result = await run(args, text);
      const answer = record(parseJson(result.stdout.trim()));
      if (result.code !== 0 || answer?.ok === false) {
        throw new ConnectorError("refused", (str(answer, "error") ?? result.stderr.trim().slice(0, 600)) || "Slack nam het bericht niet aan.");
      }
    },
    async check(): Promise<string> {
      const result = await run(["check_access", "--quiet"], null);
      if (result.code !== 0) throw new ConnectorError("refused", result.stderr.trim().slice(0, 300) || "Slack is niet bereikbaar; de sessie is mogelijk verlopen.");
      return "verbonden";
    },
  };
}
