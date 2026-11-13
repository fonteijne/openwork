// A stand-in for the MS365 MCP server (stdio): the few tools Vandaag calls, and a log of every call.
import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

const log = process.env.FAKE_MS365_LOG;
const now = Number(process.env.FAKE_NOW);
const iso = (ms) => new Date(ms).toISOString().replace("Z", "0000");
const events = { value: [
  { id: "evt-soon", subject: "Klantoverleg", start: { dateTime: iso(now + 20 * 60_000), timeZone: "UTC" }, end: { dateTime: iso(now + 80 * 60_000), timeZone: "UTC" }, location: { displayName: "Zaal 2" }, organizer: { emailAddress: { name: "Robin" } } },
  { id: "evt-tomorrow", subject: "Teamoverleg", start: { dateTime: iso(now + 26 * 3_600_000), timeZone: "UTC" }, end: { dateTime: iso(now + 27 * 3_600_000), timeZone: "UTC" } },
] };
const mails = [{ id: "mail-1", from: "Robin <robin@example.invalid>", subject: "Offerte akkoord?", received: "2026-11-13T08:00:00Z", text: "Kun je vandaag laten weten of de offerte akkoord is?" }];

const answer = (id, result) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
const text = (value) => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }] });

createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line);
  if (message.id === undefined) return;
  if (message.method === "initialize") return answer(message.id, { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "fake", version: "0" } });
  if (message.method !== "tools/call") return answer(message.id, {});
  const { name, arguments: args } = message.params;
  if (log) appendFileSync(log, `${JSON.stringify({ name, args })}\n`);
  if (name === "get-calendar-view") return answer(message.id, text(events));
  if (name === "read-mail-text") return answer(message.id, text(args.messageIds ? mails.filter((mail) => args.messageIds.includes(mail.id)) : mails));
  if (name === "reply-mail-message") return answer(message.id, args["message-id"] === "mail-1" ? text("") : { ...text("Message not found"), isError: true });
  return answer(message.id, { ...text(`Unknown tool ${name}`), isError: true });
});
