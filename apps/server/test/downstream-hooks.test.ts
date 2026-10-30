import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import {
  addDownstreamRoutes,
  downstreamEnginePermissions,
  downstreamEnginePolicies,
  engineConfigDirectory,
  startDownstreamServerHooks,
  type DownstreamServerHost,
  downstreamProviderGate,
  loadDownstreamServerHooks,
  setDownstreamServerHooks,
} from "../src/downstream-hooks.js";
import { organizationProviderGate } from "../src/organization-provider-gate.js";
import { matchRoute, type Route } from "../src/routes/registry.js";
import { readGlobalRuntimeOpencodeConfig, runtimeStorageDir } from "../src/runtime-opencode-config-store.js";
import type { ServerConfig } from "../src/types.js";

afterEach(() => setDownstreamServerHooks(null));

test("without hooks nothing changes", () => {
  assert.equal(downstreamProviderGate(), null);
  assert.deepEqual(downstreamEnginePolicies(), []);
  assert.equal(organizationProviderGate(undefined), null);
});

test("an allowlist gates providers even without an organization policy", () => {
  setDownstreamServerHooks({ allowedProviderIds: ["litellm"] });
  const gate = organizationProviderGate(undefined);
  assert.ok(gate);
  assert.equal(gate("litellm"), true);
  assert.equal(gate("anthropic"), false);
  assert.equal(gate("openwork"), false);
  assert.deepEqual(downstreamEnginePolicies(), [
    { action: "provider.use", resource: "*", effect: "deny" },
    { action: "provider.use", resource: "litellm", effect: "allow" },
  ]);
});

test("routes register ahead of built-ins, with params and a rest wildcard", async () => {
  const seen: Array<Record<string, string>> = [];
  setDownstreamServerHooks({
    routes: [{ method: "POST", path: "/acme/ws/:workspaceId/v1/*", auth: "none", handle: async (_request, params) => {
      seen.push(params);
      return new Response("ok");
    } }],
  });
  const routes: Route[] = [];
  addDownstreamRoutes(routes);
  const match = matchRoute(routes, "POST", "/acme/ws/ws_1/v1/chat/completions");
  assert.ok(match);
  assert.deepEqual(match.params, { workspaceId: "ws_1", "*": "chat/completions" });
  assert.equal(matchRoute(routes, "POST", "/acme/ws/ws_1/v1"), null);
  assert.equal(match.auth, "none");
});

