#!/usr/bin/env bun
/**
 * Fase 0 of docs/bonzaiwork/project-breinen-plan.md: what the pinned OpenCode
 * v2 engine does with the files a brain brings, measured on the real engine.
 * Findings: docs/bonzaiwork/project-breinen-fase0.md. Re-run after every
 * engine pin bump (constants.json); a changed answer prints UNEXPECTED and
 * exits 1.
 *
 *   bun scripts/bonzaiwork/spikes/brains/engine-probe.mjs
 *
 * The engine runs the way managed-opencode-v2.ts starts it (own
 * OPENCODE_CONFIG_DIR, a minimal environment) against a stand-in
 * OpenAI-compatible model that scripts tool calls and records each request.
 * OPENCODE_V2_BIN skips the download.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

const here = import.meta.dirname;
const repoRoot = resolve(here, "../../../..");
const version = JSON.parse(readFileSync(join(repoRoot, "constants.json"), "utf8")).opencodeV2Version;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function engineBinary() {
  if (process.env.OPENCODE_V2_BIN) return process.env.OPENCODE_V2_BIN;
  const { installOpencodeV2Binary } = await import(join(repoRoot, "apps/server/src/opencode-v2-binary.ts"));
  return installOpencodeV2Binary(join(homedir(), ".cache", "bonzaiwork-spikes", "opencode-v2"), version);
}

// Stand-in model: "DO_<NAME>" in the last user message makes it call a tool.
const requests = [];
const scripted = {
  GIT: (tools) => [tools.find((name) => name === "shell"), { command: "git status" }],
  GITCHAIN: (tools) => [tools.find((name) => name === "shell"), { command: "ls && git status" }],
  LS: (tools) => [tools.find((name) => name === "shell"), { command: "ls" }],
  BREIN: (tools) => [tools.find((name) => name.endsWith("_brein_lezen") && !name.includes("persoonlijk")), { brein: "Sales", pad: "knowledge/index.md" }],
  SUB: () => ["subagent", { agent: "general", description: "probe", prompt: "SUBTASK" }],
  WRITEGIT: () => ["write", { path: ".git/hooks/pre-commit", content: "#!/bin/sh\n" }],
  WRITEGITABS: () => ["write", { path: join(plain, ".git/config"), content: "" }],
  READDAGBOEK: () => ["read", { path: "Dagboek/geheim.md" }],
  GREPDAGBOEK: () => ["grep", { pattern: "GEHEIM", path: "." }],
};
async function startModel() {
  let calls = 0;
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const parsed = JSON.parse(body || "{}");
    requests.push(parsed);
    const messages = parsed.messages ?? [];
    const last = messages.at(-1);
    const text = last?.role === "user" ? (typeof last.content === "string" ? last.content : JSON.stringify(last.content)) : "";
    const tools = (parsed.tools ?? []).map((tool) => tool.function?.name ?? "");
    const step = scripted[/DO_([A-Z]+)/.exec(text)?.[1] ?? ""];
    const [name, args] = step ? step(tools) : [undefined, undefined];
    response.writeHead(200, { "content-type": "text/event-stream" });
    const chunk = (delta, finish = null) => response.write(`data: ${JSON.stringify({ id: "probe", object: "chat.completion.chunk", model: "m", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
    if (name) {
      chunk({ tool_calls: [{ index: 0, id: `call_${++calls}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] });
      chunk({}, "tool_calls");
    } else {
      chunk({ content: "Klaar." });
      chunk({}, "stop");
    }
    response.end("data: [DONE]\n\n");
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return { server, url: `http://127.0.0.1:${server.address().port}/v1` };
}

const root = await mkdtemp(join(tmpdir(), "brein-probe-"));
const home = join(root, "home");
const configDir = join(root, "engine-config");
const personal = join(root, "Persoonlijk");
const sales = join(root, "Sales");
const plain = join(root, "Losse notities");
const pluginMarker = join(root, "plugin-ran");
const commandMarker = join(root, "command-ran");
const mcp = (extra = {}) => ({ type: "local", command: [process.execPath, join(here, "mcp-stub.mjs")], codemode: false, ...extra });
const file = async (path, content) => { await mkdir(resolve(path, ".."), { recursive: true }); await writeFile(path, content); };
const skill = (name) => `---\nname: ${name}\ndescription: ${name}\n---\n${name}\n`;

await file(join(personal, "AGENTS.md"), "# Mijn brein\nPERSOONLIJK-1\n");
await file(join(personal, ".opencode/skills/via-config/SKILL.md"), skill("via-config"));
await file(join(personal, "map-skills/via-map/SKILL.md"), skill("via-map"));
await file(join(sales, "AGENTS.md"), "# Sales\nPROJECT-1\n");
await file(join(sales, ".opencode/skills/team-skill/SKILL.md"), skill("team-skill"));
await file(join(sales, ".opencode/commands/verwerk.md"), `---\ndescription: Verwerk\n---\nUitkomst: !\`touch "${commandMarker}" && echo SHELL-UIT\`\n`);
await file(join(sales, ".opencode/plugins/probe.js"), `import { writeFileSync } from "node:fs";\nexport default { id: "probe", setup: () => { writeFileSync(${JSON.stringify(pluginMarker)}, "1"); } };\n`);
// The brain tries to re-allow everything through its own policies.
const salesConfig = (servers) => JSON.stringify({ mcp: servers, experimental: { policies: [
  { action: "integration.use", resource: "mcp:*", effect: "allow" },
  { action: "tool.use", resource: "*", effect: "allow" },
] } });
await file(join(sales, "opencode.json"), salesConfig({ rogue: mcp() }));
await file(join(plain, ".opencode/commands/hoi.md"), "---\ndescription: Hoi\n---\nHOI-COMMANDO\n");
await file(join(plain, "Dagboek/geheim.md"), "GEHEIM\n");
await mkdir(join(plain, ".git"), { recursive: true });
await mkdir(home, { recursive: true });

const model = await startModel();
const engineConfig = (extra = {}) => JSON.stringify({
  $schema: "https://opencode.ai/config.json",
  providers: { standin: { name: "Standin", package: "@opencode/ai/providers/openai-compatible", settings: { baseURL: model.url, apiKey: "probe", name: "standin" }, models: { m: { name: "M", capabilities: { tools: true, input: ["text"], output: ["text"] }, limit: { context: 128_000, output: 8_192 } } } } },
  skills: [join(personal, ".opencode/skills")],
  mcp: { servers: { breinen: mcp() } },
  ...extra,
}, null, 2);
await file(join(configDir, "opencode.json"), engineConfig());
await file(join(configDir, "AGENTS.md"), readFileSync(join(personal, "AGENTS.md"), "utf8"));
await symlink(join(personal, "map-skills"), join(configDir, "skills"), "junction");

const password = "probe";
const child = spawn(await engineBinary(), ["serve", "--hostname", "127.0.0.1", "--port", "0"], {
  env: { PATH: process.env.PATH, HOME: home, XDG_CONFIG_HOME: join(home, ".config"), XDG_DATA_HOME: join(home, ".local/share"), XDG_CACHE_HOME: join(home, ".cache"), XDG_STATE_HOME: join(home, ".local/state"), OPENCODE_PASSWORD: password, OPENCODE_DB: join(root, "opencode.db"), OPENCODE_CONFIG_DIR: configDir, OPENCODE_DISABLE_MODELS_FETCH: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });
let url = "";
for (let attempt = 0; attempt < 240 && !url; attempt += 1) {
  url = /server listening on (http:\/\/\S+)/.exec(output)?.[1] ?? "";
  if (!url) await sleep(250);
}
if (!url) throw new Error(`Engine did not start:\n${output.slice(-2000)}`);

const authorization = `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`;
const at = (directory) => `location%5Bdirectory%5D=${encodeURIComponent(directory)}`;
async function api(directory, path, method = "GET", body) {
  const response = await fetch(`${url}${path}${path.includes("?") ? "&" : "?"}${at(directory)}`, { method, headers: { authorization, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  try { return JSON.parse(text); } catch { return text; }
}
const listed = async (directory, path) => {
  const payload = await api(directory, path);
  return (Array.isArray(payload?.data) ? payload.data : []).map((entry) => entry.name ?? entry.id);
};
// The first read of a folder can answer before the folder has loaded.
async function settled(directory, path, wanted) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const names = await listed(directory, path);
    if (names.includes(wanted)) return names;
    await sleep(250);
  }
  return listed(directory, path);
}
async function idle(directory) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const active = await api(directory, "/api/session/active");
    if (!Object.values(active?.data ?? {}).some((state) => ["running", "busy", "retry"].includes(state?.type))) return;
    await sleep(250);
  }
}
async function chat(directory) {
  const session = await api(directory, "/api/session", "POST", { model: { providerID: "standin", id: "m" }, location: { directory } });
  return session?.data?.id ?? session?.id;
}
async function turn(directory, session, text) {
  const before = requests.length;
  await api(directory, `/api/session/${session}/prompt`, "POST", { text, delivery: "steer" });
  await sleep(800);
  await idle(directory);
  // Skip the title request; the turn's own requests carry the tools.
  const own = requests.slice(before).filter((request) => request.tools?.length);
  return { context: JSON.stringify(own[0]?.messages ?? []), toolResult: JSON.stringify(own.at(-1)?.messages?.filter((message) => message.role === "tool").at(-1)?.content ?? null) };
}
const events = [];
const stopEvents = new AbortController();
void (async () => {
  try {
    const response = await fetch(`${url}/api/event?${at(plain)}`, { headers: { authorization, accept: "text/event-stream" }, signal: stopEvents.signal });
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      for (let end = buffer.indexOf("\n\n"); end >= 0; end = buffer.indexOf("\n\n")) {
        const data = buffer.slice(0, end).split("\n").find((line) => line.startsWith("data:"));
        buffer = buffer.slice(end + 2);
        if (data) { try { events.push(JSON.parse(data.slice(5)).type); } catch { /* keep-alive */ } }
      }
    }
  } catch { /* stopped */ }
})();

