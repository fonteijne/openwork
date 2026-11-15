import type { Project } from "~/backend/types";

/**
 * The pure part of the "Nieuwe chat" picker (⌘N): which projects it lists, in which order. No
 * React, so it tests in node.
 */

/** The rows that get a ⌘1…⌘9 chord: the first nine, by position. */
export const MAX_ROW_CHORDS = 9;

/** Lower-case without accents, so "financien" finds "Financiën". */
function fold(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

/**
 * The picker's rows: the current project first (so ⌘N ⏎ starts a chat where the person is), then
 * the rest in the order the sidebar lists them. A query keeps the projects whose name or
 * description holds every typed word.
 */
export function pickerProjects(projects: readonly Project[], currentId: string | null, query: string): Project[] {
  const current = currentId ? projects.find((project) => project.id === currentId) : undefined;
  const ordered = current ? [current, ...projects.filter((project) => project.id !== current.id)] : [...projects];
  const tokens = fold(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return ordered;
  return ordered.filter((project) => {
    const haystack = fold(`${project.name} ${project.description ?? ""}`);
    return tokens.every((token) => haystack.includes(token));
  });
}

/** The row a ⌘1…⌘9 keydown chooses, or null: `code` is the physical key ("Digit3"). */
export function rowForDigit(code: string, rows: readonly Project[]): Project | null {
  const match = /^Digit([1-9])$/.exec(code);
  if (!match) return null;
  return rows[Number(match[1]) - 1] ?? null;
}