test("OPENWORK_SERVER_HOOKS loads a module and rejects a malformed one", async () => {
  const dir = await mkdtemp(join(tmpdir(), "downstream-hooks-"));
  try {
    const good = join(dir, "good.mjs");
    await writeFile(good, "export default () => ({ allowedProviderIds: ['litellm'], routes: [] });\n");
    const hooks = await loadDownstreamServerHooks({ OPENWORK_SERVER_HOOKS: good });
    assert.deepEqual(hooks?.allowedProviderIds, ["litellm"]);

    const bad = join(dir, "bad.mjs");
    await writeFile(bad, "export default () => ({ allowedProviderIds: 'litellm' });\n");
    await assert.rejects(loadDownstreamServerHooks({ OPENWORK_SERVER_HOOKS: bad }), /invalid hooks/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("extra engine policies follow the provider allowlist; a hook cannot add provider rules", () => {
  setDownstreamServerHooks({
    allowedProviderIds: ["litellm"],
    enginePolicies: () => [
      { action: "tool.use", resource: "shell:git *", effect: "deny" },
      { action: "provider.use", resource: "*", effect: "allow" },
    ],
  });
  assert.deepEqual(downstreamEnginePolicies(), [
    { action: "provider.use", resource: "*", effect: "deny" },
    { action: "provider.use", resource: "litellm", effect: "allow" },
    { action: "tool.use", resource: "shell:git *", effect: "deny" },
  ]);
});

test("engine permission rules from the hooks go first in the engine config", async () => {
  const { renderOpencodeV2Config } = await import("../src/managed-opencode-v2.js");
  assert.deepEqual(downstreamEnginePermissions(), []);
  assert.equal(renderOpencodeV2Config({ providers: [], skills: [] }).permissions, undefined);
  setDownstreamServerHooks({ enginePermissions: () => [{ action: "breinen_brein_lezen", resource: "*", effect: "ask" }] });
  const rendered = renderOpencodeV2Config({ providers: [], skills: [], permissions: [{ action: "bash", resource: "*", effect: "deny" }] });
  assert.deepEqual(rendered.permissions, [
    { action: "breinen_brein_lezen", resource: "*", effect: "ask" },
    { action: "bash", resource: "*", effect: "deny" },
  ]);
});

test("the engine config folder is the one managed-opencode-v2 uses", async () => {
  const { engineInstanceId } = await import("../src/engine-v2-preview.js");
  const config = { configPath: "/state/server.json" };
  for (const environment of [{}, { OPENWORK_ELECTRON_APP_IDENTIFIER: "nl.bonzaiwork.desktop" }, { OPENWORK_SERVER_STATE_PATH: "/x" }]) {
    const id = engineInstanceId(environment);
    assert.equal(engineConfigDirectory(config, environment), join(runtimeStorageDir(config), "opencode-v2", "state", ...(id ? ["instances", id] : []), "config"));
  }
});

test("host: session activity, running sessions, MCP entries and the global context", async () => {
  const root = await mkdtemp(join(tmpdir(), "downstream-host-"));
  const workspace = join(root, "brein");
  const skills = join(root, "persoonlijk-skills");
  await mkdir(workspace, { recursive: true });
  await mkdir(skills, { recursive: true });
  const events: string[] = [];
  let sseClient: ServerResponse | undefined;
  const engine = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://engine");
    assert.equal(request.headers.authorization, `Basic ${Buffer.from("opencode:pw").toString("base64")}`);
    if (url.pathname === "/api/event") {
      assert.equal(url.searchParams.get("location[directory]"), workspace);
      response.writeHead(200, { "content-type": "text/event-stream" });
      sseClient = response;
      return;
    }
    if (url.pathname === "/api/session/active") {
      response.end(JSON.stringify({ data: { ses_a: { type: "running" }, ses_b: { type: "idle" } } }));
      return;
    }
    if (url.pathname === "/api/session/ses_a") {
      response.end(JSON.stringify({ data: { id: "ses_a", title: "Offerte", parentID: null } }));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => engine.listen(0, "127.0.0.1", resolve));
  const address = engine.address();
  assert.ok(address && typeof address === "object");
  const previousState = process.env.OPENWORK_SERVER_STATE_PATH;
  delete process.env.OPENWORK_SERVER_STATE_PATH;
  const config: ServerConfig = {
    host: "127.0.0.1", port: 0, token: "test", hostToken: "host-test", configPath: join(root, "server.json"),
    approval: { mode: "auto", timeoutMs: 1000 }, corsOrigins: [], authorizedRoots: [], readOnly: false,
    workspaces: [{ id: "ws_1", name: "Brein", path: workspace, preset: "starter", workspaceType: "local" }],
    startedAt: Date.now(), tokenSource: "generated", hostTokenSource: "generated", logFormat: "json", logRequests: false,
  };
  let host: DownstreamServerHost | undefined;
  setDownstreamServerHooks({ start: async (next) => { host = next; } });
  try {
    await startDownstreamServerHooks({
      config, port: 0, markReloadPending: () => {},
      engine: { connection: () => ({ url: `http://127.0.0.1:${address.port}`, password: "pw" }), refreshProviders: async () => undefined },
      logger: { log: () => {} },
    });
    assert.ok(host);
    const stop = host.onSessionActivity((activity) => events.push(`${activity.workspaceId}:${activity.sessionId}:${activity.state}:${activity.outcome ?? ""}`));
    for (let attempt = 0; attempt < 50 && !sseClient; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(sseClient);
    sseClient.write(`data: ${JSON.stringify({ type: "session.execution.started", data: { sessionID: "ses_a" } })}\n\n`);
    sseClient.write(`data: ${JSON.stringify({ type: "session.text.delta", data: { sessionID: "ses_a" } })}\n\n`);
    // CRLF line ends, the pair split over two writes.
    sseClient.write(`data: ${JSON.stringify({ type: "session.execution.succeeded", data: { sessionID: "ses_a" } })}\r\n\r`);
    sseClient.write(`\n`);
    sseClient.write(`data: ${JSON.stringify({ type: "session.execution.started", data: { sessionID: "ses_b" } })}\r\n\r\n`);
    for (let attempt = 0; attempt < 50 && events.length < 3; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(events, ["ws_1:ses_a:running:", "ws_1:ses_a:idle:succeeded", "ws_1:ses_b:running:"]);
    stop();

    assert.deepEqual(await host.runningSessions("ws_1"), ["ses_a"]);
    assert.equal(await host.runningSessions("ws_unknown"), null);
    assert.deepEqual(await host.sessionInfo("ses_a"), { id: "ses_a", title: "Offerte", parentId: null });

    assert.equal(await host.updateEngineMcp({ breinen: { type: "remote", url: "http://127.0.0.1:1/bonzaiwork/brains/mcp", codemode: false } }), true);
    assert.equal(await host.updateEngineMcp({ breinen: { type: "remote", url: "http://127.0.0.1:1/bonzaiwork/brains/mcp", codemode: false } }), false);
    assert.deepEqual(Object.keys((await readGlobalRuntimeOpencodeConfig(config)).mcp ?? {}), ["breinen"]);
    assert.equal(await host.updateEngineMcp({ breinen: null }), true);
    assert.equal((await readGlobalRuntimeOpencodeConfig(config)).mcp, undefined);

    await host.setEngineGlobalContext({ instructions: "# Mijn voorkeuren\n", skillsDirectory: skills });
    const directory = engineConfigDirectory(config);
    assert.equal(await readFile(join(directory, "AGENTS.md"), "utf8"), "# Mijn voorkeuren\n");
    assert.equal(await realpath(join(directory, "skills")), await realpath(skills));
    await host.setEngineGlobalContext({ instructions: null, skillsDirectory: null });
    assert.equal(existsSync(join(directory, "AGENTS.md")), false);
    assert.equal(existsSync(join(directory, "skills")), false);
  } finally {
    sseClient?.end();
    engine.closeAllConnections();
    engine.close();
    if (previousState === undefined) delete process.env.OPENWORK_SERVER_STATE_PATH;
    else process.env.OPENWORK_SERVER_STATE_PATH = previousState;
    await rm(root, { recursive: true, force: true });
  }
});
