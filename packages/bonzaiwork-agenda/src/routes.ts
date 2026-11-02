import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { bookingDocument } from "./booking-doc.ts";
import { parseBridgePost, rememberPost } from "./bridge.ts";
import { dateOf, datesBetween, isDate, keyStart, quarterKey, QUARTER_MS } from "./clock.ts";
import { finite, record, text, type Json } from "./json.ts";
import { NOTE_MAX, optionalText, parseCorrection, PROJECT_NAME_MAX, REFERENCE_MAX } from "./parse.ts";
import type { PresenceReport } from "./presence.ts";
import type { AgendaDay, AgendaHost, AgendaRoute, AgendaSettings, BridgePost, Correction, DayView, QuarterRecord } from "./types.ts";

/**
 * The agenda routes (plan §5.2). Reading with a client token; changing needs the host token, and
 * nothing changes on a read-only device (`read_only`), like routines. Presence is a measurement, not
 * a change, and comes from the UI with a client token.
 */

export const MAX_PERIOD_DAYS = 31;
const UNDO_KEPT = 20;

export type AgendaSettingsView = {
  enabled: boolean;
  projects: Array<{ workspaceId: string; name: string; bridgePost: BridgePost | null }>;
  recentPosts: BridgePost[];
};

/** What the routes need from the agenda. */
export type RoutesContext = {
  host(): AgendaHost | null;
  now(): number;
  timeZone(): string;
  settings(): AgendaSettings;
  saveSettings(change: (settings: AgendaSettings) => void): Promise<AgendaSettings>;
  projectName(workspaceId: string): string;
  dayView(date: string): Promise<DayView>;
  changeDay<T>(date: string, change: (day: AgendaDay) => { write: boolean; result: T }): Promise<T>;
  reportPresence(input: PresenceReport): void;
  saveDirectory(): string;
};

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "cache-control": "no-store" } });
const failure = (status: number, code: string, message: string) => json({ code, message }, status);

async function readBody(request: Request): Promise<Json | null> {
  try { return record(await request.json()); } catch { return null; }
}

/** A period from the query or body: both dates valid, from ≤ to, at most 31 days. */
function period(from: string | null, to: string | null, today: string): { ok: true; from: string; to: string } | { ok: false; response: Response } {
  const start = from ?? today;
  const end = to ?? start;
  if (!isDate(start) || !isDate(end) || end < start) return { ok: false, response: failure(400, "invalid_period", "Choose a valid period.") };
  if (datesBetween(start, end).length > MAX_PERIOD_DAYS) return { ok: false, response: failure(400, "period_too_long", `A period is at most ${MAX_PERIOD_DAYS} days.`) };
  return { ok: true, from: start, to: end };
}

const emptyRecord = (record: QuarterRecord) => !record.measured && !record.correction && record.note === null && record.reference === null;

