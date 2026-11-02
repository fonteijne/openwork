import { parseBridgePost } from "./bridge.ts";
import { keyStart } from "./clock.ts";
import { finite, list, record, text } from "./json.ts";
import type { AgendaDay, AgendaProject, AgendaSettings, BridgePost, ChatRef, Correction, Measured, QuarterRecord } from "./types.ts";

/** Readers for what is on disk and what comes in: anything unexpected is dropped, never trusted. */

export const NOTE_MAX = 500;
export const REFERENCE_MAX = 120;
export const OTHER_LABEL_MAX = 120;
export const CHAT_TITLE_MAX = 200;
export const PROJECT_NAME_MAX = 120;

export const defaultSettings = (): AgendaSettings => ({ version: 1, enabled: true, projects: {}, recentPosts: [] });
export const emptyDay = (date: string): AgendaDay => ({ version: 1, date, quarters: {}, undo: {} });

const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();

/** A label for an "other" quarter: one line, 1–120 characters. */
export function parseOtherLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const label = oneLine(value);
  return label && label.length <= OTHER_LABEL_MAX ? label : null;
}

export function parseCorrection(value: unknown): Correction | null {
  const kind = text(value, "kind");
  if (kind === "away") return { kind };
  if (kind === "project") {
    const workspaceId = text(value, "workspaceId")?.trim();
    return workspaceId ? { kind, workspaceId } : null;
  }
  if (kind === "other") {
    const label = parseOtherLabel(record(value)?.label);
    const rawPost = record(value)?.bridgePost;
    const bridgePost = rawPost === null || rawPost === undefined ? null : parseBridgePost(rawPost);
    if (!label || (rawPost !== null && rawPost !== undefined && !bridgePost)) return null;
    return { kind, label, bridgePost };
  }
  return null;
}

/** Text up to `max` characters, trimmed; empty is null. Undefined when the value is not acceptable. */
export function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length > max) return undefined;
  return trimmed || null;
}

function numbers(value: unknown): Record<string, number> {
  return Object.fromEntries(Object.entries(record(value) ?? {}).flatMap(([key, entry]) => {
    const number = finite(entry);
    return number !== null && number >= 0 ? [[key, number]] : [];
  }));
}

function chats(value: unknown): Record<string, ChatRef[]> {
  return Object.fromEntries(Object.entries(record(value) ?? {}).map(([workspaceId, entries]) => [workspaceId, list(entries).flatMap((entry): ChatRef[] => {
    const id = text(entry, "id");
    return id ? [{ id, title: text(entry, "title")?.slice(0, CHAT_TITLE_MAX) ?? null }] : [];
  })]));
}

function parseMeasured(value: unknown): Measured | null {
  const found = record(value);
  if (!found) return null;
  return { scores: numbers(found.scores), lastActivity: numbers(found.lastActivity), chats: chats(found.chats), appOpen: found.appOpen === true };
}

export function parseQuarterRecord(value: unknown, date: string): QuarterRecord | null {
  const key = text(value, "key");
  const start = key && key.startsWith(`${date}T`) ? keyStart(key) : null;
  if (!key || start === null) return null;
  const found = record(value);
  const correctionValue = record(found?.correction);
  const correction = correctionValue ? parseCorrection(correctionValue) : null;
  return {
    key,
    start,
    measured: parseMeasured(found?.measured),
    correction: correction ? { ...correction, at: finite(correctionValue?.at) ?? 0 } : null,
    note: optionalText(found?.note, NOTE_MAX) ?? null,
    reference: optionalText(found?.reference, REFERENCE_MAX) ?? null,
  };
}

export function parseDay(value: unknown, date: string): AgendaDay {
  const found = record(value);
  const quarters: AgendaDay["quarters"] = {};
  for (const entry of Object.values(record(found?.quarters) ?? {})) {
    const parsed = parseQuarterRecord(entry, date);
    if (parsed) quarters[parsed.key] = parsed;
  }
  const undo: AgendaDay["undo"] = {};
  for (const [undoId, changes] of Object.entries(record(found?.undo) ?? {})) {
    undo[undoId] = list(changes).flatMap((change) => {
      const key = text(change, "key");
      if (!key || keyStart(key) === null) return [];
      const before = record(change)?.before;
      return [{ key, before: before === null || before === undefined ? null : parseQuarterRecord(before, date) }];
    });
  }
  return { version: 1, date, quarters, undo };
}

export function parseSettings(value: unknown): AgendaSettings {
  const found = record(value);
  const projects: Record<string, AgendaProject> = {};
  for (const [workspaceId, entry] of Object.entries(record(found?.projects) ?? {})) {
    const name = text(entry, "name");
    projects[workspaceId] = { name: name ? oneLine(name).slice(0, PROJECT_NAME_MAX) || null : null, bridgePost: parseBridgePost(record(entry)?.bridgePost) };
  }
  const recentPosts = list(found?.recentPosts).flatMap((entry): BridgePost[] => {
    const post = parseBridgePost(entry);
    return post ? [post] : [];
  }).slice(0, 10);
  return { version: 1, enabled: found?.enabled !== false, projects, recentPosts };
}
