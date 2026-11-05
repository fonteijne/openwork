import type {
  ActivityEntry,
  AgentSettings,
  Approval,
  Area,
  AwayGroup,
  CalendarEvent,
  InboxItem,
  LibraryPage,
  LibraryProposal,
  LibraryRequest,
  OutboundEntry,
  Person,
  ProjectBrief,
  Run,
  Shelf,
  Todo,
  WaitingFor,
  Werkwijze,
} from "../cockpit";

/**
 * The cockpit's demo story, told around the demo's own projects (seed.ts): a small agency that
 * writes quotes for Bakkerij Van Dijk, runs a customer-service desk and keeps its finances. Every
 * name is fictional. Times are relative to "now" so the story always reads as today.
 */

export const P = {
  offertes: "p-offertes",
  marketing: "p-marketing",
  service: "p-service",
  finance: "p-finance",
  website: "p-website",
  personal: "p-mijn-brein",
  verhuizing: "p-verhuizing",
} as const;

export const TEAM = "het team";

export const PEOPLE = {
  lars: { name: "Lars van Dijk", address: "lars@bakkerijvandijk.example", org: "Extern", external: true },
  fleur: { name: "Fleur Jansen", address: "fleur@noordlicht.example", org: "Team", external: false },
  ruben: { name: "Ruben de Boer", address: "ruben@noordlicht.example", org: "Team", external: false },
  linde: { name: "Marieke Smit", address: "reserveringen@hoteldelinde.example", org: "Extern", external: true },
} satisfies Record<string, Person>;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** A local time `days` from today at hh:mm. */
export function dayAt(now: number, days: number, hour: number, minute = 0): number {
  const date = new Date(now);
  date.setHours(hour, minute, 0, 0);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

/** Days from today to the next given weekday (1 = Monday), at least 1. */
function untilWeekday(now: number, weekday: number): number {
  const today = new Date(now).getDay();
  const diff = (weekday - today + 7) % 7;
  return diff === 0 ? 7 : diff;
}

export type CockpitState = {
  version: 1;
  seededAt: number;
  todos: Todo[];
  waiting: WaitingFor[];
  inbox: InboxItem[];
  runs: Run[];
  approvals: Approval[];
  sent: OutboundEntry[];
  activity: ActivityEntry[];
  shelves: Shelf[];
  pages: LibraryPage[];
  requests: LibraryRequest[];
  proposals: LibraryProposal[];
  areas: Area[];
  briefs: ProjectBrief[];
  calendar: CalendarEvent[];
  agent: AgentSettings;
  werkwijzen: Werkwijze[];
  lastSeenAt: number;
  planCommittedAt: number | null;
};

const COMPARISON_NOTE = `## Onderhoud voor Bakkerij Van Dijk: drie opties

Alle drie de opties houden de service binnen 24 uur, zoals afgesproken in B-007. Ze verschillen vooral in wie de onderdelen beheert en hoe de kosten meegroeien met het aantal ovens.

1. **Volledig onderhoudscontract via de leverancier.** Snelst te regelen; de leverancier doet ook de updates van de besturing. Indicatie [prijsbereik uit bron 2]. [[let op: ik weet niet zeker of deze prijs actueel is: de bron is van maart 2026]]
2. **Basiscontract met losse storingsdienst.** Past als de bakkerij ook de koelcellen wil laten meenemen. Indicatie [prijsbereik uit bron 4].
3. **Eigen monteur met een onderdelenpakket.** Laagste vaste kosten; vraagt iemand die planning en voorraad bijhoudt. ++Zonder opties die een eigen werkplaats vragen, zoals afgesproken in stap 1.++

9 bronnen geciteerd · 3 intern, 6 van het web`;

const PREVIOUS_NOTE = `## Onderhoud voor Bakkerij Van Dijk: opties

1. **Volledig onderhoudscontract.** Indicatie [prijsbereik].
2. **Basiscontract.** Indicatie [prijsbereik].
3. **Eigen monteur.** Indicatie [prijsbereik].`;

const DECISIONS_NOTE = `### Besluiten

- Alleen leveranciers met service binnen 24 uur, in lijn met B-007.
- De offerte gaat over de ovens en de koelcellen; geen kassasystemen.
- De keuze valt in het overleg van 12 november.

### Actiepunten

| Wie | Wat | Wanneer |
| --- | --- | --- |
| Jij | Het optie-overzicht sturen | ma 9 nov |
| Fleur Jansen | De agenda van het overleg delen | di 10 nov |
| Ruben de Boer | De testomgeving voor de planning klaarzetten | vr 13 nov |
| Lars van Dijk | Toegang geven tot de onderhoudshistorie | [[let op: geen datum]] |`;

const REPLY_BODY = `Hoi Lars,

Zoals beloofd drie opties voor het onderhoud van jullie ovens, met een indicatie van de maandkosten:

1. Volledig onderhoudscontract via de leverancier: [prijsbereik]. Het snelst te regelen. [[let op: ik weet niet zeker of deze prijs actueel is: de bron is van maart 2026]]
2. Basiscontract met losse storingsdienst: [prijsbereik]. Handig als jullie ook de koelcellen willen meenemen.
3. Eigen monteur met een onderdelenpakket: [prijsbereik]. De laagste vaste kosten; vraagt iemand die de planning bijhoudt.

Alle drie houden de service binnen 24 uur. Ik stel voor dat we er een kiezen in het overleg van 12 november.

Met vriendelijke groet,`;

const LARS_MAIL = `Hoi, bedankt voor het gesprek van vorige week. Voor het onderhoudscontract: kun je ons voor maandag 2 tot 3 opties sturen met een ruwe indicatie van de kosten? Dan bespreken we ze in het overleg.

Groet, Lars`;

export function createCockpitSeed(now: number): CockpitState {
  const monday = untilWeekday(now, 1);
  const tuesday = untilWeekday(now, 2);
  const wednesday = untilWeekday(now, 3);
  const thursday = untilWeekday(now, 4);
  const friday = untilWeekday(now, 5);

  const shelves: Shelf[] = [
    {
      id: "s-mine",
      name: "Alleen jij",
      audience: "personal",
      tag: "Persoonlijk",
      description: "Je eigen notities, en alles wat agents voor je maken. Niemand anders ziet het.",
      newest: "Nieuwste: onderhoudsopties, uit RUN-0417, vandaag",
      projectId: null,
    },
    {
      id: "s-vandijk",
      name: "Team Van Dijk",
      audience: "team",
      tag: "Klant: Bakkerij Van Dijk",
      description: "Gedeeld met de collega's op het account Van Dijk. Klantgegevens blijven op deze plank.",
      newest: "Nieuwste: B-007 service binnen 24 uur, gecontroleerd door Fleur",
      projectId: P.offertes,
    },
    {
      id: "s-team",
      name: `Iedereen in ${TEAM}`,
      audience: "everyone",
      tag: "Team",
      description: "Checklists, werkinstructies en besluiten voor alle collega's. Elke pagina heeft een eigenaar die hem actueel houdt.",
      newest: "Nieuwste: checklist privacy klantgegevens, opnieuw gecontroleerd 4 nov",
      projectId: null,
    },
  ];

  const pages: LibraryPage[] = [
    {
      id: "pg-vergelijking",
      title: "Onderhoudsopties voor Bakkerij Van Dijk",
      shelfId: "s-mine",
      kind: "note",
      owner: "Jij",
      verified: null,
      checkDue: dayAt(now, 30, 9),
      stale: null,
      body: COMPARISON_NOTE.replace(/\[\[let op: ([^\]]+)\]\]/g, "").replace(/\+\+/g, ""),
      sources: [
        { id: "src-mail", kind: "email", title: "Mail \"Onderhoudscontract\" van Lars van Dijk", meta: "Extern · Outlook · 3 nov 16:12", href: null },
        { id: "src-b007", kind: "decision", title: "B-007 Service binnen 24 uur", meta: "Team Van Dijk · versie 7c1e04", href: "#/bibliotheek/pagina/pg-besluit" },
      ],
      comments: [],
      history: [{ at: now - 70 * MIN, who: "Agent, RUN-0417", text: "Concept opgeslagen" }],
      updatedAt: now - 70 * MIN,
      addedBy: "Agent, RUN-0417",
    },
    {
      id: "pg-vergelijking-team",
      title: "Leveranciersvergelijking ovens",
      shelfId: "s-vandijk",
      kind: "note",
      owner: "Fleur Jansen",
      verified: { by: "Fleur Jansen", at: now - 2 * DAY },
      checkDue: dayAt(now, 20, 9),
      stale: null,
      body: "## Leveranciersvergelijking ovens\n\nDrie leveranciers met service binnen 24 uur in de regio. Prijzen zijn indicaties uit offertes van september.\n\n- **Leverancier A**: volledige dekking, updates inbegrepen.\n- **Leverancier B**: basis plus storingsdienst.\n- **Leverancier C**: alleen onderdelen; eigen monteur nodig.",
      sources: [{ id: "src-offertes-sep", kind: "file", title: "Offertes leveranciers september", meta: "Team Van Dijk · 3 bestanden", href: null }],
      comments: [
        { id: "cm-1", author: "Fleur Jansen", at: now - 5 * HOUR, text: "Kun jij controleren of leverancier B nog dezelfde reactietijd heeft?", anchor: "Leverancier B" },
        { id: "cm-2", author: "Fleur Jansen", at: now - 5 * HOUR + 4 * MIN, text: "En klopt de prijs van C nog?", anchor: "Leverancier C" },
      ],
      history: [{ at: now - 2 * DAY, who: "Fleur Jansen", text: "Gecontroleerd" }],
      updatedAt: now - 5 * HOUR,
      addedBy: "Fleur Jansen",
    },
    {
      id: "pg-privacy",
      title: "Checklist privacy klantgegevens",
      shelfId: "s-team",
      kind: "checklist",
      owner: "Fleur Jansen",
      verified: { by: "Fleur Jansen", at: dayAt(now, -1, 9, 14) },
      checkDue: dayAt(now, 60, 9),
      stale: null,
      body: "## Checklist privacy klantgegevens\n\n### 1. Wat we bewaren\n\n- Alleen gegevens die nodig zijn voor de opdracht.\n- Geen kopieën van klantbestanden buiten de projectmap.\n\n### 2. Waar het staat\n\n- Klantgegevens blijven op de plank van dat klantteam.\n- Gedeelde pagina's bevatten geen namen van klanten.\n\n### 3. Wat agents mogen\n\n- Agents lezen klantgegevens alleen binnen het project.\n- Een agent deelt niets met het hele team zonder goedkeuring.",
      sources: [{ id: "src-avg", kind: "web", title: "AVG-richtlijnen voor kleine bedrijven", meta: "Web · gelezen 4 nov", href: null }],
      comments: [],
      history: [
        { at: dayAt(now, -1, 9, 14), who: "Fleur Jansen", text: "Opnieuw gecontroleerd" },
        { at: now - 20 * DAY, who: "Fleur Jansen", text: "Sectie 3 toegevoegd" },
      ],
      updatedAt: dayAt(now, -1, 9, 14),
      addedBy: "Fleur Jansen",
    },
    {
      id: "pg-besluit",
      title: "B-007 Alleen leveranciers met service binnen 24 uur",
      shelfId: "s-vandijk",
      kind: "decision",
      owner: "Jij",
      verified: { by: "Jij", at: dayAt(now, -2, 11) },
      checkDue: null,
      stale: null,
      body: "## B-007 Alleen leveranciers met service binnen 24 uur\n\nElke optie in dit project moet storingen aan de ovens binnen 24 uur oplossen. Een bakkerij kan geen dag zonder oven.\n\n**Gevolg:** opties zonder storingsdienst vallen af.",
      sources: [],
      comments: [],
      history: [{ at: dayAt(now, -2, 11), who: "Jij", text: "Besluit vastgelegd" }],
      updatedAt: dayAt(now, -2, 11),
      addedBy: "Jij",
    },
    {
      id: "pg-korting",
      title: "Kortingsbeleid 2026",
      shelfId: "s-team",
      kind: "checklist",
      owner: "Ruben de Boer",
      verified: { by: "Ruben de Boer", at: now - 9 * DAY },
      checkDue: dayAt(now, 40, 9),
      stale: null,
      body: "## Kortingsbeleid 2026\n\n- Tot 5% korting mag iedereen geven.\n- Tussen 5% en 10% beslist de accountmanager.\n- Boven 10% alleen met akkoord van de directie.",
      sources: [],
      comments: [],
      history: [{ at: now - 9 * DAY, who: "Ruben de Boer", text: "Gecontroleerd" }],
      updatedAt: now - 9 * DAY,
      addedBy: "Ruben de Boer",
    },
    {
      id: "pg-oud",
      title: "Notities offertes 2025",
      shelfId: "s-mine",
      kind: "note",
      owner: "Jij",
      verified: { by: "Jij", at: now - 200 * DAY },
      checkDue: now - 10 * DAY,
      stale: "controledatum verstreken",
      body: "## Notities offertes 2025\n\nWat werkte en wat niet in de offertes van vorig jaar.",
      sources: [],
      comments: [],
      history: [],
      updatedAt: now - 200 * DAY,
      addedBy: "Jij",
    },
    {
      id: "pg-garantie",
      title: "Shortlist garantievoorwaarden",
      shelfId: "s-team",
      kind: "howto",
      owner: "Jij",
      verified: { by: "Jij", at: now - 40 * DAY },
      checkDue: dayAt(now, 5, 9),
      stale: "een bron is gewijzigd sinds 2 okt · jij bent eigenaar",
      body: "## Shortlist garantievoorwaarden\n\nDe garantievoorwaarden die we in offertes gebruiken, per type apparaat.",
      sources: [{ id: "src-garantie", kind: "web", title: "Garantiewet consumentenkoop", meta: "Web · gewijzigd 2 okt", href: null }],
      comments: [],
      history: [],
      updatedAt: now - 40 * DAY,
      addedBy: "Jij",
    },
  ];

  const werkwijzen: Werkwijze[] = [
    {
      id: "ww-opties",
      name: "Opties vergelijken",
      version: 3,
      origin: "project",
      projectId: P.offertes,
      stages: ["Scope en criteria", "Feiten verzamelen", "Vergelijken", "Notitie schrijven"],
      grants: [
        { kind: "allow", text: "Zoeken en lezen op het web" },
        { kind: "allow", text: `Het klantteam van het project lezen, ${TEAM} en één mailgesprek` },
        { kind: "allow", text: "Schrijven naar Alleen jij" },
        { kind: "deny", text: "Versturen, delen of publiceren" },
      ],
      key: "project",
      label: "Werkwijze · projectkey",
    },
    {
      id: "ww-gesprek",
      name: "Gesprek verwerken",
      version: 2,
      origin: "project",
      projectId: P.offertes,
      stages: ["Deelnemers en scope", "Besluiten en actiepunten", "Samenvatting", "Resultaten opslaan"],
      grants: [
        { kind: "allow", text: "Het transcript en de plank van het klantteam lezen" },
        { kind: "allow", text: "Schrijven naar Alleen jij" },
        { kind: "ask", text: "Voorstellen aan de plank van het klantteam, met jouw goedkeuring" },
        { kind: "deny", text: "Iets versturen" },
      ],
      key: "project",
      label: "Werkwijze · projectkey",
    },
    {
      id: "ww-mail",
      name: "Mail beantwoorden",
      version: 1,
      origin: "app",
      projectId: null,
      stages: ["Gesprek lezen", "Concept schrijven", "Goedkeuring vragen"],
      grants: [
        { kind: "allow", text: "Eén mailgesprek en de plank van het klantteam lezen" },
        { kind: "allow", text: "Een concept in Outlook maken" },
        { kind: "ask", text: "Versturen, alleen met jouw goedkeuring" },
        { kind: "deny", text: "Webtoegang" },
      ],
      key: "project",
      label: "Werkwijze · projectkey",
    },
    {
      id: "ww-onderzoek",
      name: "Onderzoeksbrief",
      version: 2,
      origin: "app",
      projectId: null,
      stages: ["Vraag scherpstellen", "Bronnen zoeken", "Lezen", "Toetsen", "Samenvatten"],
      grants: [
        { kind: "allow", text: "Zoeken en lezen op het web" },
        { kind: "allow", text: "De planken lezen die in dit project mogen" },
        { kind: "allow", text: "Schrijven naar Alleen jij" },
        { kind: "deny", text: "Versturen, delen of publiceren" },
      ],
      key: "project",
      label: "Werkwijze · projectkey",
    },
    {
      id: "ww-admin",
      name: "Inbox sorteren · Uren schrijven",
      version: 1,
      origin: "personal",
      projectId: null,
      stages: ["Lezen", "Voorstellen"],
      grants: [
        { kind: "allow", text: "Je mail en agenda lezen" },
        { kind: "allow", text: `Alleen jij en Iedereen in ${TEAM} lezen` },
        { kind: "ask", text: "Uren indienen via je urenprogramma, met jouw goedkeuring" },
        { kind: "deny", text: "Klantplanken of projectkeys" },
      ],
      key: "personal",
      label: "Werkwijzen · agentchats · persoonlijke key",
    },
  ];

  const opties = werkwijzen[0];
  const gesprek = werkwijzen[1];
  const mailWw = werkwijzen[2];
  const onderzoek = werkwijzen[3];
  if (!opties || !gesprek || !mailWw || !onderzoek) throw new Error("werkwijzen");

  const budget = (spent: number, cap: number, keyAlias: string, keyLeft: number) => ({ spent, cap, currency: "EUR", keyAlias, keyLeft, resetsAt: dayAt(now, 26, 0) });

  const runs: Run[] = [
    {
      id: "RUN-0417",
      title: "Drie onderhoudsopties vergelijken voor Bakkerij Van Dijk",
      projectId: P.offertes,
      werkwijzeId: opties.id,
      werkwijzeName: opties.name,
      status: "review",
      progress: "Stap 4 van 4",
      waitingOn: "Jij: controleer \"Notitie schrijven\"",
      waitingDetail: null,
      due: dayAt(now, monday, 17),
      updatedAt: now - 71 * MIN,
      startedAt: dayAt(now, -1, 15, 48),
      chatRef: null,
      origin: "van de to-do \"Optie-overzicht naar Lars sturen\"",
      stages: [
        { title: "Scope en criteria", state: "done", note: "Geaccepteerd · 1 wijziging · wo 16:02", artifact: "01-scope.md" },
        { title: "Feiten verzamelen", state: "done", note: "Doorgegaan · controles 7 van 7 · wo 19:10", artifact: "02-feiten.md" },
        { title: "Vergelijken", state: "done", note: "Doorgegaan · controles 5 van 5 · wo 21:30", artifact: "03-vergelijking.md" },
        { title: "Notitie schrijven", state: "review", note: "Wacht op jouw controle", artifact: "04-notitie.md" },
      ],
      review: {
        stageIndex: 3,
        file: "04-notitie.md",
        delta: null,
        body: COMPARISON_NOTE,
        edits: null,
        previous: PREVIOUS_NOTE,
        checks: [
          { result: "care", text: "Let op: 1 van de 2 prijzen verwijst naar een pagina van maart 2026" },
          { result: "pass", text: "Geslaagd: elke optie voldoet aan service binnen 24 uur" },
          { result: "pass", text: "Geslaagd: minstens 2 bronnen per optie" },
        ],
        builtFrom: [
          { id: "b-1", kind: "email", title: "Mail \"Onderhoudscontract\" van Lars", meta: "Extern · Outlook · 3 nov 16:12", href: null },
          { id: "b-2", kind: "decision", title: "B-007 Service binnen 24 uur", meta: "Team Van Dijk · versie 7c1e04", href: "#/bibliotheek/pagina/pg-besluit" },
          { id: "b-3", kind: "library", title: "Checklist privacy klantgegevens § 2–3", meta: `Iedereen in ${TEAM} · gecontroleerd 4 nov`, href: "#/bibliotheek/pagina/pg-privacy" },
          { id: "b-4", kind: "file", title: "Uitkomsten stap 1–3", meta: "Alleen jij · 3 bestanden", href: null },
        ],
        citations: "9 bronnen geciteerd · 3 intern, 6 van het web",
      },
      question: null,
      interruption: null,
      grants: opties.grants,
      budget: budget(1.84, 5, "offertes-2026", 62),
      after: ["De notitie voorstellen aan de plank Team Van Dijk", "Een antwoord aan Lars opstellen en het versturen goedkeuren"],
      toolCalls: 48,
      queued: [],
    },
    {
      id: "RUN-0424",
      title: "Gesprek verwerken",
      projectId: P.offertes,
      werkwijzeId: gesprek.id,
      werkwijzeName: gesprek.name,
      status: "review",
      progress: "Stap 2 van 4",
      waitingOn: "Jij: controleer \"Besluiten en actiepunten\"",
      waitingDetail: null,
      due: null,
      updatedAt: now - 40 * MIN,
      startedAt: now - 52 * MIN,
      chatRef: { projectId: P.offertes, chatId: "c-vandijk" },
      origin: "uit de chat \"Offerte onderhoudscontract Bakkerij Van Dijk\"",
      stages: [
        { title: "Deelnemers en scope", state: "done", note: "Jij ging door · 14:05", artifact: "01-scope.md" },
        { title: "Besluiten en actiepunten", state: "review", note: "Jouw controle", artifact: "02-besluiten-acties.md" },
        { title: "Samenvatting", state: "pending", note: "Start als je doorgaat", artifact: null },
        { title: "Resultaten opslaan", state: "pending", note: "To-do's, wachten-op en plankvoorstellen. Delen vraagt een eigen goedkeuring.", artifact: null },
      ],
      review: {
        stageIndex: 1,
        file: "02-besluiten-acties.md",
        delta: "Sinds stap 1: + 3 besluiten, + 4 actiepunten",
        body: DECISIONS_NOTE,
        edits: null,
        previous: null,
        checks: [
          { result: "pass", text: "Geslaagd: elk actiepunt heeft een eigenaar" },
          { result: "care", text: "Let op: 1 actiepunt heeft geen datum. Voeg er een toe met Aanpassen, of ga zonder door." },
        ],
        builtFrom: [{ id: "b-tr", kind: "file", title: "Transcript intakegesprek", meta: "Teams · wo 4 nov", href: null }],
        citations: null,
      },
      question: null,
      interruption: null,
      grants: gesprek.grants,
      budget: budget(0.31, 2, "offertes-2026", 62),
      after: ["Plankvoorstellen vragen elk een eigen goedkeuring"],
      toolCalls: 12,
      queued: [],
    },
    {
      id: "RUN-0420",
      title: "Klantvragen scoren tegen de antwoordrichtlijn",
      projectId: P.service,
      werkwijzeId: onderzoek.id,
      werkwijzeName: onderzoek.name,
      status: "question",
      progress: "Stap 2 van 4",
      waitingOn: "Jij: welke versie van de richtlijn?",
      waitingDetail: "Stopt als er vr 12:00 geen antwoord is",
      due: dayAt(now, friday, 12),
      updatedAt: now - 54 * MIN,
      startedAt: now - 3 * HOUR,
      chatRef: null,
      origin: null,
      stages: [
        { title: "Vraag scherpstellen", state: "done", note: "Klaar · 06:10", artifact: "01-vraag.md" },
        { title: "Tickets scoren", state: "working", note: "Wacht op jouw antwoord", artifact: null },
        { title: "Toetsen", state: "pending", note: null, artifact: null },
        { title: "Samenvatten", state: "pending", note: null, artifact: null },
      ],
      review: null,
      question: {
        text: "Welke versie van de antwoordrichtlijn moeten de scores gebruiken?",
        options: ["Versie 2 (in gebruik)", "Versie 3 (concept van Ruben)"],
        deadline: dayAt(now, friday, 12),
        consequence: "RUN-0420 stopt als je niet antwoordt voor vr 12:00. Het werk tot nu toe blijft bewaard.",
      },
      interruption: null,
      grants: onderzoek.grants,
      budget: budget(0.62, 5, "klantenservice", 80),
      after: [],
      toolCalls: 21,
      queued: [],
    },
    {
      id: "RUN-0419",
      title: "Nieuwe garantieregels voor onderhoudscontracten",
      projectId: P.offertes,
      werkwijzeId: onderzoek.id,
      werkwijzeName: onderzoek.name,
      status: "working",
      progress: "Stap 3 van 5 · leest 4 bronnen",
      waitingOn: "Niets",
      waitingDetail: null,
      due: dayAt(now, tuesday, 17),
      updatedAt: now - 3 * MIN,
      startedAt: now - 2 * HOUR,
      chatRef: null,
      origin: null,
      stages: onderzoek.stages.map((title, index) => ({ title, state: index < 2 ? "done" : index === 2 ? "working" : "pending", note: index < 2 ? "Klaar" : index === 2 ? "Leest 4 bronnen" : null, artifact: null })),
      review: null,
      question: null,
      interruption: null,
      grants: onderzoek.grants,
      budget: budget(0.48, 5, "offertes-2026", 62),
      after: [],
      toolCalls: 17,
      queued: [],
    },
    {
      id: "RUN-0415",
      title: "Notities van het gesprek met Hotel De Linde samenvatten",
      projectId: P.service,
      werkwijzeId: onderzoek.id,
      werkwijzeName: onderzoek.name,
      status: "failed",
      progress: "Gestopt bij stap 2 van 3",
      waitingOn: "Kon de modeldienst niet bereiken. Gedeeltelijke notities bewaard.",
      waitingDetail: null,
      due: null,
      updatedAt: dayAt(now, -1, 17, 20),
      startedAt: dayAt(now, -1, 17, 2),
      chatRef: null,
      origin: null,
      stages: [
        { title: "Lezen", state: "done", note: "Klaar", artifact: "01-gelezen.md" },
        { title: "Samenvatten", state: "failed", note: "Modeldienst niet bereikbaar", artifact: null },
        { title: "Opslaan", state: "pending", note: null, artifact: null },
      ],
      review: null,
      question: null,
      interruption: null,
      grants: onderzoek.grants,
      budget: budget(0.12, 5, "klantenservice", 80),
      after: [],
      toolCalls: 6,
      queued: [],
    },
    {
      id: "RUN-0418",
      title: "Prijzen van leveranciers verzamelen",
      projectId: P.finance,
      werkwijzeId: onderzoek.id,
      werkwijzeName: onderzoek.name,
      status: "done",
      progress: "5 van 5",
      waitingOn: "Uitkomst klaar om te lezen",
      waitingDetail: null,
      due: dayAt(now, friday, 17),
      updatedAt: now - 100 * MIN,
      startedAt: dayAt(now, -1, 20),
      chatRef: null,
      origin: null,
      stages: onderzoek.stages.map((title) => ({ title, state: "done", note: "Klaar", artifact: null })),
      review: null,
      question: null,
      interruption: null,
      grants: onderzoek.grants,
      budget: budget(1.02, 5, "financien", 12),
      after: [],
      toolCalls: 39,
      queued: [],
    },
    {
      id: "RUN-0416",
      title: "Antwoordcriteria uit eerdere tickets verzamelen",
      projectId: P.service,
      werkwijzeId: onderzoek.id,
      werkwijzeName: onderzoek.name,
      status: "issues",
      progress: "4 van 4",
      waitingOn: "1 bron heeft geen datum",
      waitingDetail: "Bibliotheekvoorstel wacht in Vandaag",
      due: null,
      updatedAt: dayAt(now, -1, 18, 5),
      startedAt: dayAt(now, -1, 14),
      chatRef: null,
      origin: null,
      stages: ["Tickets lezen", "Criteria vinden", "Toetsen", "Samenvatten"].map((title) => ({ title, state: "done", note: "Klaar", artifact: null })),
      review: null,
      question: null,
      interruption: null,
      grants: onderzoek.grants,
      budget: budget(0.94, 5, "klantenservice", 80),
      after: ["Een wijziging voorstellen aan de checklist privacy klantgegevens"],
      toolCalls: 33,
      queued: [],
    },
    {
      id: "RUN-0421",
      title: "Antwoord aan Lars met de opties",
      projectId: P.offertes,
      werkwijzeId: mailWw.id,
      werkwijzeName: mailWw.name,
      status: "draft",
      progress: "Niet gestart",
      waitingOn: "Start na de controle van RUN-0417",
      waitingDetail: null,
      due: dayAt(now, monday, 9),
      updatedAt: now - 22 * MIN,
      startedAt: now - 22 * MIN,
      chatRef: null,
      origin: "van de to-do \"Optie-overzicht naar Lars sturen\"",
      stages: mailWw.stages.map((title) => ({ title, state: "pending", note: null, artifact: null })),
      review: null,
      question: null,
      interruption: null,
      grants: mailWw.grants,
      budget: null,
      after: ["Versturen vraagt jouw goedkeuring"],
      toolCalls: 0,
      queued: [],
    },
    {
      id: "RUN-0414",
      title: "Bevestiging aan Hotel De Linde opstellen en versturen",
      projectId: P.service,
      werkwijzeId: mailWw.id,
      werkwijzeName: mailWw.name,
      status: "interrupted",
      progress: "Onderbroken bij stap 3 van 3",
      waitingOn: "Jij: controleer of de mail is verstuurd",
      waitingDetail: null,
      due: null,
      updatedAt: dayAt(now, -1, 18, 10),
      startedAt: dayAt(now, -1, 17, 24),
      chatRef: null,
      origin: null,
      stages: [
        { title: "Gesprek lezen", state: "done", note: "Klaar · 17:24", artifact: null },
        { title: "Concept schrijven", state: "done", note: "Klaar · 17:31", artifact: null },
        { title: "Versturen", state: "failed", note: "Uitkomst onbekend", artifact: null },
      ],
      review: null,
      question: null,
      interruption: {
        cause: "Laptop sliep om 17:42 · weer open om 18:10",
        happened: [
          { label: "Klaar", text: "Het Outlook-concept \"Re: Reservering zaal\" gemaakt om 17:31. Jij keurde versturen goed om 17:41, met één wijziging.", tone: "done" },
          { label: "Bewaard", text: "Het goedgekeurde concept en jouw wijziging staan in de geschiedenis van de run.", tone: "saved" },
          { label: "Niet gedaan", text: "Het versturen bevestigen, de to-do afronden en een wachten-op voorstellen.", tone: "not_done" },
          { label: "Gevolgen buiten de app", text: "1 e-mail is misschien wel, misschien niet verstuurd. Zie hieronder.", tone: "external" },
        ],
        outbound: null,
        timeline: [
          { at: dayAt(now, -1, 17, 24), text: "Het gesprek met Hotel De Linde gelezen", state: "done" },
          { at: dayAt(now, -1, 17, 31), text: "Outlook-concept \"Re: Reservering zaal\" gemaakt", state: "done" },
          { at: dayAt(now, -1, 17, 41), text: "Jij paste één zin aan en keurde versturen goed", state: "done" },
          { at: dayAt(now, -1, 17, 42), text: "OUT-0091 versturen", state: "unknown" },
        ],
        whyNoRetry: "Een e-mail waarvan de uitkomst onbekend is, wordt nooit vanzelf opnieuw verstuurd. Eerst controleren voorkomt dat Hotel De Linde hetzelfde bericht twee keer krijgt.",
      },
      grants: mailWw.grants,
      budget: budget(0.09, 2, "klantenservice", 80),
      after: [],
      toolCalls: 8,
      queued: [],
    },
  ];

  const sent: OutboundEntry[] = [
    {
      id: "OUT-0092",
      title: "Een bibliotheekwijziging publiceren",
      kind: "library",
      target: ["Kortingsbeleid 2026 § 2", `Iedereen in ${TEAM}`],
      status: "published",
      statusText: "Gepubliceerd",
      decidedBy: "Jij keurde goed",
      at: dayAt(now, 0, 7, 14) > now ? dayAt(now, -1, 9, 14) : dayAt(now, 0, 7, 14),
      steps: [],
      projectId: null,
    },
    {
      id: "OUT-0091",
      title: "Bevestiging reservering versturen",
      kind: "email",
      target: ["Aan Marieke Smit · Hotel De Linde", "Extern"],
      status: "unknown",
      statusText: "Uitkomst onbekend",
      decidedBy: "Jij keurde goed",
      at: dayAt(now, -1, 17, 42),
      steps: [
        { at: dayAt(now, -1, 17, 41), title: "Jij keurde goed", detail: "Gebonden aan deze precieze e-mail" },
        { at: dayAt(now, -1, 17, 41) + 20_000, title: "20 s vastgehouden", detail: "Ongedaan maken was mogelijk" },
        { at: dayAt(now, -1, 17, 42), title: "Versturen", detail: "De verbinding viel weg" },
      ],
      projectId: P.service,
    },
    {
      id: "OUT-0090",
      title: "Antwoord: agenda voor dinsdag",
      kind: "email",
      target: ["Aan Fleur Jansen", "Team"],
      status: "undone",
      statusText: "Ongedaan gemaakt tijdens het wachten",
      decidedBy: "Jij keurde goed en maakte het ongedaan",
      at: dayAt(now, -2, 11, 20),
      steps: [],
      projectId: P.offertes,
    },
    {
      id: "OUT-0089",
      title: "E-mail versturen",
      kind: "email",
      target: ["Aan Lars van Dijk", "Extern"],
      status: "declined",
      statusText: "Afgewezen",
      decidedBy: "Jij: \"Te lang, maak er 3 punten van\"",
      at: dayAt(now, -3, 15, 2),
      steps: [],
      projectId: P.offertes,
    },
    {
      id: "OUT-0088",
      title: "Antwoord: Re: Offerte vervolg",
      kind: "email",
      target: ["Aan Lars van Dijk · Extern", "Cc Fleur Jansen · team"],
      status: "sent",
      statusText: "Verstuurd, gevonden in Verzonden items",
      decidedBy: "Jij paste aan en keurde goed",
      at: dayAt(now, -4, 16, 9),
      steps: [
        { at: dayAt(now, -4, 16, 8) + 12_000, title: "Jij keurde goed", detail: "Gebonden aan deze precieze e-mail" },
        { at: dayAt(now, -4, 16, 8) + 12_000, title: "20 s vastgehouden", detail: "Ongedaan maken was mogelijk" },
        { at: dayAt(now, -4, 16, 8) + 32_000, title: "Versturen", detail: "Concept ongewijzigd sinds goedkeuring" },
        { at: dayAt(now, -4, 16, 8) + 34_000, title: "Outlook nam hem aan", detail: "Verstuurd" },
        { at: dayAt(now, -4, 16, 9) + 5_000, title: "Gevonden in Verzonden items", detail: "Bevestigd" },
      ],
      projectId: P.offertes,
    },
  ];

  const unknown = sent.find((entry) => entry.id === "OUT-0091") ?? null;
  const interrupted = runs.find((run) => run.id === "RUN-0414");
  if (interrupted?.interruption) interrupted.interruption.outbound = unknown;

  const approvals: Approval[] = [
    {
      id: "OUT-0093",
      kind: "email",
      risk: "R4",
      title: "Optie-overzicht naar Lars sturen",
      headline: "Stuurt een e-mail naar 1 externe persoon",
      consequence: "Kan na de wachttijd van 20 s niet worden teruggehaald. Daarna kun je alleen een correctie sturen.",
      audience: "Extern · verlaat het team",
      projectId: P.offertes,
      runId: "RUN-0421",
      status: "open",
      holdSeconds: 20,
      provenance: "Opgesteld door de agent in RUN-0421 met de werkwijze \"Mail beantwoorden\", uit de notitie van RUN-0417 (9 bronnen). Jij accepteerde die notitie om 12:31; versturen vraagt deze goedkeuring. Jouw wijzigingen: nog geen.",
      mail: {
        from: "Jij",
        to: [PEOPLE.lars],
        cc: [{ ...PEOPLE.fleur, addedByAgent: true, reason: "Voorgesteld omdat zij het overleg op 12 nov organiseert.", decision: null }],
        subject: "Re: Onderhoudscontract",
        attached: null,
        body: REPLY_BODY,
        replyingTo: { from: PEOPLE.lars.address, at: dayAt(now, -2, 16, 12), body: LARS_MAIL },
      },
      library: null,
      calendar: null,
      createdAt: now - 20 * MIN,
    },
    {
      id: "APR-0094",
      kind: "library",
      risk: "R3",
      title: "1 wijziging publiceren in de checklist privacy klantgegevens",
      headline: `Publiceert 1 wijziging voor Iedereen in ${TEAM}`,
      consequence: "Zichtbaar voor alle collega's en hun agents. Terug te draaien.",
      audience: `Iedereen in ${TEAM}`,
      projectId: P.service,
      runId: "RUN-0416",
      status: "open",
      holdSeconds: 0,
      provenance: "Voorgesteld door je agent uit RUN-0416, sectie 3. Fleur Jansen is eigenaar van de pagina en ziet de wijziging na publicatie.",
      mail: null,
      library: {
        changes: [
          {
            shelfId: "s-team",
            pageTitle: "Checklist privacy klantgegevens",
            section: "3. Wat agents mogen",
            diff: [
              { op: "same", text: "Agents lezen klantgegevens alleen binnen het project." },
              { op: "add", text: "Een agent noemt in een gedeelde pagina nooit de naam van een klant." },
              { op: "same", text: "Een agent deelt niets met het hele team zonder goedkeuring." },
            ],
          },
        ],
        reviewers: ["Fleur Jansen"],
      },
      calendar: null,
      createdAt: dayAt(now, -1, 18, 5),
    },
    {
      id: "APR-0095",
      kind: "library",
      risk: "R3",
      title: "Een voorstel publiceren op 2 planken",
      headline: "Publiceert 2 wijzigingen op 2 planken",
      consequence: "1 voor Team Van Dijk, 1 voor het hele team. Klantgegevens zijn verwijderd uit de versie voor het hele team. Terug te draaien.",
      audience: `Team Van Dijk en Iedereen in ${TEAM}`,
      projectId: P.offertes,
      runId: null,
      // Made by completing Offertes 2026 (Afronden); it opens from there, not from Today.
      status: "snoozed",
      holdSeconds: 0,
      provenance: "Samengesteld bij het afronden van Offertes 2026: één besluit en één werkinstructie, door jou gekozen.",
      mail: null,
      library: {
        changes: [
          {
            shelfId: "s-vandijk",
            pageTitle: "Gekozen onderhoudsoptie",
            section: null,
            diff: [
              { op: "add", text: "Gekozen onderhoudsoptie: [de optie uit het overleg]." },
              { op: "add", text: "Waarom, de alternatieven en de 24-uurscontrole, gekoppeld aan de notitie van RUN-0417." },
            ],
          },
          {
            shelfId: "s-team",
            pageTitle: "Werkinstructie: een onderhoudscontract kiezen",
            section: null,
            diff: [
              { op: "remove", text: "Bakkerij Van Dijk wilde 2–3 opties met een indicatie van de maandkosten." },
              { op: "add", text: "De klant wilde 2–3 opties met een indicatie van de maandkosten." },
              { op: "same", text: "Begin met de reactietijd die de klant nodig heeft; die bepaalt welke opties overblijven." },
            ],
          },
        ],
        reviewers: ["Fleur Jansen", "Ruben de Boer"],
      },
      calendar: null,
      createdAt: now - 2 * HOUR,
    },
  ];

  const proposals: LibraryProposal[] = [
    {
      id: "vs-12",
      title: "Wijziging in de checklist privacy klantgegevens",
      shelfId: "s-team",
      from: "Je agent, uit RUN-0416",
      runId: "RUN-0416",
      audience: `Iedereen in ${TEAM}: alle collega's en hun agents`,
      reason: "In 3 eerdere tickets stond een klantnaam in een gedeelde notitie. Deze regel voorkomt dat.",
      changes: approvals[1]?.library?.changes ?? [],
      checks: [
        { result: "pass", text: "Geslaagd: geen klantgegevens in de wijziging" },
        { result: "pass", text: "Geslaagd: past in de bestaande sectie" },
        { result: "care", text: "Let op: 1 bron in RUN-0416 heeft geen datum" },
      ],
      status: "open",
      createdAt: dayAt(now, -1, 18, 5),
    },
  ];

  const requests: LibraryRequest[] = [
    {
      id: "rq-1",
      kind: "change",
      title: "Je agent stelt een wijziging voor in de checklist privacy klantgegevens",
      detail: `Uit RUN-0416, sectie 3. Alle collega's in ${TEAM} zouden het zien.`,
      shelfId: "s-team",
      approvalId: "APR-0094",
      pageId: "pg-privacy",
    },
    {
      id: "rq-2",
      kind: "check",
      title: "Fleur vroeg je de leveranciersvergelijking te controleren",
      detail: "2 opmerkingen op de pagina. Alleen Team Van Dijk ziet hem.",
      shelfId: "s-vandijk",
      approvalId: null,
      pageId: "pg-vergelijking-team",
    },
  ];

  const todos: Todo[] = [
    { id: "t-1", title: "Offerte Van Dijk bijwerken in HubSpot met de shortlist", projectId: P.offertes, origin: "HubSpot DKS-142", external: false, due: { kind: "due", at: dayAt(now, -1, 17) }, done: false, doneAt: null, today: true, rolledOver: 1, runId: null, createdAt: now - 3 * DAY },
    { id: "t-2", title: "De notities van Ruben over de antwoordrichtlijn lezen", projectId: P.service, origin: null, external: false, due: { kind: "due", at: dayAt(now, 0, 17) }, done: false, doneAt: null, today: true, rolledOver: 0, runId: null, createdAt: now - DAY },
    { id: "t-3", title: "Optie-overzicht naar Lars sturen", projectId: P.offertes, origin: "uit de mail van Lars van Dijk", external: true, due: { kind: "deadline", at: dayAt(now, monday, 17) }, done: false, doneAt: null, today: true, rolledOver: 0, runId: null, createdAt: now - 2 * DAY },
    { id: "t-4", title: "De agenda van het overleg met Van Dijk voorbereiden", projectId: P.offertes, origin: null, external: false, due: { kind: "deadline", at: dayAt(now, wednesday, 17) }, done: false, doneAt: null, today: true, rolledOver: 0, runId: null, createdAt: now - 2 * DAY },
    { id: "t-5", title: "De sectie \"Bronnen actueel houden\" van de checklist schrijven", projectId: P.service, origin: null, external: false, due: null, done: false, doneAt: null, today: true, rolledOver: 3, runId: null, createdAt: now - 6 * DAY },
    { id: "t-6", title: "Btw-aangifte Q3 laten controleren", projectId: P.finance, origin: null, external: false, due: { kind: "deadline", at: dayAt(now, thursday + 7, 17) }, done: false, doneAt: null, today: false, rolledOver: 0, runId: null, createdAt: now - 4 * DAY },
    { id: "t-7", title: "Nieuwsbrief november nalezen", projectId: P.marketing, origin: null, external: false, due: null, done: false, doneAt: null, today: false, rolledOver: 0, runId: null, createdAt: now - 4 * DAY },
  ];

  const waiting: WaitingFor[] = [
    { id: "w-1", title: "Toegang tot de onderhoudshistorie", person: PEOPLE.lars, projectId: P.offertes, askedAt: dayAt(now, -3, 10) },
    { id: "w-2", title: "Wie de agenda van het overleg maakt", person: PEOPLE.fleur, projectId: P.offertes, askedAt: dayAt(now, -2, 14) },
  ];

  const inbox: InboxItem[] = [
    {
      id: "i-1",
      kind: "mail",
      title: "2–3 onderhoudsopties met een kostenindicatie naar Lars sturen",
      projectId: null,
      suggestedProjectId: P.offertes,
      deadline: dayAt(now, monday, 17),
      receivedAt: dayAt(now, -2, 16, 12),
      from: PEOPLE.lars,
      why: "Waarom hier: een verzoek met een datum, aan jou gericht",
      sourceLabel: "\"Onderhoudscontract\"",
      mail: { subject: "Onderhoudscontract", body: LARS_MAIL, thread: 2, imagesOff: true },
      duplicateOf: { todoId: "t-3", title: "Optie-overzicht naar Lars sturen" },
    },
    {
      id: "i-2",
      kind: "waiting",
      title: "Antwoord van Ruben over de testomgeving bijhouden",
      projectId: P.offertes,
      suggestedProjectId: null,
      deadline: null,
      receivedAt: dayAt(now, 0, 9, 48) > now ? now - 30 * MIN : dayAt(now, 0, 9, 48),
      from: PEOPLE.ruben,
      why: null,
      sourceLabel: "jouw mail aan Ruben de Boer",
      mail: null,
      duplicateOf: null,
    },
    {
      id: "i-3",
      kind: "captured",
      title: "Uitzoeken: zoeken op samengestelde woorden in de helpdesk",
      projectId: null,
      suggestedProjectId: null,
      deadline: null,
      receivedAt: now - 25 * MIN,
      from: null,
      why: null,
      sourceLabel: null,
      mail: null,
      duplicateOf: null,
    },
    {
      id: "i-4",
      kind: "captured",
      title: "Een ruimte boeken voor de demo",
      projectId: null,
      suggestedProjectId: null,
      deadline: null,
      receivedAt: dayAt(now, -1, 17, 55),
      from: null,
      why: null,
      sourceLabel: null,
      mail: null,
      duplicateOf: null,
    },
    {
      id: "i-5",
      kind: "agent",
      title: "De prijsbron van maart 2026 opnieuw controleren vóór maandag",
      projectId: P.offertes,
      suggestedProjectId: P.offertes,
      deadline: dayAt(now, monday, 9),
      receivedAt: now - 70 * MIN,
      from: null,
      why: null,
      sourceLabel: "uit de controle van RUN-0417 stap 4",
      mail: null,
      duplicateOf: null,
    },
  ];

  const calendar: CalendarEvent[] = [
    { id: "ev-1", start: dayAt(now, 0, 9, 30), end: dayAt(now, 0, 9, 45), title: "Stand-up", proposed: false },
    { id: "ev-2", start: dayAt(now, 0, 11), end: dayAt(now, 0, 12), title: "Gesprek Hotel De Linde", proposed: false },
    { id: "ev-3", start: dayAt(now, 0, 15), end: dayAt(now, 0, 15, 30), title: "1-op-1 met je manager", proposed: false },
  ];

  const areas: Area[] = [
    { id: "a-vandijk", name: "Account Van Dijk", client: "Bakkerij Van Dijk" },
    { id: "a-intern", name: "Intern", client: null },
    { id: "a-kantoor", name: "Kantoor", client: null },
  ];

  const brief = (projectId: string, fields: Partial<ProjectBrief> & Pick<ProjectBrief, "area">): ProjectBrief => ({
    projectId,
    state: "active",
    goal: null,
    doneWhen: null,
    target: null,
    keyAlias: null,
    keyLeft: null,
    needsYou: null,
    waitingOnYou: null,
    changes: [],
    lastVisitAt: null,
    sources: [],
    decisions: [],
    outputs: [],
    ...fields,
  });
  const vandijk = areas[0];
  const intern = areas[1];
  const kantoor = areas[2];
  if (!vandijk || !intern || !kantoor) throw new Error("areas");

  const briefs: ProjectBrief[] = [
    brief(P.offertes, {
      area: vandijk,
      goal: "Een onderhoudsvoorstel en een planning voor Bakkerij Van Dijk, rond voor vr 20 nov.",
      doneWhen: "Lars kiest een optie in het overleg, en de planning staat op de plank Team Van Dijk.",
      target: dayAt(now, friday + 14, 17),
      keyAlias: "offertes-2026",
      keyLeft: 62,
      needsYou: "1 controle",
      waitingOnYou: { title: "Stap 4 van RUN-0417 controleren, de vergelijkingsnotitie.", href: "#/runs/RUN-0417", action: "Controle openen" },
      changes: [
        { at: dayAt(now, -2, 16, 12), text: "Lars vroeg 2–3 opties voor maandag" },
        { at: dayAt(now, -1, 15, 48), text: "Jij delegeerde RUN-0417 vanuit die mail" },
        { at: now - 92 * MIN, text: "DKS-142 ging naar In behandeling" },
        { at: now - 71 * MIN, text: "Notitie van stap 4 klaar om te controleren" },
      ],
      lastVisitAt: dayAt(now, -2, 17, 20),
      sources: [
        { id: "so-1", kind: "email", title: "\"Onderhoudscontract\" van Lars van Dijk", meta: "Outlook · Extern", href: null },
        { id: "so-2", kind: "ticket", title: "DKS-142, het overleg en de klantcontext", meta: "HubSpot · agenda · Bibliotheek", href: null },
        { id: "so-3", kind: "decision", title: "Alleen leveranciers met service binnen 24 uur", meta: "B-007 · gecontroleerd", href: "#/bibliotheek/pagina/pg-besluit" },
      ],
      decisions: [{ id: "pg-besluit", title: "B-007 Alleen leveranciers met service binnen 24 uur", state: "Gecontroleerd", body: "Elke optie in dit project moet storingen binnen 24 uur oplossen." }],
      outputs: [
        { id: "pg-vergelijking", title: "Onderhoudsopties voor Bakkerij Van Dijk", meta: "Concept · Alleen jij · RUN-0417", runId: "RUN-0417" },
        { id: "o-2", title: "Prijsindexatie 2027", meta: "Alleen jij · uit een chat", runId: null },
      ],
    }),
    brief(P.service, {
      area: intern,
      goal: "Een herbruikbare antwoordrichtlijn voor de helpdesk.",
      doneWhen: "De richtlijn staat op de plank van het team en de helpdesk gebruikt hem.",
      target: dayAt(now, 25, 17),
      keyAlias: "klantenservice",
      keyLeft: 80,
      needsYou: "1 antwoord",
      waitingOnYou: { title: "Welke versie van de richtlijn moeten de scores gebruiken?", href: "#/runs/RUN-0420", action: "Antwoorden" },
      changes: [{ at: now - 54 * MIN, text: "RUN-0420 stelde een vraag" }],
      lastVisitAt: dayAt(now, -1, 16),
    }),
    brief(P.finance, { area: intern, goal: "Leveranciersprijzen en de btw van Q3 op orde.", keyAlias: "financien", keyLeft: 12 }),
    brief(P.marketing, { area: intern, goal: "Het webinar en de nieuwsbrieven van Q4.", keyAlias: "marketing-q4", keyLeft: 95, state: "on_hold", target: null }),
    brief(P.website, { area: intern, goal: "Nieuwe teksten voor de website.", keyAlias: null, keyLeft: null, target: dayAt(now, 0, 11) }),
    brief(P.verhuizing, { area: kantoor, goal: "Het kantoor verhuisd zonder dat het werk stilvalt.", state: "completed" }),
  ];

  const agent: AgentSettings = {
    selfCheck: { ok: true, at: dayAt(now, 0, 8, 41) > now ? now - 20 * MIN : dayAt(now, 0, 8, 41), text: "modeldienst, toestemmingsregels en toegestane mappen komen overeen met de instellingen van deze app." },
    werkwijzen,
    safeDefault: [
      { kind: "allow", text: "Lezen en onderzoeken: het web en de planken die toegestaan zijn waar je bent" },
      { kind: "allow", text: "Schrijven naar Alleen jij" },
      { kind: "deny", text: "Versturen, delen, publiceren of iets buiten de app wijzigen" },
    ],
    caps: { money: 5, currency: "EUR", toolCalls: 200, minutes: 90 },
    rules: [
      { risk: "R0", action: "Mail, agenda en de Bibliotheek lezen; op het web zoeken", className: "R0 · lezen", effect: "allow", choices: [], note: null },
      { risk: "R1", action: "To-do's, vlaggen in Outlook, Alleen jij", className: "R1 · privé, terug te draaien", effect: "allow_undo", choices: [], note: null },
      { risk: "R2", action: "Een Outlook-concept maken of bijwerken", className: "R2 · privéconcept", effect: "allow", choices: [], note: null },
      { risk: "R3", action: "Voorstellen aan een gedeelde plank; agendablokken toevoegen", className: "R3 · zichtbaar voor het team", effect: "ask", choices: ["allow", "ask", "deny"], note: null },
      { risk: "R4", action: "E-mail versturen of beantwoorden; uitnodigingen beantwoorden; afspraken met deelnemers", className: "R4 · extern", effect: "ask", choices: ["ask", "deny"], note: "Een vaste toestemming voor externe acties is nog niet beschikbaar." },
      { risk: "R5", action: "Mail of afspraken verwijderen, mailregels, bulkmail, klantinhoud zonder controle naar het team verplaatsen", className: "R5 · verboden", effect: "locked", choices: [], note: "Vast door het teambeleid" },
    ],
    denials: [
      { id: "dn-1", title: "Geblokkeerd: nieuw hulpmiddel \"crm.opzoeken\" is niet ingedeeld", runId: "RUN-0419", at: now - 61 * MIN, reason: "unclassified", detail: "Telt als extern tot je het indeelt" },
      { id: "dn-2", title: "Geblokkeerd door een regel: schrijven buiten de toegestane mappen", runId: "RUN-0416", at: dayAt(now, -1, 14, 30), reason: "rule", detail: "De run probeerde naar je bureaublad te schrijven" },
    ],
    contradictions: 1,
  };

  const activity: ActivityEntry[] = [
    { id: "ac-1", at: now - 71 * MIN, actor: "agent", actorName: "Agent", text: "Notitie van stap 4 van RUN-0417 klaargezet voor controle", basis: "9 bronnen · werkwijze Opties vergelijken v3", projectId: P.offertes, runId: "RUN-0417" },
    { id: "ac-2", at: now - 54 * MIN, actor: "agent", actorName: "Agent", text: "RUN-0420 stelde een vraag over de versie van de richtlijn", basis: "Twee versies gevonden op de plank van het team", projectId: P.service, runId: "RUN-0420" },
    { id: "ac-3", at: now - 92 * MIN, actor: "app", actorName: "De app", text: "DKS-142 ging naar In behandeling", basis: "HubSpot", projectId: P.offertes, runId: null },
    { id: "ac-4", at: dayAt(now, -1, 21, 30), actor: "you", actorName: "Jij", text: "Ging door met stap 3 van RUN-0417", basis: "Controles 5 van 5", projectId: P.offertes, runId: "RUN-0417" },
    { id: "ac-5", at: dayAt(now, -1, 9, 14), actor: "you", actorName: "Jij", text: "Keurde OUT-0092 goed: wijziging in Kortingsbeleid 2026", basis: "Voorstel van Ruben de Boer", projectId: null, runId: null },
    { id: "ac-6", at: dayAt(now, -1, 9, 2), actor: "colleague", actorName: "Fleur Jansen", text: "Controleerde de checklist privacy klantgegevens opnieuw", basis: null, projectId: null, runId: null },
    { id: "ac-7", at: dayAt(now, -1, 17, 42), actor: "app", actorName: "De app", text: "Verbinding met Outlook viel weg tijdens het versturen van OUT-0091", basis: "Niet opnieuw geprobeerd", projectId: P.service, runId: "RUN-0414" },
    { id: "ac-8", at: dayAt(now, -1, 15, 48), actor: "you", actorName: "Jij", text: "Delegeerde \"Optie-overzicht naar Lars sturen\" als RUN-0417", basis: "Mail van Lars van Dijk", projectId: P.offertes, runId: "RUN-0417" },
  ];

  return {
    version: 1,
    seededAt: now,
    todos,
    waiting,
    inbox,
    runs,
    approvals,
    sent,
    activity,
    shelves,
    pages,
    requests,
    proposals,
    areas,
    briefs,
    calendar,
    agent,
    werkwijzen,
    lastSeenAt: dayAt(now, -1, 18, 40),
    planCommittedAt: null,
  };
}

