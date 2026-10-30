import { createBrainsServerHooks, type BrainsHooksOptions, type BrainsHost, type EnginePermission, type EnginePolicy } from "@bonzaiwork/brains";
import { createServerHooks, type ServerHooksOptions, type ServerHost, type ServerRoute } from "@bonzaiwork/litellm";
import { createRoutinesHooks, type RoutinesHost, type RoutinesOptions } from "@bonzaiwork/routines";

/**
 * The one module openwork-server loads (OPENWORK_SERVER_HOOKS): the
 * LiteLLM-only policy and brains side by side. The host type is what both
 * need from apps/server/src/downstream-hooks.ts, structurally.
 */
export type Host = ServerHost & BrainsHost & RoutinesHost;

export type CombinedHooks = {
  allowedProviderIds: readonly string[];
  routes: readonly ServerRoute[];
  enginePolicies(): readonly EnginePolicy[];
  enginePermissions(): readonly EnginePermission[];
  start(host: Host): Promise<void>;
};

export function createCombinedHooks(options: { litellm?: ServerHooksOptions; brains?: BrainsHooksOptions; routines?: RoutinesOptions } = {}): CombinedHooks {
  const litellm = createServerHooks(options.litellm);
  const brains = createBrainsServerHooks(options.brains);
  // A routine may read the brains it names without a click (brains plan §5.2).
  const routines = createRoutinesHooks({ answerBrainReads: brains.answerBrainReads, ...options.routines });
  const paths = new Set<string>();
  for (const route of [...litellm.routes, ...brains.routes, ...routines.routes]) {
    const key = `${route.method} ${route.path}`;
    if (paths.has(key)) throw new Error(`Route ${key} is registered twice.`);
    paths.add(key);
  }
  return {
    allowedProviderIds: litellm.allowedProviderIds,
    routes: [...litellm.routes, ...brains.routes, ...routines.routes],
    enginePolicies: () => brains.enginePolicies(),
    enginePermissions: () => brains.enginePermissions(),
    async start(host) {
      // Each starts on its own: a failing brain store never takes the models away.
      await Promise.all([
        litellm.start(host).catch((error: unknown) => host.log("error", "LiteLLM hooks failed to start", { error: String(error) })),
        brains.start(host),
        routines.start(host).catch((error: unknown) => host.log("error", "Routines failed to start", { error: String(error) })),
      ]);
    },
  };
}

export default function serverHooks(): CombinedHooks {
  return createCombinedHooks();
}
