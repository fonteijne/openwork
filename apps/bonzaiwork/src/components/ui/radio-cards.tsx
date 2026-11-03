import type { ReactNode } from "react";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";

import { cn } from "~/lib/cn";

export type RadioCardItem<V extends string> = {
  value: V;
  label: ReactNode;
  /** One line of consequence under the label ("De agent vraagt eerst"); label or hint, never a paragraph (P2). */
  hint?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
};

/**
 * Options as hairline rows (DESIGN.md S1: flat, no card-in-card), for the question card and
 * settings choices. Base UI RadioGroup gives one tab stop, ←/↑/→/↓ and `aria-checked`; the
 * checked row shows a filled radio in the primary color, the rest a hairline ring.
 */
export function RadioCards<V extends string>(props: {
  value: V | null;
  onValueChange: (value: V) => void;
  items: readonly RadioCardItem<V>[];
  /** Names the group for assistive tech; the question itself when inside a Callout. */
  label: string;
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
      className={cn("flex flex-col", props.className)}
    >
      {props.items.map((item) => (
        <Radio.Root
          key={item.value}
          value={item.value}
          disabled={item.disabled}
          className="group flex min-h-11 select-none items-center gap-3 border-b border-border px-1.5 py-2 text-start outline-none transition-colors duration-100 last:border-b-0 hover:bg-hover focus-visible:rounded-lg focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-45 pointer-coarse:min-h-12 [&_svg]:size-4 [&_svg]:shrink-0"
        >
          <span
            aria-hidden="true"
            className="flex size-4 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ring-input transition-[background-color,box-shadow] duration-100 group-data-[checked]:bg-primary group-data-[checked]:ring-primary"
          >
            <Radio.Indicator className="size-1.5 rounded-full bg-primary-foreground" />
          </span>
          {item.icon ? <span className="text-muted-foreground">{item.icon}</span> : null}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-medium text-foreground group-data-[checked]:font-semibold">{item.label}</span>
            {item.hint ? <span className="text-xs text-muted-foreground">{item.hint}</span> : null}
          </span>
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}
