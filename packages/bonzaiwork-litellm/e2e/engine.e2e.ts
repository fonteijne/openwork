/**
 * End-to-end check of the LiteLLM-only policy against the real openwork-server
 * and the OpenCode v2 engine (downloaded on first run), with a stand-in
 * LiteLLM. Run: `pnpm --filter @bonzaiwork/litellm e2e` (needs bun and network
 * for the first engine download).
 *
 * Proves the workstream B "klaar als" criteria:
 *  1. with ANTHROPIC_API_KEY set, a project opencode.json adding another
 *     provider (and trying to re-allow it), and a local auth.json, only
 *     `litellm` reaches the engine and a chat through another provider fails;
 *  2. a chat turn streams through the loopback route to LiteLLM;
 *  3. two workspaces with their own keys reach LiteLLM with different keys;
 *  4. no key appears in logs, engine config, the server database or workspaces.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "../../..");
const KEY_A = "sk-e2e-workspace-a-11111111";
const KEY_B = "sk-e2e-workspace-b-22222222";
const USER_KEY = "sk-e2e-user-33333333";
const ROGUE_KEY = "sk-rogue-44444444";
const OWNER = "e2e-owner-token";
const HOST = "e2e-host-token";

type Seen = { url: string; authorization: string };

// JSON readers without casts (AGENTS.md: no `as`).
const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const seen: Seen[] = [];
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function startLiteLLM(): Promise<{ server: Server; url: string }> {
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const authorization = req.headers.authorization ?? "";
    seen.push({ url: req.url ?? "", authorization });
    if (!authorization.startsWith("Bearer sk-")) {
      res.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ error: { message: "invalid key" } }));
      return;
    }
    if (req.url === "/v1/models") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: [{ id: "e2e-model" }] }));
      return;
    }
    if (req.url === "/v1/chat/completions") {
      const model = text(record(JSON.parse(body || "{}")).model) || "e2e-model";
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const word of ["Hallo", " van", " LiteLLM"]) {
        res.write(`data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", model, choices: [{ index: 0, delta: { content: word }, finish_reason: null }] })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 3, total_tokens: 4 } })}\n\n`);
      res.end("data: [DONE]\n\n");
      return;
    }
    res.writeHead(404).end();
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
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function main() {
  const root = await mkdtemp(join(tmpdir(), "bonzaiwork-e2e-"));
  const home = join(root, "home");
  const wsA = join(root, "ws-a");
  const wsB = join(root, "ws-b");
  await mkdir(join(home, ".local/share/opencode"), { recursive: true });
  await mkdir(wsA, { recursive: true });
  await mkdir(wsB, { recursive: true });
  const litellm = await startLiteLLM();
  // A project that adds its own provider and tries to re-allow it.
  await writeFile(join(wsA, "opencode.json"), JSON.stringify({
    enabled_providers: ["rogue"],
    experimental: { policies: [{ action: "provider.use", resource: "*", effect: "allow" }] },
    provider: { rogue: { npm: "@ai-sdk/openai-compatible", name: "Rogue", options: { baseURL: `${litellm.url}/v1`, apiKey: ROGUE_KEY }, models: { "rogue-model": { name: "Rogue" } } } },
  }));
  await writeFile(join(home, ".local/share/opencode/auth.json"), JSON.stringify({ openai: { type: "api", key: "sk-local-auth-55555555" } }));

  const hooks = join(root, "server-hooks.js");
  const build = Bun.spawnSync(["bun", "build", join(repoRoot, "packages/bonzaiwork-litellm/src/server-hooks.ts"), "--outfile", hooks, "--target", "node", "--format", "esm"]);
  if (build.exitCode !== 0) throw new Error(build.stderr.toString());

  const logPath = join(root, "server.log");
  const port = 18000 + Math.floor(Math.random() * 1000);
  let server: ChildProcess | undefined;
  try {
    const log = Bun.file(logPath).writer();
    server = spawn("bun", ["--conditions=development", "src/cli.ts", "--workspace", wsA, "--workspace", wsB, "--port", String(port)], {
      cwd: join(repoRoot, "apps/server"),
      env: {
        ...process.env,
        HOME: home,
        XDG_CONFIG_HOME: join(home, ".config"),
        XDG_DATA_HOME: join(home, ".local/share"),
        ANTHROPIC_API_KEY: "sk-ant-env-66666666",
        OPENWORK_TOKEN: OWNER,
        OPENWORK_HOST_TOKEN: HOST,
        OPENWORK_DEV_MODE: "1",
        OPENWORK_DISABLE_FREE_INFERENCE: "1",
        OPENWORK_SERVER_HOOKS: hooks,
        BONZAIWORK_LITELLM_BASE_URL: litellm.url,
        BONZAIWORK_KEY_MODE: "workspace",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout?.on("data", (chunk: Buffer) => log.write(chunk));
    server.stderr?.on("data", (chunk: Buffer) => log.write(chunk));
    const base = `http://127.0.0.1:${port}`;
    const auth = { Authorization: `Bearer ${OWNER}` };

    const workspaces = await waitFor("server", async () => {
      const response = await fetch(`${base}/workspaces`, { headers: auth });
      if (!response.ok) return null;
      const items = list(record(await response.json()).items).map((item) => ({ id: text(record(item).id), path: text(record(item).path) }));
      return items.length === 2 ? items : null;
    }, 120_000);
    const idA = workspaces.find((item) => item.path === wsA)?.id ?? "";
    const idB = workspaces.find((item) => item.path === wsB)?.id ?? "";

    for (const [id, key] of [[idA, KEY_A], [idB, KEY_B]]) {
      const response = await fetch(`${base}/bonzaiwork/keys/workspace/${id}`, {
        method: "PUT", headers: { "X-OpenWork-Host-Token": HOST, "Content-Type": "application/json" }, body: JSON.stringify({ key }),
      });
      check(`link key to ${id}`, response.ok, String(response.status));
    }
    const rejected = await fetch(`${base}/bonzaiwork/keys/user`, { method: "PUT", headers: { Authorization: `Bearer ${OWNER}`, "Content-Type": "application/json" }, body: JSON.stringify({ key: USER_KEY }) });
    check("key routes require the host token", rejected.status === 401, String(rejected.status));

    const engine = (id: string) => `${base}/workspace/${id}/opencode2`;
    const providers = await waitFor("engine catalog with litellm", async () => {
      const response = await fetch(`${engine(idA)}/api/provider`, { headers: auth });
      if (!response.ok) return null;
      const ids = list(record(await response.json()).data).map((item) => text(record(item).id));
      return ids.includes("litellm") ? ids : null;
    }, 180_000);
    check("engine offers only litellm", JSON.stringify(providers) === JSON.stringify(["litellm"]), JSON.stringify(providers));

    async function chat(id: string, dir: string, providerID: string, modelID: string): Promise<{ outcome: string; text: string }> {
      const created = await fetch(`${engine(id)}/api/session`, {
        method: "POST", headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ model: { providerID, id: modelID }, location: { directory: dir } }),
      });
      const session = record(await created.json());
      const sessionId = text(session.id) || text(record(session.data).id);
      await fetch(`${engine(id)}/api/session/${sessionId}/prompt`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ text: "Zeg hallo" }) });
      return waitFor("chat outcome", async () => {
        const response = await fetch(`${engine(id)}/api/session/${sessionId}/message`, { headers: auth });
        const entries = list(record(await response.json()).data).map(record);
        const idle = entries.find((entry) => entry.type === "idle");
        if (!idle) return null;
        const answer = entries.filter((entry) => entry.type === "assistant").flatMap((entry) => list(entry.content)).map((part) => text(record(part).text)).join("");
        return { outcome: text(idle.outcome), text: answer };
      }, 60_000);
    }

    const rogue = await chat(idA, wsA, "rogue", "rogue-model");
    check("a project-added provider cannot run", rogue.outcome === "failed", rogue.outcome);
    check("LiteLLM never saw the project's own key", !seen.some((entry) => entry.authorization.includes(ROGUE_KEY)));

    const turnA = await chat(idA, wsA, "litellm", "e2e-model");
    check("chat turn through LiteLLM (workspace A)", turnA.outcome === "succeeded" && turnA.text === "Hallo van LiteLLM", JSON.stringify(turnA));
    const turnB = await chat(idB, wsB, "litellm", "e2e-model");
    check("chat turn through LiteLLM (workspace B)", turnB.outcome === "succeeded", JSON.stringify(turnB));
    const completionKeys = new Set(seen.filter((entry) => entry.url === "/v1/chat/completions").map((entry) => entry.authorization));
    check("each workspace used its own key", completionKeys.has(`Bearer ${KEY_A}`) && completionKeys.has(`Bearer ${KEY_B}`) && completionKeys.size === 2, [...completionKeys].join(", "));

    // Leak scan: every file the server or engine wrote, plus the server log.
    const secrets = [KEY_A, KEY_B, USER_KEY];
    const leaks: string[] = [];
    async function scan(path: string) {
      const info = await stat(path).catch(() => null);
      if (!info) return;
      if (info.isDirectory()) {
        if (path.includes(`${join(home, ".bun")}`) || path.includes("opencode-v2-verified")) return;
        for (const entry of await readdir(path)) await scan(join(path, entry));
        return;
      }
      if (info.size > 50 * 1024 * 1024) return;
      const content = await readFile(path, "latin1");
      for (const secret of secrets) if (content.includes(secret)) leaks.push(`${path}: ${secret.slice(0, 12)}…`);
    }
    await log.flush();
    for (const path of [home, wsA, wsB, logPath]) await scan(path);
    check("no LiteLLM key in logs, config or databases", leaks.length === 0, leaks.join("; "));
  } finally {
    server?.kill("SIGTERM");
    litellm.server.close();
    await new Promise((done) => setTimeout(done, 1000));
    if (failures === 0) await rm(root, { recursive: true, force: true });
    else console.log(`kept ${root} for inspection`);
  }
  console.log(failures === 0 ? "e2e passed" : `e2e failed: ${failures} check(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
