import { useRef, useState } from "react";
import { FolderPlus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { useBackend } from "~/backend/context";
import { keys, useStatus } from "~/backend/queries";
import { BrandMark } from "~/components/brand";
import { Button } from "~/components/ui/button";
import { Field, SecretInput, type SecretInputHandle } from "~/components/ui/field";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { errorText } from "~/lib/errors";

import { NewProjectDialog } from "../projects/new-project-dialog";

function LinkUserKey() {
  const backend = useBackend();
  const status = useStatus();
  const client = useQueryClient();
  const field = useRef<SecretInputHandle>(null);
  const [present, setPresent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const key = field.current?.take().trim() ?? "";
    if (!key) return;
    setBusy(true);
    setError(null);
    try {
      const next = await backend.keys.linkUser(key);
      client.setQueryData(keys.status, next);
      toast(copy.keys.linkedToast);
    } catch (failure) {
      setError(errorText(failure));
      field.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex w-full flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div>
        <h1 className="text-2xl font-medium tracking-tight">{copy.onboarding.title}</h1>
        <p className="mt-1 break-all font-mono text-xs text-muted-foreground" data-testid="litellm-server">
          {status.data?.litellmBaseUrl}
        </p>
      </div>
      <Field label={copy.onboarding.keyLabel} error={error} hint={status.data?.keyStorePersistent === false ? copy.onboarding.notPersistent : undefined}>
        {(id, describedBy) => (
          <SecretInput ref={field} id={id} describedBy={describedBy} invalid={Boolean(error)} placeholder={copy.onboarding.keyPlaceholder} autoFocus disabled={busy} testId="litellm-key-input" onPresenceChange={setPresent} onSubmit={() => void submit()} />
        )}
      </Field>
      <Button type="submit" variant="primary" size="lg" disabled={!present || busy} data-testid="litellm-key-submit">
        {busy ? copy.onboarding.linking : copy.onboarding.link}
      </Button>
    </form>
  );
}

function FirstProject() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex w-full flex-col gap-4">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">{copy.onboarding.projectFirst}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{copy.onboarding.projectFirstHint}</p>
      </div>
      <Button variant="primary" size="lg" onClick={() => setOpen(true)}>
        <FolderPlus />
        {copy.projects.new}
      </Button>
      <NewProjectDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

/** First start. The LiteLLM server is baked into the build, so the only decision is the key (or the first project). */
export function Onboarding() {
  const status = useStatus();
  const backend = useBackend();
  const userMode = status.data?.keyMode === "user" && !status.data.user.hasKey;
  return (
    <main className="flex min-h-dvh items-center justify-center overflow-y-auto bg-background px-4 py-10">
      <div className="flex w-full max-w-sm flex-col items-start gap-8">
        <div className="flex items-center gap-2.5">
          <BrandMark className="size-8" />
          <span className="text-base font-semibold tracking-tight">{copy.appName}</span>
          {backend.mode === "demo" ? <span className="rounded-full bg-electric-3 px-2 py-px text-[11px] font-semibold text-electric-11">{copy.boot.demoBadge}</span> : null}
        </div>
        {userMode ? <LinkUserKey /> : <FirstProject />}
      </div>
    </main>
  );
}
