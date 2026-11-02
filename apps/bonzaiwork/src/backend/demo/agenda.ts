import {
  addDays,
  bookingDocument,
  dateOf,
  datesBetween,
  dayQuarters,
  dayView,
  isDate,
  keyStart,
  quarterKey,
  QUARTER_MS,
  rememberPost,
  validEntityId,
  weekday,
  weekOf,
  type AgendaDay,
  type AgendaProject,
  type BridgePost,
  type Measured,
  type QuarterRecord,
} from "@bonzaiwork/agenda/model";

import { BackendError, type AgendaBackend, type AgendaQuartersInput, type AgendaSettingsView } from "../types";
import { readLocalJson, writeLocalJson } from "~/lib/storage";

/**
 * The agenda in the demo (plan §7.1): a week and a half of workdays with away quarters, a meeting,
 * a shared quarter and a project without a Bridge post. Stored in this browser; the view, the totals
 * and the booking document come from the same pure functions the server uses. Only placeholders
 * (AGENTS.md, confidentiality): posts are `<ENTITY_ID_A>`, labels "Project A, ontwikkeling".
 */

type DemoAgendaState = {
  version: 1;
  enabled: boolean;
  projects: Record<string, AgendaProject>;
  recentPosts: BridgePost[];
  days: Record<string, AgendaDay>;
};

export type DemoAgendaProject = { id: string; name: string };

const POST_A: BridgePost = { entityId: "<ENTITY_ID_A>", label: "Project A, ontwikkeling" };
const POST_B: BridgePost = { entityId: "<ENTITY_ID_B>", label: "Intern overleg" };
const POST_C: BridgePost = { entityId: "<ENTITY_ID_C>", label: "Project C" };
const UNDO_KEPT = 20;

/** Which demo project plays which part; the seed uses these ids. */
export const DEMO_AGENDA = { main: "p-offertes", second: "p-marketing", withoutPost: "p-service" } as const;

type Slot = { from: string; to: string; project?: string; chats?: string[]; sharedWith?: string; appOpen?: boolean };

/** One workday, local time. Gaps without a slot are away with the app closed (lunch). */
function template(dayIndex: number): Slot[] {
  const { main, second, withoutPost } = DEMO_AGENDA;
  const odd = dayIndex % 2 === 1;
  return [
    { from: "09:00", to: "10:45", project: main, chats: odd ? ["Prijstabel Q4"] : ["Prijstabel Q4", "Template offerte"] },
    { from: "10:45", to: "11:00", project: withoutPost, chats: ["Opzet rapport"] },
    // A meeting: the app is open, nothing happens in it.
    { from: "11:00", to: "12:00", appOpen: true },
    { from: "12:45", to: "13:00", project: withoutPost },
    { from: "13:00", to: "13:30", appOpen: true },
    { from: "13:30", to: "14:00", project: main, chats: ["Template offerte"] },
    { from: "14:00", to: "14:15", project: main, sharedWith: second },
    { from: "14:15", to: "15:15", project: main },
    { from: "15:15", to: "16:00", project: second, chats: ["Exportfout CSV"] },
    { from: "16:00", to: odd ? "16:30" : "17:00", project: second },
  ];
}

function at(date: string, time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, hours ?? 0, minutes ?? 0).getTime();
}

const emptyDay = (date: string): AgendaDay => ({ version: 1, date, quarters: {}, undo: {} });

function measuredFor(slot: Slot, start: number): Measured {
  if (!slot.project) return { scores: {}, lastActivity: {}, chats: {}, appOpen: slot.appOpen ?? false };
  const scores: Record<string, number> = { [slot.project]: 12 };
  const lastActivity: Record<string, number> = { [slot.project]: start + 10 * 60_000 };
  if (slot.sharedWith) {
    scores[slot.sharedWith] = 4;
    lastActivity[slot.sharedWith] = start + 5 * 60_000;
  }
  const chats = slot.chats ? { [slot.project]: slot.chats.map((title, index) => ({ id: `demo-chat-${index}-${title.length}`, title })) } : {};
  return { scores, lastActivity, chats, appOpen: true };
}

function seedDay(date: string, dayIndex: number, now: number): AgendaDay {
  const day = emptyDay(date);
  for (const slot of template(dayIndex)) {
    for (let start = at(date, slot.from); start < at(date, slot.to); start += QUARTER_MS) {
      // Only what already happened; the quarter of now fills in from presence.
      if (start + QUARTER_MS > now) continue;
      const key = quarterKey(start);
      day.quarters[key] = { key, start, measured: measuredFor(slot, start), correction: null, note: null, reference: null };
    }
  }
  return day;
}

