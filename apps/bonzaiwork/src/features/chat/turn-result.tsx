import { useState } from "react";
import { Check, Copy, FileText, RefreshCw } from "lucide-react";

import type { Model } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Menu, MenuItem, MenuLabel } from "~/components/ui/menu";
import { Tooltip } from "~/components/ui/tooltip";
import { cn } from "~/lib/cn";
import type { TouchedFile } from "~/lib/tools";

import { chatCopy } from "./copy";

/**
 * What a finished turn produced (brief §7; DESIGN.md S4, S5): one flat row of file chips that
 * open the file in the Details column (the `?bestand=` hash), and the turn's hover actions:
 * Kopieer, and "Nogmaals met ander model" (a copy of the chat up to this turn, sent again).
 */

export function CopyButton(props: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  const label = props.label ?? chatCopy.turn.copy;
  return (
    <Tooltip label={done ? chatCopy.turn.copied : label}>
      <Button
        variant="quiet"
        size="icon-sm"
        className={props.className}
        aria-label={label}
        onClick={() => {
          void navigator.clipboard?.writeText(props.text).then(() => {
            setDone(true);
            window.setTimeout(() => setDone(false), 1_500);
          });
        }}
      >
        {done ? <Check /> : <Copy />}
      </Button>
    </Tooltip>
  );
}

/** The files this turn wrote or changed, as chips that open them next to the chat. */
export function DeliveredRow(props: { files: readonly TouchedFile[]; onOpen: (path: string) => void; className?: string }) {
  if (!props.files.length) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1.5", props.className)} data-testid="turn-delivered">
      <span className="text-xs text-muted-foreground">{chatCopy.turn.delivered}</span>
      {props.files.map((file) => (
        <button
          key={file.path}
          type="button"
          title={file.path}
          aria-label={chatCopy.turn.open(file.name)}
          onClick={() => props.onOpen(file.path)}
          className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-muted ps-2 pe-2.5 font-mono text-xs text-foreground transition-colors duration-100 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:h-9"
        >
          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{file.name}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * The turn's quiet actions, shown on hover, focus and touch: copy the answer, run the same
 * question again with another model. The list names models the way the key does (C3).
 */
export function TurnActionsRow(props: { answer: string; models: readonly Model[]; currentModel: string | null; onRerun: (model: string) => void; className?: string }) {
  const others = props.models.filter((model) => model.id !== props.currentModel);
  return (
    <div className={cn("flex h-8 items-center gap-0.5 opacity-0 transition-opacity duration-100 group-hover/turn:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100", props.className)}>
      {props.answer ? <CopyButton text={props.answer} /> : null}
      {props.models.length ? (
        <Menu
          align="start"
          trigger={
            <Button variant="quiet" size="sm" className="gap-1.5 text-xs">
              <RefreshCw className="size-3.5!" />
              {chatCopy.turn.rerun}
            </Button>
          }
        >
          <MenuLabel>{chatCopy.turn.rerun}</MenuLabel>
          {(others.length ? others : props.models).map((model) => (
            <MenuItem key={model.id} onClick={() => props.onRerun(model.id)}>
              {model.name}
            </MenuItem>
          ))}
        </Menu>
      ) : null}
    </div>
  );
}
