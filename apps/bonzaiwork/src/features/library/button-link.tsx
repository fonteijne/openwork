import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

import { cn } from "~/lib/cn";

/**
 * A page action that navigates: a real link (DESIGN.md) in the shape of the iO pill button
 * (`Button size="xl"`), with the trailing arrow the design puts on "go there" actions.
 */
export function ButtonLink(props: { href: string; children: ReactNode; variant?: "primary" | "secondary" | "inverse"; arrow?: boolean; className?: string; icon?: ReactNode }) {
  const variant = props.variant ?? "secondary";
  return (
    <a
      href={props.href}
      className={cn(
        "group inline-flex h-12 shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-full px-6 text-base font-semibold no-underline transition-[background-color,color,box-shadow] duration-200 ease-io [&_svg]:size-4 [&_svg]:shrink-0",
        variant === "primary" && "bg-primary text-primary-foreground hover:bg-primary-hover",
        variant === "secondary" && "text-foreground ring-1 ring-inset ring-border-strong hover:bg-ink hover:text-surface hover:ring-ink",
        variant === "inverse" && "bg-ink-inverse text-surface-inverse hover:bg-ink-inverse/85",
        props.className,
      )}
    >
      {props.icon}
      {props.children}
      {props.arrow ? <ArrowRight className="transition-transform duration-200 ease-io group-hover:translate-x-1" aria-hidden="true" /> : null}
    </a>
  );
}
