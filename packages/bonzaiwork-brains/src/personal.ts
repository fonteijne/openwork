import { lstat, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, posix, relative, resolve, sep } from "node:path";

import { ALWAYS_EXCLUDED_FOLDERS } from "./trust.ts";

/**
 * The personal brain (plan §5.1): one per user, a folder that stays where it
 * is, whose instructions count in every chat of every project.
 */

/**
 * Folders a cloud service syncs: BonzaiWork then never adds a remote of its
 * own (plan §5.1.1, "Bestaande sync blijft van de gebruiker").
 */
export function isCloudFolder(path: string, home = homedir()): boolean {
  const normal = resolve(path).split(sep).join("/").toLowerCase();
  const base = home.split(sep).join("/").toLowerCase();
  const inside = (folder: string) => normal === folder || normal.startsWith(`${folder}/`);
  return inside(`${base}/library/mobile documents`)
    || inside(`${base}/library/cloudstorage`)
    || /\/(onedrive|dropbox|google drive|icloud ?drive)( [^/]*)?(\/|$)/.test(normal);
}

/** BonzaiWork's own rules (plan §6.6): not in any repository, so a team cannot remove them. */
export const APP_RULES = `# Werken in BonzaiWork

- BonzaiWork haalt vóór je beurt de nieuwste versie van een brein op en deelt je wijzigingen erna. Voer zelf nooit git uit en schrijf niets in een map \`.git\`.
- Teamkennis hoort in het projectbrein, persoonlijke voorkeuren in het persoonlijke brein. Weet je niet waar iets hoort, vraag het.
- Leer je een voorkeur van de gebruiker ("samenvattingen altijd in drie punten"), stel hem dan voor met \`voorkeur_voorstellen\`; schrijf hem niet zelf in \`_meta/voorkeuren.md\`.
- Notities in het persoonlijke brein lees en schrijf je met de \`persoonlijk_brein_*\`-tools, alleen Markdown. Bewerk per passage en geef de versie mee die je las.
- Kijk alleen in een ander brein als de gebruiker erom vraagt. Denk je dat een ander brein helpt, stel het dan in één zin voor en wacht op antwoord.
- Zet nooit wachtwoorden, sleutels of privégegevens van personen in een brein.
`;

/** N6: what goes into every chat, at most. */
export const PERSONAL_INSTRUCTIONS_LIMIT = 32 * 1024;

export const PREFERENCES_FILE = "_meta/voorkeuren.md";

export type GlobalInstructions = { text: string; personalBytes: number; truncated: boolean };

/** App rules plus the personal `AGENTS.md` and preferences, cut at N6 rather than dropped. */
export async function composeInstructions(personalRoot: string | null): Promise<GlobalInstructions> {
  if (!personalRoot) return { text: APP_RULES, personalBytes: 0, truncated: false };
  const read = (path: string) => readFile(join(personalRoot, path), "utf8").catch(() => "");
  const parts = [await read("AGENTS.md"), await read(PREFERENCES_FILE)].map((part) => part.trim()).filter(Boolean);
  let personal = parts.join("\n\n");
  const personalBytes = Buffer.byteLength(personal);
  const truncated = personalBytes > PERSONAL_INSTRUCTIONS_LIMIT;
  if (truncated) {
    personal = Buffer.from(personal).subarray(0, PERSONAL_INSTRUCTIONS_LIMIT).toString("utf8").replace(/�+$/, "");
    personal += "\n\n[Ingekort: de persoonlijke instructies zijn groter dan 32 KiB. Vraag de gebruiker ze in te korten.]";
  }
  const text = personal ? `${APP_RULES}\n# Persoonlijke instructies van de gebruiker\n\n${personal}\n` : APP_RULES;
  return { text, personalBytes, truncated };
}

export type PathCheck = { ok: true; path: string; absolute: string } | { ok: false; reason: string };

/**
 * A path the brain tools may use (plan §7.3): Markdown only, inside the
 * brain, not through a link that points outside, never `.git`, the inbox or
 * an excluded folder.
 */
export async function brainPath(root: string, requested: string, excluded: readonly string[]): Promise<PathCheck> {
  const cleaned = requested.trim().replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (!cleaned || isAbsolute(cleaned) || /^[a-z]:/i.test(cleaned)) return { ok: false, reason: "Gebruik een pad binnen het brein, bijvoorbeeld knowledge/index.md." };
  const path = posix.normalize(cleaned);
  if (path === ".." || path.startsWith("../")) return { ok: false, reason: "Dit pad valt buiten het brein." };
  if (!/\.md$/i.test(path)) return { ok: false, reason: "Alleen Markdown-bestanden (.md)." };
  const segments = path.split("/");
  const blocked = [...ALWAYS_EXCLUDED_FOLDERS, ...excluded].map((folder) => folder.replace(/^\/+|\/+$/g, "").toLowerCase());
  if (segments.some((segment) => segment.toLowerCase() === ".git")
    || path.toLowerCase().startsWith(".opencode/openwork/inbox/")
    || blocked.some((folder) => folder && (path.toLowerCase() === folder || path.toLowerCase().startsWith(`${folder}/`)))) {
    return { ok: false, reason: "Deze map is uitgesloten; daar lees of schrijf je niet." };
  }
  const base = await realpath(root);
  const absolute = join(base, ...segments);
  // The nearest existing part decides: a link anywhere on the way must stay inside.
  let probe = absolute;
  while (!(await lstat(probe).catch(() => null))) {
    const parent = resolve(probe, "..");
    if (parent === probe) break;
    probe = parent;
  }
  const real = await realpath(probe).catch(() => probe);
  const inside = relative(base, real);
  if (inside.startsWith("..") || isAbsolute(inside)) return { ok: false, reason: "Dit pad wijst naar buiten het brein." };
  return { ok: true, path, absolute };
}
