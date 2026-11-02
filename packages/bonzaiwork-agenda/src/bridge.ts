import { record, text } from "./json.ts";
import type { BridgePost } from "./types.ts";

/**
 * Bridge posts (plan §2.6). The format of an entity id is not known yet (B1): free text, 1–64
 * characters, no spaces or line breaks. This is the one place to add a pattern later.
 */
const ENTITY_ID = /^\S{1,64}$/;
export const POST_LABEL_MAX = 120;
export const RECENT_POSTS_MAX = 10;

export function validEntityId(value: string): boolean {
  return ENTITY_ID.test(value);
}

/** A valid post from untrusted input, or null. The id is trimmed; an empty label is no label. */
export function parseBridgePost(value: unknown): BridgePost | null {
  const entityId = text(value, "entityId")?.trim() ?? "";
  if (!validEntityId(entityId)) return null;
  const rawLabel = record(value)?.label;
  if (rawLabel !== undefined && rawLabel !== null && typeof rawLabel !== "string") return null;
  const label = typeof rawLabel === "string" ? rawLabel.replace(/\s+/g, " ").trim() : "";
  if (label.length > POST_LABEL_MAX) return null;
  return { entityId, label: label || null };
}

export const samePost = (a: BridgePost | null, b: BridgePost | null) => (a?.entityId ?? null) === (b?.entityId ?? null);

/** The recent posts with `post` in front: at most ten, one per entity id, the newest label wins. */
export function rememberPost(recent: readonly BridgePost[], post: BridgePost): BridgePost[] {
  return [post, ...recent.filter((entry) => entry.entityId !== post.entityId)].slice(0, RECENT_POSTS_MAX);
}
