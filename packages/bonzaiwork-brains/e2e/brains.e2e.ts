/**
 * End-to-end check of brains against the real openwork-server and the
 * OpenCode v2 engine, with a stand-in LiteLLM that scripts tool calls (plan
 * §11, "Server-e2e"). Run: `pnpm --filter @bonzaiwork/brains e2e` (needs bun,
 * git, and network for the first engine download).
 *
 *  1. clone through the brain routes, register as a workspace, then a chat
 *     turn in which the model writes a file: after the quiet period the commit
 *     is on the bare repository, under the chat title and the user's name;
 *  2. the AI's own `git` is blocked by the engine policy from the hooks;
 *  3. an MCP from the brain's opencode.json does not load until trusted;
 *  4. a personal brain: the engine reaches the "breinen" MCP, the app rules
 *     and the user's preferences are in the chat's context, and a note the
 *     model writes through the tool lands in the personal brain's history.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { SERVER_ENVIRONMENT_DEFAULTS } from "@bonzaiwork/policy";

const repoRoot = resolve(import.meta.dir, "../../..");
const OWNER = "e2e-owner-token";
const HOST = "e2e-host-token";
const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string => (typeof value === "string" ? value : "");
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const toolResults: string[] = [];
const contexts: string[] = [];

/** Stand-in LiteLLM: "SCHRIJF" makes it write a file, "GIT" makes it run git. */
async function startLiteLLM(): Promise<{ server: Server; url: string }> {
  let calls = 0;
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    if (req.url === "/v1/models") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: [{ id: "e2e-model" }] }));
      return;
    }
    if (req.url !== "/v1/chat/completions") { res.writeHead(404).end(); return; }
    const parsed = record(JSON.parse(body || "{}"));
    const messages = list(parsed.messages).map(record);
    const last = messages.at(-1) ?? {};
    const tools = list(parsed.tools).map((tool) => text(record(record(tool).function).name));
    res.writeHead(200, { "content-type": "text/event-stream" });
    const chunk = (delta: unknown, finish: string | null = null) => res.write(`data: ${JSON.stringify({ id: "e2e", object: "chat.completion.chunk", model: "e2e-model", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
    const call = (name: string, args: unknown) => {
      chunk({ tool_calls: [{ index: 0, id: `call_${++calls}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] });
      chunk({}, "tool_calls");
    };
    const userText = last.role === "user" ? JSON.stringify(last.content) : "";
    if (tools.length) contexts.push(JSON.stringify(messages));
    if (last.role === "tool") toolResults.push(JSON.stringify(last.content));
    const personalTool = tools.find((name) => name.endsWith("persoonlijk_brein_schrijven"));
    const readTool = tools.find((name) => /(^|_)brein_lezen$/.test(name) && !name.includes("persoonlijk"));
    if (userText.includes("ANDERBREIN") && readTool) call(readTool, { brein: "Sales", pad: "AGENTS.md" });
    else if (userText.includes("PERSOONLIJK") && personalTool) call(personalTool, { pad: "knowledge/geleerd.md", inhoud: "---\ntype: Analysis\ntitle: Geleerd\n---\n# Geleerd\n" });
    else if (userText.includes("SCHRIJF") && tools.includes("write")) call("write", { path: "knowledge/e2e.md", content: "---\ntype: Process\n---\n# Uit de chat\n" });
    else if (userText.includes("GIT") && tools.includes("shell")) call("shell", { command: "git log -1" });
    else { chunk({ content: "Klaar." }); chunk({}, "stop"); }
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address: AddressInfo | string | null = server.address();
  if (!address || typeof address === "string") throw new Error("LiteLLM stand-in has no port");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function waitFor<T>(label: string, attempt: () => Promise<T | null>, timeoutMs: number): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await attempt().catch(() => null);
    if (value !== null) return value;
    await new Promise((done) => setTimeout(done, 300));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const git = (cwd: string, ...args: string[]) => spawnSync("git", ["-c", "user.name=Teamlid", "-c", "user.email=teamlid@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" });

