import { quarterKey, quartersOfDay, QUARTER_MS } from "./clock.ts";
import { AWAY_LABEL, type AgendaDay, type AgendaProject, type Measured, type QuarterRecord, type QuarterView } from "./types.ts";

/**
 * From measurement to one assignment per quarter (plan §2.3–2.5). Pure: no clock, no I/O.
 */

/** Presence minutes + 2 × turns you started (plan §2.3). */
export function score(presenceMinutes: number, turnsStarted: number): number {
  return presenceMinutes + 2 * turnsStarted;
}

/**
 * The project a quarter goes to: the highest score, on a tie the last activity in the quarter
 * (then the id, so the outcome never depends on insertion order). All scores 0: away.
 */
export function winner(measured: Measured | null): { workspaceId: string | null; others: string[] } {
  const active = Object.entries(measured?.scores ?? {})
    .filter(([, value]) => value > 0)
    .sort(([a, scoreA], [b, scoreB]) => scoreB - scoreA
      || (measured?.lastActivity[b] ?? 0) - (measured?.lastActivity[a] ?? 0)
      || a.localeCompare(b))
    .map(([workspaceId]) => workspaceId);
  return { workspaceId: active[0] ?? null, others: active.slice(1) };
}

/** Active or corrected: what makes a quarter part of the day window (plan §2.5). */
export function counts(record: QuarterRecord | null | undefined): boolean {
  if (!record) return false;
  return record.correction !== null || record.note !== null || record.reference !== null || winner(record.measured).workspaceId !== null;
}

export type ViewContext = {
  projects: Record<string, AgendaProject>;
  /** The name to show for a workspace (settings, else the folder name). */
  name(workspaceId: string): string;
  now: number;
};

/** What is shown, totalled and exported: the correction if there is one, else the measurement (plan §2.4). */
export function viewQuarter(start: number, record: QuarterRecord | null | undefined, context: ViewContext): QuarterView {
  const base = {
    key: quarterKey(start),
    start,
    end: start + QUARTER_MS,
    note: record?.note ?? null,
    reference: record?.reference ?? null,
    current: start <= context.now && context.now < start + QUARTER_MS,
  };
  const correction = record?.correction ?? null;
  const chatsOf = (workspaceId: string) => [...new Set((record?.measured?.chats[workspaceId] ?? []).flatMap((chat) => (chat.title ? [chat.title] : [])))];
  const project = (workspaceId: string, source: QuarterView["source"], others: string[]): QuarterView => ({
    ...base,
    kind: "project",
    workspaceId,
    projectName: context.name(workspaceId),
    label: context.name(workspaceId),
    bridgePost: context.projects[workspaceId]?.bridgePost ?? null,
    source,
    shared: others.map((other) => context.name(other)),
    chats: chatsOf(workspaceId),
    appClosed: false,
  });
  const away = (source: QuarterView["source"]): QuarterView => ({
    ...base,
    kind: "away",
    workspaceId: null,
    projectName: null,
    label: AWAY_LABEL,
    bridgePost: null,
    source,
    shared: [],
    chats: [],
    appClosed: source === "measured" && !record?.measured?.appOpen && !base.current,
  });

  if (correction?.kind === "project") return project(correction.workspaceId, "user", []);
  if (correction?.kind === "away") return away("user");
  if (correction?.kind === "other") {
    return { ...base, kind: "other", workspaceId: null, projectName: null, label: correction.label, bridgePost: correction.bridgePost, source: "user", shared: [], chats: [], appClosed: false };
  }
  const measured = winner(record?.measured ?? null);
  return measured.workspaceId ? project(measured.workspaceId, "measured", measured.others) : away("measured");
}

/**
 * The quarters of a day within its window: from the first to the last quarter that is active or
 * corrected, and on the day itself up to now. Away quarters in between are in it, before and after
 * are not (plan §2.5). The current quarter's live counters are expected in `day` already.
 */
export function dayQuarters(date: string, day: AgendaDay, context: ViewContext): QuarterView[] {
  const starts = quartersOfDay(date);
  const records = starts.map((start) => day.quarters[quarterKey(start)]);
  const first = records.findIndex(counts);
  if (first < 0) return [];
  let last = records.length - 1;
  while (last > first && !counts(records[last])) last--;
  const current = starts.findIndex((start) => start <= context.now && context.now < start + QUARTER_MS);
  if (current > last) last = current;
  return starts.slice(first, last + 1).map((start, index) => viewQuarter(start, records[first + index], context));
}
