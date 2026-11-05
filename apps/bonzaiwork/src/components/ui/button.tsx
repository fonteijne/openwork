import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "~/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "quiet" | "inverse" | "solid";
export type ButtonSize = "sm" | "md" | "lg" | "xl" | "icon-sm" | "icon" | "icon-lg" | "icon-xl";

const VARIANTS: Record<ButtonVariant, string> = {
  // Disabled primary is quiet ink on muted, not faded brand (brief §11: lavender is no longer "disabled").
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover disabled:bg-muted disabled:text-subtle-foreground disabled:opacity-100",
  // iO: the outline pill fills with ink on hover.
  secondary: "bg-transparent text-foreground ring-1 ring-inset ring-border-strong hover:bg-ink hover:text-surface hover:ring-ink",
  ghost: "text-foreground hover:bg-hover",
  quiet: "text-muted-foreground hover:bg-hover hover:text-foreground",
  // AA at 13px: deep red with page-white text on light; solid red with near-black (`ink-1`) on dark (assessment P-6).
  danger: "bg-red-11 text-ink-1 hover:brightness-95 dark:bg-red-9",
  // On the inverse band ("Needs you"): a light pill.
  inverse: "bg-ink-inverse text-surface-inverse hover:bg-ink-inverse/85",
  // A chosen option in a row of pills ("Done", "Today"): solid ink.
  solid: "bg-ink text-surface hover:bg-ink/85",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-7 gap-1.5 rounded-full px-3 text-xs pointer-coarse:h-11",
  md: "h-8 gap-1.5 rounded-full px-3.5 text-sm pointer-coarse:h-11",
  lg: "h-10 gap-2 rounded-full px-5 text-sm pointer-coarse:h-11",
  // iO page actions: 48px pills, 15px semibold labels.
  xl: "h-12 gap-2 rounded-full px-6 text-base font-semibold",
  "icon-sm": "size-7 rounded-full pointer-coarse:size-11",
  icon: "size-8 rounded-full pointer-coarse:size-11",
  "icon-lg": "size-9 rounded-full pointer-coarse:size-11",
  "icon-xl": "size-11 rounded-full",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize };

/** The one button (DESIGN.md P5). Icons inside are 16px (V5). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "md", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-semibold transition-[background-color,color,box-shadow,filter] duration-200 ease-io disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
});
