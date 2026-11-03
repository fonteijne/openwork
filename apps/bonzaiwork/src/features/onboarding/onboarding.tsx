import { useBackend } from "~/backend/context";
import { useStatus } from "~/backend/queries";
import { BrandMark } from "~/components/brand";
import { Chip } from "~/components/ui/chip";
import { Button } from "~/components/ui/button";
import { Locked } from "~/components/ui/misc";
import { copy } from "~/copy";
import { navigate } from "~/lib/router";

import { KeyField, NameField, StarterField, focusComposerWhenReady, useProjectDraft } from "../projects/project-form";
import { useUi } from "../shell/ui-store";

/**
 * First start, one screen (brief §3, concept §10; assessment I-1): "Waar werk je aan?" with the
 * name, the key, starter chips and "Begin". The key is required and checked before the project
 * opens (create → link; a refused key keeps the person here with the error under the field, C6).
 * In user mode the one key is linked first. Lands on Vandaag with the composer focused and the
 * project pill set. No sentence explains the interface (P1); the server row keeps its URL for
 * the smoke test but no longer names the vendor (C3).
 */
export function Onboarding() {
  const backend = useBackend();
  const status = useStatus();
  const rememberProject = useUi((state) => state.rememberProject);
  const draft = useProjectDraft();
  const readOnly = status.data?.readOnly ?? false;

  const begin = async () => {
    const project = await draft.create({ folderPath: null, requireKey: true });
    if (!project) return;
    rememberProject(project.id);
    navigate({ name: "home" }, { replace: true });
    focusComposerWhenReady();
  };

  return (
    <main className="flex min-h-dvh items-center justify-center overflow-y-auto bg-background px-4 py-10">
      {/* No header here: in the desktop shell this strip moves the window. */}
      <div className="fixed inset-x-0 top-0 h-10" data-titlebar="strip" aria-hidden="true" />
      <form
        className="flex w-full max-w-sm flex-col gap-6"
        data-testid="welcome"
        onSubmit={(event) => {
          event.preventDefault();
          void begin();
        }}
      >
        <div className="flex items-center gap-2.5">
          <BrandMark className="size-8" />
          <span className="text-base font-semibold tracking-tight">{copy.appName}</span>
          {backend.mode === "demo" ? (
            <Chip tone="accent" size="sm">
              {copy.boot.demoBadge}
            </Chip>
          ) : null}
        </div>

        {/* ≤ 20px with slight negative tracking (V1); the one title on the screen (P2). */}
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{copy.onboarding.title}</h1>

        <NameField draft={draft} autoFocus />
        <StarterField draft={draft} />
        <KeyField draft={draft} required hint testId="litellm-key-input" />
        {draft.asksKey && status.data?.litellmBaseUrl ? (
          <div className="flex min-w-0 items-baseline gap-3 text-xs">
            <span className="shrink-0 text-muted-foreground">{copy.newProject.server}</span>
            <span className="min-w-0 truncate font-mono text-subtle-foreground" data-testid="litellm-server" title={status.data.litellmBaseUrl}>
              {status.data.litellmBaseUrl}
            </span>
          </div>
        ) : null}

        {draft.error?.field === "form" ? (
          <p className="text-sm text-destructive-foreground" role="alert">
            {draft.error.message}
          </p>
        ) : null}
        {readOnly ? <Locked>{copy.settings.readOnly}</Locked> : null}

        <Button type="submit" variant="primary" size="lg" disabled={draft.busy || readOnly} data-testid="litellm-key-submit">
          {draft.busy ? copy.onboarding.beginning : copy.onboarding.begin}
        </Button>
      </form>
    </main>
  );
}
