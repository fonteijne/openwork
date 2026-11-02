/** Small, cast-free readers for JSON from disk and from requests (like routines.ts). */
export type Json = Record<string, unknown>;

export const record = (value: unknown): Json | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null);

export const text = (value: unknown, key: string): string | null => {
  const found = record(value)?.[key];
  return typeof found === "string" ? found : null;
};

export const finite = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

export const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
