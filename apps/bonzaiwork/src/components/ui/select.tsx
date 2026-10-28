import type { ReactNode } from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "~/lib/cn";

export type SelectItem = { value: string; label: string; hint?: string | null; disabled?: boolean };

/**
 * A single choice from a short list. `pill` is the quiet composer variant
 * (DESIGN.md T5: model and run-mode as quiet pills).
 */
export function Select(props: {
  value: string | null;
  onValueChange: (value: string) => void;
  items: SelectItem[];
  label: string;
  placeholder?: string;
  variant?: "field" | "pill";
  icon?: ReactNode;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  const labels = Object.fromEntries(props.items.map((item) => [item.value, item.label]));
  return (
    <SelectPrimitive.Root
      value={props.value}
      items={labels}
      onValueChange={(value) => {
        if (typeof value === "string") props.onValueChange(value);
      }}
      disabled={props.disabled}
    >
      <SelectPrimitive.Trigger
        id={props.id}
        aria-label={props.label}
        className={cn(
          "inline-flex min-w-0 items-center gap-1.5 text-sm outline-none transition-colors duration-150 disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0",
          props.variant === "pill"
            ? "h-7 max-w-[14rem] rounded-full px-2.5 text-muted-foreground hover:bg-hover hover:text-foreground data-[popup-open]:bg-hover pointer-coarse:h-9"
            : "h-8 w-full justify-between rounded-full bg-background px-3.5 ring-1 ring-inset ring-input focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-10",
          props.className,
        )}
      >
        {props.icon}
        <SelectPrimitive.Value className="min-w-0 truncate data-[placeholder]:text-subtle-foreground" placeholder={props.placeholder} />
        <SelectPrimitive.Icon className="text-subtle-foreground">
          <ChevronDown className="size-3.5!" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner className="z-50 outline-none" sideOffset={4} alignItemWithTrigger={false} collisionPadding={8}>
          <SelectPrimitive.Popup className="max-h-[var(--available-height)] min-w-[max(var(--anchor-width),12rem)] max-w-[var(--available-width)] overflow-y-auto rounded-2xl bg-popover p-1.5 text-popover-foreground shadow-popover outline-none transition-[opacity,transform] duration-120 data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-75">
            <SelectPrimitive.List>
              {props.items.map((item) => (
                <SelectPrimitive.Item
                  key={item.value}
                  value={item.value}
                  disabled={item.disabled}
                  className="flex min-h-8 cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-1 text-sm outline-none data-[highlighted]:bg-hover data-[disabled]:opacity-45 pointer-coarse:min-h-10"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <SelectPrimitive.ItemText className="truncate">{item.label}</SelectPrimitive.ItemText>
                    {item.hint ? <span className="truncate text-xs text-muted-foreground">{item.hint}</span> : null}
                  </span>
                  <SelectPrimitive.ItemIndicator>
                    <Check className="size-4 text-muted-foreground" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
