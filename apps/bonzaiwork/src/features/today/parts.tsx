import { useEffect, useState, type AnchorHTMLAttributes, type ReactNode } from "react";
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { ArrowRight, Check } from "lucide-react";

import { cn } from "~/lib/cn";

/**
 * Small pieces the Today, plan and inbox screens share: a pill-shaped link (navigation is an
 * `<a href>`, never a button that navigates), the 22px check box of the design's lists, and a clock.
 */

const LINK_VARIANTS = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
  secondary: "bg-transparent text-ink ring-1 ring-inset ring-line-strong hover:bg-ink hover:text-surface hover:ring-ink",
  inverse: "bg-ink-inverse text-surface-inverse hover:bg-ink-inverse/85",
} as const;

/** A link that looks like a Button (`size="xl"`): 48px pill, 15px semibold, an optional arrow. */
export function PillLink(
  props: { href: string; children: ReactNode; variant?: keyof typeof LINK_VARIANTS; arrow?: boolean; className?: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children" | "className">,
) {
  const { href, children, variant, arrow, className, ...rest } = props;
  return (
    <a
      href={href}
      className={cn(
        "group inline-flex h-12 shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-full px-6 text-base font-semibold no-underline transition-[background-color,color,box-shadow] duration-200 ease-io [&_svg]:size-4",
        LINK_VARIANTS[variant ?? "secondary"],
        className,
      )}
      {...rest}
    >
      {children}
      {arrow ? <ArrowRight aria-hidden="true" className="transition-transform duration-200 ease-io group-hover:translate-x-0.5" /> : null}
    </a>
  );
}

/** The 22px check box of a to-do row (Base UI: role, aria-checked and Space come from the primitive). */
export function TickBox(props: { checked: boolean; onCheckedChange: (checked: boolean) => void; label: string; disabled?: boolean; className?: string }) {
  return (
    <CheckboxPrimitive.Root
      checked={props.checked}
      onCheckedChange={(checked) => props.onCheckedChange(checked)}
      disabled={props.disabled}
      aria-label={props.label}
      className={cn(
        // The visible box is 22px; the hit area grows to 44px on touch screens.
        "relative flex size-[22px] shrink-0 items-center justify-center rounded-[4px] bg-surface-raised ring-[1.5px] ring-inset ring-ink outline-none transition-[background-color,box-shadow] duration-100 before:absolute before:-inset-[11px] before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[checked]:bg-primary data-[checked]:ring-primary data-[disabled]:opacity-45",
        props.className,
      )}
    >
      <CheckboxPrimitive.Indicator className="text-primary-foreground">
        <Check className="size-4" strokeWidth={2.5} aria-hidden="true" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

/** Now, refreshed every `every` ms (the hero's clock, "Nu" in the day card). */
export function useNow(every = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), every);
    return () => window.clearInterval(timer);
  }, [every]);
  return now;
}

/** The 28px section heading of the design with a muted count ("Vandaag · 5 to-do's"). */
export function SectionHeading(props: { id?: string; children: ReactNode; count?: ReactNode; className?: string; as?: "h2" | "h3" }) {
  const Heading = props.as ?? "h2";
  return (
    <Heading id={props.id} className={cn("m-0 text-[22px] font-bold leading-[28px] tracking-[-0.01em] text-ink sm:text-[28px] sm:leading-[34px]", props.className)}>
      {props.children}
      {props.count !== undefined && props.count !== null ? <span className="font-normal text-ink-muted"> · {props.count}</span> : null}
    </Heading>
  );
}
