import { expect, test } from "bun:test";

import { createCombinedHooks } from "../src/server-hooks.ts";

test("één module met de routes en policies van beide", () => {
  const hooks = createCombinedHooks({ litellm: { settings: { litellmBaseUrl: "https://litellm.example.invalid", defaultModel: null, keyMode: "user" } } });
  expect(hooks.allowedProviderIds).toEqual(["litellm"]);
  const paths = hooks.routes.map((route) => `${route.method} ${route.path}`);
  expect(paths).toContain("GET /bonzaiwork/status");
  expect(paths).toContain("POST /bonzaiwork/brains/:workspaceId/pull");
  expect(hooks.enginePolicies()[0]).toEqual({ action: "tool.use", resource: "shell:git *", effect: "deny" });
});
