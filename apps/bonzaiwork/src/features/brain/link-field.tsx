import { useState } from "react";
import { Check, Fingerprint, LoaderCircle } from "lucide-react";

import { useBackend } from "~/backend/context";
import type { RemoteCheck } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Field, Input } from "~/components/ui/field";
import { copy } from "~/copy";
import { errorText } from "~/lib/errors";

/**
 * The link to a shared brain with "Verbinding testen" (brains plan §4.1):
 * the check runs before anything is cloned, so access problems show here in
 * the user's words (DESIGN.md C6). An unknown server shows its fingerprint
 * once; the user confirms it before the app connects (plan §3.3).
 */
export function BrainLinkField(props: { check: RemoteCheck | null; onCheck: (check: RemoteCheck | null) => void; disabled?: boolean }) {
  const backend = useBackend();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const test = async (link: string) => {
    if (!link.trim()) return;
    setBusy(true);
    setFailure(null);
    try {
      props.onCheck(await backend.brains.checkRemote(link.trim()));
    } catch (error) {
      setFailure(errorText(error));
      props.onCheck(null);
    } finally {
      setBusy(false);
    }
  };

  const confirmHost = async (fingerprints: string[]) => {
    setBusy(true);
    try {
      await backend.brains.trustHost(url.trim(), fingerprints);
    } catch (error) {
      setFailure(errorText(error));
      setBusy(false);
      return;
    }
    await test(url);
  };

  const check = props.check;
  const message = failure ?? (check && !check.ok && check.problem !== "host_unknown" ? (check.problem === "link" ? copy.brain.linkInvalid : check.message) : null);
  const host = check && !check.ok && check.problem === "host_unknown" ? check.host : null;

  return (
    <div className="flex flex-col gap-2">
      <Field label={copy.brain.link} error={message}>
        {(id, describedBy) => (
          <div className="flex gap-2">
            <Input
              id={id}
              aria-describedby={describedBy}
              aria-invalid={message ? true : undefined}
              value={url}
              disabled={props.disabled}
              onChange={(event) => {
                setUrl(event.target.value);
                setFailure(null);
                props.onCheck(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void test(url);
                }
              }}
              placeholder={copy.brain.linkPlaceholder}
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
            />
            <Button variant="secondary" disabled={busy || props.disabled || !url.trim()} onClick={() => void test(url)}>
              {busy ? <LoaderCircle className="animate-spin" /> : null}
              {busy ? copy.brain.testing : copy.brain.testConnection}
            </Button>
          </div>
        )}
      </Field>
      {check?.ok ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground [&_svg]:size-4" role="status" data-testid="brain-link-ok">
          <Check className="text-jade-11" />
          {copy.brain.connectionOk}
        </p>
      ) : null}
      {host ? (
        <div className="rounded-2xl bg-muted/70 p-4" data-testid="brain-host">
          <p className="flex items-center gap-2 text-sm font-medium [&_svg]:size-4"><Fingerprint />{copy.brain.hostTitle(host.name)}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{copy.brain.hostBody}</p>
          <ul className="mt-2 flex flex-col gap-0.5">
            {host.fingerprints.map((fingerprint) => <li key={fingerprint}><code className="break-all font-mono text-xs">{fingerprint}</code></li>)}
          </ul>
          <Button className="mt-3" variant="secondary" size="sm" disabled={busy} onClick={() => void confirmHost(host.fingerprints)}>
            {copy.brain.hostConfirm}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