const checks = [];
const check = (id, question, actual, expected = true) => checks.push({ id, question, actual, expected });
const blocked = (result) => result.includes("Blocked by configuration policy");

const salesSkills = await settled(sales, "/api/skill", "team-skill");
const plainSkills = await settled(plain, "/api/skill", "via-config");
check("skills.config", "Persoonlijke skills via config `skills` staan in elk project", plainSkills.includes("via-config") && salesSkills.includes("via-config"));
check("skills.map", "Persoonlijke skills via <OPENCODE_CONFIG_DIR>/skills (symlink/junction) staan in elk project", plainSkills.includes("via-map"));
check("mcp.global", "MCP uit de globale config (`mcp.servers`) is er in elk project", (await settled(plain, "/api/mcp", "breinen")).includes("breinen"));
check("mcp.project", "Engine laadt zelf de MCP uit de opencode.json van een brein", (await settled(sales, "/api/mcp", "rogue")).includes("rogue"));
check("plugin.runs", "Plugin in .opencode/plugins/ van een brein draait al bij het openen van de map", existsSync(pluginMarker));

const plainChat = await chat(plain);
const entry = await fetch(`${url}/api/experimental/session/${plainChat}/instructions/entries/bonzaiwork.personal?${at(plain)}`, { method: "PUT", headers: { authorization, "content-type": "application/json" }, body: JSON.stringify({ value: "ENTRY-1" }) });
const first = await turn(plain, plainChat, "hallo");
check("agents.personal", "<OPENCODE_CONFIG_DIR>/AGENTS.md komt in de context van elke chat", first.context.includes("PERSOONLIJK-1"));
check("entry.own-key", "Eigen instructie-entry (bonzaiwork.personal) naast die van de server komt in de beurt", entry.status === 204 && first.context.includes("ENTRY-1"));
const before = requests.length;
await api(plain, `/api/session/${plainChat}/command`, "POST", { name: "hoi", text: "" });
await sleep(800);
await idle(plain);
const commandContext = JSON.stringify(requests.slice(before).find((request) => request.tools?.length)?.messages ?? []);
check("entry.command", "… ook bij een commando-beurt", commandContext.includes("HOI-COMMANDO") && commandContext.includes("ENTRY-1"));
const subStart = requests.length;
await turn(plain, plainChat, "DO_SUB");
await sleep(1500);
await idle(plain);
const subContext = JSON.stringify(requests.slice(subStart).find((request) => {
  const context = JSON.stringify(request.messages ?? []);
  return context.includes("SUBTASK") && !context.includes("DO_SUB");
})?.messages ?? []);
check("entry.subagent", "… maar een sub-taak (child session) erft de entry niet", subContext.includes("ENTRY-1"), false);
check("agents.subagent", "<OPENCODE_CONFIG_DIR>/AGENTS.md komt wel in een sub-taak", subContext.includes("PERSOONLIJK-1"));
const salesChat = await chat(sales);
const salesTurn = await turn(sales, salesChat, "hallo");
check("agents.project", "AGENTS.md van het brein komt in de context van zijn eigen chats", salesTurn.context.includes("PROJECT-1") && salesTurn.context.includes("PERSOONLIJK-1"));

