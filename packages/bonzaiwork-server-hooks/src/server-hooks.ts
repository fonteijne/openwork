import { createBrainsServerHooks, type BrainsHooksOptions, type BrainsHost, type EnginePermission, type EnginePolicy } from "@bonzaiwork/brains";
import { createServerHooks, type ServerHooksOptions, type ServerHost, type ServerRoute } from "@bonzaiwork/litellm";

/**
 * The one module openwork-server loads (OPENWORK_SERVER_HOOKS): the
 * LiteLLM-only policy and brains side by side. The host type is what both
 * need from apps/server/src/downstream-hooks.ts, structurally.
 */
export type Host = ServerHost & BrainsHost;

export type CombinedHooks = {
  allowedProviderIds: readonly string[];
  routes: readonly ServerRoute[];
  enginePolicies(): readonly EnginePolicy[];
  enginePermissions(): readonly EnginePermission[];
  start(host: Host): Promise<void>;
};

export function createCombinedHooks(options: { litellm?: ServerHooksOptions; brains?: BrainsHooksOptions } = {}): CombinedHooks {
  const litellm = createServerHooks(options.litellm);
  const brains = createBrainsServerHooks(options.brains);
  const paths = new Set(litellm.routes.map((route) => `${route.method} ${route.path}`));
  const clash = brains.routes.find((route) => paths.has(`${route.method} ${route.path}`));
  if (clash) throw new Error(`Route ${clash.method} ${clash.path} is registered twice.`);
  return {
    allowedProviderIds: litellm.allowedProviderIds,
    routes: [...litellm.routes, ...brains.routes],
    enginePolicies: () => brains.enginePolicies(),
    enginePermissions: () => brains.enginePermissions(),
    async start(host) {
      // Each starts on its own: a failing brain store never takes the models away.
      await Promise.all([
        litellm.start(host).catch((error: unknown) => host.log("error", "LiteLLM hooks failed to start", { error: String(error) })),
        brains.start(host),
      ]);
    },
  };
}

export default function serverHooks(): CombinedHooks {
  return createCombinedHooks();
}
