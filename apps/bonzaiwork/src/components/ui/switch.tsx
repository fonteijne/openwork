import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "~/lib/cn";

export function Switch(props: { checked: boolean; onCheckedChange: (checked: boolean) => void; label: string; disabled?: boolean; id?: string }) {
  return (
    <SwitchPrimitive.Root
      id={props.id}
      checked={props.checked}
      onCheckedChange={(checked) => props.onCheckedChange(checked)}
      disabled={props.disabled}
      aria-label={props.label}
      className={cn(
        "relative inline-flex h-5 w-8 shrink-0 items-center rounded-full bg-ink-6 p-0.5 transition-colors duration-150 data-[checked]:bg-primary disabled:opacity-45",
      )}
    >
      {/* The thumb is the primary's text color: light in both themes now that the dark primary is saturated (brief §11). */}
      <SwitchPrimitive.Thumb className="size-4 rounded-full bg-primary-foreground shadow-card transition-transform duration-150 ease-soft data-[checked]:translate-x-3" />
    </SwitchPrimitive.Root>
  );
}
