/**
 * Copy for Activity: the audit log of who did what, and the sent log of everything that left the
 * app. Entries come from the backend; this table holds the frame around them.
 */
export const activityCopy = {
  title: "Activiteit",
  heroBefore: "Wat er gebeurde, en ",
  heroAccent: "wie",
  heroAfter: " het deed.",
  lead: "Alles wat jij, de agent en de app deden, en waar het op gebaseerd was. Regels kunnen niet worden aangepast of verwijderd.",
  exportCsv: "Exporteren als CSV",
  exported: (count: number) => `${count} ${count === 1 ? "regel" : "regels"} geëxporteerd`,
  exportEmpty: "Er is niets om te exporteren met deze filters.",
  viewLabel: "Weergave",
  viewAll: "Alle activiteit",
  viewSent: "Verstuurd vanuit de app",
  whoLabel: "Wie",
  who: { all: "Iedereen", you: "Jij", agent: "De agent", colleague: "Collega's", app: "De app" },
  loading: "Activiteit laden",
  locked: "Activiteit",

  // The unknown outcome
  unknownEyebrow: (id: string) => `Uitkomst onbekend · ${id}`,
  unknownTitle: (target: string) => `Is je bericht ${target} aangekomen?`,
  unknownBody: (when: string) => `De verbinding met Outlook viel weg tijdens het versturen, ${when}. De app probeert het pas opnieuw als jij hebt gecontroleerd.`,
  checkOutlook: "Controleren in Outlook",
  resolveQuestion: "Kijk in Verzonden items van Outlook. Wat zie je?",
  resolveSent: "Hij is verstuurd",
  resolveNotSent: "Niet verstuurd",
  resolveLater: "Later",
  resolvedSent: "Bevestigd: verstuurd. Er wordt niets opnieuw verstuurd.",
  resolvedNotSent: "Bevestigd: niet verstuurd. Opnieuw versturen vraagt een nieuwe goedkeuring.",
  openRun: (runId: string) => `Naar de onderbroken run ${runId}`,

  // The sent log
  sentTitle: "Verstuurd vanuit de app",
  sentCount: "nieuwste eerst",
  sentLead: "Alles wat de app verliet of collega's bereikte, en wie het goedkeurde.",
  sentEmpty: "Nog niets verstuurd",
  sentEmptyBody: "Alles wat de app verstuurt of publiceert komt hier, met wie het goedkeurde en wat er gebeurde. Zonder jouw goedkeuring gaat er niets weg.",
  sentEmptyFiltered: "Niets verstuurd door wie je kiest",
  kind: { email: "e-mail", library: "bibliotheek", calendar: "agenda" },
  status: {
    held: "Wordt verstuurd",
    sent: "Verstuurd",
    published: "Gepubliceerd",
    unknown: "Uitkomst onbekend",
    undone: "Ongedaan gemaakt",
    declined: "Afgewezen",
    accepted: "Toegevoegd",
  },
  heldIn: (seconds: number) => `Wordt verstuurd over ${seconds} s`,
  whatHappened: "Wat er gebeurde",
  showSteps: "Wat er gebeurde tonen",
  hideSteps: "Verbergen",
  cannotUnsend: "Een verzonden mail kan niet worden teruggehaald.",
  sendCorrection: "Een correctie sturen",
  columns: { what: "Wat", to: "Aan of voor wie", status: "Status", who: "Wie besliste" },

  // All activity
  allTitle: "Alles wat er gebeurde",
  allCount: (count: number) => `${count} ${count === 1 ? "regel" : "regels"}`,
  allEmpty: "Nog geen activiteit",
  allEmptyBody: "Zodra jij, een agent of de app iets doet, staat het hier, met waar het op gebaseerd was.",
  allEmptyFiltered: "Niets van wie je kiest",
  allEmptyFilteredBody: "Kies Iedereen om alle activiteit te zien.",
  basis: (text: string) => `Op basis van: ${text}`,
  openRunShort: (runId: string) => runId,
  noProject: "Geen project",

  csv: {
    allHeader: ["Tijd", "Wie", "Wat", "Gebaseerd op", "Project", "Run"],
    sentHeader: ["Id", "Wat", "Soort", "Aan", "Tweede regel", "Status", "Besloten door", "Tijd"],
    fileAll: "activiteit",
    fileSent: "verzonden",
  },
} as const;
