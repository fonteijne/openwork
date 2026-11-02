import { expect, test } from "bun:test";

import { createAgendaHooks } from "../src/index.ts";

test("start en stop met een nep-host", async () => {
  const hooks = createAgendaHooks();
  await hooks.start({ readOnly: false, workspaces: () => [], onSessionActivity: () => () => {}, sessionInfo: async () => null, log: () => {} });
  expect(hooks.started).toBe(true);
  hooks.stop();
  expect(hooks.started).toBe(false);
});
