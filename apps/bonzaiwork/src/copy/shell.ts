/**
 * Copy for the cockpit shell: the top navigation, the status line and the phone's tab bar.
 * Each cockpit area keeps its copy in its own module under `src/copy/`; `copy.test.ts` checks all.
 */
export const shellCopy = {
  nav: {
    label: "Hoofdnavigatie",
    today: "Vandaag",
    agent: "Agent",
    inbox: "Inbox",
    projects: "Projecten",
    runs: "Runs",
    library: "Bibliotheek",
    capture: "Vastleggen",
    todayBadge: (count: number) => `Vandaag, ${count} ${count === 1 ? "beslissing wacht" : "beslissingen wachten"} op jou`,
    inboxBadge: (count: number) => `Inbox, ${count} te sorteren`,
    search: "Zoek of vraag",
    searchLabel: "Zoeken of een opdracht geven",
    activity: "Activiteit",
    settings: "Instellingen",
    account: "Jouw menu",
    menu: "Menu openen",
    demo: "Demo",
    demoHint: "Voorbeeldgegevens in deze browser. Er gaat niets naar een server.",
    agenda: "Agenda bijhouden",
    theme: "Weergave",
    you: "Jij",
  },
  status: {
    label: "Status",
  },
} as const;
