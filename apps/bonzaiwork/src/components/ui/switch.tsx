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
      <SwitchPrimitive.Thumb className="size-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-transform duration-150 ease-soft data-[checked]:translate-x-3 dark:bg-ink-12 dark:data-[checked]:bg-primary-foreground" />
    </SwitchPrimitive.Root>
  );
}
