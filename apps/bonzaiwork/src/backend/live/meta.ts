import { PROJECT_COLORS, PROJECT_ICONS, type ProjectColor, type ProjectIcon } from "../types";
import { readLocalJson, writeLocalJson } from "~/lib/storage";

import { enc, request, type Connection } from "./http";
import { field, items, list, num, rec, str, strings } from "./read";

/**
 * ProjectMeta from frontend-contract §7.1: what a workspace lacks to be a
 * project (description, color, pins, archive, chat notes). Stored by the
 * server once `/bonzaiwork/projects` exists, until then on this device, so the
 * screens work today and move to the server without changing.
 */
export type ProjectMeta = {
  description: string | null;
  color: ProjectColor | null;
  icon: ProjectIcon | null;
  pinned: boolean;
  archivedAt: number | null;
  pinnedChatIds: string[];
  archivedChatIds: string[];
  chatNotes: Record<string, string>;
  allowedModels: string[] | null;
};

export const EMPTY_META: ProjectMeta = {
  description: null,
  color: null,
  icon: null,
  pinned: false,
  archivedAt: null,
  pinnedChatIds: [],
  archivedChatIds: [],
  chatNotes: {},
  allowedModels: null,
};

function isColor(value: unknown): value is ProjectColor {
  return PROJECT_COLORS.some((color) => color === value);
}

function isIcon(value: unknown): value is ProjectIcon {
  return PROJECT_ICONS.some((icon) => icon === value);
}

export function readMeta(value: unknown): ProjectMeta {
  const notes = rec(field(value, "chatNotes")) ?? {};
  const allowed = field(value, "allowedModels");
  const color = field(value, "color");
  const icon = field(value, "icon");
  return {
    description: str(value, "description") ?? null,
    color: isColor(color) ? color : null,
    icon: isIcon(icon) ? icon : null,
    pinned: field(value, "pinned") === true,
    archivedAt: num(value, "archivedAt") ?? null,
    pinnedChatIds: strings(field(value, "pinnedChatIds")),
    archivedChatIds: strings(field(value, "archivedChatIds")),
    chatNotes: Object.fromEntries(Object.entries(notes).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
    allowedModels: Array.isArray(allowed) ? strings(allowed) : null,
  };
}

export interface MetaStore {
  readonly where: "server" | "device";
  all(): Promise<Map<string, ProjectMeta>>;
  get(projectId: string): Promise<ProjectMeta>;
  patch(projectId: string, patch: Partial<ProjectMeta>): Promise<ProjectMeta>;
  remove(projectId: string): Promise<void>;
}

const DEVICE_KEY = "bonzaiwork.meta.v1";

export function deviceMetaStore(scope: string): MetaStore {
  const key = `${DEVICE_KEY}.${scope}`;
  const load = (): Record<string, unknown> => rec(readLocalJson(key)) ?? {};
  return {
    where: "device",
    async all() {
      return new Map(Object.entries(load()).map(([id, value]) => [id, readMeta(value)]));
    },
    async get(projectId) {
      return readMeta(load()[projectId] ?? EMPTY_META);
    },
    async patch(projectId, patch) {
      const stored = load();
      const next = { ...readMeta(stored[projectId] ?? EMPTY_META), ...patch };
      writeLocalJson(key, { ...stored, [projectId]: next });
      return next;
    },
    async remove(projectId) {
      const { [projectId]: _removed, ...rest } = load();
      writeLocalJson(key, rest);
    },
  };
}

export function serverMetaStore(connection: Connection): MetaStore {
  return {
    where: "server",
    async all() {
      const payload = await request(connection, "/bonzaiwork/projects");
      const result = new Map<string, ProjectMeta>();
      for (const entry of items(payload).length ? items(payload) : list(payload, "projects")) {
        const id = str(entry, "workspaceId") ?? str(entry, "id");
        if (id) result.set(id, readMeta(rec(field(entry, "meta")) ?? entry));
      }
      return result;
    },
    async get(projectId) {
      const payload = await request(connection, `/bonzaiwork/projects/${enc(projectId)}`);
      return readMeta(rec(field(payload, "meta")) ?? payload);
    },
    async patch(projectId, patch) {
      const payload = await request(connection, `/bonzaiwork/projects/${enc(projectId)}`, { method: "PATCH", body: patch });
      return readMeta(rec(field(payload, "meta")) ?? payload);
    },
    async remove() {
      // The server drops metadata together with the workspace.
    },
  };
}
