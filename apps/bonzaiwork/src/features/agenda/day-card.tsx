import type { BridgePost, DayView, Project } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/misc";
import { cn } from "~/lib/cn";
import { copy } from "~/copy";

import { awayMinutes, dayCardRows, type DayCardRow } from "./day-model";
import { dutchDuration } from "./format";
import { PostPicker } from "./post-picker";

/**
 * The Dagkaart (brief §8; assessment I1, I2): the end-of-day decision at the top of the panel.
 * One row per Bridge post with its minutes; time without a post gets the only amber on the
 * surface (V2) and "Kies post" in place, so the most common fix is one press instead of a trip
 * to the project settings (H3). "Niet geboekt" closes the card. Flat rows under one hairline (S1).
 */

/** The project's color token as a dot (frontend-contract §7.1); neutral for a label or a mix. */
function ColorDot(props: { project: Project | null; away?: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-project-color={props.project?.color}
      className={cn("size-2 shrink-0 rounded-full", props.away ? "bg-border" : props.project ? "bg-[var(--project-solid)]" : "bg-border-strong")}
    />
  );
}

export function DayCard(props: {
  day: DayView;
  projects: ReadonlyMap<string, Project>;
  recent: readonly BridgePost[];
  disabled: boolean;
  /** The row a post is being set on; its button shows a spinner and stays in place (P11). */
  busyRowId: string | null;
  onChoosePost: (row: DayCardRow, post: BridgePost) => void;
}) {
  const rows = dayCardRows(props.day);
  const away = awayMinutes(props.day);
  if (!rows.length && !away) return null;
  return (
    <section aria-label={copy.agenda.dayCard.title} data-testid="agenda-day-card" className="rounded-2xl bg-muted px-3">
      <ul className="divide-y divide-border">
        {rows.map((row) => {
          const project = row.workspaceId ? (props.projects.get(row.workspaceId) ?? null) : null;
          const busy = props.busyRowId === row.id;
          return (
            <li key={row.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2" data-testid="agenda-day-row" data-missing={row.post ? undefined : ""}>
              <ColorDot project={project} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{row.label}</span>
              <span className="shrink-0 text-sm tabular-nums text-foreground">{dutchDuration(row.minutes)}</span>
              {row.post ? null : (
                <span className="flex w-full items-center gap-2 ps-4">
                  {/* Amber only on the missing post (brief §8, V2); icon + word, never hue alone. */}
                  <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-warning-foreground">
                    <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-amber-9 ring-1 ring-inset ring-amber-11/50" />
                    {copy.agenda.withoutPost}
                  </span>
                  <PostPicker
                    recent={props.recent}
                    onChoose={(post) => props.onChoosePost(row, post)}
                    align="end"
                    trigger={
                      <Button variant="secondary" size="sm" className="ms-auto" disabled={props.disabled || busy} aria-label={`${copy.agenda.choosePost}: ${row.label}`} data-testid="agenda-post-pick">
                        {busy ? <Spinner /> : null}
                        {copy.agenda.choosePost}
                      </Button>
                    }
                  />
                </span>
              )}
            </li>
          );
        })}
        {away ? (
          <li className="flex items-center gap-2 py-2 text-sm text-muted-foreground" data-testid="agenda-day-away">
            <ColorDot project={null} away />
            <span className="min-w-0 flex-1 truncate">{copy.agenda.dayCard.notBooked}</span>
            <span className="shrink-0 tabular-nums">{dutchDuration(away)}</span>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
