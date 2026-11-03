import { useRef, useState } from "react";
import { Check, Fingerprint, LoaderCircle } from "lucide-react";

import { useBackend } from "~/backend/context";
import type { RemoteCheck } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Field, Input } from "~/components/ui/field";
import { copy } from "~/copy";
import { errorText } from "~/lib/errors";


/**
 * The link to a shared brain (brains plan §4.1). Joining is one step (brief §8): the check runs by
 * itself when the link is pasted or the field loses focus, so access problems show here in the
 * user's words before anything is cloned (DESIGN.md C6) and nobody presses a test button first.
 * An unknown server shows its fingerprint once; the user confirms it before the app connects
 * (plan §3.3). The same field serves the personal brain's private repository (assessment I-8).
 */
export function BrainLinkField(props: { check: RemoteCheck | null; onCheck: (check: RemoteCheck | null) => void; disabled?: boolean; label?: string; autoFocus?: boolean }) {
  const backend = useBackend();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // The link the last check was for: a blur without a change does not test again.
  const tested = useRef<string | null>(null);

  const test = async (link: string) => {
    const trimmed = link.trim();
    if (!trimmed || busy) return;
    tested.current = trimmed;
    setBusy(true);
    setFailure(null);
    try {
      props.onCheck(await backend.brains.checkRemote(trimmed));
    } catch (error) {
      setFailure(errorText(error));
      props.onCheck(null);
    } finally {
      setBusy(false);
    }
  };

  const testIfNew = (link: string) => {
    if (link.trim() && link.trim() !== tested.current) void test(link);
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
    setBusy(false);
    tested.current = null;
    await test(url);
  };

  const check = props.check;
  const message = failure ?? (check && !check.ok && check.problem !== "host_unknown" ? (check.problem === "link" ? copy.brain.linkInvalid : check.message) : null);
  const host = check && !check.ok && check.problem === "host_unknown" ? check.host : null;

  return (
    <div className="flex flex-col gap-2">
      <Field label={props.label ?? copy.brain.link} error={message}>
        {(id, describedBy) => (
          <div className="flex items-center gap-2">
            <Input
              id={id}
              aria-describedby={describedBy}
              aria-invalid={message ? true : undefined}
              value={url}
              disabled={props.disabled}
              autoFocus={props.autoFocus}
              onChange={(event) => {
                setUrl(event.target.value);
                setFailure(null);
                tested.current = null;
                props.onCheck(null);
              }}
              onBlur={() => testIfNew(url)}
              onPaste={(event) => {
                // The pasted link is checked at once; the input's own value lands after this event.
                const pasted = event.clipboardData.getData("text");
                if (pasted.trim()) {
                  event.preventDefault();
                  const next = url.slice(0, event.currentTarget.selectionStart ?? url.length) + pasted + url.slice(event.currentTarget.selectionEnd ?? url.length);
                  setUrl(next);
                  setFailure(null);
                  props.onCheck(null);
                  void test(next);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  tested.current = null;
                  void test(url);
                }
              }}
              placeholder={copy.brain.linkPlaceholder}
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
              data-testid="brain-link-input"
            />
            {busy ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-4" role="status">
                <LoaderCircle className="animate-spin motion-reduce:animate-none" />
                {copy.brain.testing}
              </span>
            ) : message ? (
              <Button variant="quiet" size="sm" disabled={props.disabled || !url.trim()} onClick={() => { tested.current = null; void test(url); }}>
                {copy.brain.join.retest}
              </Button>
            ) : null}
          </div>
        )}
      </Field>
      {check?.ok ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground [&_svg]:size-4" role="status" data-testid="brain-link-ok">
          <Check className="text-jade-11" />
          {check.empty ? copy.brain.connectionEmpty : copy.brain.connectionOk}
        </p>
      ) : null}
      {host ? (
        <div className="rounded-2xl bg-muted/70 p-4" data-testid="brain-host">
          <p className="flex items-center gap-2 text-sm font-medium [&_svg]:size-4">
            <Fingerprint />
            {copy.brain.hostTitle(host.name)}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">{copy.brain.hostBody}</p>
          <ul className="mt-2 flex flex-col gap-0.5">
            {host.fingerprints.map((fingerprint) => (
              <li key={fingerprint}>
                <code className="break-all font-mono text-xs">{fingerprint}</code>
              </li>
            ))}
          </ul>
          <Button className="mt-3" variant="secondary" size="sm" disabled={busy} onClick={() => void confirmHost(host.fingerprints)}>
            {copy.brain.hostConfirm}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
