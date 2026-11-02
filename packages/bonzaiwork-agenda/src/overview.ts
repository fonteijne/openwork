import { timeOf, QUARTER_MS } from "./clock.ts";
import type { Block, BridgePost, DayTotal, DayView, QuarterView } from "./types.ts";

/**
 * From quarters to what people and the booking document read (plan §5.1, §6.1): blocks, totals,
 * the booking proposal per date × Bridge post (× reference), and the points of attention.
 * Pure: no clock, no I/O.
 */

export const QUARTER_MINUTES = 15;
const MATERIAL_MAX = 10;
const MATERIAL_TEXT_MAX = 120;

export type TimeRange = { from: string; to: string };

export type Booking = {
  /** Stable within a document: "bw-2026-11-02-1". */
  id: string;
  date: string;
  bridgePost: BridgePost;
  minutes: number;
  /** "1h 45m", for `--duration`. */
  duration: string;
  times: TimeRange[];
  material: { projects: string[]; labels: string[]; chats: string[]; notes: string[] };
  reference: string | null;
  sharedWith: string[];
};

export type MissingPost = { date: string; label: string; kind: "project" | "other"; minutes: number; times: TimeRange[] };
export type AwayRange = { date: string; from: string; to: string; minutes: number; appClosed: boolean };
export type SharedRange = { date: string; from: string; to: string; label: string; sharedWith: string[] };

export type Proposal = {
  bookings: Booking[];
  missing: MissingPost[];
  away: AwayRange[];
  shared: SharedRange[];
  minutes: { book: number; missing: number; away: number };
};

const samePost = (a: BridgePost | null, b: BridgePost | null) => (a?.entityId ?? null) === (b?.entityId ?? null);
const unique = (values: readonly string[]) => [...new Set(values)];
const clip = (value: string) => (value.length > MATERIAL_TEXT_MAX ? `${value.slice(0, MATERIAL_TEXT_MAX - 1)}…` : value);
const material = (values: readonly string[]) => unique(values.map((value) => clip(value.replace(/\s+/g, " ").trim())).filter(Boolean)).slice(0, MATERIAL_MAX);
const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((value, index) => value === b[index]);

