import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import {
  addDownstreamRoutes,
  downstreamEnginePolicies,
  downstreamProviderGate,
  loadDownstreamServerHooks,
  setDownstreamServerHooks,
} from "../src/downstream-hooks.js";
import { organizationProviderGate } from "../src/organization-provider-gate.js";
import { matchRoute, type Route } from "../src/routes/registry.js";

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
