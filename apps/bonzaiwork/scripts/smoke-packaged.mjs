/**
 * Smoke test of the packaged Linux app (run under xvfb-run):
 *   1. starts a stand-in LiteLLM on the URL baked into this build;
 *   2. launches dist-electron/bonzaiwork/linux-unpacked/bonzaiwork with a fresh
 *      profile, a CDP port, and every outbound request routed through a
 *      recording proxy that refuses to forward anything;
 *   3. links a key in onboarding, adds a workspace, and runs one chat turn;
 *   4. fails when any request went to *.openworklabs.com (workstream C).
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const binary = resolve(appRoot, "../desktop/dist-electron/bonzaiwork/linux-unpacked/bonzaiwork");
const baked = JSON.parse(readFileSync(resolve(appRoot, "dist-electron/build-config.json"), "utf8"));
const litellmUrl = new URL(baked.litellmBaseUrl);
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const KEY = "sk-smoke-virtual-key-7777";
const outbound = [];
const litellmCalls = [];
let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
};
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

// Stand-in LiteLLM.
const litellm = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  litellmCalls.push({ url: req.url, authorization: req.headers.authorization ?? "" });
  if (req.headers.authorization !== `Bearer ${KEY}`) {
    res.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ error: { message: "invalid key" } }));
    return;
  }
  if (req.url === "/v1/models") {
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: [{ id: "smoke-model" }] }));
    return;
  }
  if (req.url === "/v1/chat/completions") {
    res.writeHead(200, { "content-type": "text/event-stream" });
    for (const word of ["Hallo", " van", " LiteLLM"]) {
      res.write(`data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", model: "smoke-model", choices: [{ index: 0, delta: { content: word }, finish_reason: null }] })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", model: "smoke-model", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 3, total_tokens: 4 } })}\n\n`);
    res.end("data: [DONE]\n\n");
    return;
  }
  res.writeHead(404).end();
});
await new Promise((done) => litellm.listen(Number(litellmUrl.port), litellmUrl.hostname, done));

// Recording proxy: logs every destination and forwards nothing.
const proxy = createServer((req, res) => {
  outbound.push(new URL(req.url).host);
  res.writeHead(502).end();
});
proxy.on("connect", (req, socket) => {
  outbound.push(req.url);
  socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
});
await new Promise((done) => proxy.listen(0, "127.0.0.1", done));
const proxyUrl = `http://127.0.0.1:${proxy.address().port}`;

const profile = mkdtempSync(join(tmpdir(), "bonzaiwork-smoke-"));
const workspace = join(profile, "workspace");
mkdirSync(workspace, { recursive: true });
writeFileSync(join(workspace, "notities.md"), "# Notities\n");
const cdpPort = 9300 + Math.floor(Math.random() * 500);
const environment = { ...process.env };
for (const name of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"]) delete environment[name];
// Upstream main.mjs owns the CDP switch; it takes the port from this variable.
const app = spawn(binary, [`--proxy-server=${proxyUrl}`, "--no-sandbox"], {
  env: {
    ...environment,
    HOME: profile,
    XDG_CONFIG_HOME: join(profile, ".config"),
    XDG_DATA_HOME: join(profile, ".local/share"),
    HTTPS_PROXY: proxyUrl,
    HTTP_PROXY: proxyUrl,
    NODE_USE_ENV_PROXY: "1",
    NO_PROXY: "127.0.0.1,localhost,::1",
    OPENWORK_ELECTRON_REMOTE_DEBUG_PORT: String(cdpPort),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let appLog = "";
app.stdout.on("data", (chunk) => { appLog += chunk; });
app.stderr.on("data", (chunk) => { appLog += chunk; });

let browser;
try {
  let page;
  for (let attempt = 0; attempt < 120 && !page; attempt += 1) {
    await wait(1000);
    try {
      browser ??= await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
      page = browser.contexts().flatMap((context) => context.pages()).find((candidate) => !candidate.url().startsWith("devtools:"));
    } catch { /* not up yet */ }
  }
  if (!page) throw new Error("The app window never appeared");
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http")) outbound.push(url.host);
  });

  await page.waitForSelector('[data-testid="litellm-key-input"]', { timeout: 120_000 });
  check("packaged app shows BonzaiWork onboarding", (await page.title()) === "BonzaiWork", await page.title());
  check("onboarding shows the baked LiteLLM URL", (await page.textContent('[data-testid="litellm-server"]')) === baked.litellmBaseUrl);
  await page.fill('[data-testid="litellm-key-input"]', KEY);
  await page.click('[data-testid="litellm-key-submit"]');
  await page.waitForSelector('[data-testid="new-workspace"]', { timeout: 60_000 });

  // The native folder picker cannot be driven here; register the folder the way the UI does after picking one.
  await page.evaluate(async (folderPath) => {
    const info = await window.__OPENWORK_ELECTRON__.invokeDesktop("openworkServerInfo");
    const response = await fetch(`${info.baseUrl}/workspaces/local`, {
      method: "POST",
      headers: { Authorization: `Bearer ${info.ownerToken}`, "X-OpenWork-Host-Token": info.hostToken, "Content-Type": "application/json" },
      body: JSON.stringify({ folderPath, name: "workspace", preset: "starter" }),
    });
    if (!response.ok) throw new Error(`workspace create failed: ${response.status}`);
  }, workspace);
  await page.reload();
  await page.waitForSelector('[data-testid="composer-input"]', { timeout: 60_000 });
  await page.fill('[data-testid="composer-input"]', "Zeg hallo");
  await page.click('[data-testid="composer-send"]');
  const answered = await page.waitForSelector('[data-role="assistant"]:has-text("Hallo van LiteLLM")', { timeout: 120_000 }).then(() => true, () => false);
  check("one chat turn via LiteLLM in the packaged app", answered);
  await page.screenshot({ path: resolve(appRoot, "dist-electron/smoke-chat.png") });
  check("LiteLLM received the linked key", litellmCalls.some((call) => call.url === "/v1/chat/completions" && call.authorization === `Bearer ${KEY}`));
  const cloud = [...new Set(outbound)].filter((host) => /(^|\.)openworklabs\.com(:\d+)?$/i.test(host));
  check("no traffic to *.openworklabs.com", cloud.length === 0, cloud.join(", "));
  console.log(`outbound destinations (all refused): ${[...new Set(outbound)].filter((host) => !/^(127\.0\.0\.1|localhost)(:|$)/.test(host)).join(", ") || "none"}`);
} catch (error) {
  failures += 1;
  console.error(error);
  console.error(appLog.slice(-4000));
} finally {
  await browser?.close().catch(() => undefined);
  app.kill("SIGTERM");
  await wait(2000);
  if (!app.killed) app.kill("SIGKILL");
  litellm.close();
  proxy.close();
  rmSync(profile, { recursive: true, force: true });
}
console.log(failures === 0 ? "smoke passed" : `smoke failed: ${failures} check(s)`);
process.exit(failures === 0 ? 0 : 1);