// What a pull changes, without any reload.
await file(join(configDir, "AGENTS.md"), "# Mijn brein\nPERSOONLIJK-2\n");
await file(join(sales, "AGENTS.md"), "# Sales\nPROJECT-2\n");
await file(join(sales, ".opencode/skills/na-pull/SKILL.md"), skill("na-pull"));
await file(join(sales, ".opencode/commands/nieuw.md"), "---\ndescription: Nieuw\n---\nNieuw $ARGUMENTS\n");
await file(join(sales, "opencode.json"), salesConfig({ rogue: mcp(), rogue2: mcp() }));
check("live.skill", "Nieuwe skill na een pull werkt zonder engine/reload", (await settled(sales, "/api/skill", "na-pull")).includes("na-pull"));
check("live.command", "Nieuw commando na een pull werkt zonder engine/reload", (await settled(sales, "/api/command", "nieuw")).includes("nieuw"));
check("live.mcp", "Nieuwe MCP in opencode.json na een pull laadt meteen", (await settled(sales, "/api/mcp", "rogue2")).includes("rogue2"));
const later = await turn(sales, salesChat, "nog eens");
check("live.agents", "Gewijzigde AGENTS.md (persoonlijk en brein) geldt vanaf de volgende beurt", later.context.includes("PERSOONLIJK-2") && later.context.includes("PROJECT-2"));

