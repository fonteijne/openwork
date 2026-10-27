import { useRef, useState } from "react";

import { SecretField, type SecretFieldHandle } from "@/components/secret-field";
import { Button } from "@/components/ui/button";

import { copy } from "~/copy";
import { bonzaiworkApi, type BonzaiworkStatus } from "~/lib/bonzaiwork-api";
import type { ServerConnection } from "~/lib/connection";

/**
 * Links a LiteLLM virtual key. The key stays inside the private SecretField
 * until it is sent once to the local server; nothing here stores it.
 */
export function KeyLinkForm(props: {
  connection: ServerConnection;
  /** Links the key to one workspace instead of to the person. */
  workspaceId?: string;
  autoFocus?: boolean;
  onLinked: (status: BonzaiworkStatus) => void;
  onCancel?: () => void;
}) {
  const field = useRef<SecretFieldHandle>(null);
  const [hasValue, setHasValue] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const key = field.current?.take().trim() ?? "";
    if (!key) return;
    setBusy(true);
    setError(null);
    try {
      const status = props.workspaceId
        ? await bonzaiworkApi.linkWorkspaceKey(props.connection, props.workspaceId, key)
        : await bonzaiworkApi.linkUserKey(props.connection, key);
      props.onLinked(status);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      field.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <SecretField
        id={props.workspaceId ? `litellm-key-${props.workspaceId}` : "litellm-key"}
        label={copy.keyLabel}
        placeholder={copy.keyPlaceholder}
        error={error}
        disabled={busy}
        autoFocus={props.autoFocus}
        handleRef={field}
        onValueChange={setHasValue}
        onSubmit={() => void submit()}
        testId="litellm-key-input"
      />
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={!hasValue || busy} data-testid="litellm-key-submit">
          {busy ? copy.linking : copy.linkKey}
        </Button>
        {props.onCancel ? (
          <Button type="button" variant="ghost" onClick={props.onCancel} disabled={busy}>
            {copy.cancel}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
