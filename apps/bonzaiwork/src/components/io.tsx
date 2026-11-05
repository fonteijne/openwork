import type { AnchorHTMLAttributes, ReactNode } from "react";
import {
  ArrowRight,
  Bot,
  Check,
  CircleAlert,
  CircleDashed,
  CircleHelp,
  CircleX,
  Diamond,
  Eye,
  FileText,
  Lock,
  Pause,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";

import { cn } from "~/lib/cn";

import { PAGE_TITLE_FOCUS, useDocumentTitle } from "./top-bar";

/*
 * The iO layer: the page grammar of the "decision-first cockpit" design. Every screen is a stack of
 * full-width bands (white or warm grey) with a 1360px container and a 48px gutter; a page opens with
 * a hero (eyebrow, a 56px title with one serif italic word, a lead, actions bottom-right); decisions
 * sit in an inverse band; lists are hairline rows; status is a word with an icon in a pill.
 * Built on `~/components/ui` (Button, Checkbox, SegmentedControl...), never instead of it (P5).
 */

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** The 1360px column with the page gutter (48px desktop, 24px phone). */
export function Container(props: { children: ReactNode; className?: string; narrow?: boolean }) {
  return <div className={cn("mx-auto w-full max-w-[1360px] px-6 lg:px-12", props.narrow && "max-w-[1040px]", props.className)}>{props.children}</div>;
}

/** A full-width band: white (`plain`) or warm grey (`alt`); sections separate by tone, never by a border. */
export function Band(props: { children: ReactNode; tone?: "plain" | "alt"; className?: string; inner?: string; id?: string; label?: string }) {
  return (
    <section id={props.id} aria-label={props.label} className={cn(props.tone === "alt" ? "bg-surface-alt" : "bg-surface", "py-12 lg:py-16", props.className)}>
      <Container className={props.inner}>{props.children}</Container>
    </section>
  );
}

/** The one serif italic word of a title ("Three things *need you* today"). */
export function Accent(props: { children: ReactNode }) {
  return <em className="font-serif text-[1.08em] font-normal italic tracking-[-0.01em]">{props.children}</em>;
}

/** Uppercase kicker above a heading: 13px, 600, tracked. Parts are joined with " · ". */
export function Eyebrow(props: { children: ReactNode; className?: string; tone?: "muted" | "ink" | "inverse" | "danger" }) {
  return (
    <p
      className={cn(
        "m-0 text-[13px] font-semibold uppercase leading-4 tracking-[0.08em]",
        props.tone === "ink" ? "text-ink" : props.tone === "inverse" ? "text-ink-inverse" : props.tone === "danger" ? "text-danger" : "text-ink-muted",
        props.className,
      )}
    >
      {props.children}
    </p>
  );
}

/** Joins eyebrow or meta parts with a middle dot. */
export function dot(...parts: Array<ReactNode | null | undefined | false>): ReactNode[] {
  const kept = parts.filter((part): part is ReactNode => part !== null && part !== undefined && part !== false && part !== "");
  return kept.flatMap((part, index) => (index === 0 ? [part] : [" · ", part]));
}

/**
 * The page opener: eyebrow, the 56px title (the focal element, P7), a lead and the page actions on
 * the right. `below` holds filters or tabs under the hero, still on the white band.
 */
export function PageHero(props: {
  eyebrow?: ReactNode;
  /** Text before the title: a tag ("Klant: …"), shown inline with the eyebrow. */
  tag?: ReactNode;
  title: ReactNode;
  /** The window title when `title` is not plain text. */
  documentTitle: string;
  lead?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  below?: ReactNode;
  size?: "lg" | "md";
  className?: string;
}) {
  useDocumentTitle(props.documentTitle);
  return (
    <header className={cn("bg-surface pb-10 pt-10 lg:pb-12 lg:pt-16", props.className)}>
      <Container>
        {props.eyebrow || props.tag ? (
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            {props.tag}
            {props.eyebrow ? <Eyebrow>{props.eyebrow}</Eyebrow> : null}
          </div>
        ) : null}
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
          <div className="min-w-0 max-w-[920px] flex-[1_1_560px]">
            <h1
              tabIndex={-1}
              data-page-title=""
              className={cn(
                "m-0 font-bold text-ink",
                props.size === "md" ? "text-[40px] leading-[46px] tracking-[-0.015em]" : "text-[40px] leading-[44px] tracking-[-0.02em] sm:text-[56px] sm:leading-[60px]",
                PAGE_TITLE_FOCUS,
              )}
            >
              {props.title}
            </h1>
            {props.meta ? <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-lg text-ink-muted">{props.meta}</div> : null}
            {props.lead ? <p className="mb-0 mt-6 max-w-[60ch] text-xl text-ink-muted">{props.lead}</p> : null}
          </div>
          {props.actions ? <div className="flex flex-wrap items-center gap-3">{props.actions}</div> : null}
        </div>
        {props.below ? <div className="mt-10">{props.below}</div> : null}
      </Container>
    </header>
  );
}

/** "Today · 5 to-dos": a 28px section title, the count in muted ink, an optional action on the right. */
export function SectionTitle(props: {
  title: ReactNode;
  count?: ReactNode;
  lead?: ReactNode;
  action?: ReactNode;
  as?: "h2" | "h3";
  size?: "lg" | "md";
  index?: string;
  className?: string;
  id?: string;
}) {
  const Heading = props.as ?? "h2";
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-2", props.className)}>
      <div className="min-w-0">
        <Heading id={props.id} className={cn("m-0 font-semibold tracking-[-0.01em] text-ink", props.size === "md" ? "text-xl" : "text-[28px] leading-[34px]")}>
          {props.index ? <span className="me-2 text-ink-muted">{props.index}</span> : null}
          {props.title}
          {props.count !== undefined && props.count !== null ? <span className="font-normal text-ink-muted"> · {props.count}</span> : null}
        </Heading>
        {props.lead ? <p className="mb-0 mt-2 max-w-[68ch] text-lg text-ink-muted">{props.lead}</p> : null}
      </div>
      {props.action ? <div className="flex shrink-0 items-center gap-3">{props.action}</div> : null}
    </div>
  );
}

/** A white panel on a grey band (the chat card, tables, forms): 24px corners, generous padding. */
export function Panel(props: { children: ReactNode; className?: string; as?: "div" | "section" | "article"; label?: string }) {
  const Tag = props.as ?? "div";
  return (
    <Tag aria-label={props.label} className={cn("rounded-[24px] bg-surface-raised p-6 lg:p-8", props.className)}>
      {props.children}
    </Tag>
  );
}

/** A grey card on a white band (Since you were away, Sources): 16px corners. */
export function Card(props: { children: ReactNode; className?: string; tone?: "alt" | "raised" | "outline" }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-card p-6 lg:p-7",
        props.tone === "raised" ? "bg-surface-raised" : props.tone === "outline" ? "border border-line bg-surface" : "bg-surface-alt",
        props.className,
      )}
    >
      {props.children}
    </div>
  );
}

