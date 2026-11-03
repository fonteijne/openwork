import { useState } from "react";
import { ChevronRight, PenLine, Split } from "lucide-react";

import type { Block, DayView, Project, QuarterView } from "~/backend/types";
import { Tooltip } from "~/components/ui/tooltip";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";

import { PostLine } from "./bridge-post-field";
import { displayLabel } from "./day-model";
import { dutchDuration, timeRange } from "./format";

/**
 * The day as blocks of quarters with the same kind, project or label, post and reference (plan
 * §7.3). Each block carries a bar in its project's color token (brief §8); away is a hairline
 * grey and reads "Niet in BonzaiWork" or "Niet boeken" (decision A2); the only amber on the
 * timeline marks a missing post (V2). A block opens to its quarters (S3); clicking a block or a
 * quarter edits it.
 */

export type EditTarget = { from: QuarterView; to: QuarterView; block: Block | null };

export function quartersOf(day: DayView, block: Block): QuarterView[] {
  return day.quarters.filter((quarter) => quarter.start >= block.start && quarter.end <= block.end);
}

function SharedIcon(props: { shared: string[] }) {
  if (!props.shared.length) return null;
  const text = copy.agenda.sharedWith(props.shared.join(", "));
  return (
    <Tooltip label={text}>
      <span role="img" aria-label={text} tabIndex={0} className="inline-flex shrink-0 rounded-full text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Split className="size-3.5" />
      </span>
    </Tooltip>
  );
}

function UserIcon(props: { source: "measured" | "user" }) {
  if (props.source !== "user") return null;
  return (
    <Tooltip label={copy.agenda.byYou}>
      <span role="img" aria-label={copy.agenda.byYou} tabIndex={0} className="inline-flex shrink-0 rounded-full text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <PenLine className="size-3.5" />
      </span>
    </Tooltip>
  );
}

function BlockRow(props: { day: DayView; block: Block; project: Project | null; onEdit: (target: EditTarget) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const { block, project } = props;
  const quarters = quartersOf(props.day, block);
  const away = block.kind === "away";
  const first = quarters[0];
  const last = quarters.at(-1);
  const current = quarters.some((quarter) => quarter.current);
  const shared = [...new Set(quarters.flatMap((quarter) => quarter.shared))];
  const label = displayLabel(block);

  return (
    <li className="border-b border-border last:border-b-0" data-testid="agenda-block" data-kind={block.kind} data-project-color={project?.color}>
      <div className="flex items-start gap-1">
        <button
          type="button"
          disabled={props.disabled || !first || !last}
          onClick={() => first && last && props.onEdit({ from: first, to: last, block })}
          aria-label={`${copy.agenda.edit}: ${timeRange(block.start, block.end)}, ${label}`}
          className="flex min-w-0 flex-1 items-stretch gap-2.5 rounded-xl px-2 py-2 text-start outline-none transition-colors duration-150 hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none motion-reduce:transition-none"
        >
          {/* The project's color token as a bar; hairline grey for away; neutral ink for a meeting. */}
          <span aria-hidden="true" className={cn("w-0.5 shrink-0 self-stretch rounded-full", away ? "bg-border" : project ? "bg-[var(--project-solid)]" : "bg-border-strong")} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-baseline gap-2 text-xs tabular-nums text-muted-foreground">
              <span className={cn(current && "font-semibold text-foreground")}>{timeRange(block.start, block.end)}</span>
              <span>{dutchDuration(block.quarters * 15)}</span>
            </span>
            <span className={cn("flex min-w-0 items-center gap-1.5 text-sm", away ? "text-muted-foreground" : "font-medium text-foreground")}>
              <span className="min-w-0 truncate">{label}</span>
              <SharedIcon shared={shared} />
              <UserIcon source={block.source} />
            </span>
            {away ? (
              block.appClosed ? <span className="text-xs text-muted-foreground">{copy.agenda.appClosed}</span> : null
            ) : block.bridgePost ? (
              <PostLine post={block.bridgePost} className="text-xs text-muted-foreground" />
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning-foreground">
                <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-amber-9 ring-1 ring-inset ring-amber-11/50" />
                {copy.agenda.withoutPost}
              </span>
            )}
            {block.reference ? <span className="truncate text-xs text-muted-foreground">{block.reference}</span> : null}
            {block.chats.length ? <span className="truncate text-xs text-subtle-foreground">{block.chats.join(", ")}</span> : null}
            {block.notes.length ? <span className="line-clamp-2 text-xs text-muted-foreground">{block.notes.join("; ")}</span> : null}
          </span>
        </button>
        {quarters.length > 1 ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={open ? copy.agenda.hideQuarters : copy.agenda.showQuarters}
            className="mt-1.5 flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight className={cn("size-4 transition-transform duration-150 motion-reduce:transition-none", open && "rotate-90")} />
          </button>
        ) : (
          <span className="size-7 shrink-0" />
        )}
      </div>
      {open ? (
        <ul className="mb-2 ms-3 border-s border-border ps-2">
          {quarters.map((quarter) => (
            <li key={quarter.key}>
              <button
                type="button"
                disabled={props.disabled}
                onClick={() => props.onEdit({ from: quarter, to: quarter, block: null })}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-start text-xs outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
              >
                <span className="tabular-nums text-muted-foreground">{timeRange(quarter.start, quarter.end)}</span>
                <span className={cn("min-w-0 flex-1 truncate", quarter.kind === "away" ? "text-muted-foreground" : "text-foreground")}>{displayLabel(quarter)}</span>
                {quarter.shared.length ? <span className="truncate text-muted-foreground">{copy.agenda.sharedWith(quarter.shared.join(", "))}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function Timeline(props: { day: DayView; projects: ReadonlyMap<string, Project>; onEdit: (target: EditTarget) => void; disabled: boolean }) {
  return (
    <ol className="flex flex-col" aria-label={copy.agenda.title} data-testid="agenda-timeline">
      {props.day.blocks.map((block) => (
        <BlockRow
          key={block.start}
          day={props.day}
          block={block}
          project={block.workspaceId ? (props.projects.get(block.workspaceId) ?? null) : null}
          onEdit={props.onEdit}
          disabled={props.disabled}
        />
      ))}
    </ol>
  );
}
