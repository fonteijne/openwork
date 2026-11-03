import type { ChatErrorKind } from "~/backend/types";

/**
 * Copy of Vandaag that `src/copy.ts` does not carry yet (brief §10: `copy.home`, `copy.attention`).
 * A later step folds this into `src/copy.ts`; until then the home reads it from here. Verb-first,
 * sentence case, never a model id or a vendor name in a row (C1, C3, C7).
 */
export const homeCopy = {
  /** The failure in the user's words after "Mislukt: " (T2, C6); never a vendor name (C3). */
  failureReason: {
    key_missing: "dit project heeft nog geen key",
    key_rejected: "de key van dit project is geweigerd",
    budget_exceeded: "het budget van de key is op",
    rate_limited: "te veel verzoeken tegelijk",
    litellm_unreachable: "de AI-dienst is niet bereikbaar",
    model_unavailable: "het model is niet beschikbaar voor deze key",
    unknown: "het antwoord is mislukt",
  } satisfies Record<ChatErrorKind, string>,
  /** The fix next to "Opnieuw", where one exists (C6: what happened + the next action). */
  failureFix: {
    key_missing: "Key koppelen",
    key_rejected: "Key vervangen",
    budget_exceeded: "Key bekijken",
    model_unavailable: "Ander model kiezen",
    rate_limited: null,
    litellm_unreachable: null,
    unknown: null,
  } satisfies Record<ChatErrorKind, string | null>,
  /** The agent wants to read another brain (brains plan §5.2); the engine names no file. */
  brainRead: "Een ander brein lezen",
  openRoutine: "Routine openen",
  openBrain: "Brein openen",
  yourBrain: "Jouw brein",
  /** Under a routine run: a chat exists to open. */
  routineChat: "routine",
  /** A finished chat or run with no result sentence yet. */
  finished: "Klaar",
  /** The answer card: numbered choices and their chords. */
  pick: (option: number) => `Kies optie ${option}`,
  /** A brain changed by a colleague: "Sanne: Kortingsbeleid bijgewerkt". */
  brainChange: (author: string, title: string) => `${author}: ${title}`,
  /** The day line of "Je werkdag": "ma 2 nov". */
  seenAll: "Alles gezien",
  seenAllChord: "U",
  keyLocked: "Dit project heeft nog geen key",
  /** Toast after "Opnieuw" on a failed chat (C2). */
  retried: "Opnieuw gestart",
  /** Toast after "Nu uitvoeren" on a routine (C2). */
  routineStarted: "Gestart",
  trustCount: (count: number) => (count === 1 ? "1 onderdeel wacht op jouw akkoord" : `${count} onderdelen wachten op jouw akkoord`),
  conflictFiles: (count: number) => (count === 1 ? "1 notitie" : `${count} notities`),
  busyNow: "Bezig",
  stopped: "Gestopt",
  noPost: "zonder post",
  loadingLabel: "Vandaag laden",
} as const;
