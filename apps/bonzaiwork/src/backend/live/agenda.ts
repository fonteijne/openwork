import { AWAY_LABEL } from "@bonzaiwork/agenda/model";

import { BackendError, type AgendaBackend, type AgendaSettingsView, type Block, type BridgePost, type DayView, type QuarterKind, type QuarterView } from "../types";

import { enc, type request } from "./http";
import { bool, field, list, num, rec, str, strings } from "./read";

/**
 * The agenda routes of packages/bonzaiwork-agenda (contract §7.6). Reading with the client token,
 * changing with the host token; presence is a measurement and goes with the client token.
 */

type Request = (path: string, options?: Parameters<typeof request>[2]) => Promise<unknown>;

export function readPost(value: unknown): BridgePost | null {
  const entityId = str(value, "entityId");
  if (!entityId) return null;
  return { entityId, label: str(value, "label") ?? null };
}

function readKind(value: unknown): QuarterKind {
  const kind = str(value, "kind");
  return kind === "project" || kind === "other" ? kind : "away";
}

const readSource = (value: unknown): "measured" | "user" => (str(value, "source") === "user" ? "user" : "measured");

export function readQuarter(value: unknown): QuarterView | null {
  const key = str(value, "key");
  const start = num(value, "start");
  const end = num(value, "end");
  if (!key || start === undefined || end === undefined) return null;
  const kind = readKind(value);
  return {
    key,
    start,
    end,
    kind,
    workspaceId: str(value, "workspaceId") ?? null,
    projectName: str(value, "projectName") ?? null,
    label: str(value, "label") ?? (kind === "away" ? AWAY_LABEL : ""),
    bridgePost: readPost(field(value, "bridgePost")),
    source: readSource(value),
    shared: strings(field(value, "shared")),
    chats: strings(field(value, "chats")),
    note: str(value, "note") ?? null,
    reference: str(value, "reference") ?? null,
    appClosed: bool(value, "appClosed") ?? false,
    current: bool(value, "current") ?? false,
  };
}

function readBlock(value: unknown): Block | null {
  const start = num(value, "start");
  const end = num(value, "end");
  if (start === undefined || end === undefined) return null;
  const kind = readKind(value);
  return {
    start,
    end,
    quarters: num(value, "quarters") ?? Math.round((end - start) / 900_000),
    kind,
    workspaceId: str(value, "workspaceId") ?? null,
    label: str(value, "label") ?? (kind === "away" ? AWAY_LABEL : ""),
    bridgePost: readPost(field(value, "bridgePost")),
    reference: str(value, "reference") ?? null,
    source: readSource(value),
    appClosed: bool(value, "appClosed") ?? false,
    chats: strings(field(value, "chats")),
    notes: strings(field(value, "notes")),
    shared: strings(field(value, "shared")),
  };
}

export function readDay(value: unknown, fallbackDate: string): DayView {
  const now = rec(field(value, "now"));
  const since = num(now, "since");
  return {
    date: str(value, "date") ?? fallbackDate,
    now: now && since !== undefined ? { workspaceId: str(now, "workspaceId") ?? null, label: str(now, "label") ?? AWAY_LABEL, since } : null,
    quarters: list(value, "quarters").flatMap((entry) => readQuarter(entry) ?? []),
    blocks: list(value, "blocks").flatMap((entry) => readBlock(entry) ?? []),
    totals: list(value, "totals").map((entry) => ({ bridgePost: readPost(field(entry, "bridgePost")), label: str(entry, "label") ?? "", minutes: num(entry, "minutes") ?? 0 })),
    missingPosts: num(value, "missingPosts") ?? 0,
  };
}

export function readSettings(value: unknown): AgendaSettingsView {
  return {
    enabled: bool(value, "enabled") ?? true,
    projects: list(value, "projects").flatMap((entry) => {
      const workspaceId = str(entry, "workspaceId");
      return workspaceId ? [{ workspaceId, name: str(entry, "name") ?? workspaceId, bridgePost: readPost(field(entry, "bridgePost")) }] : [];
    }),
    recentPosts: list(value, "recentPosts").flatMap((entry) => readPost(entry) ?? []),
  };
}

export function createAgendaClient(req: Request, options: { available: boolean }): AgendaBackend {
  const host = { host: true };
  const unavailable = () => new BackendError("agenda_unavailable", "Deze versie van de lokale server heeft nog geen agenda. Werk BonzaiWork bij.", 404);
  const guard = <T>(run: () => Promise<T>): Promise<T> => (options.available ? run() : Promise.reject(unavailable()));
  return {
    settings: () => guard(async () => readSettings(await req("/bonzaiwork/agenda/settings"))),
    setEnabled: (enabled) => guard(async () => void (await req("/bonzaiwork/agenda/settings", { method: "PATCH", body: { enabled }, ...host }))),
    setProjectPost: (projectId, post) => guard(async () => void (await req(`/bonzaiwork/agenda/projects/${enc(projectId)}`, { method: "PUT", body: { bridgePost: post }, ...host }))),
    day: (date) => guard(async () => readDay(await req(`/bonzaiwork/agenda/day${date ? `?date=${enc(date)}` : ""}`), date ?? "")),
    setQuarters: (input) =>
      guard(async () => {
        const result = await req("/bonzaiwork/agenda/quarters", { method: "PUT", body: input, ...host });
        const undoId = str(result, "undoId");
        if (!undoId) throw new BackendError("invalid_response", "De wijziging is niet bevestigd. Ververs de agenda.");
        return { undoId };
      }),
    undo: (undoId) => guard(async () => void (await req(`/bonzaiwork/agenda/undo/${enc(undoId)}`, { method: "POST", ...host }))),
    // A measurement, never awaited by navigation: an older server or a hiccup only loses one signal.
    reportPresence: async (input) => {
      if (!options.available) return;
      const body = {
        workspaceId: input.projectId,
        ...(input.name ? { name: input.name } : {}),
        ...(input.focused === undefined ? {} : { focused: input.focused }),
        ...(input.lastInputAt === undefined ? {} : { lastInputAt: input.lastInputAt }),
      };
      await req("/bonzaiwork/agenda/presence", { method: "POST", body, timeoutMs: 5_000 }).catch(() => undefined);
    },
    bookingDocument: (from, to) =>
      guard(async () => {
        const text = await req(`/bonzaiwork/agenda/booking-doc?from=${enc(from)}&to=${enc(to)}`, { timeoutMs: 60_000 });
        if (typeof text !== "string") throw new BackendError("invalid_response", "Het document kon niet worden gemaakt. Probeer het opnieuw.");
        return text;
      }),
    saveBookingDocument: (from, to) =>
      guard(async () => {
        const saved = await req("/bonzaiwork/agenda/booking-doc/save", { method: "POST", body: { from, to }, timeoutMs: 60_000, ...host });
        const path = str(saved, "path");
        if (!path) throw new BackendError("invalid_response", "Het document is niet opgeslagen. Probeer het opnieuw.");
        return { path };
      }),
  };
}
