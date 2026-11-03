import type { ReactElement, ReactNode, RefObject } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { cn } from "~/lib/cn";

/**
 * A small anchored surface (project pill, look picker, "Kies post"; brief §12) on Base UI
 * (DESIGN.md S7): portals out of the layout, anchors to its trigger, flips to the side with
 * room, caps to `--available-height` and scrolls inside, closes on an outside press and esc, and
 * returns focus to the trigger. Pass `open`/`onOpenChange` to control it (close after a choice).
 */
export function Popover(props: {
  /** The element that opens it; it becomes the Base UI trigger (aria-haspopup, aria-expanded). */
  trigger: ReactElement<Record<string, unknown>>;
  children: ReactNode;
  /** Names the popup for assistive tech when it has no visible title. */
  label?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  /** Where focus lands on open; default: the first tabbable element. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Trap focus inside (pickers with inputs); off by default so the surface stays light. */
  modal?: boolean;
  className?: string;
}) {
  return (
    <PopoverPrimitive.Root open={props.open} onOpenChange={props.onOpenChange} modal={props.modal ? "trap-focus" : false}>
      <PopoverPrimitive.Trigger render={props.trigger} />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner className="z-50 outline-none" side={props.side ?? "bottom"} align={props.align ?? "start"} sideOffset={6} collisionPadding={8}>
          <PopoverPrimitive.Popup
            aria-label={props.label}
            initialFocus={props.initialFocus}
            className={cn(
              "flex max-h-[var(--available-height)] w-max max-w-[min(var(--available-width),22rem)] flex-col overflow-y-auto rounded-2xl bg-popover p-2 text-popover-foreground shadow-popover outline-none origin-[var(--transform-origin)] transition-[opacity,transform] duration-120 data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-75",
              props.className,
            )}
          >
            {props.children}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/** Closes the surrounding Popover; render any control through it ("Klaar"). */
export function PopoverClose(props: { render: ReactElement<Record<string, unknown>>; children?: ReactNode }) {
  return <PopoverPrimitive.Close render={props.render}>{props.children}</PopoverPrimitive.Close>;
}
