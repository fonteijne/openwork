import type { AnchorHTMLAttributes, ReactNode } from "react";

import type { Area, RunStatus } from "~/backend/cockpit";
import { Accent, type StatusKind } from "~/components/io";
import { projectsCopy } from "~/copy/projects";
import { cn } from "~/lib/cn";

/** Pieces the project screens share: link buttons, the accented title, status mapping, choice pills. */

const LINK_VARIANT = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
  secondary: "bg-transparent text-foreground ring-1 ring-inset ring-border-strong hover:bg-ink hover:text-surface hover:ring-ink",
  inverse: "bg-ink-inverse text-surface-inverse hover:bg-ink-inverse/85",
} as const;

/** A navigation that looks like a page action (a real `<a href>`, DESIGN.md: links navigate). */
export function ButtonLink(props: { href: string; variant?: keyof typeof LINK_VARIANT; size?: "lg" | "xl"; children: ReactNode; className?: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className" | "children">) {
  const { href, variant, size, children, className, ...rest } = props;
  return (
    <a
      href={href}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold no-underline transition-[background-color,color,box-shadow] duration-200 ease-io [&_svg]:size-4 [&_svg]:shrink-0",
        LINK_VARIANT[variant ?? "secondary"],
        size === "lg" ? "h-10 px-5 text-sm pointer-coarse:h-11" : "h-12 px-6 text-base",
        className,
      )}
      {...rest}
    >
      {children}
    </a>
  );
}

/** "Offertes *2026*": the last word of a project name as the serif accent. */
export function AccentTitle(props: { text: string }) {
  const trimmed = props.text.trim();
  const at = trimmed.lastIndexOf(" ");
  if (at <= 0) return <Accent>{trimmed}</Accent>;
  return (
    <>
      {trimmed.slice(0, at)} <Accent>{trimmed.slice(at + 1)}</Accent>
    </>
  );
}

export function runStatusKind(status: RunStatus): StatusKind {
  switch (status) {
    case "review":
      return "review";
    case "question":
      return "answer";
    case "working":
      return "working";
    case "failed":
      return "failed";
    case "done":
      return "done";
    case "issues":
      return "issues";
    case "draft":
      return "draft";
    case "interrupted":
      return "interrupted";
    case "stopped":
      return "neutral";
  }
}

/** The tag that names a project's area: the client when there is one ("Klant: Bakkerij Van Dijk"). */
export function areaTagText(area: Area): string {
  return area.client ? projectsCopy.clientTag(area.client) : area.name;
}

/** One pill in a row of exclusive choices (Klaar · Naar project… · Annuleren): the chosen one is solid ink. */
export function ChoicePill(props: { selected: boolean; onSelect: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={props.selected}
      disabled={props.disabled}
      onClick={props.onSelect}
      className={cn(
        "inline-flex min-h-11 items-center rounded-full px-5 text-base font-semibold transition-colors duration-200 disabled:opacity-45 sm:min-h-10",
        props.selected ? "bg-ink text-surface ring-1 ring-inset ring-ink" : "bg-surface text-ink ring-1 ring-inset ring-line-strong hover:ring-ink",
      )}
    >
      {props.children}
    </button>
  );
}

export function ChoiceGroup(props: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="radiogroup" aria-label={props.label} className={cn("flex flex-wrap gap-2", props.className)}>
      {props.children}
    </div>
  );
}

/** A section heading in the iO weight (28px bold) with an optional muted count and a trailing link. */
export function BandTitle(props: { title: ReactNode; count?: ReactNode; index?: string; action?: ReactNode; id?: string; as?: "h2" | "h3" }) {
  const Heading = props.as ?? "h2";
  return (
    <div className="flex flex-wrap items-baseline gap-3">
      <Heading id={props.id} className="m-0 flex-1 text-[28px] font-bold leading-[34px] tracking-[-0.01em] text-ink">
        {props.index ? <span className="text-ink-muted">{props.index} </span> : null}
        {props.title}
        {props.count !== undefined && props.count !== null ? <span className="font-normal text-ink-muted"> · {props.count}</span> : null}
      </Heading>
      {props.action}
    </div>
  );
}
