import { projectsCopy } from "~/copy/projects";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** `[[let op: …]]` becomes a `<mark>` (a dashed warning chip), `++…++` an `<ins>`; the text inside is escaped. */
export function markRunText(source: string): string {
  return source
    .replace(/\[\[\s*let op:\s*([^\]]+?)\s*\]\]/gi, (_match, text: string) => `<mark><span class="sr-only">${escapeHtml(projectsCopy.run.flag)}: </span>${escapeHtml(text)}</mark>`)
    .replace(/\+\+([^+\n]+?)\+\+/g, (_match, text: string) => `<ins><span class="sr-only">${escapeHtml(projectsCopy.run.added)}: </span>${escapeHtml(text)}</ins>`);
}