export function createDemoAgendaSeed(now: number, withProjects: boolean): DemoAgendaState {
  const state: DemoAgendaState = {
    version: 1,
    enabled: true,
    projects: withProjects
      ? { [DEMO_AGENDA.main]: { name: null, bridgePost: POST_A }, [DEMO_AGENDA.second]: { name: null, bridgePost: POST_C }, [DEMO_AGENDA.withoutPost]: { name: null, bridgePost: null } }
      : {},
    recentPosts: withProjects ? [POST_A, POST_B, POST_C] : [],
    days: {},
  };
  if (!withProjects) return state;
  const today = dateOf(now);
  const lastMonday = addDays(weekOf(today).from, -7);
  datesBetween(lastMonday, today)
    .filter((date) => weekday(date) < 5)
    .forEach((date, index) => {
      state.days[date] = seedDay(date, index, now);
    });
  // Monday of this week: the meeting was booked as one, with a note.
  const monday = weekOf(today).from;
  const mondayDay = state.days[monday];
  if (mondayDay && monday !== today) {
    for (let start = at(monday, "11:00"); start < at(monday, "12:00"); start += QUARTER_MS) {
      const key = quarterKey(start);
      const record = mondayDay.quarters[key];
      if (record) record.correction = { kind: "other", label: "Meeting sprintplanning", bridgePost: POST_B, at: start };
    }
  }
  return state;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const latency = (kind: "read" | "write" = "read") => wait(kind === "read" ? 40 : 200);

function isState(value: unknown): value is DemoAgendaState {
  return typeof value === "object" && value !== null && Reflect.get(value, "version") === 1 && typeof Reflect.get(value, "days") === "object";
}

function randomId(): string {
  return Math.random().toString(16).slice(2, 14).padEnd(12, "0");
}

export function createDemoAgenda(options: { storageKey: string; withProjects: boolean; projects: () => DemoAgendaProject[]; now?: () => number }): AgendaBackend & { reset(): void } {
  const now = options.now ?? (() => Date.now());
  const storageKey = `${options.storageKey}.agenda.v1`;
  const stored = readLocalJson(storageKey);
  let state: DemoAgendaState = isState(stored) ? stored : createDemoAgendaSeed(now(), options.withProjects);
  const save = () => writeLocalJson(storageKey, state);
  save();
  /** The last presence minute per project, so a burst of navigation counts once. */
  const lastPresence = new Map<string, number>();

  const projectName = (workspaceId: string) => options.projects().find((project) => project.id === workspaceId)?.name ?? state.projects[workspaceId]?.name ?? workspaceId;
  const known = (workspaceId: string) => options.projects().some((project) => project.id === workspaceId);
  const dayOf = (date: string): AgendaDay => state.days[date] ?? emptyDay(date);

  function settingsView(): AgendaSettingsView {
    return {
      enabled: state.enabled,
      projects: options.projects().map((project) => ({ workspaceId: project.id, name: project.name, bridgePost: state.projects[project.id]?.bridgePost ?? null })),
      recentPosts: structuredClone(state.recentPosts),
    };
  }

  function view(date: string) {
    const quarters = dayQuarters(date, dayOf(date), { projects: state.projects, name: projectName, now: now() });
    return dayView(date, quarters);
  }

  function checkPost(post: BridgePost | null): BridgePost | null {
    if (!post) return null;
    const entityId = post.entityId.trim();
    const label = post.label?.replace(/\s+/g, " ").trim() ?? "";
    if (!validEntityId(entityId) || label.length > 120) throw new BackendError("invalid_post", "Een entity-ID heeft 1 tot 64 tekens, zonder spaties.", 400);
    return { entityId, label: label || null };
  }

  function setQuarters(input: AgendaQuartersInput): { undoId: string } {
    const from = isDate(input.date) && input.from.startsWith(`${input.date}T`) ? keyStart(input.from) : null;
    const to = isDate(input.date) && input.to.startsWith(`${input.date}T`) ? keyStart(input.to) : null;
    if (from === null || to === null || to < from) throw new BackendError("invalid_quarters", "Kies kwartieren van één dag, met het begin vóór het einde.", 400);
    let correction = input.correction;
    if (correction?.kind === "project" && !known(correction.workspaceId)) throw new BackendError("invalid_workspace", "Kies een project.", 400);
    if (correction?.kind === "other") {
      const label = correction.label.replace(/\s+/g, " ").trim();
      if (!label || label.length > 120) throw new BackendError("invalid_correction", "Geef een label van hoogstens 120 tekens.", 400);
      correction = { kind: "other", label, bridgePost: checkPost(correction.bridgePost) };
    }
    const day = structuredClone(dayOf(input.date));
    const undoId = `u-${input.date}-${randomId()}`;
    const changes: AgendaDay["undo"][string] = [];
    const changedAt = now();
    for (let start = from; start <= to; start += QUARTER_MS) {
      const key = quarterKey(start);
      const before = day.quarters[key] ?? null;
      changes.push({ key, before: before ? structuredClone(before) : null });
      const next: QuarterRecord = before ? { ...before } : { key, start, measured: null, correction: null, note: null, reference: null };
      next.correction = correction ? { ...correction, at: changedAt } : null;
      if (input.note !== undefined) next.note = input.note?.trim() || null;
      if (input.reference !== undefined) next.reference = input.reference?.trim() || null;
      if (!next.measured && !next.correction && next.note === null && next.reference === null) delete day.quarters[key];
      else day.quarters[key] = next;
    }
    day.undo[undoId] = changes;
    const ids = Object.keys(day.undo);
    for (const old of ids.slice(0, Math.max(0, ids.length - UNDO_KEPT))) delete day.undo[old];
    state.days[input.date] = day;
    if (correction?.kind === "other" && correction.bridgePost) state.recentPosts = rememberPost(state.recentPosts, correction.bridgePost);
    save();
    return { undoId };
  }

  function documentFor(from: string, to: string): string {
    if (!isDate(from) || !isDate(to) || to < from) throw new BackendError("invalid_period", "Deze periode klopt niet. Kies een begin- en einddatum.", 400);
    const dates = datesBetween(from, to);
    if (dates.length > 31) throw new BackendError("period_too_long", "Kies een periode van hoogstens 31 dagen.", 400);
    return bookingDocument({ from, to, days: dates.map(view), now: now(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" });
  }

  return {
    reset() {
      state = createDemoAgendaSeed(now(), options.withProjects);
      lastPresence.clear();
      save();
    },
    async settings() {
      await latency();
      return settingsView();
    },
    async setEnabled(enabled) {
      await latency("write");
      state.enabled = enabled;
      save();
    },
    async setProjectPost(projectId, post) {
      await latency("write");
      if (!known(projectId)) throw new BackendError("project_not_found", "Dit project bestaat niet meer.", 404);
      const checked = checkPost(post);
      state.projects[projectId] = { name: state.projects[projectId]?.name ?? null, bridgePost: checked };
      if (checked) state.recentPosts = rememberPost(state.recentPosts, checked);
      save();
    },
    async day(date) {
      await latency();
      const target = date ?? dateOf(now());
      if (!isDate(target)) throw new BackendError("invalid_date", "Deze datum klopt niet. Kies een andere dag.", 400);
      return view(target);
    },
    async setQuarters(input) {
      await latency("write");
      return setQuarters(input);
    },
    async undo(undoId) {
      await latency("write");
      const date = /^u-(\d{4}-\d{2}-\d{2})-[0-9a-f]+$/.exec(undoId)?.[1] ?? "";
      const day = state.days[date];
      const changes = day?.undo[undoId];
      if (!day || !changes) throw new BackendError("undo_not_found", "Deze wijziging kan niet meer ongedaan worden gemaakt.", 404);
      for (const change of [...changes].reverse()) {
        if (change.before) day.quarters[change.key] = change.before;
        else delete day.quarters[change.key];
      }
      delete day.undo[undoId];
      save();
    },
    async reportPresence(input) {
      // Like the server: a presence minute for the open project in the quarter of now.
      if (!state.enabled) return;
      const moment = now();
      const date = dateOf(moment);
      const key = quarterKey(moment);
      const day = state.days[date] ?? emptyDay(date);
      const start = keyStart(key) ?? moment;
      const record: QuarterRecord = day.quarters[key] ?? { key, start, measured: null, correction: null, note: null, reference: null };
      const measured: Measured = record.measured ?? { scores: {}, lastActivity: {}, chats: {}, appOpen: true };
      measured.appOpen = true;
      const minute = Math.floor(moment / 60_000);
      // Like the server's presence (plan §5.3): the window has focus and there was input in the last minute.
      const present = input.focused !== false && (input.lastInputAt === undefined || moment - input.lastInputAt < 60_000);
      if (present && input.projectId && known(input.projectId) && lastPresence.get(input.projectId) !== minute) {
        lastPresence.set(input.projectId, minute);
        measured.scores[input.projectId] = (measured.scores[input.projectId] ?? 0) + 1;
        measured.lastActivity[input.projectId] = moment;
      }
      day.quarters[key] = { ...record, measured };
      state.days[date] = day;
      if (input.projectId && input.name) state.projects[input.projectId] = { name: input.name, bridgePost: state.projects[input.projectId]?.bridgePost ?? null };
      save();
    },
    async bookingDocument(from, to) {
      await latency();
      return documentFor(from, to);
    },
    async saveBookingDocument(from, to) {
      await latency("write");
      const text = documentFor(from, to);
      // No file system in the browser: the document downloads, and the name is the "path".
      const name = `bonzaiwork-uren-${from}${to === from ? "" : `_${to}`}.md`;
      const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return { path: name };
    },
  };
}
