import type { ReactNode } from "react";
import { BookOpen, FileText, Globe, Link2, Mail, MessageSquare, Scale, CalendarDays, Ticket } from "lucide-react";

import type { Run, RunStatus, SourceKind } from "~/backend/cockpit";
import { StatusBadge, type StatusKind } from "~/components/io";
import { SegmentedControl, type SegmentedItem } from "~/components/ui/segmented";
import { ProseHtml } from "~/components/prose-html";
import { runsCopy } from "~/copy/runs";
import { cn } from "~/lib/cn";
import { renderMarkdown } from "~/lib/markdown";
import { href } from "~/lib/router";

/*
 * Pieces shared by the Runs overview, a run's detail and Delegeren: the status word, the ink
 * segmented control of the design, Dutch day labels, the review renderer and a line diff.
 */

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

const STATUS_KIND: Record<RunStatus, StatusKind> = {
  review: "review",
  question: "answer",
  working: "working",
  failed: "failed",
  done: "done",
  issues: "issues",
  draft: "draft",
  interrupted: "interrupted",
  stopped: "neutral",
};

export function RunStatusBadge(props: { status: RunStatus; className?: string }) {
  return (
    <StatusBadge kind={STATUS_KIND[props.status]} className={props.className}>
      {runsCopy.status[props.status]}
    </StatusBadge>
  );
}

/** What needs the person first, then what is running, then the rest (the demo sorts the same way). */
const RANK: Record<RunStatus, number> = { review: 0, question: 0, interrupted: 0, working: 1, failed: 2, issues: 3, done: 4, draft: 5, stopped: 6 };

export function sortRuns(runs: Run[]): Run[] {
  return [...runs].sort((a, b) => RANK[a.status] - RANK[b.status] || (a.due ?? Infinity) - (b.due ?? Infinity) || b.updatedAt - a.updatedAt);
}

/** Where a run opens: its own page when it has stages, else the chat it lives in (live runs). */
export function runHref(run: Run): string {
  if (run.stages.length === 0 && run.chatRef) return href({ name: "project", projectId: run.chatRef.projectId, chatId: run.chatRef.chatId });
  return href({ name: "run", runId: run.id });
}

export type RunFilter = "all" | "needsYou" | "working" | "done" | "failed";

export function matchesFilter(run: Run, filter: RunFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "needsYou":
      return run.status === "review" || run.status === "question" || run.status === "interrupted";
    case "working":
      return run.status === "working";
    case "done":
      return run.status === "done" || run.status === "issues" || run.status === "stopped";
    case "failed":
      return run.status === "failed";
  }
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const dayFormat = new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short" });
const weekdayTime = new Intl.DateTimeFormat("nl-NL", { weekday: "short", hour: "2-digit", minute: "2-digit" });
const timeFormat = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" });
const longDay = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long" });

/** "ma 9 nov". */
export function formatDay(at: number): string {
  return dayFormat.format(at).replace(/\./g, "");
}

/** "ma 9 nov 12:00". */
export function formatDayTime(at: number): string {
  return `${formatDay(at)} ${timeFormat.format(at)}`;
}

/** "07:41" today, "wo 17:20" this week, "ma 9 nov" before that. */
export function formatUpdated(at: number, now = Date.now()): string {
  const sameDay = new Date(at).toDateString() === new Date(now).toDateString();
  if (sameDay) return timeFormat.format(at);
  if (Math.abs(now - at) < 6 * 24 * 3600_000) return weekdayTime.format(at).replace(",", "").replace(/\./g, "");
  return formatDay(at);
}

export function formatClock(at: number): string {
  return timeFormat.format(at);
}

