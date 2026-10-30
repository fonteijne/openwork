import { createFeedbackRoutes } from "@bonzaiwork/feedback";
import { createServerHooks, type ServerHooks } from "@bonzaiwork/litellm";

/**
 * The openwork-server hooks module the packaged app loads
 * (OPENWORK_SERVER_HOOKS): the LiteLLM-only policy and its routes, plus the
 * feedback routes (docs/bonzaiwork/feedback.md).
 */
export default function serverHooks(): ServerHooks {
  const litellm = createServerHooks();
  return { ...litellm, routes: [...litellm.routes, ...createFeedbackRoutes()] };
}
