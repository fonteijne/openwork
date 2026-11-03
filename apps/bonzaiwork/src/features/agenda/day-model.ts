import { addDays, weekOf, QUARTER_MINUTES, type BridgePost, type DayView, type QuarterView } from "@bonzaiwork/agenda/model";

import { copy } from "~/copy";


/**
 * The Dagkaart and the week strip as data (brief §8): the totals of a day per Bridge post, with
 * enough context to fix a missing post in place, and the seven dates of a week. Pure, so it is
 * tested without the panel.
 */

export type DayCardRow = {
  /** Stable within a day: the entity id, or the label for time without a post. */
  id: string;
  label: string;
  post: BridgePost | null;
  minutes: number;
  /** For time without a post: the kind of its quarters. Null on a post row (any mix). */
  kind: "project" | "other" | null;
  /** The one project behind this row, when there is exactly one (its color, its post setting). */
  workspaceId: string | null;
  quarters: QuarterView[];
};

/** Mirrors `totals()` in the model: per post when there is one, else per label; away never counts. */
export function dayCardRows(day: DayView): DayCardRow[] {
  const rows: DayCardRow[] = [];
  for (const quarter of day.quarters) {
    if (quarter.kind === "away") continue;
    const id = quarter.bridgePost ? `post:${quarter.bridgePost.entityId}` : `label:${quarter.label}`;
    const found = rows.find((row) => row.id === id);
    if (found) {
      found.minutes += QUARTER_MINUTES;
      found.quarters.push(quarter);
      if (found.workspaceId !== quarter.workspaceId) found.workspaceId = null;
      continue;
    }
    rows.push({
      id,
      label: quarter.bridgePost?.label ?? quarter.label,
      post: quarter.bridgePost,
      minutes: QUARTER_MINUTES,
      kind: quarter.bridgePost ? null : quarter.kind,
      workspaceId: quarter.workspaceId,
      quarters: [quarter],
    });
  }
  return rows;
}

/** Minutes of a day that are away: "Niet geboekt". */
export function awayMinutes(day: DayView): number {
  return day.quarters.filter((quarter) => quarter.kind === "away").length * QUARTER_MINUTES;
}

/** Contiguous stretches of quarters as `from`/`to` keys, the shape `setQuarters` takes. */
export function keyRanges(quarters: readonly QuarterView[]): Array<{ from: string; to: string }> {
  const result: Array<{ from: string; to: string; end: number }> = [];
  for (const quarter of [...quarters].sort((a, b) => a.start - b.start)) {
    const last = result.at(-1);
    if (last && last.end === quarter.start) {
      last.to = quarter.key;
      last.end = quarter.end;
    } else result.push({ from: quarter.key, to: quarter.key, end: quarter.end });
  }
  return result.map(({ from, to }) => ({ from, to }));
}

/** Monday to Sunday of the week that holds `date`. */
export function weekDates(date: string): string[] {
  const { from } = weekOf(date);
  return Array.from({ length: 7 }, (_, index) => addDays(from, index));
}

/**
 * The label of a stretch as people read it (decision A2): a measured away stretch is
 * "Niet in BonzaiWork", one you set yourself "Niet boeken"; everything else keeps its own label.
 */
export function displayLabel(entry: { kind: "project" | "other" | "away"; label: string; source: "measured" | "user" }): string {
  if (entry.kind !== "away" && entry.label !== copy.agenda.away) return entry.label;
  return entry.source === "user" ? copy.agenda.notBooking : copy.agenda.notInApp;
}