/** "3h 30m", "1h", "45m": the form `bridge add_worklog --duration` takes. */
export function bridgeDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/** "6u 15m", "30m", "0m": for people (C-rules, Dutch). */
export function dutchDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}u ${rest}m` : `${hours}u`;
}

/** Contiguous quarters as "09:00–10:45" ranges. */
export function ranges(quarters: readonly { start: number; end: number }[]): TimeRange[] {
  const result: Array<{ start: number; end: number }> = [];
  for (const quarter of [...quarters].sort((a, b) => a.start - b.start)) {
    const last = result.at(-1);
    if (last && last.end === quarter.start) last.end = quarter.end;
    else result.push({ start: quarter.start, end: quarter.end });
  }
  return result.map((range) => ({ from: timeOf(range.start), to: timeOf(range.end) }));
}

/** Adjacent quarters with the same kind, project or label, post, reference and source form one block. */
export function blocks(quarters: readonly QuarterView[]): Block[] {
  const result: Block[] = [];
  for (const quarter of quarters) {
    const last = result.at(-1);
    if (last && last.end === quarter.start && last.kind === quarter.kind && last.workspaceId === quarter.workspaceId && last.label === quarter.label
      && samePost(last.bridgePost, quarter.bridgePost) && last.reference === quarter.reference && last.source === quarter.source && last.appClosed === quarter.appClosed) {
      last.end = quarter.end;
      last.quarters += 1;
      last.chats = unique([...last.chats, ...quarter.chats]);
      last.notes = unique([...last.notes, ...(quarter.note ? [quarter.note] : [])]);
      last.shared = unique([...last.shared, ...quarter.shared]);
      continue;
    }
    result.push({
      start: quarter.start, end: quarter.end, quarters: 1, kind: quarter.kind, workspaceId: quarter.workspaceId, label: quarter.label,
      bridgePost: quarter.bridgePost, reference: quarter.reference, source: quarter.source, appClosed: quarter.appClosed,
      chats: [...quarter.chats], notes: quarter.note ? [quarter.note] : [], shared: [...quarter.shared],
    });
  }
  return result;
}

/** Minutes per Bridge post; time without a post per project or label. Away does not count. */
export function totals(quarters: readonly QuarterView[]): DayTotal[] {
  const result: DayTotal[] = [];
  for (const quarter of quarters) {
    if (quarter.kind === "away") continue;
    const found = result.find((total) => (quarter.bridgePost ? samePost(total.bridgePost, quarter.bridgePost) : total.bridgePost === null && total.label === quarter.label));
    if (found) found.minutes += QUARTER_MINUTES;
    else result.push({ bridgePost: quarter.bridgePost, label: quarter.bridgePost?.label ?? quarter.label, minutes: QUARTER_MINUTES });
  }
  return result;
}

export function dayView(date: string, quarters: QuarterView[]): DayView {
  const dayBlocks = blocks(quarters);
  const index = quarters.findIndex((quarter) => quarter.current);
  const current = quarters[index] ?? null;
  // "Since": the start of the stretch with this project or label, whatever the source.
  let first = index;
  while (current && first > 0) {
    const before = quarters[first - 1];
    if (!before || before.end !== quarters[first]?.start || before.kind !== current.kind || before.workspaceId !== current.workspaceId || before.label !== current.label) break;
    first--;
  }
  return {
    date,
    now: current ? { workspaceId: current.workspaceId, label: current.label, since: quarters[first]?.start ?? current.start } : null,
    quarters,
    blocks: dayBlocks,
    totals: totals(quarters),
    missingPosts: quarters.filter((quarter) => quarter.kind !== "away" && !quarter.bridgePost).length,
  };
}

/**
 * The booking proposal over one or more days (plan §6.1): only project and other quarters with a
 * Bridge post, one booking per date × post, split per reference when those differ. Away is never
 * proposed; time without a post and shared quarters are points of attention.
 */
export function proposal(days: readonly DayView[]): Proposal {
  const bookings: Booking[] = [];
  const missing: MissingPost[] = [];
  const away: AwayRange[] = [];
  const shared: SharedRange[] = [];
  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    const groups: Array<{ post: BridgePost; reference: string | null; quarters: QuarterView[] }> = [];
    const without: Array<{ label: string; kind: "project" | "other"; quarters: QuarterView[] }> = [];
    for (const quarter of day.quarters) {
      if (quarter.kind === "away") continue;
      const post = quarter.bridgePost;
      if (post) {
        const group = groups.find((entry) => entry.post.entityId === post.entityId && entry.reference === quarter.reference);
        if (group) group.quarters.push(quarter);
        else groups.push({ post, reference: quarter.reference, quarters: [quarter] });
      } else {
        const group = without.find((entry) => entry.label === quarter.label && entry.kind === quarter.kind);
        if (group) group.quarters.push(quarter);
        else without.push({ label: quarter.label, kind: quarter.kind, quarters: [quarter] });
      }
    }
    groups.forEach((group, index) => {
      const minutes = group.quarters.length * QUARTER_MINUTES;
      bookings.push({
        id: `bw-${day.date}-${index + 1}`,
        date: day.date,
        bridgePost: group.post,
        minutes,
        duration: bridgeDuration(minutes),
        times: ranges(group.quarters),
        material: {
          projects: material(group.quarters.flatMap((quarter) => (quarter.kind === "project" && quarter.projectName ? [quarter.projectName] : []))),
          labels: material(group.quarters.flatMap((quarter) => (quarter.kind === "other" ? [quarter.label] : []))),
          chats: material(group.quarters.flatMap((quarter) => quarter.chats)),
          notes: material(group.quarters.flatMap((quarter) => (quarter.note ? [quarter.note] : []))),
        },
        reference: group.reference,
        sharedWith: unique(group.quarters.flatMap((quarter) => quarter.shared)),
      });
    });
    for (const group of without) missing.push({ date: day.date, label: group.label, kind: group.kind, minutes: group.quarters.length * QUARTER_MINUTES, times: ranges(group.quarters) });

    for (const block of day.blocks) {
      if (block.kind !== "away") continue;
      const last = away.at(-1);
      const range = { date: day.date, from: timeOf(block.start), to: timeOf(block.end), minutes: block.quarters * QUARTER_MINUTES, appClosed: block.appClosed };
      // Blocks also split on source; for "do not book" one range per stretch is enough.
      if (last && last.date === day.date && last.to === range.from && last.appClosed === range.appClosed) {
        last.to = range.to;
        last.minutes += range.minutes;
      } else away.push(range);
    }
    let previous: { end: number; range: SharedRange } | null = null;
    for (const quarter of day.quarters) {
      if (!quarter.shared.length) { previous = null; continue; }
      if (previous && previous.end === quarter.start && previous.range.label === quarter.label && sameList(previous.range.sharedWith, quarter.shared)) {
        previous.range.to = timeOf(quarter.end);
        previous.end = quarter.end;
        continue;
      }
      const range = { date: day.date, from: timeOf(quarter.start), to: timeOf(quarter.end), label: quarter.label, sharedWith: [...quarter.shared] };
      shared.push(range);
      previous = { end: quarter.start + QUARTER_MS, range };
    }
  }
  const sum = (values: readonly { minutes: number }[]) => values.reduce((total, value) => total + value.minutes, 0);
  return { bookings, missing, away, shared, minutes: { book: sum(bookings), missing: sum(missing), away: sum(away) } };
}
