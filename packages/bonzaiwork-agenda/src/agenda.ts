import type { AgendaHost, AgendaRoute } from "./types.ts";

export type AgendaOptions = {
  stateDirectory?: string;
  environment?: NodeJS.ProcessEnv;
  now?: () => number;
};

/**
 * The agenda (docs/bonzaiwork/agenda-manager-plan.md): in the server process, per quarter hour,
 * where you worked in BonzaiWork. No model, no engine, no brains (A7, A8).
 */
export function createAgendaHooks(_options: AgendaOptions = {}) {
  let host: AgendaHost | null = null;
  const routes: AgendaRoute[] = [];
  return {
    routes,
    async start(next: AgendaHost) {
      host = next;
    },
    stop() {
      host = null;
    },
    get started() { return host !== null; },
  };
}

export type AgendaHooks = ReturnType<typeof createAgendaHooks>;