/** `?demo=leeg`: no projects, so no story; shelves, werkwijzen and the agent settings stay. */
export function emptyCockpitSeed(now: number): CockpitState {
  const full = createCockpitSeed(now);
  return {
    ...full,
    todos: [],
    waiting: [],
    inbox: [],
    runs: [],
    approvals: [],
    sent: [],
    activity: [],
    pages: [],
    requests: [],
    proposals: [],
    briefs: [],
    calendar: full.calendar,
  };
}

/** "Terwijl je weg was", grouped per project (demo text, newest first within a group). */
export function demoAway(now: number): AwayGroup[] {
  return [
    {
      projectId: P.offertes,
      label: "Offertes 2026",
      lines: ["Jij ging om 21:30 door met stap 3 van RUN-0417", "DKS-142 ging naar In behandeling", `Notitie van stap 4 klaar om te controleren, ${new Date(now - 71 * MIN).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}`],
      link: { label: "Project openen", href: `#/p/${P.offertes}` },
    },
    {
      projectId: P.service,
      label: "Klantenservice",
      lines: ["RUN-0420 stelde een vraag", "RUN-0416 is klaar, met 1 punt van aandacht"],
      link: { label: "Runs openen", href: "#/runs" },
    },
    {
      projectId: null,
      label: "Bibliotheek",
      lines: ["Fleur Jansen controleerde de checklist privacy klantgegevens opnieuw"],
      link: { label: "Bibliotheek openen", href: "#/bibliotheek" },
    },
  ];
}
