import type { ReactNode } from "react";
import { Lock } from "lucide-react";

import type { ChatStatus } from "~/backend/types";
import { cn } from "~/lib/cn";

/** Loading keeps the destination layout (DESIGN.md States): skeletons, not "Loading…". */
export function Skeleton(props: { className?: string }) {
  return <span aria-hidden="true" className={cn("block animate-pulse rounded-md bg-muted", props.className)} />;
}

/** One key or chord ("⏎", "⌘⏎", "esc") as a keycap in the surrounding ink (AA at 11px); the border keeps it quiet. */
export function Kbd(props: { children: ReactNode; className?: string }) {
  return (
    <kbd className={cn("inline-flex h-4 min-w-4 items-center justify-center rounded border border-current/25 px-1 font-sans text-[11px] leading-none text-current", props.className)}>
      {props.children}
    </kbd>
  );
}

export type KbdHint = { keys: ReactNode; label: ReactNode };

/**
 * A quiet row of chords (DESIGN.md S6, T5): "⏎ bijsturen · ⌘⏎ na afloop · esc annuleren". The
 * hint belongs to the focused element next to it; the row itself is not interactive.
 */
export function KbdRow(props: { hints: readonly KbdHint[]; className?: string }) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-subtle-foreground", props.className)}>
      {props.hints.map((hint, index) => (
        <span key={index} className="inline-flex items-center gap-1.5">
          {index > 0 ? (
            <span aria-hidden="true" className="me-0.5">
              ·
            </span>
          ) : null}
          <Kbd>{hint.keys}</Kbd>
          <span>{hint.label}</span>
        </span>
      ))}
    </span>
  );
}

/** Color marks the minority that needs attention (V2): idle chats show nothing. */
export function StatusDot(props: { status: ChatStatus; className?: string; label?: string }) {
  if (props.status === "idle") return null;
  return (
    <span
      role={props.label ? "img" : undefined}
      aria-label={props.label}
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        props.status === "running" && "bw-pulse bg-electric-9",
        props.status === "waiting" && "bg-amber-9",
        props.status === "failed" && "bg-red-9",
        props.className,
      )}
    />
  );
}

/** Empty states invite and name the next step (C6). Title or body, a single action. */
export function EmptyState(props: { icon?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", props.className)}>
      {props.icon ? <div className="mb-3 text-subtle-foreground [&_svg]:size-6">{props.icon}</div> : null}
      <p className="text-base font-semibold text-foreground">{props.title}</p>
      {props.body ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{props.body}</p> : null}
      {props.action ? <div className="mt-4">{props.action}</div> : null}
    </div>
  );
}

/** Settings and lists as compact rows: label left, state right, at most one action (S2). */
export function Row(props: { label: ReactNode; value?: ReactNode; action?: ReactNode; className?: string; hint?: ReactNode }) {
  return (
    <div className={cn("flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border py-2.5 last:border-b-0", props.className)}>
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{props.label}</div>
        {props.hint ? <div className="text-xs text-muted-foreground">{props.hint}</div> : null}
      </div>
      <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
        {props.value !== undefined ? <div className="min-w-0 truncate">{props.value}</div> : null}
        {props.action}
      </div>
    </div>
  );
}

/** A settings group: one heading, rows below a single hairline (S1). */
export function Section(props: { title: ReactNode; children: ReactNode; action?: ReactNode; id?: string; className?: string }) {
  return (
    <section id={props.id} className={cn("scroll-mt-6", props.className)}>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{props.title}</h2>
        {props.action}
      </div>
      <div className="border-t border-border">{props.children}</div>
    </section>
  );
}

/** P4: presence with a lock beats absence. Neutral ink, never red (C5). */
export function Locked(props: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", props.className)}>
      <Lock className="size-3.5 shrink-0" />
      {props.children}
    </span>
  );
}

export function Spinner(props: { className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60", props.className)} />;
}