/** "woensdag 4 november". */
export function formatLongDay(at: number): string {
  return longDay.format(at);
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

/**
 * The design's segmented control: a pill track (white on a grey band, grey on a white band) whose
 * chosen item is a solid ink pill. The behaviour is `SegmentedControl` (Base UI radio group).
 */
export function InkSegmented<V extends string>(props: { value: V; onValueChange: (value: V) => void; items: readonly SegmentedItem<V>[]; label: string; track?: "white" | "grey"; className?: string }) {
  return (
    <SegmentedControl
      value={props.value}
      onValueChange={props.onValueChange}
      items={props.items}
      label={props.label}
      scroll
      className={cn(
        "gap-1 p-1",
        props.track === "grey" ? "bg-surface-alt" : "bg-surface",
        "[&>*]:h-10! [&>*]:px-5! [&>*]:text-base! [&>*]:font-semibold! [&>*]:text-ink!",
        "[&>[data-checked]]:bg-ink! [&>[data-checked]]:text-surface! [&>[data-checked]]:shadow-none!",
        props.className,
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

const SOURCE_ICON: Record<SourceKind, ReactNode> = {
  email: <Mail />,
  ticket: <Ticket />,
  calendar: <CalendarDays />,
  library: <BookOpen />,
  decision: <Scale />,
  file: <FileText />,
  chat: <MessageSquare />,
  web: <Globe />,
  link: <Link2 />,
};

export function SourceIcon(props: { kind: SourceKind; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("flex shrink-0 text-ink [&_svg]:size-4", props.className)}>
      {SOURCE_ICON[props.kind]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Review Markdown
// ---------------------------------------------------------------------------

const UNSURE_CLASS = "mx-1 inline-flex items-center gap-1.5 rounded-full border border-dashed border-ink px-3 py-0.5 align-middle text-[13px] font-semibold leading-5 text-ink";
const INSERT_CLASS = "border-b-2 border-ink bg-surface no-underline";

/**
 * The agent's Markdown with its two marks made visible: `[[let op: …]]` becomes a dashed warning
 * chip inline, `++…++` an underlined insertion (the person's edit). Everything still goes through
 * `renderMarkdown` (DOMPurify), so only these spans and classes survive.
 */
export function reviewHtml(markdown: string): string {
  const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const marked = markdown
    .replace(/\[\[let op: ([^\]]+)\]\]/gi, (_match, text: string) => `<span class="${UNSURE_CLASS}"><span aria-hidden="true">⚠</span><span class="sr-only">${runsCopy.run.unsure}: </span>${escape(text)}</span>`)
    .replace(/\+\+([^+]+)\+\+/g, (_match, text: string) => `<ins class="${INSERT_CLASS}"><span aria-hidden="true" class="font-semibold">+ </span>${escape(text)}<span class="sr-only"> ${runsCopy.run.yourEdit}</span></ins>`);
  return renderMarkdown(marked);
}

/** Removes the marks for plain comparison and editing. */
export function plainReview(markdown: string): string {
  return markdown.replace(/\[\[let op: ([^\]]+)\]\]/gi, "").replace(/\+\+([^+]+)\+\+/g, "$1");
}

export function ReviewBody(props: { markdown: string; className?: string }) {
  return (
    <ProseHtml
      html={reviewHtml(props.markdown)}
      className={cn(
        "max-w-[68ch] text-lg! leading-7! text-ink [&_h1]:text-[28px]! [&_h1]:leading-[34px]! [&_h2]:mb-5! [&_h2]:max-w-[34ch] [&_h2]:text-[28px]! [&_h2]:leading-[34px]! [&_h2]:tracking-[-0.01em] [&_h3]:text-xl! [&_li]:my-4! [&_ol]:ps-6! [&_p]:my-4!",
        props.className,
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Line diff
// ---------------------------------------------------------------------------

export type DiffLine = { op: "same" | "add" | "remove"; text: string };

/** A line diff by longest common subsequence; enough for a note of a few dozen lines. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    const row = table[i];
    const next = table[i + 1];
    if (!row || !next) continue;
    for (let j = b.length - 1; j >= 0; j -= 1) row[j] = a[i] === b[j] ? (next[j + 1] ?? 0) + 1 : Math.max(next[j] ?? 0, row[j + 1] ?? 0);
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const left = a[i] ?? "";
    const right = b[j] ?? "";
    if (left === right) {
      out.push({ op: "same", text: left });
      i += 1;
      j += 1;
    } else if ((table[i + 1]?.[j] ?? 0) >= (table[i]?.[j + 1] ?? 0)) {
      out.push({ op: "remove", text: left });
      i += 1;
    } else {
      out.push({ op: "add", text: right });
      j += 1;
    }
  }
  for (; i < a.length; i += 1) out.push({ op: "remove", text: a[i] ?? "" });
  for (; j < b.length; j += 1) out.push({ op: "add", text: b[j] ?? "" });
  return out;
}

export function DiffView(props: { lines: DiffLine[]; label: string }) {
  return (
    <ol aria-label={props.label} className="m-0 flex list-none flex-col gap-1 p-0 font-mono text-sm leading-6">
      {props.lines
        .filter((line) => line.text.trim() !== "")
        .map((line, index) => (
          <li
            key={index}
            className={cn(
              "whitespace-pre-wrap break-words rounded-[6px] px-3 py-0.5",
              line.op === "add" && "bg-surface font-semibold text-ink",
              line.op === "remove" && "text-ink-muted line-through",
              line.op === "same" && "text-ink-muted",
            )}
          >
            <span aria-hidden="true" className="me-2 inline-block w-3">
              {line.op === "add" ? "+" : line.op === "remove" ? "−" : " "}
            </span>
            {line.op === "add" ? <span className="sr-only">{runsCopy.run.added}: </span> : line.op === "remove" ? <span className="sr-only">{runsCopy.run.removed}: </span> : null}
            {line.text}
          </li>
        ))}
    </ol>
  );
}
