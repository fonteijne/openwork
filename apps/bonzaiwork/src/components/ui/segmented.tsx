import type { ReactNode } from "react";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";

import { cn } from "~/lib/cn";

export type SegmentedItem<V extends string> = { value: V; label: ReactNode; icon?: ReactNode; disabled?: boolean };

/**
 * One choice from two to four options, as a pill track (DESIGN.md P5, S6). Built on Base UI's
 * RadioGroup: one tab stop, ←/→ move the choice, `role="radio"` and `aria-checked` come from the
 * primitive (assessment P-1: six hand-rolled pickers had none of that). The checked item is a
 * page-colored pill with the card ring inside a `bg-hover` track; inner radius stays concentric
 * with the track (V4).
 */
export function SegmentedControl<V extends string>(props: {
  value: V;
  onValueChange: (value: V) => void;
  items: readonly SegmentedItem<V>[];
  /** Names the group for assistive tech ("Uitvoermodus"). */
  label: string;
  size?: "sm" | "md";
  /** Stretch the items over the full width (dialog forms). */
  fill?: boolean;
  /** Narrow columns (the 224px sidebar): the track wraps onto a second row instead of overflowing. */
  wrap?: boolean;
  /** Phones: the track scrolls sideways and items keep their width. */
  scroll?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const isItem = (value: unknown): value is V => props.items.some((item) => item.value === value);
  return (
    <RadioGroup
      value={props.value}
      onValueChange={(value) => {
        if (isItem(value)) props.onValueChange(value);
      }}
      aria-label={props.label}
      disabled={props.disabled}
      className={cn(
        "inline-flex max-w-full rounded-full bg-hover p-0.5",
        props.fill && "flex w-full",
        props.wrap && "min-w-0 flex-wrap rounded-2xl",
        props.scroll && "overflow-x-auto [scrollbar-width:none]",
        props.className,
      )}
    >
      {props.items.map((item) => (
        <Radio.Root
          key={item.value}
          value={item.value}
          disabled={item.disabled}
          className={cn(
            "flex min-w-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium text-muted-foreground outline-none transition-[background-color,color,box-shadow] duration-100 hover:text-foreground data-[checked]:bg-background data-[checked]:font-semibold data-[checked]:text-foreground data-[checked]:shadow-card data-[disabled]:pointer-events-none data-[disabled]:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0",
            props.size === "sm" ? "h-6 px-2.5 text-xs pointer-coarse:h-8" : "h-7 px-3 text-sm pointer-coarse:h-9",
            props.fill && "flex-1",
            props.scroll && "shrink-0",
          )}
        >
          {item.icon}
          <span className="truncate">{item.label}</span>
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}
