#!/usr/bin/env bun
/**
 * Fase 0 of docs/bonzaiwork/brein-harnas-plan.md (E1–E5, E7): what the pinned
 * OpenCode v2 engine does with a composed config folder (per-skill junctions,
 * command/ and agent/ next to skills/), measured on the real engine. Findings:
 * docs/bonzaiwork/project-breinen-fase0.md §9. Re-run after every engine pin
 * bump (constants.json); a changed answer prints UNEXPECTED and exits 1.
 *
 *   bun scripts/bonzaiwork/spikes/brains/harness-probe.mjs
 *
 * Same set-up as engine-probe.mjs: the engine runs the way
 * managed-opencode-v2.ts starts it, against a stand-in model that records each
 * request. OPENCODE_V2_BIN skips the download.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
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

// Stand-in model: "DO_<NAME>" in the last user message makes it call a tool; otherwise it answers "Klaar.".
const requests = [];
const scripted = {
  SUB: () => ["subagent", { agent: "general", description: "probe", prompt: "SUBTASK" }],
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

const root = await mkdtemp(join(tmpdir(), "harnas-probe-"));
const home = join(root, "home");
const configDir = join(root, "engine-config");
const harness = join(root, "harness");          // bron 1: meegeleverd
const personal = join(root, "Persoonlijk");     // bron 3: eigen skills
const sales = join(root, "Sales");              // projectbrein met een eigen kopie van okf-query
const plain = join(root, "Losse notities");     // gewoon project
const file = async (path, content) => { await mkdir(resolve(path, ".."), { recursive: true }); await writeFile(path, content); };
const skill = (name, description = name) => `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n\n${description}\n`;

await file(join(harness, "skills/okf-query/SKILL.md"), skill("okf-query", "HARNAS-VERSIE van okf-query"));
await file(join(harness, "skills/brein-mensen/SKILL.md"), skill("brein-mensen", "HARNAS-MENSEN"));
await file(join(harness, "skills/later-skill/SKILL.md"), skill("later-skill", "HARNAS-LATER"));
// E7: a workflow packaged as a skill: SKILL.md with the ICM stages in a sub-folder.
await file(join(harness, "skills/werkwijze-pakket/SKILL.md"), skill("werkwijze-pakket", "HARNAS-WERKWIJZE: offerte maken"));
await file(join(harness, "skills/werkwijze-pakket/workflow/CONTEXT.md"), "# Offerte maken\n\n| Stap | Taak |\n|---|---|\n| `01_intake` | aanvraag tot brief |\n");
await file(join(harness, "skills/werkwijze-pakket/workflow/01_intake/CONTEXT.md"), "# 01_intake\n\n## Inputs\n- Working: `aanvraag.md`\n\n## Process\n1. Lees.\n\n## Outputs\n- `brief.md` -> `output/`\n\n## Check\nDe gebruiker leest de brief.\n");
await file(join(harness, "commands/onthoud.md"), "---\ndescription: Onthoud wat projectoverstijgend is\n---\nONTHOUD-COMMANDO $ARGUMENTS\n");
await file(join(harness, "agents/brein.md"), "---\ndescription: Jouw brein\nmode: primary\ntools:\n  write: false\n---\nBREIN-AGENT-PROMPT-1\n");
await file(join(personal, "AGENTS.md"), "# Mijn brein\nPERSOONLIJK-1\n");
await file(join(personal, ".opencode/skills/eigen-skill/SKILL.md"), skill("eigen-skill", "EIGEN-SKILL"));
await file(join(sales, "AGENTS.md"), "# Sales\nPROJECT-1\n");
await file(join(sales, ".opencode/skills/okf-query/SKILL.md"), skill("okf-query", "PROJECT-VERSIE van okf-query"));
await mkdir(join(plain, ".git"), { recursive: true });
await mkdir(home, { recursive: true });

const model = await startModel();
const engineConfig = () => JSON.stringify({
  $schema: "https://opencode.ai/config.json",
  providers: { standin: { name: "Standin", package: "@opencode/ai/providers/openai-compatible", settings: { baseURL: model.url, apiKey: "probe", name: "standin" }, models: { m: { name: "M", capabilities: { tools: true, input: ["text"], output: ["text"] }, limit: { context: 128_000, output: 8_192 } } } } },
}, null, 2);
await file(join(configDir, "opencode.json"), engineConfig());
await file(join(configDir, "AGENTS.md"), readFileSync(join(personal, "AGENTS.md"), "utf8"));
// E2: skills/ as a real folder with one junction per skill, from several sources.
await mkdir(join(configDir, "skills"), { recursive: true });
const link = (name, target) => symlink(target, join(configDir, "skills", name), "junction");
await link("okf-query", join(harness, "skills/okf-query"));
await link("brein-mensen", join(harness, "skills/brein-mensen"));
await link("werkwijze-pakket", join(harness, "skills/werkwijze-pakket"));
await link("eigen-skill", join(personal, ".opencode/skills/eigen-skill"));
// E1: command/ and agent/ in the config folder (singular, as opencode documents them), plus the plural
// spelling the brains use in a project (.opencode/commands, .opencode/agents), as a link to the harness.
await mkdir(join(configDir, "command"), { recursive: true });
await symlink(join(harness, "commands/onthoud.md"), join(configDir, "command/onthoud.md"));
await file(join(configDir, "commands/meervoud.md"), "---\ndescription: Meervoud\n---\nMEERVOUD-COMMANDO\n");
await mkdir(join(configDir, "agent"), { recursive: true });
await symlink(join(harness, "agents/brein.md"), join(configDir, "agent/brein.md"));
await file(join(configDir, "agents/meervoud-agent.md"), "---\ndescription: Meervoud\nmode: primary\n---\nMEERVOUD-AGENT\n");

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
const entries = async (directory, path) => {
  const payload = await api(directory, path);
  return Array.isArray(payload?.data) ? payload.data : [];
};
const listed = async (directory, path) => (await entries(directory, path)).map((entry) => entry.name ?? entry.id);
async function settled(directory, path, wanted, present = true) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const names = await listed(directory, path);
    if (names.includes(wanted) === present) return names;
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
async function chat(directory, title) {
  const session = await api(directory, "/api/session", "POST", { model: { providerID: "standin", id: "m" }, location: { directory }, ...(title ? { title } : {}) });
  return session?.data?.id ?? session?.id;
}
async function turn(directory, session, text) {
  const before = requests.length;
  await api(directory, `/api/session/${session}/prompt`, "POST", { text, delivery: "steer" });
  await sleep(800);
  await idle(directory);
  const own = requests.slice(before).filter((request) => request.tools?.length);
  const first = own[0] ?? {};
  return { context: JSON.stringify(first.messages ?? []), tools: (first.tools ?? []).map((tool) => tool.function?.name ?? "") };
}

const checks = [];
const check = (id, question, actual, expected = true, note = "") => checks.push({ id, question, actual, expected, note });
const notes = [];

// E2: per-skill junctions in a real skills/ folder.
const plainSkills = await settled(plain, "/api/skill", "eigen-skill");
check("E2.junctions", "skills/ als echte map met per skill een junction: elke skill staat in elk project", ["okf-query", "brein-mensen", "eigen-skill"].every((name) => plainSkills.includes(name)));
await link("later-skill", join(harness, "skills/later-skill"));
check("E2.live-add", "Een junction toevoegen terwijl de engine draait: de skill verschijnt zonder herstart", (await settled(plain, "/api/skill", "later-skill")).includes("later-skill"));
await rm(join(configDir, "skills/brein-mensen"));
check("E2.live-remove", "Een junction weghalen: de skill verdwijnt zonder herstart", !(await settled(plain, "/api/skill", "brein-mensen", false)).includes("brein-mensen"));

// E7: a skill with a workflow/ sub-folder is still a skill.
check("E7.skill-with-workflow", "Een skill met een `workflow/`-submap (ICM-stappen) blijft een gewone skill voor de engine", plainSkills.includes("werkwijze-pakket"));

// E3: same name in the project and the config folder.
await settled(sales, "/api/skill", "okf-query");
const salesSkillEntries = await entries(sales, "/api/skill");
const okf = salesSkillEntries.filter((entry) => (entry.name ?? entry.id) === "okf-query");
notes.push(`E3: /api/skill in Sales geeft ${okf.length}x okf-query: ${JSON.stringify(okf).slice(0, 400)}`);
const salesChat = await chat(sales);
const salesTurn = await turn(sales, salesChat, "hallo");
const projectWins = salesTurn.context.includes("PROJECT-VERSIE") && !salesTurn.context.includes("HARNAS-VERSIE");
const bothListed = salesTurn.context.includes("PROJECT-VERSIE") && salesTurn.context.includes("HARNAS-VERSIE");
check("E3.project-wins", "Dezelfde skillnaam in project en config-map: in de chat telt de projectversie (en niet die uit de config-map)", projectWins, true, bothListed ? "beide beschrijvingen staan in de context" : "");
check("E3.listed-once", "… en /api/skill noemt hem één keer", okf.length === 1);
const plainTurn = await turn(plain, await chat(plain), "hallo");
check("E3.harness-elsewhere", "In een project zonder eigen kopie telt de versie uit de config-map", plainTurn.context.includes("HARNAS-VERSIE"));

// E1: command/ and agent/ in the config folder.
const plainCommands = await settled(plain, "/api/command", "onthoud");
check("E1.command-dir", "`<OPENCODE_CONFIG_DIR>/command/*.md` (via een link naar het harnas) is een commando in elk project", plainCommands.includes("onthoud"));
check("E1.commands-plural", "… `commands/` (meervoud) ook", plainCommands.includes("meervoud"), true, `commando's gezien: ${plainCommands.join(", ")}`);
const commandChat = await chat(plain);
const beforeCommand = requests.length;
await api(plain, `/api/session/${commandChat}/command`, "POST", { name: "onthoud", text: "" });
await sleep(800);
await idle(plain);
const commandContext = JSON.stringify(requests.slice(beforeCommand).find((request) => request.tools?.length)?.messages ?? []);
check("E1.command-turn", "Zo'n commando draait als commando-beurt met zijn sjabloon", commandContext.includes("ONTHOUD-COMMANDO"));
const agents = await entries(plain, "/api/agent");
const agentNames = agents.map((entry) => entry.name ?? entry.id);
notes.push(`E1: /api/agent: ${JSON.stringify(agents.map((entry) => ({ name: entry.name, mode: entry.mode, hidden: entry.hidden, description: entry.description }))).slice(0, 600)}`);
check("E1.agent-dir", "`<OPENCODE_CONFIG_DIR>/agent/*.md` (link naar het harnas) staat in /api/agent", agentNames.includes("brein"));
check("E1.agents-plural", "… `agents/` (meervoud) ook", agentNames.includes("meervoud-agent"), true, `agents gezien: ${agentNames.join(", ")}`);
check("E1.agent-primary", "De agent uit het harnas is `primary` en niet verborgen (komt dus in de agent-kiezer van de UI)", agents.some((entry) => (entry.name ?? entry.id) === "brein" && entry.mode === "primary" && !entry.hidden));

// E4: use the agent in a chat.
const breinChat = await chat(plain);
const switched = await api(plain, `/api/session/${breinChat}/agent`, "POST", { agent: "brein" });
notes.push(`E4: POST /api/session/:id/agent → ${JSON.stringify(switched).slice(0, 200)}`);
const breinTurn = await turn(plain, breinChat, "hallo");
check("E4.agent-prompt", "Na POST /api/session/:id/agent {agent: brein} staat de agent-prompt in de beurt", breinTurn.context.includes("BREIN-AGENT-PROMPT-1"));
check("E4.agent-tools", "… en de tool-regels van de agent gelden (write uit)", breinTurn.tools.length > 0 && !breinTurn.tools.includes("write") && breinTurn.tools.includes("read"), true, `tools: ${breinTurn.tools.join(", ")}`);
check("E4.agent-global-agents", "… met <OPENCODE_CONFIG_DIR>/AGENTS.md er nog steeds bij", breinTurn.context.includes("PERSOONLIJK-1"));
await file(join(harness, "agents/brein.md"), "---\ndescription: Jouw brein\nmode: primary\ntools:\n  write: false\n---\nBREIN-AGENT-PROMPT-2\n");
await sleep(1000);
const breinTurn2 = await turn(plain, breinChat, "nog eens");
check("E4.agent-live", "Een agentbestand dat via een symlink is gewijzigd, geldt NIET in dezelfde chat (de watcher volgt het doel van de link niet)", breinTurn2.context.includes("BREIN-AGENT-PROMPT-2"), false);
const breinChat2 = await chat(plain);
await api(plain, `/api/session/${breinChat2}/agent`, "POST", { agent: "brein" });
const breinTurn3 = await turn(plain, breinChat2, "hallo");
check("E4.agent-live-newchat", "… en ook niet in een nieuwe chat: agentbestanden dus als kopie in de config-map zetten, niet als link", breinTurn3.context.includes("BREIN-AGENT-PROMPT-2"), false);
await file(join(configDir, "agents/meervoud-agent.md"), "---\ndescription: Meervoud\nmode: primary\n---\nMEERVOUD-AGENT-2\n");
await sleep(1000);
const plural = await chat(plain);
await api(plain, `/api/session/${plural}/agent`, "POST", { agent: "meervoud-agent" });
const pluralTurn = await turn(plain, plural, "hallo");
check("E4.agent-live-direct", "… een rechtstreeks (niet via link) gewijzigd agentbestand geldt in een nieuwe chat", pluralTurn.context.includes("MEERVOUD-AGENT-2"));
const subStart = requests.length;
await turn(plain, breinChat, "DO_SUB");
await sleep(1500);
await idle(plain);
const subContext = JSON.stringify(requests.slice(subStart).find((request) => {
  const context = JSON.stringify(request.messages ?? []);
  return context.includes("SUBTASK") && !context.includes("DO_SUB");
})?.messages ?? []);
check("E4.subtask-skills", "Een sub-taak vanuit de agent ziet de harnas-skills ook", subContext.includes("okf-query") || subContext.includes("eigen-skill"), true, subContext ? "" : "geen sub-taak-verzoek gezien");

// E5: sessions of today across folders, and what that costs.
const directories = [plain, sales];
const made = [];
for (let index = 0; index < 20; index += 1) {
  const directory = directories[index % 2];
  const session = await chat(directory, `Gesprek ${index}`);
  await turn(directory, session, `Vraag ${index}: wie is Jan?`);
  made.push({ directory, session });
}
const started = performance.now();
let sessionsSeen = 0;
let messagesSeen = 0;
let sample = null;
for (const directory of directories) {
  const sessions = await entries(directory, "/api/session");
  sessionsSeen += sessions.length;
  sample ??= sessions[0];
  for (const session of sessions) {
    const messages = await entries(directory, `/api/session/${session.id}/message`);
    messagesSeen += messages.length;
  }
}
const elapsed = Math.round(performance.now() - started);
notes.push(`E5: ${sessionsSeen} sessies, ${messagesSeen} berichten in ${elapsed} ms; sessievelden: ${Object.keys(sample ?? {}).join(", ")}; tijd: ${JSON.stringify(sample?.time)}`);
check("E5.sessions", "GET /api/session per map noemt alle chats met titel en tijd (voor `gesprekken_lezen`)", sessionsSeen >= made.length && typeof sample?.title === "string" && sample?.time?.created !== undefined);
check("E5.messages", "GET /api/session/:id/message geeft de berichten; 20 chats lezen kost minder dan 5 s", messagesSeen >= made.length && elapsed < 5000, true, `${elapsed} ms`);
const sampleMessages = await entries(made[0].directory, `/api/session/${made[0].session}/message`);
notes.push(`E5: berichtvormen (${sampleMessages.length}): ${sampleMessages.map((message) => `${message.type ?? message.info?.role ?? message.role ?? "?"}:${Object.keys(message).join("/")}`).join(" | ")}`);
const userMessage = sampleMessages.find((message) => message.type === "user");
const assistantMessage = sampleMessages.find((message) => message.type === "assistant");
notes.push(`E5: gebruikersbericht: ${String(JSON.stringify(userMessage)).slice(0, 700)}`);
notes.push(`E5: antwoord: ${String(JSON.stringify(assistantMessage)).slice(0, 900)}`);

child.kill();
model.server.close();
await rm(root, { recursive: true, force: true });

let unexpected = 0;
console.log(`OpenCode ${version}\n`);
for (const { id, question, actual, expected, note } of checks) {
  const ok = actual === expected;
  if (!ok) unexpected += 1;
  console.log(`${ok ? "ok        " : "UNEXPECTED"}  ${actual ? "ja " : "nee"}  ${id.padEnd(24)} ${question}${note ? `  [${note}]` : ""}`);
}
console.log("");
for (const note of notes) console.log(note);
process.exit(unexpected ? 1 : 0);
