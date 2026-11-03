import { useEffect, useRef, type ReactNode } from "react";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";

import { cn } from "~/lib/cn";

export type TabItem<V extends string> = {
  value: V;
  label: ReactNode;
  /** A trailing count ("Bestanden 12"); null or 0 renders nothing. */
  count?: number | null;
  icon?: ReactNode;
  disabled?: boolean;
  /** Tabs that are routes render as real anchors (typed routes stay anchors; brief §11). */
  href?: string;
};

/**
 * Tabs on Base UI (DESIGN.md P5): roving focus, ←/→, aria-selected and aria-controls come from
 * the primitive. The active tab is a pill like the sidebar's active pill: on the page a sand pill,
 * on a sand surface (`surface="sand"`) a page-colored pill with the card ring. The list scrolls
 * sideways on narrow screens and keeps the active tab in view, so the same component is the
 * phone's pill strip (brief §6).
 */
export function Tabs<V extends string>(props: {
  value: V;
  onValueChange: (value: V) => void;
  items: readonly TabItem<V>[];
  /** Names the tab list for assistive tech ("Projectonderdelen"). */
  label: string;
  surface?: "page" | "sand";
  /** Panels (`TabPanel`), or nothing when a router renders the content. */
  children?: ReactNode;
  className?: string;
  listClassName?: string;
}) {
  const list = useRef<HTMLDivElement>(null);
  const isItem = (value: unknown): value is V => props.items.some((item) => item.value === value);
  const linked = props.items.some((item) => item.href !== undefined);

  useEffect(() => {
    // Phone pill strip: the active tab stays in view (brief §6). No smooth scrolling under reduced motion.
    const active = list.current?.querySelector<HTMLElement>("[data-active]");
    active?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
  }, [props.value]);

  return (
    <TabsPrimitive.Root
      value={props.value}
      onValueChange={(value) => {
        if (isItem(value)) props.onValueChange(value);
      }}
      className={cn("flex min-w-0 flex-col", props.className)}
    >
      <TabsPrimitive.List
        ref={list}
        aria-label={props.label}
        // Route tabs activate on press/enter, not on arrow focus: focusing must not navigate.
        activateOnFocus={!linked}
        className={cn("-mx-1 flex shrink-0 gap-0.5 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", props.listClassName)}
      >
        {props.items.map((item) => (
          <TabsPrimitive.Tab
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            nativeButton={item.href === undefined}
            render={item.href !== undefined ? <a href={item.href} /> : undefined}
            className={cn(
              "flex h-8 shrink-0 select-none items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm text-muted-foreground outline-none transition-colors duration-100 hover:bg-hover hover:text-foreground focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-45 pointer-coarse:h-11 [&_svg]:size-4 [&_svg]:shrink-0",
              props.surface === "sand" ? "data-[active]:bg-background data-[active]:shadow-card" : "data-[active]:bg-sand-3",
              "data-[active]:font-semibold data-[active]:text-foreground",
            )}
          >
            {item.icon}
            <span className="truncate">{item.label}</span>
            {item.count ? <span className="tabular-nums text-subtle-foreground">{item.count}</span> : null}
          </TabsPrimitive.Tab>
        ))}
      </TabsPrimitive.List>
      {props.children}
    </TabsPrimitive.Root>
  );
}

/** The content of one tab; only the active panel renders (`keepMounted` keeps the others in the DOM). */
export function TabPanel<V extends string>(props: { value: V; children: ReactNode; keepMounted?: boolean; className?: string }) {
  return (
    <TabsPrimitive.Panel value={props.value} keepMounted={props.keepMounted} className={cn("min-w-0 outline-none", props.className)}>
      {props.children}
    </TabsPrimitive.Panel>
  );
}
