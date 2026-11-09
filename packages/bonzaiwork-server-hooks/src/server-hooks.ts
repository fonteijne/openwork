import { createAgendaHooks, type AgendaHost, type AgendaOptions } from "@bonzaiwork/agenda";
import { createBrainsServerHooks, type BrainsHooksOptions, type BrainsHost, type EnginePermission, type EnginePolicy } from "@bonzaiwork/brains";
import { createFeedbackRoutes, type FeedbackRoutesOptions } from "@bonzaiwork/feedback";
import { createServerHooks, type ServerHooksOptions, type ServerHost, type ServerRoute } from "@bonzaiwork/litellm";
import { createRoutinesHooks, type RoutinesHost, type RoutinesOptions } from "@bonzaiwork/routines";

import { prepareEngineHistoryDatabase } from "./engine-history.ts";

/**
 * The one module openwork-server loads (OPENWORK_SERVER_HOOKS): the
 * LiteLLM-only policy, brains, routines, the agenda and the feedback routes side by side,
 * and the engine's own chat history (engine-history.ts).
 * The host type is what they need from apps/server/src/downstream-hooks.ts,
 * structurally.
 */
export type Host = ServerHost & BrainsHost & RoutinesHost & AgendaHost;

export type CombinedHooks = {
  allowedProviderIds: readonly string[];
  routes: readonly ServerRoute[];
  enginePolicies(): readonly EnginePolicy[];
  enginePermissions(): readonly EnginePermission[];
  engineHistoryDatabase(): string;
  start(host: Host): Promise<void>;
};

export function createCombinedHooks(options: { litellm?: ServerHooksOptions; brains?: BrainsHooksOptions; routines?: RoutinesOptions; agenda?: AgendaOptions; feedback?: FeedbackRoutesOptions; environment?: NodeJS.ProcessEnv } = {}): CombinedHooks {
  const litellm = createServerHooks(options.litellm);
  const brains = createBrainsServerHooks(options.brains);
  // A routine may read the brains it names without a click (brains plan §5.2).
  const routines = createRoutinesHooks({ answerBrainReads: brains.answerBrainReads, ...options.routines });
  // Where you worked, per quarter hour (docs/bonzaiwork/agenda-manager-plan.md).
  // Turns in a routine's chat are the planner's, not yours (agenda plan §5.4).
  const agenda = createAgendaHooks({ isRoutineChat: routines.isRoutineChat, ...options.agenda });
  // "Feedback sturen" (docs/bonzaiwork/feedback.md).
  const feedback = createFeedbackRoutes(options.feedback);
  const paths = new Set<string>();
  for (const route of [...litellm.routes, ...brains.routes, ...routines.routes, ...agenda.routes, ...feedback]) {
    const key = `${route.method} ${route.path}`;
    if (paths.has(key)) throw new Error(`Route ${key} is registered twice.`);
    paths.add(key);
  }
  return {
    allowedProviderIds: litellm.allowedProviderIds,
    routes: [...litellm.routes, ...brains.routes, ...routines.routes, ...agenda.routes, ...feedback],
    enginePolicies: () => brains.enginePolicies(),
    enginePermissions: () => brains.enginePermissions(),
    // Read when engine v2 first selects its history, after the Electron entry set BONZAIWORK_STATE_DIR.
    engineHistoryDatabase: () => prepareEngineHistoryDatabase(options.environment),
    async start(host) {
      // Each starts on its own: a failing brain store never takes the models away.
      await Promise.all([
        litellm.start(host).catch((error: unknown) => host.log("error", "LiteLLM hooks failed to start", { error: String(error) })),
        brains.start(host),
        routines.start(host).catch((error: unknown) => host.log("error", "Routines failed to start", { error: String(error) })),
        agenda.start(host).catch((error: unknown) => host.log("error", "Agenda failed to start", { error: String(error) })),
      ]);
    },
  };
}

export default function serverHooks(): CombinedHooks {
  return createCombinedHooks();
}