/** The inverse feature band (Needs you, Where this stands, What gets shared): 32px corners. */
export function InversePanel(props: { children: ReactNode; className?: string; label?: string }) {
  return (
    <section aria-label={props.label} className={cn("rounded-panel bg-surface-inverse p-8 text-ink-inverse lg:p-10", props.className)}>
      {props.children}
    </section>
  );
}

/**
 * Columns with a hairline on top, each with "01 ·" index and an eyebrow: the decisions in the
 * Needs you band, the stages of a run, "How keys work". `tone` follows the band it sits on.
 */
export function Columns(props: { children: ReactNode; className?: string; min?: number }) {
  return (
    <div className={cn("grid gap-x-10 gap-y-10", props.className)} style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${props.min ?? 240}px, 1fr))` }}>
      {props.children}
    </div>
  );
}

export function Column(props: {
  index?: string;
  eyebrow?: ReactNode;
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  tone?: "plain" | "inverse";
  /** The top rule: thick ink for the current one, danger for an external effect, dashed for later. */
  rule?: "line" | "strong" | "danger" | "success" | "dashed" | "none";
  className?: string;
}) {
  const inverse = props.tone === "inverse";
  const rule = props.rule ?? "line";
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 pt-6",
        rule === "line" && (inverse ? "border-t border-line-inverse" : "border-t border-ink"),
        rule === "strong" && "border-t-[3px] border-ink",
        rule === "danger" && "border-t-2 border-danger",
        rule === "success" && "border-t-2 border-success",
        rule === "dashed" && "border-t-2 border-dashed border-line-strong",
        props.className,
      )}
    >
      {props.index || props.eyebrow ? (
        <p className={cn("m-0 flex items-center gap-1.5 text-[13px] font-semibold uppercase leading-4 tracking-[0.08em]", inverse ? "text-ink-inverse" : "text-ink-muted")}>
          {props.index ? <span>{props.index}</span> : null}
          {props.index && props.eyebrow ? <span aria-hidden="true">·</span> : null}
          {props.icon ? <span className="flex [&_svg]:size-4" aria-hidden="true">{props.icon}</span> : null}
          {props.eyebrow}
        </p>
      ) : null}
      {props.title ? <h3 className={cn("m-0 text-xl font-semibold", inverse ? "text-ink-inverse" : "text-ink")}>{props.title}</h3> : null}
      {props.children ? <div className={cn("text-base", inverse ? "text-ink-inverse-muted" : "text-ink-muted")}>{props.children}</div> : null}
      {props.action ? <div className="mt-2 flex flex-wrap gap-3">{props.action}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Links, tags and status
// ---------------------------------------------------------------------------

/** A text link with a trailing arrow that nudges on hover (iO LinkArrow). */
export function LinkArrow(props: { children: ReactNode; href?: string; onClick?: () => void; className?: string; tone?: "accent" | "inverse" } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "onClick" | "href" | "children" | "className">) {
  const { children, href, onClick, className, tone, ...rest } = props;
  const classes = cn(
    "group inline-flex items-center gap-2 text-base font-semibold no-underline transition-colors duration-200",
    tone === "inverse" ? "text-ink-inverse hover:text-ink-inverse/80" : "text-accent hover:text-accent-hover",
    className,
  );
  const arrow = <ArrowRight className="size-4 transition-transform duration-200 ease-io group-hover:translate-x-1" aria-hidden="true" />;
  if (href !== undefined)
    return (
      <a href={href} className={classes} onClick={onClick} {...rest}>
        {children}
        {arrow}
      </a>
    );
  return (
    <button type="button" className={cn(classes, "cursor-pointer bg-transparent p-0")} onClick={onClick}>
      {children}
      {arrow}
    </button>
  );
}

/** Uppercase pill naming an object ("Klant: Polderwerk", "Persoonlijk"); `solid` is the dark key pill. */
export function Tag(props: { children: ReactNode; tone?: "outline" | "accent" | "solid" | "inverse"; icon?: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={props.title}
      className={cn(
        "inline-flex max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold uppercase leading-4 tracking-[0.06em] [&_svg]:size-3.5",
        props.tone === "accent" && "bg-accent-soft text-accent",
        props.tone === "solid" && "bg-ink normal-case tracking-normal text-surface",
        props.tone === "inverse" && "border border-line-inverse text-ink-inverse",
        (props.tone === undefined || props.tone === "outline") && "border border-line text-ink",
        props.className,
      )}
    >
      {props.icon}
      <span className="truncate">{props.children}</span>
    </span>
  );
}

export type StatusKind =
  | "review"
  | "answer"
  | "approval"
  | "working"
  | "done"
  | "issues"
  | "failed"
  | "draft"
  | "interrupted"
  | "unknown"
  | "connected"
  | "undone"
  | "declined"
  | "neutral";

const STATUS_ICON: Record<StatusKind, ReactNode> = {
  review: <Diamond />,
  answer: <Diamond />,
  approval: <Lock />,
  working: <CircleDashed />,
  done: <Check />,
  issues: <TriangleAlert />,
  failed: <CircleX />,
  draft: <FileText />,
  interrupted: <Pause />,
  unknown: <CircleAlert />,
  connected: <Check />,
  undone: <Undo2 />,
  declined: <X />,
  neutral: null,
};

/**
 * Status as a word with an icon, in a pill (never hue alone): what needs the person is solid ink
 * with a diamond; running work is an outline; done and connected are success, failed and unknown
 * outcomes are danger, a draft is dashed.
 */
export function StatusBadge(props: { kind: StatusKind; children: ReactNode; className?: string; plain?: boolean }) {
  const solid = props.kind === "review" || props.kind === "answer" || props.kind === "approval";
  const tone =
    props.kind === "done" || props.kind === "connected"
      ? "border-success text-success"
      : props.kind === "failed" || props.kind === "unknown"
        ? "border-danger text-danger"
        : props.kind === "draft"
          ? "border-dashed border-line-strong text-ink"
          : "border-line-strong text-ink";
  if (props.plain)
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-base font-semibold [&_svg]:size-4", props.kind === "done" ? "text-success" : props.kind === "failed" || props.kind === "unknown" ? "text-danger" : "text-ink", props.className)}>
        <span aria-hidden="true" className="flex">
          {STATUS_ICON[props.kind]}
        </span>
        {props.children}
      </span>
    );
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-sm font-semibold leading-5 [&_svg]:size-3.5",
        solid ? "bg-ink text-surface" : cn("border bg-surface", tone),
        props.className,
      )}
    >
      {STATUS_ICON[props.kind] ? (
        <span aria-hidden="true" className="flex">
          {STATUS_ICON[props.kind]}
        </span>
      ) : null}
      {props.children}
    </span>
  );
}

/** "✓ Allow" / "✗ Never" / "🔒 With your approval": one line of what a run may do. */
export function PermissionLine(props: { kind: "allow" | "deny" | "ask"; children: ReactNode; className?: string }) {
  return (
    <li className={cn("flex items-start gap-2.5 text-base text-ink", props.className)}>
      <span aria-hidden="true" className={cn("mt-1 flex [&_svg]:size-4", props.kind === "allow" ? "text-success" : props.kind === "deny" ? "text-danger" : "text-ink")}>
        {props.kind === "allow" ? <Check /> : props.kind === "deny" ? <X /> : <Lock />}
      </span>
      <span>{props.children}</span>
    </li>
  );
}

export function PermissionList(props: { children: ReactNode; className?: string }) {
  return <ul className={cn("m-0 flex list-none flex-col gap-2 p-0", props.className)}>{props.children}</ul>;
}

/** A check result line ("✓ Passed: …", "⚠ Needs care: …"). */
export function CheckLine(props: { result: "pass" | "care" | "fail"; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-base text-ink">
      <span aria-hidden="true" className={cn("mt-1 flex [&_svg]:size-4", props.result === "pass" ? "text-success" : props.result === "fail" ? "text-danger" : "text-ink")}>
        {props.result === "pass" ? <Check /> : props.result === "fail" ? <CircleX /> : <TriangleAlert />}
      </span>
      <span className={props.result === "care" ? "font-semibold" : undefined}>{props.children}</span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/** Hairline rows (S2): a top rule on the list, a rule under each row. */
export function Rows(props: { children: ReactNode; className?: string; label?: string; tone?: "ink" | "line" }) {
  return (
    <ul aria-label={props.label} className={cn("m-0 list-none border-t p-0 [&>li]:border-b [&>li]:border-line", props.tone === "line" ? "border-line" : "border-line-strong", props.className)}>
      {props.children}
    </ul>
  );
}

/** One row: title (17px) with meta under it, a trailing value or action on the right. */
export function RowItem(props: {
  title: ReactNode;
  meta?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  href?: string;
  onClick?: () => void;
  highlight?: boolean;
  className?: string;
}) {
  const body = (
    <>
      {props.leading ? <span className="flex shrink-0 items-center">{props.leading}</span> : null}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-lg font-medium text-ink">{props.title}</span>
        {props.meta ? <span className="text-sm text-ink-muted">{props.meta}</span> : null}
      </span>
      {props.trailing ? <span className="flex shrink-0 items-center gap-3 text-sm text-ink-muted">{props.trailing}</span> : null}
    </>
  );
  const classes = cn(
    "flex w-full items-center gap-4 py-5 text-start",
    props.highlight && "-mx-px rounded-[10px] px-5 ring-2 ring-accent",
    (props.href !== undefined || props.onClick) && "cursor-pointer hover:bg-hover/60",
    props.className,
  );
  return (
    <li>
      {props.href !== undefined ? (
        <a href={props.href} className={cn(classes, "no-underline")}>
          {body}
        </a>
      ) : props.onClick ? (
        <button type="button" className={cn(classes, "bg-transparent")} onClick={props.onClick}>
          {body}
        </button>
      ) : (
        <div className={classes}>{body}</div>
      )}
    </li>
  );
}

/** A dashed box for what the agent suggests (nothing is applied until the person picks it). */
export function Suggestion(props: { eyebrow?: ReactNode; children: ReactNode; className?: string; agent?: boolean }) {
  return (
    <div className={cn("rounded-card border border-dashed border-line-strong p-6", props.className)}>
      {props.eyebrow ? (
        <Eyebrow className="mb-3 flex items-center gap-2">
          {props.agent ? <Bot className="size-4" aria-hidden="true" /> : null}
          {props.eyebrow}
        </Eyebrow>
      ) : null}
      {props.children}
    </div>
  );
}

/** A small note line with an agent icon ("Fields filled in by your mail scan"). */
export function AgentNote(props: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("m-0 flex items-center gap-2 text-sm text-ink-muted", props.className)}>
      <Bot className="size-4 shrink-0" aria-hidden="true" />
      <span>{props.children}</span>
    </p>
  );
}

/** "Agent · 08:31" above an assistant turn; "You · 08:30" above the person's. */
export function Speaker(props: { who: "agent" | "you"; children: ReactNode; className?: string }) {
  return (
    <p className={cn("m-0 flex items-center gap-2 text-sm", props.who === "you" ? "justify-end text-ink-muted" : "text-ink-muted", props.className)}>
      {props.who === "agent" ? <Bot className="size-4 text-ink" aria-hidden="true" /> : null}
      {props.children}
    </p>
  );
}

/** Icons the design reuses for kinds of decisions. */
export const DecisionIcon = {
  review: <Eye />,
  question: <CircleHelp />,
  approval: <Lock />,
  diamond: <Diamond />,
} as const;

/** A table in the iO style: uppercase eyebrow headers, hairline rows; wide tables scroll in their box. */
export function DataTable(props: { head: ReactNode[]; children: ReactNode; label: string; className?: string; align?: Array<"start" | "end"> }) {
  return (
    <div className={cn("overflow-x-auto", props.className)}>
      <table aria-label={props.label} className="w-full min-w-[720px] border-collapse text-start">
        <thead>
          <tr className="border-b border-line-strong">
            {props.head.map((cell, index) => (
              <th
                key={index}
                scope="col"
                className={cn(
                  "whitespace-nowrap px-0 pb-4 pe-6 text-[13px] font-semibold uppercase leading-4 tracking-[0.08em] text-ink-muted last:pe-0",
                  props.align?.[index] === "end" ? "text-end" : "text-start",
                )}
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-line [&>tr:last-child]:border-0 [&_td]:py-5 [&_td]:pe-6 [&_td]:align-top [&_td:last-child]:pe-0">{props.children}</tbody>
      </table>
    </div>
  );
}

/** A filter pill that toggles ("All · 7", "Everyone"). */
export function FilterChip(props: { children: ReactNode; active: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={props.active}
      onClick={props.onClick}
      className={cn(
        "inline-flex h-10 shrink-0 items-center rounded-full border px-4 text-base transition-colors duration-200",
        props.active ? "border-ink font-semibold text-ink ring-1 ring-inset ring-ink" : "border-line-strong text-ink hover:border-ink",
        props.className,
      )}
    >
      {props.children}
    </button>
  );
}

/**
 * The right-hand sheet the design opens next to the page (Delegate, New project, Approval): the page
 * stays readable on the left, the sheet is a white rounded panel on the right. On narrow screens it
 * stacks under the page.
 */
export function SplitWithSheet(props: { page: ReactNode; sheet: ReactNode; className?: string; sheetTone?: "plain" | "inverse-top" }) {
  return (
    <div className={cn("flex flex-wrap items-start bg-surface-alt", props.className)}>
      <div className="min-w-0 flex-[1_1_480px] bg-surface pb-16">{props.page}</div>
      <div className="min-w-0 flex-[1_1_560px] self-stretch bg-surface lg:max-w-[720px]">
        <div className="h-full overflow-hidden bg-surface-raised shadow-float lg:rounded-tl-panel lg:rounded-bl-panel">{props.sheet}</div>
      </div>
    </div>
  );
}

/** The header of a right-hand sheet: eyebrow, title, a close button. */
export function SheetHeader(props: { eyebrow?: ReactNode; title: ReactNode; lead?: ReactNode; onClose?: () => void; closeLabel: string; tone?: "plain" | "inverse"; trailing?: ReactNode }) {
  const inverse = props.tone === "inverse";
  return (
    <div className={cn("flex items-start gap-6 px-8 pb-8 pt-10 lg:px-12", inverse ? "bg-surface-inverse text-ink-inverse" : "border-b border-line")}>
      <div className="min-w-0 flex-1">
        {props.eyebrow ? <Eyebrow tone={inverse ? "inverse" : "muted"} className="mb-3 flex items-center gap-2">{props.eyebrow}</Eyebrow> : null}
        <h2 className={cn("m-0 text-[28px] font-bold leading-[34px] tracking-[-0.01em] sm:text-[40px] sm:leading-[46px]", inverse ? "text-ink-inverse" : "text-ink")}>{props.title}</h2>
        {props.lead ? <p className={cn("mb-0 mt-3 text-lg", inverse ? "text-ink-inverse-muted" : "text-ink-muted")}>{props.lead}</p> : null}
      </div>
      {props.trailing}
      {props.onClose ? (
        <button
          type="button"
          aria-label={props.closeLabel}
          onClick={props.onClose}
          className={cn("flex size-11 shrink-0 items-center justify-center rounded-full border transition-colors", inverse ? "border-line-inverse text-ink-inverse hover:bg-inverse-hover" : "border-line-strong text-ink hover:bg-ink hover:text-surface")}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

/** The sticky footer of a sheet: the primary decision and one line of what it does. */
export function SheetFooter(props: { children: ReactNode; note?: ReactNode; tone?: "plain" | "inverse" | "alt" }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-3 px-8 py-8 lg:px-12", props.tone === "inverse" ? "bg-surface-inverse text-ink-inverse" : props.tone === "alt" ? "bg-surface-alt" : "border-t border-line")}>
      <div className="flex flex-wrap gap-3">{props.children}</div>
      {props.note ? <p className={cn("m-0 min-w-[16rem] flex-1 text-sm", props.tone === "inverse" ? "text-ink-inverse-muted" : "text-ink-muted")}>{props.note}</p> : null}
    </div>
  );
}

/** A demo-only or locked surface: what it would show, why it cannot here, and who can change that (P4). */
export function LockedNote(props: { title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-card border border-dashed border-line-strong p-6", props.className)}>
      <Lock className="mt-1 size-4 shrink-0 text-ink" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <p className="m-0 text-lg font-semibold text-ink">{props.title}</p>
        {props.children ? <p className="m-0 text-base text-ink-muted">{props.children}</p> : null}
      </div>
    </div>
  );
}

/** A keyboard hint line under a list ("Press D on a to-do to delegate it"). */
export function HintLine(props: { children: ReactNode; className?: string }) {
  return <p className={cn("mb-0 mt-6 text-sm text-ink-muted", props.className)}>{props.children}</p>;
}