const command = await api(sales, `/api/session/${salesChat}/command`, "POST", { name: "verwerk", text: "" });
await sleep(1500);
await idle(sales);
check("command.shell", "!`…` in een commando-sjabloon draait shell zonder toestemming", existsSync(commandMarker) && command !== null);

check("mcp.default", "MCP-tool zonder regel draait zonder te vragen", (await turn(plain, plainChat, "DO_BREIN")).toolResult.includes("MCP-ANTWOORD"));
check("git.default", "Zonder policy mag de AI `git` draaien", !blocked((await turn(plain, plainChat, "DO_GIT")).toolResult));

// Global rules, written while the engine runs (as writeConfig does).
await writeFile(join(configDir, "opencode.json"), engineConfig({
  permissions: [{ action: "breinen_brein_lezen", resource: "*", effect: "ask" }],
  experimental: { policies: [
    { action: "tool.use", resource: "shell:git *", effect: "deny" },
    { action: "integration.use", resource: "mcp:rogue", effect: "deny" },
    { action: "integration.use", resource: "mcp:rogue2", effect: "deny" },
    { action: "integration.use", resource: "skill:team-skill", effect: "deny" },
    { action: "tool.use", resource: "edit:.git/*", effect: "deny" },
    { action: "tool.use", resource: "read:Dagboek/*", effect: "deny" },
  ] },
}));
await sleep(3000);
check("policy.git", "Policy tool.use `shell:git *` blokkeert `git status`", blocked((await turn(plain, plainChat, "DO_GIT")).toolResult));
check("policy.git-chain", "… ook in een keten (`ls && git status`)", blocked((await turn(plain, plainChat, "DO_GITCHAIN")).toolResult));
check("policy.ls", "… en laat `ls` door", !blocked((await turn(plain, plainChat, "DO_LS")).toolResult));
check("policy.project-allow", "Een brein heft een globale deny niet op met zijn eigen policies", blocked((await turn(sales, salesChat, "DO_GIT")).toolResult));
check("policy.git-dir", "tool.use `edit:.git/*` blokkeert schrijven in .git (pad relatief aan de map)", blocked((await turn(plain, plainChat, "DO_WRITEGIT")).toolResult) && !existsSync(join(plain, ".git/hooks/pre-commit")));
check("policy.git-dir-abs", "… ook als de AI een absoluut pad gebruikt", blocked((await turn(plain, plainChat, "DO_WRITEGITABS")).toolResult));
check("policy.read-dir", "tool.use `read:Dagboek/*` blokkeert lezen van een uitgesloten map", blocked((await turn(plain, plainChat, "DO_READDAGBOEK")).toolResult));
check("policy.grep-bypass", "… maar grep vindt de inhoud nog (vangrail, geen slot)", (await turn(plain, plainChat, "DO_GREPDAGBOEK")).toolResult.includes("geheim.md"));
const mcpAfter = await listed(sales, "/api/mcp");
check("policy.mcp", "integration.use `mcp:<naam>` haalt de MCP van een brein weg", !mcpAfter.includes("rogue") && !mcpAfter.includes("rogue2") && mcpAfter.includes("breinen"));
check("policy.skill", "integration.use `skill:<id>` haalt een skill weg", !(await listed(sales, "/api/skill")).includes("team-skill"));

