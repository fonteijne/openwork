import { useEffect, useRef, useState } from "react";

import { copy } from "~/copy";
import { errorText } from "~/lib/errors";

import { Button } from "./ui/button";
import { Field, Input } from "./ui/field";
import { Dialog } from "./ui/overlay";

/** One text value, e.g. a new name. Submits on ⏎, keeps the dialog open on failure. */
export function PromptDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  submitLabel: string;
  onSubmit: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(props.initialValue ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (props.open) {
      setValue(props.initialValue ?? "");
      setError(null);
    }
  }, [props.open, props.initialValue]);

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await props.onSubmit(trimmed);
      props.onOpenChange(false);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.title}
      initialFocus={input}
      footer={
        <>
          <Button variant="secondary" onClick={() => props.onOpenChange(false)}>
            {copy.common.cancel}
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={!value.trim() || busy}>
            {props.submitLabel}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field label={props.label} error={error}>
          {(id, describedBy) => (
            <Input
              ref={input}
              id={id}
              aria-describedby={describedBy}
              value={value}
              placeholder={props.placeholder}
              onChange={(event) => setValue(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}
