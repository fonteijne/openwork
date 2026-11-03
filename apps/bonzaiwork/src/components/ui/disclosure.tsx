import type { ReactNode } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronRight } from "lucide-react";

import { cn } from "~/lib/cn";

/**
 * A details/summary-style row (DESIGN.md S3, P3): label only, chevron on the left that rotates
 * 90° when open, content below. Open by default only when the content is the answer. Base UI's
 * Collapsible gives `aria-expanded`/`aria-controls` and the height transition (`--collapsible-panel-height`).
 */
export function Disclosure(props: {
  /** The summary ("Technische details", "3 stappen"); never a preview of the contents (P3). */
  label: ReactNode;
  children: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Right-aligned state on the row (a duration, a StatusChip). */
  trailing?: ReactNode;
  size?: "sm" | "md";
  /** Keep the content in the DOM while closed (find-in-page, forms that hold state). */
  keepMounted?: boolean;
  className?: string;
  panelClassName?: string;
  testId?: string;
}) {
  return (
    <Collapsible.Root open={props.open} defaultOpen={props.defaultOpen} onOpenChange={props.onOpenChange} className={cn("min-w-0", props.className)}>
      <Collapsible.Trigger
        data-testid={props.testId}
        className={cn(
          "group flex w-full min-w-0 select-none items-center gap-1.5 rounded-lg text-start text-muted-foreground outline-none transition-colors duration-100 hover:bg-hover hover:text-foreground data-[panel-open]:text-foreground pointer-coarse:min-h-10",
          props.size === "sm" ? "h-7 px-1 text-xs" : "h-8 px-1 text-sm",
        )}
      >
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 transition-transform duration-150 ease-soft group-data-[panel-open]:rotate-90" />
        <span className="min-w-0 flex-1 truncate">{props.label}</span>
        {props.trailing ? <span className="shrink-0 text-xs text-subtle-foreground">{props.trailing}</span> : null}
      </Collapsible.Trigger>
      <Collapsible.Panel
        keepMounted={props.keepMounted}
        className="h-[var(--collapsible-panel-height)] overflow-hidden transition-[height] duration-150 ease-soft data-[starting-style]:h-0 data-[ending-style]:h-0"
      >
        <div className={cn("ps-6 pt-1 pb-1", props.panelClassName)}>{props.children}</div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
