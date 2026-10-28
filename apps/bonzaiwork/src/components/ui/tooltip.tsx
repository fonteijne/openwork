import { cloneElement, useLayoutEffect, useRef, type ReactElement, type ReactNode } from "react";

import { useIdleReady } from "~/lib/idle";
import { lazyModule, useModule } from "~/lib/lazy-module";
import { useMediaQuery } from "~/lib/use-media";

const HOVER = "(hover: hover) and (pointer: fine)";

/** Base UI's tooltip, off the first load: fetched in idle time, and only on screens that hover. */
const primitives = lazyModule(() => import("@base-ui/react/tooltip").then((module) => module.Tooltip));

/** A short label on hover or focus; shows the keyboard chord when there is one (DESIGN.md S6). */
export function Tooltip(props: { label: ReactNode; shortcut?: string; children: ReactElement<Record<string, unknown>>; side?: "top" | "bottom" | "left" | "right" }) {
  // Touch screens never hover: the control's own aria-label carries the name, and no popup store is built.
  const hover = useMediaQuery(HOVER);
  const idle = useIdleReady(hover);
  const TooltipPrimitive = useModule(primitives, hover && idle);
  const trigger = useRef<HTMLButtonElement>(null);
  const focused = useRef(false);
  const live = TooltipPrimitive !== null;

  useLayoutEffect(() => {
    // The control is remounted inside the trigger: if it had focus, it keeps it.
    if (live && focused.current) trigger.current?.focus();
  }, [live]);

  if (!TooltipPrimitive) {
    if (!hover) return props.children;
    const own = props.children.props;
    return cloneElement(props.children, {
      onFocus: (event: unknown) => {
        focused.current = true;
        if (typeof own.onFocus === "function") own.onFocus(event);
      },
      onBlur: (event: unknown) => {
        focused.current = false;
        if (typeof own.onBlur === "function") own.onBlur(event);
      },
    });
  }
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger ref={trigger} delay={400} render={props.children} />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner side={props.side ?? "top"} sideOffset={6} collisionPadding={8} className="z-50">
          <TooltipPrimitive.Popup className="flex items-center gap-2 rounded-full bg-ink-12 px-2.5 py-1 text-xs text-ink-1 shadow-popover transition-opacity duration-100 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 dark:bg-ink-5 dark:text-ink-12">
            {props.label}
            {props.shortcut ? <kbd className="font-sans opacity-60">{props.shortcut}</kbd> : null}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
