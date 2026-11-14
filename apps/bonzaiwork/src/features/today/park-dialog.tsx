import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useBackend } from "~/backend/context";
import { keys, useToday } from "~/backend/queries";
import { Button } from "~/components/ui/button";
import { Field, Textarea } from "~/components/ui/field";
import { Dialog } from "~/components/ui/overlay";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { errorText } from "~/lib/errors";
import { PARK_EVENT } from "~/lib/shortcuts";

/**
 * "Gedachte parkeren" from anywhere (docs/bonzaiwork/persoonlijke-agent-plan.md T5): a thought
 * usually arrives in the middle of a chat, not on Vandaag. ⌘⇧G or the palette opens this dialog;
 * ⏎ parks, and focus goes back to where it came from. With the agent off the chord says so once
 * instead of doing nothing (P4).
 */
export function ParkDialog() {
  const backend = useBackend();
  const client = useQueryClient();
  const today = useToday();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const ready = Boolean(today.data?.enabled) && !today.data?.blocked;

  useEffect(() => {
    const show = () => {
      if (ready) setOpen(true);
      else toast(copy.today.parkOff);
    };
    window.addEventListener(PARK_EVENT, show);
    return () => window.removeEventListener(PARK_EVENT, show);
  }, [ready]);

  const park = async () => {
    setTried(true);
    if (!text.trim() || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await backend.today.park(text.trim());
      toast(copy.today.parkedToast);
      setText("");
      setTried(false);
      setOpen(false);
      void client.invalidateQueries({ queryKey: keys.today });
    } catch (error) {
      setFailure(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={copy.today.parkTitle}
      footer={
        <>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
            {copy.common.cancel}
          </Button>
          <Button variant="primary" onClick={() => void park()} disabled={busy} data-testid="park-save">
            {copy.today.park}
          </Button>
        </>
      }
    >
      <Field label={copy.today.parkPlaceholder} error={failure ?? (tried && !text.trim() ? copy.today.parkRequired : null)}>
        {(id, describedBy) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            value={text}
            rows={3}
            autoFocus
            disabled={busy}
            data-testid="park-text"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              // ⏎ parks; ⇧⏎ is a new line, as in the composer.
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void park();
              }
            }}
          />
        )}
      </Field>
    </Dialog>
  );
}
