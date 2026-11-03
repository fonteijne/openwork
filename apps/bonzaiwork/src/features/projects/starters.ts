import type { Look } from "./look";

/**
 * Starters (assessment I-4, brief §6/§10): a chip under the name that seeds a name suggestion, a
 * look and the project's instructions. Client data only; nothing a template route would add.
 */
export type StarterId = "offertes" | "klantenservice" | "marketing" | "financien";

export type Starter = {
  id: StarterId;
  /** The chip's word and the suggested project name. */
  name: string;
  look: Look;
  /** Seeds the project's AGENTS.md; the person can change it under "Meer" or later in Agent. */
  instructions: string;
};

export const STARTERS: readonly Starter[] = [
  {
    id: "offertes",
    name: "Offertes",
    look: { icon: "briefcase", color: "jade" },
    instructions: [
      "Dit project gaat over offertes en prijsvoorstellen voor klanten.",
      "Schrijf zakelijk en in de u-vorm. Noem bedragen exclusief btw en rond af op hele euro's.",
      "Bewaar elke offerte als een eigen Markdown-bestand met de klantnaam en de datum in de bestandsnaam.",
    ].join("\n"),
  },
  {
    id: "klantenservice",
    name: "Klantenservice",
    look: { icon: "users", color: "blue" },
    instructions: [
      "Dit project gaat over antwoorden op klantvragen en klachten.",
      "Schrijf vriendelijk, kort en concreet. Benoem eerst wat de klant krijgt, dan wat we van de klant nodig hebben.",
      "Beloof nooit een korting of vergoeding zonder dat ik dat heb goedgekeurd.",
    ].join("\n"),
  },
  {
    id: "marketing",
    name: "Marketing",
    look: { icon: "megaphone", color: "violet" },
    instructions: [
      "Dit project gaat over nieuwsbrieven, social posts en campagnes.",
      "Schrijf in de je-vorm, actief en zonder jargon. Houd posts onder de 280 tekens, tenzij ik anders vraag.",
      "Geef bij elke tekst twee varianten: een korte en een langere.",
    ].join("\n"),
  },
  {
    id: "financien",
    name: "Financiën",
    look: { icon: "chart", color: "amber" },
    instructions: [
      "Dit project gaat over facturen, btw-aangiftes en de maandafsluiting.",
      "Werk met bedragen in euro's en noem altijd of een bedrag inclusief of exclusief btw is.",
      "Zet bij elke berekening de bron (bestand en regel) erbij, zodat ik het kan controleren.",
    ].join("\n"),
  },
];

export function starterById(id: string | null): Starter | null {
  return STARTERS.find((starter) => starter.id === id) ?? null;
}
