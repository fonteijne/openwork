// Minimal stdio MCP server for engine-probe.mjs: newline-delimited JSON-RPC,
// three tools named like the planned "breinen" server (project-breinen-plan §5.2).
import { createInterface } from "node:readline";

const tools = [
  { name: "breinen_lijst", description: "Lijst van breinen", inputSchema: { type: "object", properties: {} } },
  { name: "brein_lezen", description: "Lees een bestand uit een ander brein", inputSchema: { type: "object", properties: { brein: { type: "string" }, pad: { type: "string" } }, required: ["brein", "pad"] } },
  { name: "persoonlijk_brein_lezen", description: "Lees uit het persoonlijke brein", inputSchema: { type: "object", properties: { pad: { type: "string" } }, required: ["pad"] } },
];

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);

createInterface({ input: process.stdin }).on("line", (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message.id === undefined) return;
  const reply = (result) => send({ jsonrpc: "2.0", id: message.id, result });
  if (message.method === "initialize") {
    reply({ protocolVersion: message.params?.protocolVersion ?? "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "breinen", version: "0.0.0" } });
  } else if (message.method === "tools/list") {
    reply({ tools });
  } else if (message.method === "tools/call") {
    reply({ content: [{ type: "text", text: `MCP-ANTWOORD ${message.params.name}` }] });
  } else if (message.method === "ping") {
    reply({});
  } else {
    send({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } });
  }
});
