/**
 * Copy for the ⌘K palette in the cockpit style (design v2-Palette). The older palette strings
 * (settings crumbs, state words, actions) stay in `copy.palette` and are reused from there.
 */
export const paletteCopy = {
  title: "Zoek of vraag",
  placeholder: "Zoek of vraag iets",
  close: "Sluiten",
  filters: {
    label: "Zoeken in",
    all: "Alles",
    recent: "Laatste 30 dagen",
  },
  groups: {
    do: "Doen",
    waiting: "Wacht op jou",
    work: "Jouw werk",
    library: "Bibliotheek en mail",
    settings: "Instellingen",
  },
  delegate: (query: string) => `Onderzoek delegeren over “${query}”…`,
  delegateEmpty: "Onderzoek delegeren…",
  newProject: "Nieuw project…",
  startChat: (project: string, query: string) => `Begin een chat in ${project}: “${query}”`,
  startChatLocked: "Dit project heeft nog geen key of model",
  ask: (query: string) => `Vraag de Bibliotheek over “${query}”`,
  askDetail: "Het antwoord noemt pagina's die je kunt openen",
  answerTitle: (query: string) => `De Bibliotheek over “${query}”`,
  answerLoading: "De Bibliotheek zoekt een antwoord…",
  answerFailed: "De Bibliotheek gaf geen antwoord. Probeer het zo opnieuw.",
  answerSources: "Bronnen",
  hitKind: {
    project: "Project",
    run: "Run",
    todo: "To-do",
    page: "Bibliotheekpagina",
    mail: "Mail",
    chat: "Chat",
  },
  footer: {
    count: (count: number) => `${count} ${count === 1 ? "resultaat" : "resultaten"}`,
    move: "Omhoog en omlaag om te bewegen",
    open: "Enter om te openen",
    run: "Ctrl of Cmd met Enter om nu uit te voeren",
    close: "Esc om te sluiten",
  },
  noResults: "Niets gevonden. Delegeer het onderzoek of vraag de Bibliotheek.",
  enter: "Enter",
  esc: "Esc",
} as const;
