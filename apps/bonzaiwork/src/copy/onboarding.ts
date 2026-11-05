/**
 * Copy for the first start (#/welkom) in the cockpit design: a step frame of five, the model
 * service as the finished first step, the first project with its key as the current one.
 */
export const onboardingCopy = {
  setupNote: "Instellen · alles is later te wijzigen bij Instellingen",
  progress: (current: number, total: number) => `Stap ${current} van ${total}`,
  titleBefore: "Zet je ",
  titleAccent: "werkplek",
  titleAfter: " klaar.",
  lead: "Werkt naast je mail, je agenda en de programma's die je al gebruikt. Het vervangt ze niet.",
  now: "nu",
  done: "klaar",
  steps: {
    service: "Modeldienst",
    project: "Eerste project en key",
    projectUser: "Je key en eerste project",
    library: "Bibliotheek",
    mail: "Mail en agenda",
    capture: "Snel vastleggen",
  },
  serviceDone: "1. Modeldienst: ingesteld",
  serviceProjectKeys: "Centraal ingesteld voor het team. Elk project krijgt in deze stap zijn eigen key.",
  serviceUserKey: "Centraal ingesteld voor het team. Je persoonlijke key koppel je in deze stap; die gebruikt elk project.",
  serviceUserLinked: (hint: string) => `Centraal ingesteld voor het team. Je persoonlijke key ${hint} is gekoppeld.`,
  stepEyebrow: (step: number) => `Stap ${step}`,
  lead2: "Een project houdt je chats, bestanden en runs voor één klant of onderwerp bij elkaar. Je maakt er later makkelijk meer.",
  required: "Nodig om te beginnen. De volgende stappen kun je overslaan.",
  nextTitle: "Daarna: 3. Bibliotheek",
  optional: "Optioneel",
  nextLead: "Kies welke planken je agent mag lezen. Dat kan wanneer je wilt, vanuit de Bibliotheek.",
  nextLines: [
    { kind: "allow", strong: "Lezen", text: " van Alleen jij en Iedereen in het team" },
    { kind: "allow", strong: "Klantplanken", text: " één voor één openen, alleen die je al kunt lezen" },
    { kind: "ask", strong: "Voorstellen", text: " aan een gedeelde plank, pas na jouw goedkeuring" },
    { kind: "deny", strong: "Nooit", text: " iets van een plank verwijderen" },
  ],
  then: "Dan: mail en agenda koppelen als je in de pilot zit, en één sneltoets om alles snel vast te leggen.",
} as const;