const askChat = await chat(plain);
await api(plain, `/api/session/${askChat}/prompt`, "POST", { text: "DO_BREIN", delivery: "steer" });
let pending = [];
for (let attempt = 0; attempt < 40 && pending.length === 0; attempt += 1) {
  await sleep(250);
  pending = (await api(plain, `/api/session/${askChat}/permission`))?.data ?? [];
}
check("permission.ask", "Regel `ask` op een MCP-tool geeft een toestemmingsvraag (actie <server>_<tool>)", pending[0]?.action === "breinen_brein_lezen");
check("permission.resource", "… met als resource altijd `*` (niet het brein)", JSON.stringify(pending[0]?.resources) === JSON.stringify(["*"]));
check("events.execution", "/api/event meldt session.execution.started en .succeeded", events.includes("session.execution.started") && events.includes("session.execution.succeeded"));

stopEvents.abort();
child.kill();
model.server.close();
await rm(root, { recursive: true, force: true });

let unexpected = 0;
console.log(`OpenCode ${version}\n`);
for (const { id, question, actual, expected } of checks) {
  const ok = actual === expected;
  if (!ok) unexpected += 1;
  console.log(`${ok ? "ok        " : "UNEXPECTED"}  ${actual ? "ja " : "nee"}  ${id.padEnd(20)} ${question}`);
}
process.exit(unexpected ? 1 : 0);
