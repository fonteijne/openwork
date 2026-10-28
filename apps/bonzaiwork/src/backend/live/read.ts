/** Readers for untrusted JSON, without casts (OpenWork AGENTS.md: no `as`). */

export type Json = Record<string, unknown>;

export function rec(value: unknown): Json | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null;
}

export function field(value: unknown, key: string): unknown {
  return rec(value)?.[key];
}

export function str(value: unknown, key: string): string | undefined {
  const found = field(value, key);
  return typeof found === "string" ? found : undefined;
}

export function num(value: unknown, key: string): number | undefined {
  const found = field(value, key);
  return typeof found === "number" && Number.isFinite(found) ? found : undefined;
}

export function bool(value: unknown, key: string): boolean | undefined {
  const found = field(value, key);
  return typeof found === "boolean" ? found : undefined;
}

export function list(value: unknown, key?: string): unknown[] {
  const found = key === undefined ? value : field(value, key);
  return Array.isArray(found) ? found : [];
}

export function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** Native v2 wraps payloads in `{ data }`; older routes return them bare. */
export function data(value: unknown): unknown {
  const record = rec(value);
  return record && "data" in record ? record.data : value;
}

export function items(value: unknown): unknown[] {
  const inner = data(value);
  return Array.isArray(inner) ? inner : list(value, "items");
}
