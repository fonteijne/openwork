import type { ChatErrorKind } from "~/backend/types";

/**
 * Dutch copy for the chat screen (brief §7, §10). Feature-local until the consolidation step
 * folds it into `src/copy.ts`. Verb-first, sentence case, no engine or routing names (C1, C3, C7).
 */
export const chatCopy = {
  header: {
    back: "Terug",
  },
  composer: {
    /** A permission or question is open: the card is the focal element, not the field (T4). */
    decisionPending: "Beantwoord eerst de vraag hierboven",
    /** The agent is working: a message steers it, ⌘⏎ waits for the end (T5). */
    steer: "Stuur bij: de agent neemt dit mee",
    steerHint: "bijsturen",
    afterHint: "na afloop",
    skills: "Skills",
    skillsTitle: "Skills en commando's",
    noSkills: "Geen skills of commando's in dit project",
    queued: "Wordt verstuurd zodra de agent klaar is",
    cancelQueued: "Annuleren",
  },
  turn: {
    label: "Antwoord",
    /** The fold while a turn runs: earlier steps behind one row (T1). */
    stepsDone: (count: number) => (count === 1 ? "1 stap" : `${count} stappen`),
    worked: (duration: string | null, steps: number) => {
      const count = steps === 1 ? "1 stap" : `${steps} stappen`;
      return duration ? `Gewerkt ${duration} · ${count}` : count;
    },
    /** Stopping is the person's decision, not a failure (C5). */
    stoppedByYou: (duration: string | null, steps: number) => {
      const count = steps === 1 ? "1 stap" : `${steps} stappen`;
      return [`Gestopt door jou`, duration, count].filter(Boolean).join(" · ");
    },
    continue: "Ga verder",
    continuePrompt: "Ga verder waar je gebleven was.",
    declined: "door jou geweigerd",
    stopped: "gestopt",
    failed: "mislukt",
    delivered: "Dit leverde op",
    open: (name: string) => `${name} openen`,
    copy: "Kopieer",
    copied: "Gekopieerd",
    rerun: "Nogmaals met ander model",
    rerunWith: (model: string) => `Nogmaals met ${model}`,
    rerunStarted: "Nogmaals gestart in een kopie",
    retry: "Opnieuw",
    retried: "Opnieuw gestart",
    technicalDetails: "Technische details",
  },
  /** The turn's failure as a sentence with its fix (T2, C3: never a routing name). */
  failure: {
    key_missing: { text: "Dit project heeft nog geen key", action: "Key koppelen" },
    key_rejected: { text: "De key van dit project is geweigerd", action: "Key vervangen" },
    budget_exceeded: { text: "Het budget van de key is op", action: "Budget verhogen" },
    rate_limited: { text: "De server krijgt even te veel verzoeken", action: "Opnieuw" },
    litellm_unreachable: { text: "De server is niet bereikbaar", action: "Opnieuw" },
    model_unavailable: { text: "Dit model is niet beschikbaar voor deze key", action: "Ander model kiezen" },
    unknown: { text: "Het antwoord is mislukt", action: "Opnieuw" },
  } satisfies Record<ChatErrorKind, { text: string; action: string }>,
  /** Common step failures with the next action; the raw text stays under "Technische details". */
  stepFix: {
    locked: "Ontgrendel het bestand en probeer het opnieuw",
    missing: "Controleer of het bestand nog bestaat",
    access: "Geef BonzaiWork toegang tot deze map",
    signIn: (service: string | null) => (service ? `Log opnieuw in bij ${service}` : "Log opnieuw in bij de connectie"),
    timeout: "Probeer het later opnieuw",
    tooLarge: "Kies een kleiner bestand of een deel ervan",
  },
} as const;
