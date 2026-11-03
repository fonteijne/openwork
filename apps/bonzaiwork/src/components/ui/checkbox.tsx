import type { ReactNode } from "react";
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Check } from "lucide-react";

import { cn } from "~/lib/cn";

/**
 * A checkbox row on Base UI (DESIGN.md P5): `role="checkbox"`, `aria-checked`, space toggles,
 * focus ring from the primitive. The box is primary when checked, a hairline ring otherwise; the
 * label is the row, so the whole line is the hit target (pointer-coarse: 40px).
 */
export function Checkbox(props: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** The visible label; `aria-label` when it is not text. */
  children: ReactNode;
  label?: string;
  /** Right-aligned detail on the row (an id, a chip). */
  trailing?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={cn("flex min-h-8 cursor-default select-none items-center gap-2.5 rounded-lg px-1 text-sm text-foreground has-[[data-disabled]]:opacity-45 pointer-coarse:min-h-10", props.className)}>
      <CheckboxPrimitive.Root
        checked={props.checked}
        onCheckedChange={(checked) => props.onCheckedChange(checked)}
        disabled={props.disabled}
        aria-label={props.label}
        className="flex size-4 shrink-0 items-center justify-center rounded-[0.25rem] ring-1 ring-inset ring-input outline-none transition-[background-color,box-shadow] duration-100 focus-visible:ring-2 focus-visible:ring-ring data-[checked]:bg-primary data-[checked]:ring-primary"
      >
        <CheckboxPrimitive.Indicator className="text-primary-foreground">
          <Check className="size-3" strokeWidth={2.5} aria-hidden="true" />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <span className="min-w-0 flex-1 truncate">{props.children}</span>
      {props.trailing ? <span className="shrink-0">{props.trailing}</span> : null}
    </label>
  );
}
