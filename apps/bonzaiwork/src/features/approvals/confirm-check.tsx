import type { ReactNode } from "react";
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Check } from "lucide-react";

import { cn } from "~/lib/cn";

/**
 * A confirmation checkbox whose label wraps (an audience sentence, "I checked what moves"): the
 * shared `Checkbox` truncates to one line, which would hide what the person confirms.
 */
export function ConfirmCheck(props: { checked: boolean; onCheckedChange: (checked: boolean) => void; children: ReactNode; disabled?: boolean; className?: string }) {
  return (
    <label className={cn("flex min-h-11 cursor-pointer items-start gap-3 py-1 text-base text-ink has-[[data-disabled]]:cursor-default has-[[data-disabled]]:opacity-60", props.className)}>
      <CheckboxPrimitive.Root
        checked={props.checked}
        disabled={props.disabled}
        onCheckedChange={(checked) => props.onCheckedChange(checked)}
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[4px] ring-[1.5px] ring-inset ring-ink outline-none transition-[background-color,box-shadow] duration-100 focus-visible:ring-2 focus-visible:ring-ring data-[checked]:bg-primary data-[checked]:ring-primary"
      >
        <CheckboxPrimitive.Indicator className="text-primary-foreground">
          <Check className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <span className="min-w-0 flex-1">{props.children}</span>
    </label>
  );
}
