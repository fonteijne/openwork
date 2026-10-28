import { copy } from "~/copy";
import type { BonzaiworkStatus } from "~/lib/bonzaiwork-api";
import type { ServerConnection } from "~/lib/connection";

import { KeyLinkForm } from "./key-link-form";

/**
 * First run (workstream B6): the LiteLLM server is baked into the build, so
 * the only decision here is the key. No provider choice exists anywhere.
 */
export function Onboarding(props: { connection: ServerConnection; status: BonzaiworkStatus; onLinked: (status: BonzaiworkStatus) => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{copy.onboardingTitle}</h1>
          <p className="font-mono text-sm text-muted-foreground" data-testid="litellm-server">{props.status.litellmBaseUrl}</p>
        </div>
        <KeyLinkForm connection={props.connection} autoFocus onLinked={props.onLinked} />
      </div>
    </main>
  );
}
