import type { ReactNode } from "react";
import { Progress as ProgressPrimitive } from "@base-ui/react/progress";

import { cn } from "~/lib/cn";

import { uiCopy } from "./copy";

/**
 * A usage bar ("€ 18 van € 50"; brief §12) on Base UI Progress: `role="progressbar"` with
 * aria-valuenow/min/max and the value text come from the primitive. Neutral primary fill; `warning`
 * (amber) only when the budget is nearly used, `exceeded` (red) when it is gone (V2: color marks
 * the minority). `value: null` is indeterminate.
 */
export function Progress(props: {
  value: number | null;
  max?: number;
  /** Names the bar for assistive tech ("Verbruik deze maand"). */
  label: string;
  /** What assistive tech reads instead of a percentage ("€ 18 van € 50"); also shown right of the caption. */
  valueText?: string;
  /** Visible words left of the value ("Deze maand"). */
  caption?: ReactNode;
  tone?: "neutral" | "warning" | "exceeded";
  className?: string;
}) {
  const tone = props.tone ?? "neutral";
  return (
    <ProgressPrimitive.Root
      value={props.value}
      max={props.max}
      aria-label={props.label}
      aria-valuetext={props.valueText ?? (props.value === null ? uiCopy.progress.indeterminate : undefined)}
      className={cn("flex min-w-0 flex-col gap-1.5", props.className)}
    >
      {props.caption || props.valueText ? (
        <div className="flex items-baseline justify-between gap-3 text-xs">
          {props.caption ? <ProgressPrimitive.Label className="min-w-0 truncate text-muted-foreground">{props.caption}</ProgressPrimitive.Label> : <span />}
          {props.valueText ? <span className={cn("shrink-0 tabular-nums font-medium text-foreground", tone === "exceeded" && "text-destructive-foreground")}>{props.valueText}</span> : null}
        </div>
      ) : null}
      <ProgressPrimitive.Track className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <ProgressPrimitive.Indicator
          className={cn(
            "h-full rounded-full transition-[width] duration-200 ease-soft data-[indeterminate]:w-1/3 data-[indeterminate]:animate-pulse",
            tone === "exceeded" ? "bg-red-9" : tone === "warning" ? "bg-amber-9" : "bg-primary",
          )}
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  );
}
