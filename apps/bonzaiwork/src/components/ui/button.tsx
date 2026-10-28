import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "~/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
export type ButtonSize = "sm" | "md" | "lg" | "icon-sm" | "icon" | "icon-lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
  secondary: "bg-transparent text-foreground ring-1 ring-inset ring-border-strong hover:bg-hover",
  ghost: "text-foreground hover:bg-hover",
  quiet: "text-muted-foreground hover:bg-hover hover:text-foreground",
  danger: "bg-red-9 text-white hover:brightness-95",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-7 gap-1.5 rounded-full px-3 text-xs pointer-coarse:h-9",
  md: "h-8 gap-1.5 rounded-full px-3.5 text-sm pointer-coarse:h-10",
  lg: "h-10 gap-2 rounded-full px-5 text-sm",
  "icon-sm": "size-7 rounded-full pointer-coarse:size-9",
  icon: "size-8 rounded-full pointer-coarse:size-10",
  "icon-lg": "size-9 rounded-full",
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
        "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium transition-[background-color,color,box-shadow,filter] duration-150 ease-out disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
});
