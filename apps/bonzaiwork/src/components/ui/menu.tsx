import { cloneElement, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronRight } from "lucide-react";

import { cn } from "~/lib/cn";
import { useIdleReady } from "~/lib/idle";
import { lazyModule, useModule } from "~/lib/lazy-module";

const POPUP =
  "max-h-[var(--available-height)] min-w-48 max-w-[var(--available-width)] overflow-y-auto rounded-2xl bg-popover p-1.5 text-popover-foreground shadow-popover outline-none origin-[var(--transform-origin)] transition-[opacity,transform] duration-120 data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-75";
const ITEM =
  "flex h-8 cursor-default select-none items-center gap-2 rounded-lg px-2.5 text-sm outline-none data-[highlighted]:bg-hover data-[disabled]:opacity-45 pointer-coarse:h-10 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

/** Base UI's menu, off the first load. Items only render inside an open menu, so after it arrived. */
const primitives = lazyModule(() => import("@base-ui/react/menu").then((module) => module.Menu));

/**
 * Menus portal out of the layout, anchor to their trigger and fit the window
 * (DESIGN.md S7). Lists put a menu on every row, and each closed menu still
 * costs a popup store: the trigger starts as the plain button and becomes the
 * real menu in idle time, one menu at a time, or at once when clicked.
 */
export function Menu(props: { trigger: React.ReactElement<Record<string, unknown>>; children: ReactNode; align?: "start" | "center" | "end"; side?: "top" | "bottom" | "left" | "right" }) {
  const idle = useIdleReady();
  const [clicked, setClicked] = useState(false);
  const MenuPrimitive = useModule(primitives, idle || clicked);
  const focused = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const live = MenuPrimitive !== null;

  useLayoutEffect(() => {
    // The plain button had focus when the real trigger replaced it: keep focus where it was.
    if (live && focused.current && !clicked) trigger.current?.focus();
  }, [live, clicked]);

  if (!MenuPrimitive) {
    return cloneElement(props.trigger, {
      "aria-haspopup": "menu",
      "aria-expanded": false,
      onClick: () => setClicked(true),
      onFocus: () => {
        focused.current = true;
      },
      onBlur: () => {
        focused.current = false;
      },
    });
  }

  return (
    <MenuPrimitive.Root defaultOpen={clicked}>
      <MenuPrimitive.Trigger ref={trigger} render={props.trigger} />
      <MenuPrimitive.Portal>
        <MenuPrimitive.Positioner className="z-50 outline-none" sideOffset={4} align={props.align ?? "start"} side={props.side ?? "bottom"} collisionPadding={8}>
          <MenuPrimitive.Popup className={POPUP}>{props.children}</MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}

export function MenuItem(props: { icon?: ReactNode; children: ReactNode; onClick?: () => void; danger?: boolean; disabled?: boolean; shortcut?: string; checked?: boolean }) {
  const MenuPrimitive = primitives.get();
  if (!MenuPrimitive) return null;
  return (
    <MenuPrimitive.Item className={cn(ITEM, props.danger && "text-destructive-foreground [&_svg]:text-destructive-foreground")} onClick={props.onClick} disabled={props.disabled}>
      {props.icon}
      <span className="min-w-0 flex-1 truncate">{props.children}</span>
      {props.checked ? <Check /> : null}
      {props.shortcut ? <kbd className="font-sans text-xs text-subtle-foreground">{props.shortcut}</kbd> : null}
    </MenuPrimitive.Item>
  );
}

export function MenuSeparator() {
  const MenuPrimitive = primitives.get();
  if (!MenuPrimitive) return null;
  return <MenuPrimitive.Separator className="mx-1 my-1 h-px bg-border" />;
}

export function MenuLabel(props: { children: ReactNode }) {
  const MenuPrimitive = primitives.get();
  if (!MenuPrimitive) return null;
  return (
    <MenuPrimitive.Group>
      <MenuPrimitive.GroupLabel className="px-2 pt-1.5 pb-1 text-xs text-subtle-foreground">{props.children}</MenuPrimitive.GroupLabel>
    </MenuPrimitive.Group>
  );
}

export function SubMenu(props: { icon?: ReactNode; label: ReactNode; children: ReactNode }) {
  const MenuPrimitive = primitives.get();
  if (!MenuPrimitive) return null;
  return (
    <MenuPrimitive.SubmenuRoot>
      <MenuPrimitive.SubmenuTrigger className={cn(ITEM, "data-[popup-open]:bg-hover")}>
        {props.icon}
        <span className="min-w-0 flex-1 truncate">{props.label}</span>
        <ChevronRight />
      </MenuPrimitive.SubmenuTrigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Positioner className="z-50 outline-none" sideOffset={2} collisionPadding={8}>
          <MenuPrimitive.Popup className={POPUP}>{props.children}</MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </MenuPrimitive.SubmenuRoot>
  );
}