export function createAgendaRoutes(context: RoutesContext): AgendaRoute[] {
  const today = () => dateOf(context.now());
  const knownWorkspace = (workspaceId: string) => context.host()?.workspaces().some((workspace) => workspace.id === workspaceId) ?? false;

  function settingsView(): AgendaSettingsView {
    const settings = context.settings();
    const ids = new Set([...(context.host()?.workspaces().map((workspace) => workspace.id) ?? [])]);
    return {
      enabled: settings.enabled,
      projects: [...ids].map((workspaceId) => ({ workspaceId, name: context.projectName(workspaceId), bridgePost: settings.projects[workspaceId]?.bridgePost ?? null })),
      recentPosts: settings.recentPosts,
    };
  }

  async function document(from: string, to: string): Promise<string> {
    const days = await Promise.all(datesBetween(from, to).map((date) => context.dayView(date)));
    return bookingDocument({ from, to, days, now: context.now(), timeZone: context.timeZone() });
  }

  const routes: AgendaRoute[] = [
    {
      method: "GET", path: "/bonzaiwork/agenda/settings", auth: "client",
      handle: async () => json(settingsView()),
    },
    {
      method: "PATCH", path: "/bonzaiwork/agenda/settings", auth: "host-token",
      handle: async (request) => {
        const body = await readBody(request);
        if (typeof body?.enabled !== "boolean") return failure(400, "invalid_settings", "Send enabled as true or false.");
        const enabled = body.enabled;
        await context.saveSettings((settings) => { settings.enabled = enabled; });
        return json(settingsView());
      },
    },
    {
      method: "PUT", path: "/bonzaiwork/agenda/projects/:workspaceId", auth: "host-token",
      handle: async (request, params) => {
        const workspaceId = params.workspaceId ?? "";
        if (!knownWorkspace(workspaceId)) return failure(404, "project_not_found", "Project not found.");
        const body = await readBody(request);
        if (!body || !("bridgePost" in body)) return failure(400, "invalid_post", "Send a bridgePost, or null.");
        const bridgePost = body.bridgePost === null ? null : parseBridgePost(body.bridgePost);
        if (body.bridgePost !== null && !bridgePost) return failure(400, "invalid_post", "A Bridge post needs an entity id of 1–64 characters without spaces, and a label of at most 120.");
        await context.saveSettings((settings) => {
          settings.projects[workspaceId] = { name: settings.projects[workspaceId]?.name ?? null, bridgePost };
          if (bridgePost) settings.recentPosts = rememberPost(settings.recentPosts, bridgePost);
        });
        return json({ workspaceId, name: context.projectName(workspaceId), bridgePost });
      },
    },
    {
      method: "GET", path: "/bonzaiwork/agenda/day", auth: "client",
      handle: async (request) => {
        const date = new URL(request.url).searchParams.get("date") ?? today();
        if (!isDate(date)) return failure(400, "invalid_date", "Use a date as YYYY-MM-DD.");
        return json(await context.dayView(date));
      },
    },
    {
      method: "PUT", path: "/bonzaiwork/agenda/quarters", auth: "host-token",
      handle: async (request) => {
        const body = await readBody(request);
        const date = text(body, "date") ?? "";
        const fromKey = text(body, "from") ?? "";
        const toKey = text(body, "to") ?? "";
        const from = isDate(date) && fromKey.startsWith(`${date}T`) ? keyStart(fromKey) : null;
        const to = isDate(date) && toKey.startsWith(`${date}T`) ? keyStart(toKey) : null;
        if (from === null || to === null || to < from) return failure(400, "invalid_quarters", "Choose quarters of one day: from and to are quarter keys, from ≤ to.");
        if (!body || !("correction" in body)) return failure(400, "invalid_correction", "Send a correction, or null for the measurement.");
        let correction: Correction | null = null;
        if (body.correction !== null) {
          correction = parseCorrection(body.correction);
          if (!correction) return failure(400, "invalid_correction", "Invalid correction.");
          if (correction.kind === "project" && !knownWorkspace(correction.workspaceId)) return failure(400, "invalid_workspace", "Choose a project.");
        }
        const note = "note" in body ? optionalText(body.note, NOTE_MAX) : null;
        const reference = "reference" in body ? optionalText(body.reference, REFERENCE_MAX) : null;
        if ("note" in body && note === undefined) return failure(400, "invalid_note", `A note is at most ${NOTE_MAX} characters.`);
        if ("reference" in body && reference === undefined) return failure(400, "invalid_reference", `A reference is at most ${REFERENCE_MAX} characters.`);
        const at = context.now();
        const undoId = `u-${date}-${randomBytes(6).toString("hex")}`;
        await context.changeDay(date, (day) => {
          const changes: AgendaDay["undo"][string] = [];
          for (let start = from; start <= to; start += QUARTER_MS) {
            const key = quarterKey(start);
            const before = day.quarters[key] ?? null;
            changes.push({ key, before: before ? structuredClone(before) : null });
            const next: QuarterRecord = before ? { ...before } : { key, start, measured: null, correction: null, note: null, reference: null };
            next.correction = correction ? { ...correction, at } : null;
            if ("note" in body) next.note = note ?? null;
            if ("reference" in body) next.reference = reference ?? null;
            if (emptyRecord(next)) delete day.quarters[key];
            else day.quarters[key] = next;
          }
          day.undo[undoId] = changes;
          const ids = Object.keys(day.undo);
          for (const old of ids.slice(0, Math.max(0, ids.length - UNDO_KEPT))) delete day.undo[old];
          return { write: true, result: undefined };
        });
        if (correction?.kind === "other" && correction.bridgePost) {
          const post = correction.bridgePost;
          await context.saveSettings((settings) => { settings.recentPosts = rememberPost(settings.recentPosts, post); });
        }
        return json({ undoId });
      },
    },
    {
      method: "POST", path: "/bonzaiwork/agenda/undo/:undoId", auth: "host-token",
      handle: async (_request, params) => {
        const undoId = params.undoId ?? "";
        const date = /^u-(\d{4}-\d{2}-\d{2})-[0-9a-f]+$/.exec(undoId)?.[1] ?? "";
        if (!isDate(date)) return failure(404, "undo_not_found", "This change can no longer be undone.");
        const undone = await context.changeDay(date, (day) => {
          const changes = day.undo[undoId];
          if (!changes) return { write: false, result: false };
          for (const change of [...changes].reverse()) {
            if (change.before) day.quarters[change.key] = change.before;
            else delete day.quarters[change.key];
          }
          delete day.undo[undoId];
          return { write: true, result: true };
        });
        return undone ? json({ ok: true }) : failure(404, "undo_not_found", "This change can no longer be undone.");
      },
    },
    {
      method: "POST", path: "/bonzaiwork/agenda/presence", auth: "client",
      handle: async (request) => {
        const body = await readBody(request);
        if (!body) return failure(400, "invalid_presence", "Send the open project.");
        const workspaceId = text(body, "workspaceId");
        if (body.workspaceId !== null && (!workspaceId || !knownWorkspace(workspaceId))) return failure(400, "invalid_workspace", "Unknown project.");
        const focused = typeof body.focused === "boolean" ? body.focused : undefined;
        const lastInputAt = finite(body.lastInputAt) ?? undefined;
        context.reportPresence({ workspaceId, ...(focused === undefined ? {} : { focused }), ...(lastInputAt === undefined ? {} : { lastInputAt }) });
        const name = text(body, "name")?.replace(/\s+/g, " ").trim().slice(0, PROJECT_NAME_MAX);
        if (workspaceId && name && context.settings().projects[workspaceId]?.name !== name) {
          await context.saveSettings((settings) => {
            settings.projects[workspaceId] = { name, bridgePost: settings.projects[workspaceId]?.bridgePost ?? null };
          });
        }
        return json({ ok: true });
      },
    },
    {
      method: "GET", path: "/bonzaiwork/agenda/booking-doc", auth: "client",
      handle: async (request) => {
        const query = new URL(request.url).searchParams;
        const range = period(query.get("from"), query.get("to"), today());
        if (!range.ok) return range.response;
        return new Response(await document(range.from, range.to), { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "no-store" } });
      },
    },
    {
      method: "POST", path: "/bonzaiwork/agenda/booking-doc/save", auth: "host-token",
      handle: async (request) => {
        const body = await readBody(request);
        const range = period(text(body, "from"), text(body, "to"), today());
        if (!range.ok) return range.response;
        const directory = context.saveDirectory();
        const base = `bonzaiwork-uren-${range.from}${range.to === range.from ? "" : `_${range.to}`}`;
        // Never over an earlier save: "-2", "-3", …
        let path = join(directory, `${base}.md`);
        for (let index = 2; existsSync(path); index++) path = join(directory, `${base}-${index}.md`);
        await writeFile(path, await document(range.from, range.to), { mode: 0o600, flag: "wx" });
        return json({ path });
      },
    },
  ];

  // Changing needs the host token, and nothing changes on a read-only device.
  return routes.map((route) => (route.auth !== "host-token" ? route : {
    ...route,
    handle: (request, params) => (context.host()?.readOnly ? Promise.resolve(failure(403, "read_only", "This device is read-only.")) : route.handle(request, params)),
  }));
}