async function main() {
  const root = await mkdtemp(join(tmpdir(), "bonzaiwork-brains-e2e-"));
  const home = join(root, "home");
  const plain = join(root, "Losse notities");
  const bare = join(root, "server.git");
  const seed = join(root, "seed");
  const brain = join(home, "BonzaiWork", "Sales");
  await mkdir(plain, { recursive: true });
  await mkdir(seed, { recursive: true });
  git(root, "init", "-q", "--bare", "-b", "main", bare);
  git(seed, "init", "-q", "-b", "main");
  await writeFile(join(seed, "AGENTS.md"), "# Sales\n");
  await writeFile(join(seed, "opencode.json"), JSON.stringify({ mcp: { rogue: { type: "local", command: ["node", "-e", "setInterval(()=>{},1000)"] } } }));
  git(seed, "add", "-A");
  git(seed, "commit", "-q", "-m", "begin");
  git(seed, "push", "-q", bare, "HEAD:refs/heads/main");

  const litellm = await startLiteLLM();
  const hooks = join(root, "server-hooks.js");
  const build = Bun.spawnSync(["bun", "build", join(repoRoot, "packages/bonzaiwork-server-hooks/src/server-hooks.ts"), "--outfile", hooks, "--target", "node", "--format", "esm"]);
  if (build.exitCode !== 0) throw new Error(build.stderr.toString());

  const logPath = join(root, "server.log");
  const port = 19000 + Math.floor(Math.random() * 1000);
  let server: ChildProcess | undefined;
  try {
    const log = Bun.file(logPath).writer();
    server = spawn("bun", ["--conditions=development", "src/cli.ts", "--workspace", plain, "--port", String(port)], {
      cwd: join(repoRoot, "apps/server"),
      env: {
        PATH: process.env.PATH, HOME: home, XDG_CONFIG_HOME: join(home, ".config"), XDG_DATA_HOME: join(home, ".local/share"),
        OPENWORK_TOKEN: OWNER, OPENWORK_HOST_TOKEN: HOST, OPENWORK_DEV_MODE: "1",
        ...SERVER_ENVIRONMENT_DEFAULTS,
        OPENWORK_SERVER_HOOKS: hooks,
        BONZAIWORK_LITELLM_BASE_URL: litellm.url,
        BONZAIWORK_KEY_MODE: "user",
        BONZAIWORK_STATE_DIR: join(home, "bonzaiwork"),
        BONZAIWORK_TEST_FILE_REMOTES: "1",
        BONZAIWORK_TEST_QUIET_MS: "1000",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout?.on("data", (chunk: Buffer) => log.write(chunk));
    server.stderr?.on("data", (chunk: Buffer) => log.write(chunk));
    const base = `http://127.0.0.1:${port}`;
    const owner = { Authorization: `Bearer ${OWNER}`, "Content-Type": "application/json" };
    const host = { "X-OpenWork-Host-Token": HOST, "Content-Type": "application/json" };
    const api = async (path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) => {
      const response = await fetch(`${base}${path}`, { method: init.method ?? "GET", headers: init.headers ?? owner, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
      return { status: response.status, body: record(await response.json().catch(() => ({}))) };
    };
    await waitFor("server", async () => (await api("/bonzaiwork/brains")).status === 200 ? true : null, 120_000);
    check("key linked", (await api("/bonzaiwork/keys/user", { method: "PUT", headers: host, body: { key: "sk-e2e-user-55555555" } })).status === 200);
    check("author set", (await api("/bonzaiwork/brains/settings", { method: "PUT", headers: host, body: { name: "Anna", email: "anna@example.invalid" } })).status === 200);

    const cloned = await api("/bonzaiwork/brains/clone", { method: "POST", headers: host, body: { url: `file://${bare}`, folderPath: brain } });
    const jobId = text(cloned.body.jobId);
    const job = await waitFor("clone", async () => {
      const state = await api(`/bonzaiwork/brains/jobs/${jobId}`, { headers: host });
      return text(state.body.state) === "running" ? null : state.body;
    }, 60_000);
    check("clone done", text(job.state) === "done", JSON.stringify(job));
    const pending = list(record(job.status).pendingTrust).map((item) => text(record(item).path));
    check("opencode.json waits for trust", JSON.stringify(pending) === JSON.stringify(["opencode.json"]), JSON.stringify(pending));

    const created = await api("/workspaces/local", { method: "POST", headers: host, body: { folderPath: brain, name: "Sales", preset: "starter" } });
    const workspaceId = text(created.body.activeId);
    check("workspace created", created.status === 201 && Boolean(workspaceId), String(created.status));
    const registered = await api(`/bonzaiwork/brains/${workspaceId}`, { method: "PUT", headers: host, body: { jobId, mode: "auto" } });
    check("brain registered", registered.status === 200, JSON.stringify(registered.body));
    const clean = git(brain, "status", "--porcelain").stdout.trim();
    check("registering wrote nothing into the brain", clean === "", clean);

    const engine = `${base}/workspace/${workspaceId}/opencode2`;
    await waitFor("engine catalog with litellm", async () => {
      const response = await fetch(`${engine}/api/provider`, { headers: owner });
      const ids = list(record(await response.json()).data).map((item) => text(record(item).id));
      return ids.includes("litellm") ? true : null;
    }, 180_000);
    const mcp = await waitFor("engine MCP list", async () => {
      const response = await fetch(`${engine}/api/mcp`, { headers: owner });
      return response.ok ? list(record(await response.json()).data).map((item) => text(record(item).name)) : null;
    }, 60_000);
    check("the brain's MCP is not loaded before trust", !mcp.includes("rogue"), JSON.stringify(mcp));

    const session = record(await (await fetch(`${engine}/api/session`, { method: "POST", headers: owner, body: JSON.stringify({ model: { providerID: "litellm", id: "e2e-model" }, title: "Offerte vastleggen", location: { directory: brain } }) })).json());
    const sessionId = text(session.id) || text(record(session.data).id);
    const turn = async (prompt: string) => {
      const pulled = await api(`/bonzaiwork/brains/${workspaceId}/pull`, { method: "POST", body: { sessionId } });
      await fetch(`${engine}/api/session/${sessionId}/prompt`, { method: "POST", headers: owner, body: JSON.stringify({ text: prompt, delivery: "steer" }) });
      await waitFor("turn", async () => {
        const response = await fetch(`${engine}/api/session/active?location%5Bdirectory%5D=${encodeURIComponent(brain)}`, { headers: owner });
        const active = record(record(await response.json()).data);
        return Object.keys(active).length === 0 || Object.values(active).every((state) => text(record(state).type) !== "running") ? true : null;
      }, 60_000);
      return pulled;
    };

    const pulled = await turn("SCHRIJF het offerteproces op");
    check("pull before the turn", text(pulled.body.waited) === "updated", JSON.stringify(pulled.body));
    const shared = await waitFor("commit on the server", async () => {
      const result = git(bare, "log", "-1", "--format=%an|%s|%(trailers:key=BonzaiWork-Chat,valueonly)", "main");
      return result.stdout.includes("Anna") ? result.stdout.trim() : null;
    }, 30_000);
    check("the turn is on the server under the chat title", shared === `Anna|Offerte vastleggen|${sessionId}`, shared);
    check("with the file the AI wrote", git(bare, "show", "main:knowledge/e2e.md").stdout.includes("Uit de chat"));

    await turn("GIT laat de log zien");
    check("the AI's own git is blocked", toolResults.some((result) => result.includes("Blocked by configuration policy")), toolResults.join(" | ").slice(0, 300));

    const trusted = await api(`/bonzaiwork/brains/${workspaceId}/trust`, { method: "POST", headers: host, body: { paths: ["opencode.json"] } });
    check("trusting the config", trusted.status === 200 && list(record(trusted.body).pendingTrust).length === 0, JSON.stringify(trusted.body).slice(0, 200));
    const loaded = await waitFor("trusted MCP appears", async () => {
      const response = await fetch(`${engine}/api/mcp`, { headers: owner });
      const names = list(record(await response.json()).data).map((item) => text(record(item).name));
      return names.includes("rogue") ? names : null;
    }, 30_000).catch(() => null);
    check("the MCP loads once trusted", loaded !== null, JSON.stringify(loaded));

    // 4. The personal brain.
    const personalFolder = join(home, "BonzaiWork", "Persoonlijk");
    const personal = await api("/workspaces/local", { method: "POST", headers: host, body: { folderPath: personalFolder, name: "Mijn brein", preset: "starter" } });
    const personalId = text(personal.body.activeId);
    const made = await api(`/bonzaiwork/brains/${personalId}`, { method: "PUT", headers: host, body: { kind: "personal", excluded: ["Dagboek"] } });
    check("personal brain registered", made.status === 200 && text(record(made.body.status).state) === "local_only", JSON.stringify(made.body).slice(0, 200));
    await writeFile(join(personalFolder, "_meta", "voorkeuren.md"), "# Mijn voorkeuren\n\nVOORKEUR-E2E: antwoord altijd kort.\n");
    const breinen = await waitFor("breinen MCP connected", async () => {
      const response = await fetch(`${engine}/api/mcp`, { headers: owner });
      const entry = list(record(await response.json()).data).map(record).find((item) => text(item.name) === "breinen");
      return entry && text(record(entry.status).status) === "connected" ? entry : null;
    }, 60_000).catch(() => null);
    check("the engine reaches the breinen MCP in a project brain", breinen !== null);
    const before = contexts.length;
    await turn("PERSOONLIJK leg dit vast");
    const context = contexts.slice(before)[0] ?? "";
    check("app rules in the chat's context", context.includes("Voer zelf nooit git uit"));
    check("the user's preferences in the chat's context", context.includes("VOORKEUR-E2E"));
    check("the model wrote in the personal brain", toolResults.some((result) => result.includes("knowledge/geleerd.md geschreven")), toolResults.slice(-2).join(" | ").slice(0, 300));
    const historyDir = join(home, "bonzaiwork", "history", `${personalId}.git`);
    const recorded = await waitFor("personal history", async () => {
      const result = spawnSync("git", ["--git-dir", historyDir, "--work-tree", personalFolder, "log", "-1", "--format=%s", "--name-only"], { encoding: "utf8" });
      return result.stdout.includes("knowledge/geleerd.md") ? result.stdout.trim() : null;
    }, 30_000).catch(() => null);
    check("recorded in the personal brain under the chat title", recorded?.startsWith("Offerte vastleggen") ?? false, String(recorded));
    check("no .git in the personal folder", !existsSync(join(personalFolder, ".git")));

    // 5. Another brain: reading it asks first (plan §5.2), then reads read-only.
    await fetch(`${engine}/api/session/${sessionId}/prompt`, { method: "POST", headers: owner, body: JSON.stringify({ text: "ANDERBREIN lees het Sales-brein", delivery: "steer" }) });
    const asked = await waitFor("permission for another brain", async () => {
      const response = await fetch(`${engine}/api/session/${sessionId}/permission`, { headers: owner });
      const pending = list(record(await response.json()).data).map(record);
      return pending.find((item) => text(item.action) === "breinen_brein_lezen") ?? null;
    }, 30_000).catch(() => null);
    check("reading another brain asks first", asked !== null, JSON.stringify(asked).slice(0, 200));
    if (asked) {
      await fetch(`${engine}/api/session/${sessionId}/permission/${text(asked.id)}/reply`, { method: "POST", headers: owner, body: JSON.stringify({ decision: "once", reply: "once" }) });
      const read = await waitFor("read from another brain", async () => toolResults.find((result) => result.includes("Uit het brein Sales")) ?? null, 30_000).catch(() => null);
      check("after allowing, the brain is read with its source", read !== null, toolResults.slice(-1).join("").slice(0, 200));
    }
    await log.flush();
  } finally {
    server?.kill("SIGTERM");
    litellm.server.close();
    await new Promise((done) => setTimeout(done, 1000));
    if (failures === 0) await rm(root, { recursive: true, force: true });
    else console.log(`kept ${root} for inspection (server log: ${logPath})`);
  }
  console.log(failures === 0 ? "e2e passed" : `e2e failed: ${failures} check(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
