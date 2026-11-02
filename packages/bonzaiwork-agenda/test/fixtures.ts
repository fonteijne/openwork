import { dayStart, quarterKey, QUARTER_MS } from "../src/clock.ts";
import { dayQuarters, type ViewContext } from "../src/quarters.ts";
import type { AgendaDay, AgendaProject, Correction, Measured, QuarterRecord } from "../src/types.ts";

/** Fixtures with placeholders only (AGENTS.md, confidentiality). */
export const PROJECTS: Record<string, AgendaProject> = {
  ws_a: { name: "Project A", bridgePost: { entityId: "<ENTITY_ID_A>", label: "Project A, ontwikkeling" } },
  ws_c: { name: "Project C", bridgePost: { entityId: "<ENTITY_ID_C>", label: "Project C" } },
  ws_d: { name: "Project D", bridgePost: null },
};
export const MEETING_POST = { entityId: "<ENTITY_ID_B>", label: "Intern overleg" };

export const at = (date: string, hour: number, minute: number) => dayStart(date) + (hour * 60 + minute) * 60_000;

export function context(now: number): ViewContext {
  return { projects: PROJECTS, name: (id) => PROJECTS[id]?.name ?? id, now };
}

type Spec = { from: string; to: string; workspaceId?: string; scores?: Record<string, number>; chats?: string[]; correction?: Correction; note?: string; reference?: string; appOpen?: boolean };

/** A day from ranges: "09:00"–"10:45" measured in a project, or corrected. */
export function buildDay(date: string, specs: readonly Spec[]): AgendaDay {
  const quarters: Record<string, QuarterRecord> = {};
  for (const spec of specs) {
    const [fromHour, fromMinute] = spec.from.split(":").map(Number);
    const [toHour, toMinute] = spec.to.split(":").map(Number);
    for (let start = at(date, fromHour ?? 0, fromMinute ?? 0); start < at(date, toHour ?? 0, toMinute ?? 0); start += QUARTER_MS) {
      const scores = spec.scores ?? (spec.workspaceId ? { [spec.workspaceId]: 5 } : {});
      const measured: Measured = { scores, lastActivity: {}, chats: spec.workspaceId && spec.chats ? { [spec.workspaceId]: spec.chats.map((title, index) => ({ id: `ses_${index}`, title })) } : {}, appOpen: spec.appOpen ?? true };
      const key = quarterKey(start);
      quarters[key] = { key, start, measured, correction: spec.correction ? { ...spec.correction, at: 1 } : null, note: spec.note ?? null, reference: spec.reference ?? null };
    }
  }
  return { version: 1, date, quarters, undo: {} };
}

export function views(date: string, specs: readonly Spec[], now = at("2026-12-01", 9, 0)) {
  return dayQuarters(date, buildDay(date, specs), context(now));
}

/** The example day of plan §6.3. */
export const EXAMPLE_DAY: Spec[] = [
  { from: "09:00", to: "10:45", workspaceId: "ws_a", chats: ["Prijstabel Q4"] },
  { from: "10:45", to: "11:00", workspaceId: "ws_d", chats: ["Opzet rapport"] },
  { from: "11:00", to: "12:00", correction: { kind: "other", label: "Meeting sprintplanning", bridgePost: MEETING_POST } },
  { from: "12:00", to: "12:45" },
  { from: "12:45", to: "13:00", workspaceId: "ws_d" },
  { from: "13:00", to: "13:30", appOpen: false },
  { from: "13:30", to: "14:00", workspaceId: "ws_a", chats: ["Template offerte"] },
  { from: "14:00", to: "14:15", scores: { ws_a: 5, ws_c: 2 } },
  { from: "14:15", to: "15:15", workspaceId: "ws_a", note: "staffelkorting herzien" },
  { from: "15:15", to: "16:00", correction: { kind: "other", label: "Meeting team", bridgePost: MEETING_POST } },
  { from: "16:00", to: "17:00", workspaceId: "ws_c", chats: ["Exportfout CSV"], reference: "<TICKET>" },
];
