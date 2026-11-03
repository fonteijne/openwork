import { PROJECT_COLORS, type ProjectColor, type ProjectIcon } from "~/backend/types";

/**
 * A project's look (icon + color) from its name (assessment I-5): "offerte" reads as a briefcase
 * in jade, "marketing" as a megaphone in violet. Nothing to recognise: a folder in a color that
 * stays the same for the same name, so the tile does not jump while the person types. Pure, so
 * it tests in node.
 */
export type Look = { icon: ProjectIcon; color: ProjectColor };

export const DEFAULT_LOOK: Look = { icon: "folder", color: "jade" };

const RULES: readonly { test: RegExp; look: Look }[] = [
  { test: /offerte|prijsvoorstel|aanbieding|verkoop|sales|deal/i, look: { icon: "briefcase", color: "jade" } },
  { test: /marketing|campagne|social|nieuwsbrief|webinar|reclame|brand/i, look: { icon: "megaphone", color: "violet" } },
  { test: /klant|service|support|helpdesk|klacht|ticket/i, look: { icon: "users", color: "blue" } },
  { test: /financi|factu|btw|boekhoud|administratie|budget|begroting|kosten/i, look: { icon: "chart", color: "amber" } },
  { test: /website|webtekst|tekst|content|blog|copy|redactie/i, look: { icon: "file-text", color: "pink" } },
  { test: /mail|nieuwsbrief|inbox|correspondentie/i, look: { icon: "mail", color: "cyan" } },
  { test: /planning|agenda|rooster|kalender|evenement|event/i, look: { icon: "calendar", color: "orange" } },
  { test: /juridisch|contract|recht|voorwaarden|privacy|compliance/i, look: { icon: "scale", color: "sage" } },
  { test: /idee|brainstorm|innovatie|strategie|visie/i, look: { icon: "lightbulb", color: "amber" } },
  { test: /code|software|app|ontwikkel|developer|api|data/i, look: { icon: "code", color: "blue" } },
  { test: /notitie|kennis|boek|onderzoek|studie|handboek|wiki/i, look: { icon: "book", color: "violet" } },
  { test: /team|personeel|hr|mensen|collega|werving/i, look: { icon: "users", color: "cyan" } },
];

/** A small stable hash so the same name always lands on the same color. */
function hashOf(text: string): number {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return hash;
}

/** Colors a nameless or unrecognised project can get: everything but sage, which reads as disabled. */
const AUTO_COLORS: readonly ProjectColor[] = PROJECT_COLORS.filter((color) => color !== "sage");

export function suggestLook(name: string): Look {
  const trimmed = name.trim();
  if (!trimmed) return DEFAULT_LOOK;
  const rule = RULES.find((entry) => entry.test.test(trimmed));
  if (rule) return rule.look;
  return { icon: "folder", color: AUTO_COLORS[hashOf(trimmed.toLowerCase()) % AUTO_COLORS.length] ?? DEFAULT_LOOK.color };
}
