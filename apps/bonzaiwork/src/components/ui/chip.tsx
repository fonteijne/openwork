import type { ReactNode } from "react";
import { CircleAlert, Lock } from "lucide-react";

import type { ChatStatus } from "~/backend/types";
import { cn } from "~/lib/cn";
import { copy } from "~/copy";


/**
 * A small pill: icon + word, or a mono file/command chip (DESIGN.md V1). Neutral by default;
 * `accent` is the one electric chip (the Demo badge). Never decorative (V7): a chip names state
 * or an object.
 */
export function Chip(props: { children: ReactNode; icon?: ReactNode; mono?: boolean; tone?: "neutral" | "accent"; size?: "sm" | "md"; className?: string; title?: string }) {
  return (
    <span
      title={props.title}
      className={cn(
        "inline-flex max-w-full shrink-0 items-center gap-1 whitespace-nowrap rounded-full font-medium [&_svg]:size-3.5 [&_svg]:shrink-0",
        props.size === "sm" ? "h-5 px-1.5 text-[11px] leading-none" : "h-6 px-2 text-xs",
        props.tone === "accent" ? "bg-electric-3 text-electric-11" : "bg-muted text-foreground",
        props.mono && "font-mono font-normal",
        props.className,
      )}
    >
      {props.icon}
      <span className="truncate">{props.children}</span>
    </span>
  );
}

export type ChipStatus = ChatStatus | "locked";

/**
 * Status as icon + word, never hue alone (DESIGN.md V2, C5; WCAG 1.4.1). Ink text with a colored
 * icon, so it reads AA on white, on sand and on dark; colored text never sits on sand.
 * running = pulsing electric dot · "Bezig"; waiting = amber dot · "Wacht op jou"; failed = red
 * alert glyph · "Mislukt"; locked = lock · your word (P4); idle = `label` as a neutral word, else nothing.
 */
export function StatusChip(props: {
  status: ChipStatus;
  /** Replaces the default word; required for `locked` ("Geen key") and for an idle word ("Klaar"). */
  label?: string;
  /** Trailing detail in subtle ink ("· 2 min"). */
  detail?: ReactNode;
  /** Render as a filled pill instead of bare text (page headers). */
  pill?: boolean;
  className?: string;
}) {
  if (props.status === "idle" && !props.label) return null;
  const word = props.label ?? (props.status === "idle" ? "" : copy.ui.status[props.status]);
  return (
    <span
      data-status={props.status}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap text-xs font-medium text-foreground",
        props.pill && "h-6 rounded-full bg-muted px-2",
        props.status === "idle" && "text-muted-foreground",
        props.className,
      )}
    >
      {props.status === "running" ? <span aria-hidden="true" className="bw-pulse size-2 shrink-0 rounded-full bg-electric-9" /> : null}
      {props.status === "waiting" ? <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-amber-9 ring-1 ring-inset ring-amber-11/50" /> : null}
      {props.status === "failed" ? <CircleAlert aria-hidden="true" className="size-3.5 shrink-0 text-red-11" /> : null}
      {props.status === "locked" ? <Lock aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" /> : null}
      <span className="truncate">{word}</span>
      {props.detail ? <span className="truncate font-normal text-subtle-foreground">{props.detail}</span> : null}
    </span>
  );
}
