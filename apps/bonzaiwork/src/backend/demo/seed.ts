import type {
  AuditEntry,
  Chat,
  ChatError,
  ChatGroup,
  Command,
  Connection,
  KeyMode,
  Message,
  MessagePart,
  Model,
  PermissionRequest,
  Project,
  ProjectFile,
  QuestionRequest,
  Routine,
  RoutineRun,
  RunMode,
  SkillContent,
  ToolPart,
  Usage,
} from "../types";
import { localTimezone, nextOccurrence } from "~/lib/schedule";

/** Everything the demo backend keeps, persisted per browser. */
export type DemoState = {
  version: 3;
  keyMode: KeyMode;
  userKey: string | null;
  models: Model[];
  defaultModel: string;
  defaultFolder: string;
  projects: (Project & { createdAt: number; keyValue: string | null })[];
  chats: Chat[];
  messages: Record<string, Message[]>;
  groups: Record<string, { groups: ChatGroup[]; assignments: Record<string, string> }>;
  permissions: PermissionRequest[];
  questions: QuestionRequest[];
  instructions: Record<string, string>;
  skills: Record<string, SkillContent[]>;
  commands: Record<string, Command[]>;
  connections: Record<string, Connection[]>;
  runModes: Record<string, RunMode>;
  folders: Record<string, string[]>;
  files: Record<string, ProjectFile[]>;
  audit: Record<string, AuditEntry[]>;
  usage: Record<string, Usage>;
  routines: Routine[];
  runs: Record<string, RoutineRun[]>;
  env: Record<string, string>;
  lastSeenAt: number;
  /** Chats whose reply the demo plays out right after loading. */
  pendingReplays: string[];
};

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
export const DEMO_HOME = "/Users/demo/BonzaiWork";

export const DEMO_MODELS: Model[] = [
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5" },
  { id: "claude-haiku-5-5", name: "Claude Haiku 5.5" },
  { id: "gpt-5-2", name: "GPT-5.2" },
  { id: "mistral-large-3", name: "Mistral Large 3" },
];

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

type ToolSpec = { tool: string; input: Record<string, unknown>; output?: string; error?: string; ms?: number; child?: string };

function tokens(text: string, extra = 0) {
  const out = Math.round(text.length / 3.6);
  return { input: 2_400 + extra, output: out, reasoning: Math.round(out * 0.3), cacheRead: 1_800 + extra, cacheWrite: 0 };
}

function userMessage(chatId: string, id: string, at: number, text: string): Message {
  return { id, chatId, role: "user", createdAt: at, completedAt: at, parts: [{ type: "text", id: `${id}:t`, text }], model: null, tokens: null, error: null };
}

function assistantMessage(
  chatId: string,
  id: string,
  at: number,
  spec: { reasoning?: string; tools?: ToolSpec[]; text?: string; after?: ToolSpec[]; closing?: string; model?: string; error?: ChatError; open?: boolean },
): Message {
  const parts: MessagePart[] = [];
  let clock = at + 1_500;
  if (spec.reasoning) {
    parts.push({ type: "reasoning", id: `${id}:r`, text: spec.reasoning, startedAt: at + 400, endedAt: at + 1_400 });
  }
  const pushTools = (list: ToolSpec[] | undefined, offset: number) => {
    list?.forEach((tool, index) => {
      const ms = tool.ms ?? 900;
      const part: ToolPart = {
        type: "tool",
        id: `${id}:tool${offset + index}`,
        tool: tool.tool,
        status: tool.error ? "error" : "completed",
        input: tool.input,
        output: tool.output ?? null,
        error: tool.error ?? null,
        startedAt: clock,
        endedAt: clock + ms,
        childChatId: tool.child ?? null,
      };
      parts.push(part);
      clock += ms + 250;
    });
  };
  pushTools(spec.tools, 0);
  if (spec.text) parts.push({ type: "text", id: `${id}:t`, text: spec.text });
  pushTools(spec.after, 10);
  if (spec.closing) parts.push({ type: "text", id: `${id}:t2`, text: spec.closing });
  const allText = [spec.text, spec.closing].filter(Boolean).join("\n");
  return {
    id,
    chatId,
    role: "assistant",
    createdAt: at,
    completedAt: spec.open ? null : clock + 2_000,
    parts,
    model: spec.model ?? "claude-sonnet-5-5",
    tokens: spec.error ? null : tokens(allText, (spec.tools?.length ?? 0) * 900),
    error: spec.error ?? null,
  };
}

function chat(projectId: string, id: string, title: string, createdAt: number, updatedAt: number, extra: Partial<Chat> = {}): Chat {
  return {
    id,
    projectId,
    title,
    untitled: false,
    createdAt,
    updatedAt,
    model: "claude-sonnet-5-5",
    parentId: null,
    groupId: null,
    pinned: false,
    archived: false,
    note: null,
    status: "idle",
    revertMessageId: null,
    routineId: null,
    ...extra,
  };
}

function project(
  id: string,
  name: string,
  createdAt: number,
  extra: Partial<Project> & { keyValue?: string | null },
): Project & { createdAt: number; keyValue: string | null } {
  const keyValue = extra.keyValue === undefined ? `sk-demo-${id}-7f3a` : extra.keyValue;
  return {
    id,
    name,
    path: `${DEMO_HOME}/${name}`,
    description: null,
    color: "jade",
    icon: "folder",
    pinned: false,
    archivedAt: null,
    key: keyValue ? { hasKey: true, keyHint: `…${keyValue.slice(-4)}` } : { hasKey: false, keyHint: null },
    defaultModel: "claude-sonnet-5-5",
    allowedModels: null,
    createdAt,
    ...extra,
    keyValue,
  };
}

function file(path: string, bytes: number, updatedAt: number): ProjectFile {
  return { path, bytes, updatedAt };
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const OFFERTE_TEXT = `Ik heb de offerte opgesteld volgens het sjabloon en opgeslagen als **offertes/2026-031-bakkerij-van-dijk.md**.

| Onderdeel | Aantal | Tarief | Totaal |
|---|---|---|---|
| Onderhoud webshop (per maand) | 6 uur | € 92,50 | € 555,00 |
| Hostingpakket Plus (per maand) | 1 | € 39,00 | € 39,00 |
| Migratie naar nieuwe hosting (eenmalig) | 14 uur | € 92,50 | € 1.295,00 |

- **Per maand:** € 594,00 excl. btw (€ 718,74 incl. btw)
- **Eenmalig:** € 1.295,00 excl. btw (€ 1.566,95 incl. btw)

De looptijd staat op 12 maanden met een opzegtermijn van één maand, zoals in het sjabloon. De migratie heb ik op 14 uur geschat: de webshop draait nog op de oude PHP-versie en de productfoto's (± 2.300 stuks) moeten mee.

Zal ik ook een begeleidende mail schrijven?`;

const MAIL_TEXT = `Hier is een voorstel:

---

**Onderwerp:** Offerte onderhoud en migratie webshop

Beste Marieke,

Dank voor het prettige gesprek van vorige week. Zoals beloofd stuur ik je hierbij onze offerte voor het onderhoud van jullie webshop en de verhuizing naar de nieuwe hosting.

Kort samengevat:

- 6 uur onderhoud per maand, inclusief updates en een maandelijkse controle van de bestelstraat;
- een eenmalige migratie, die we buiten jullie drukke ochtenden plannen;
- alles voor € 594 per maand en € 1.295 eenmalig (excl. btw).

De offerte is 30 dagen geldig. Heb je vragen, of wil je iets aanpassen? Bel of mail me gerust.

Met vriendelijke groet,

Sanne Bakker

---

Wil je een andere toon, of moet de mail korter?`;

const WEEK_TEXT = `**Week 44: 4 offertes verstuurd, 1 akkoord**

| Klant | Bedrag (excl. btw) | Verstuurd | Status |
|---|---|---|---|
| Bakkerij Van Dijk | € 1.295 + € 594 p/m | ma 26 okt | Wacht op reactie |
| Fysiopraktijk De Linde | € 3.850 | di 27 okt | **Akkoord** |
| Tegelhandel Mertens | € 7.200 | wo 28 okt | Wacht op reactie |
| Stichting Groen Dorp | € 1.100 | wo 28 okt | Vraag over planning |

**Opvallend**

- De offerte voor Tegelhandel Mertens is de grootste van dit kwartaal. In HubSpot staat een belafspraak op vrijdag.
- Stichting Groen Dorp vraagt of de oplevering vóór 1 december kan. Dat past alleen als de migratie van Van Dijk een week opschuift.

**Openstaand uit eerdere weken:** 2 offertes ouder dan 14 dagen (samen € 4.650). Zal ik opvolgmails voorbereiden?`;

const NEWSLETTER_TEXT = `## Nieuwsbrief november (concept)

**Onderwerpregel:** Drie dingen die je webshop klaar maken voor de feestdagen

Beste lezer,

De drukste weken van het jaar komen eraan. Met deze drie checks voorkom je dat bezoekers afhaken net voordat ze afrekenen:

1. **Test je bestelstraat op je telefoon.** Meer dan 70% van de bezoekers bestelt mobiel. Werkt iDEAL in twee tikken?
2. **Zet je levertijden duidelijk neer.** "Vóór 22:00 besteld, morgen in huis" verkoopt beter dan een kleine regel onderaan.
3. **Maak je site sneller.** Elke seconde laadtijd kost conversie. Kleinere foto's zijn vaak de snelste winst.

*Uitnodiging:* op 19 november geven we een gratis webinar over conversie in de feestdagen. [Meld je aan](https://example.com/webinar).

---

De toon is informeel en kort, zoals in de vorige drie nieuwsbrieven. Zal ik er een versie voor bestaande klanten naast zetten, met een korting op een snelheidscheck?`;

const FAQ_TEXT = `Ik heb de vijf meest gestelde vragen van de afgelopen maand uitgewerkt en opgeslagen in **faq/antwoorden-oktober.md**.

1. **Wanneer wordt mijn bestelling geleverd?** Binnen 2 werkdagen; vóór 14:00 besteld is de volgende werkdag verzonden.
2. **Kan ik mijn bestelling nog wijzigen?** Ja, tot het moment van verzenden. Mail of bel ons met je ordernummer.
3. **Hoe retourneer ik iets?** Binnen 30 dagen via het retourformulier; het retourlabel is gratis.
4. **Mijn betaling is mislukt, wat nu?** Er is dan niets afgeschreven. Probeer het opnieuw of kies een andere betaalmethode.
5. **Hebben jullie een winkel?** Nee, we verkopen alleen online. Ophalen kan op afspraak in Utrecht.

De antwoorden volgen de toon uit **huisstijl.md**: je-vorm, korte zinnen, geen vaktaal.`;

const BTW_TEXT = `De aangifte voor Q3 sluit op **€ 4.812** te betalen btw. Ik vond twee punten die je moet nakijken:

1. **Factuur 2026-0412 (Drukkerij Peters)** staat dubbel in de inkoopadministratie: € 311,85 btw te veel afgetrokken.
2. **Een buitenlandse factuur (Figma, € 540)** is geboekt met 21% btw. Dat moet *verlegd* zijn (rubriek 4b).

Na correctie wordt het te betalen bedrag **€ 5.123,85**. De bestanden in de administratiemap heb ik niet aangepast. Wil je dat ik een correctielijst maak voor de boekhouder?`;

const MOVE_TEXT = `Ik heb een checklist gemaakt in **verhuizing/checklist.md**, gegroepeerd per week. De belangrijkste deadline: het opzeggen van het internetcontract moet uiterlijk 1 september, anders loopt het een maand langer door.`;

// ---------------------------------------------------------------------------
// The seed
// ---------------------------------------------------------------------------

export function createSeed(now: number, options: { empty: boolean; keyMode: KeyMode }): DemoState {
  const zone = localTimezone();
  const base: DemoState = {
    version: 3,
    keyMode: options.keyMode,
    userKey: options.keyMode === "user" && !options.empty ? "sk-demo-persoonlijk-91c2" : null,
    models: DEMO_MODELS,
    defaultModel: "claude-sonnet-5-5",
    defaultFolder: DEMO_HOME,
    projects: [],
    chats: [],
    messages: {},
    groups: {},
    permissions: [],
    questions: [],
    instructions: {},
    skills: {
      global: [
        {
          skill: { name: "nederlands-zakelijk", description: "Zakelijk Nederlands: je-vorm, korte zinnen, geen anglicismen.", scope: "global", error: null },
          content: "# Zakelijk Nederlands\n\n- Schrijf in de je-vorm, tenzij de klant u gebruikt.\n- Houd zinnen korter dan twintig woorden.\n- Vermijd Engelse termen als er een gewoon Nederlands woord is.",
        },
      ],
    },
    commands: {
      global: [{ name: "samenvatten", description: "Vat dit samen in vijf punten", template: "Vat het volgende samen in maximaal vijf punten: $ARGUMENTS", scope: "global" }],
    },
    connections: {},
    runModes: {},
    folders: {},
    files: {},
    audit: {},
    usage: {},
    routines: [],
    runs: {},
    env: { HUBSPOT_TOKEN: "demo", EXACT_CLIENT_ID: "demo" },
    lastSeenAt: now,
    pendingReplays: [],
  };
  if (options.empty) return base;

  const workspaceKeys = options.keyMode === "workspace";
  const keyless = (value: string | null) => (workspaceKeys ? value : null);

  // Projects ----------------------------------------------------------------
  base.projects = [
    project("p-offertes", "Offertes 2026", now - 120 * DAY, {
      description: "Offertes en prijsvoorstellen voor nieuwe klanten",
      color: "jade",
      icon: "briefcase",
      pinned: true,
      keyValue: keyless("sk-demo-offertes-4d1e"),
    }),
    project("p-marketing", "Marketing Q4", now - 60 * DAY, {
      description: "Nieuwsbrieven, social posts en het webinar in november",
      color: "violet",
      icon: "megaphone",
      pinned: true,
      keyValue: keyless("sk-demo-marketing-a07b"),
    }),
    project("p-service", "Klantenservice", now - 200 * DAY, {
      description: "Antwoorden op klantvragen en klachten",
      color: "blue",
      icon: "users",
      keyValue: keyless("sk-demo-service-0c55"),
      defaultModel: "claude-haiku-5-5",
    }),
    project("p-finance", "Financiën en administratie", now - 300 * DAY, {
      description: "Btw-aangiftes, facturen en de maandafsluiting",
      color: "amber",
      icon: "chart",
      keyValue: keyless("sk-demo-finance-9e21"),
      allowedModels: ["claude-sonnet-5-5", "gpt-5-2"],
    }),
    project("p-website", "Website-teksten", now - 3 * DAY, {
      description: "Nieuwe teksten voor de vernieuwde website",
      color: "pink",
      icon: "file-text",
      keyValue: workspaceKeys ? null : "unused",
    }),
    project("p-verhuizing", "Verhuizing kantoor", now - 400 * DAY, {
      description: "Planning en checklist voor de verhuizing naar de Vaartsche Rijn",
      color: "sage",
      icon: "folder",
      archivedAt: now - 70 * DAY,
      keyValue: keyless("sk-demo-verhuizing-55aa"),
    }),
  ];
  if (!workspaceKeys) {
    for (const entry of base.projects) {
      entry.key = { hasKey: false, keyHint: null };
      entry.keyValue = null;
    }
  }

  // Offertes 2026 -------------------------------------------------------------
  const offertes = "p-offertes";
  const tVanDijk = now - 2 * DAY - 3 * HOUR;
  const tIndex = now - 25 * MIN;
  const tWeek = now - 2 * DAY + 9 * HOUR;
  const tFollow = now - 5 * DAY;
  base.chats.push(
    chat(offertes, "c-vandijk", "Offerte onderhoudscontract Bakkerij Van Dijk", tVanDijk, tVanDijk + 14 * MIN, { pinned: true, groupId: "g-nieuw" }),
    chat(offertes, "c-index", "Prijsindexatie 2027 doorrekenen", tIndex, tIndex + 2 * MIN, { status: "waiting" }),
    chat(offertes, "c-week", "Weekoverzicht offertes, week 44", tWeek, tWeek + 3 * MIN, { routineId: "r-week" }),
    chat(offertes, "c-week-sub", "Status van offertes uit HubSpot ophalen", tWeek + 40_000, tWeek + 90_000, { parentId: "c-week", model: "claude-haiku-5-5" }),
    chat(offertes, "c-follow", "Opvolgmails openstaande offertes", tFollow, tFollow + 6 * MIN, { groupId: "g-opvolging" }),
  );
  base.groups[offertes] = {
    groups: [{ id: "g-nieuw", label: "Nieuwe klanten" }, { id: "g-opvolging", label: "Opvolging" }],
    assignments: { "c-vandijk": "g-nieuw", "c-follow": "g-opvolging" },
  };
  base.messages["c-vandijk"] = [
    userMessage("c-vandijk", "m-vd-1", tVanDijk, "Maak een offerte voor Bakkerij Van Dijk: maandelijks onderhoud van hun webshop, 6 uur per maand, plus een eenmalige migratie naar de nieuwe hosting. Gebruik ons sjabloon."),
    assistantMessage("c-vandijk", "m-vd-2", tVanDijk + 5_000, {
      reasoning: "Het sjabloon en de prijslijst lezen, daarna het klantdossier voor de huidige hostingsituatie.",
      tools: [
        { tool: "read", input: { filePath: "sjablonen/sjabloon-offerte.md" }, output: "# Offerte {nummer}\n…", ms: 600 },
        { tool: "read", input: { filePath: "prijslijst-2026.md" }, output: "Uurtarief onderhoud: € 92,50\nHostingpakket Plus: € 39,00 p/m\n…", ms: 500 },
        { tool: "read", input: { filePath: "klanten/bakkerij-van-dijk.md" }, output: "Contact: Marieke van Dijk\nWebshop: WooCommerce, PHP 7.4\n…", ms: 700 },
        { tool: "write", input: { filePath: "offertes/2026-031-bakkerij-van-dijk.md" }, output: "Wrote 2.4 KB", ms: 1_100 },
      ],
      text: OFFERTE_TEXT,
    }),
    userMessage("c-vandijk", "m-vd-3", tVanDijk + 9 * MIN, "Ja, schrijf een korte begeleidende mail aan Marieke."),
    assistantMessage("c-vandijk", "m-vd-4", tVanDijk + 9 * MIN + 4_000, { tools: [{ tool: "skill", input: { name: "offerte-schrijven" }, ms: 300 }], text: MAIL_TEXT }),
  ];
  base.messages["c-index"] = [
    userMessage("c-index", "m-ix-1", tIndex, "Reken de prijslijst door met 3,8% indexatie voor 2027 en zet het resultaat in een nieuwe prijslijst."),
    {
      ...assistantMessage("c-index", "m-ix-2", tIndex + 4_000, {
        tools: [{ tool: "read", input: { filePath: "prijslijst-2026.md" }, output: "Uurtarief onderhoud: € 92,50\n…", ms: 500 }],
        text: "Ik heb alle tarieven met 3,8% verhoogd. Uurtarieven heb ik afgerond op hele euro's (onderhoud wordt € 96,00), pakketprijzen op € 0,50. Ik sla het resultaat op als **prijslijst-2027.md**; de prijslijst van 2026 blijft staan.",
        open: true,
      }),
    },
  ];
  const indexMessage = base.messages["c-index"][1];
  if (indexMessage) {
    indexMessage.parts.push({
      type: "tool",
      id: "m-ix-2:write",
      tool: "write",
      status: "running",
      input: { filePath: "prijslijst-2027.md" },
      output: null,
      error: null,
      startedAt: tIndex + 9_000,
      endedAt: null,
      childChatId: null,
    });
  }
  base.permissions.push({
    id: "perm-index",
    chatId: "c-index",
    action: "edit",
    resources: ["prijslijst-2027.md"],
    canAlways: true,
    message: null,
  });
  base.messages["c-week"] = [
    userMessage("c-week", "m-wk-1", tWeek, "Maak een overzicht van alle offertes die deze week zijn verstuurd, met bedrag en status. Haal de status uit HubSpot."),
    assistantMessage("c-week", "m-wk-2", tWeek + 3_000, {
      tools: [
        { tool: "glob", input: { pattern: "offertes/2026-0*.md" }, output: "offertes/2026-028-…\noffertes/2026-029-…", ms: 300 },
        { tool: "read", input: { filePath: "offertes/2026-031-bakkerij-van-dijk.md" }, ms: 400 },
        { tool: "read", input: { filePath: "offertes/2026-032-fysiopraktijk-de-linde.md" }, ms: 400 },
        { tool: "read", input: { filePath: "offertes/2026-033-tegelhandel-mertens.md" }, ms: 400 },
        { tool: "task", input: { description: "Status van offertes uit HubSpot ophalen" }, output: "4 deals gevonden", ms: 48_000, child: "c-week-sub" },
      ],
      text: WEEK_TEXT,
    }),
  ];
  base.messages["c-week-sub"] = [
    userMessage("c-week-sub", "m-ws-1", tWeek + 40_000, "Zoek in HubSpot de deals voor offertes 2026-031 t/m 2026-034 en geef per deal de status en de volgende activiteit."),
    assistantMessage("c-week-sub", "m-ws-2", tWeek + 42_000, {
      model: "claude-haiku-5-5",
      tools: [
        { tool: "hubspot_search_deals", input: { query: "2026-031 2026-032 2026-033 2026-034" }, output: "4 deals", ms: 2_200 },
        { tool: "hubspot_get_activities", input: { dealIds: ["…"] }, output: "3 activiteiten", ms: 1_800 },
      ],
      text: "Vier deals gevonden. De Linde staat op *Closed won*; Mertens heeft een belafspraak op vrijdag 30 oktober; Van Dijk en Groen Dorp staan op *Offerte verstuurd*.",
    }),
  ];
  base.messages["c-follow"] = [
    userMessage("c-follow", "m-fo-1", tFollow, "Welke offertes staan langer dan twee weken open? Schrijf voor elk een korte, vriendelijke opvolgmail."),
    assistantMessage("c-follow", "m-fo-2", tFollow + 3_500, {
      tools: [
        { tool: "grep", input: { pattern: "Status: verstuurd" }, output: "2 bestanden", ms: 300 },
        { tool: "read", input: { filePath: "offertes/2026-024-autobedrijf-hendriks.md" }, ms: 400 },
        { tool: "read", input: { filePath: "offertes/2026-026-kinderopvang-zonnebloem.md" }, ms: 400 },
      ],
      text: "Twee offertes staan langer dan 14 dagen open:\n\n1. **Autobedrijf Hendriks** (€ 3.400, verstuurd 6 okt)\n2. **Kinderopvang De Zonnebloem** (€ 1.250, verstuurd 9 okt)\n\n**Mail aan Hendriks**\n\n> Beste Ruud, ik ben benieuwd hoe je tegen onze offerte voor de nieuwe website aankijkt. Zullen we volgende week tien minuten bellen om je vragen door te nemen?\n\n**Mail aan De Zonnebloem**\n\n> Beste Ilse, heb je de offerte voor het ouderportaal kunnen bespreken met het team? Als het helpt, kan ik de planning ook in twee fases opdelen.",
    }),
  ];

  // Marketing Q4 --------------------------------------------------------------
  const marketing = "p-marketing";
  const tNews = now - 26 * HOUR;
  const tLinked = now - 4 * DAY;
  const tComp = now - 2 * MIN;
  base.chats.push(
    chat(marketing, "c-news", "Nieuwsbrief november", tNews, tNews + 8 * MIN),
    chat(marketing, "c-linkedin", "LinkedIn-posts voor het webinar", tLinked, tLinked + 12 * MIN, { groupId: "g-social", model: "gpt-5-2" }),
    chat(marketing, "c-comp", "Concurrentieanalyse webdesignbureaus Utrecht", tComp, tComp + 20_000, { status: "running" }),
  );
  base.groups[marketing] = { groups: [{ id: "g-social", label: "Social" }], assignments: { "c-linkedin": "g-social" } };
  base.messages["c-news"] = [
    userMessage("c-news", "m-nw-1", tNews, "Schrijf de nieuwsbrief voor november. Thema: webshops klaar voor de feestdagen. Verwijs naar ons webinar op 19 november."),
    assistantMessage("c-news", "m-nw-2", tNews + 3_000, {
      tools: [
        { tool: "read", input: { filePath: "nieuwsbrieven/2026-10-oktober.md" }, ms: 400 },
        { tool: "skill", input: { name: "huisstijl-teksten" }, ms: 200 },
      ],
      text: NEWSLETTER_TEXT,
    }),
  ];
  base.messages["c-linkedin"] = [
    userMessage("c-linkedin", "m-li-1", tLinked, "Maak drie LinkedIn-posts om het webinar van 19 november aan te kondigen. Kort, met een vraag aan het eind."),
    assistantMessage("c-linkedin", "m-li-2", tLinked + 2_500, {
      model: "gpt-5-2",
      text: "**Post 1 (aankondiging)**\n\nVan de tien bezoekers die iets in hun winkelwagen leggen, rekenen er gemiddeld maar drie af. Op 19 november laten we in 45 minuten zien hoe je dat in december verbetert. Gratis, online, met tijd voor vragen.\n\nWat is jouw grootste afhaker in de bestelstraat?\n\n**Post 2 (een week ervoor)**\n\nNog zeven dagen tot ons webinar over conversie in de feestdagen. Eén tip alvast: zet je levertijd bovenaan je productpagina.\n\nWelke tip wil jij er nog bij hebben?\n\n**Post 3 (op de dag zelf)**\n\nVanmiddag om 15:00 live: webshops klaar voor de feestdagen. Laatste kans om je aan te melden.\n\nZien we je straks?",
    }),
  ];
  base.messages["c-comp"] = [
    userMessage("c-comp", "m-cp-1", tComp, "Zoek de vijf grootste webdesignbureaus in Utrecht en zet hun diensten, prijsindicatie en opvallende klanten naast die van ons."),
  ];
  base.pendingReplays.push("c-comp");

  // Klantenservice -------------------------------------------------------------
  const service = "p-service";
  const tFaq = now - 6 * DAY;
  const tComplaint = now - 50 * MIN;
  base.chats.push(
    chat(service, "c-faq", "Antwoorden op veelgestelde vragen", tFaq, tFaq + 7 * MIN, { model: "claude-haiku-5-5" }),
    chat(service, "c-complaint", "Klacht over levering order 4471", tComplaint, tComplaint + 3 * MIN, { status: "waiting", model: "claude-haiku-5-5" }),
  );
  base.messages["c-faq"] = [
    userMessage("c-faq", "m-fq-1", tFaq, "Werk de vijf meest gestelde vragen van oktober uit tot korte antwoorden voor op de website."),
    assistantMessage("c-faq", "m-fq-2", tFaq + 2_000, {
      model: "claude-haiku-5-5",
      tools: [
        { tool: "read", input: { filePath: "tickets/oktober-export.csv" }, ms: 900 },
        { tool: "read", input: { filePath: "huisstijl.md" }, ms: 300 },
        { tool: "write", input: { filePath: "faq/antwoorden-oktober.md" }, ms: 600 },
      ],
      text: FAQ_TEXT,
    }),
  ];
  base.messages["c-complaint"] = [
    userMessage("c-complaint", "m-cl-1", tComplaint, "Een klant (order 4471) kreeg haar bestelling vijf dagen te laat en de verpakking was beschadigd. Schrijf een antwoord."),
    assistantMessage("c-complaint", "m-cl-2", tComplaint + 2_500, {
      model: "claude-haiku-5-5",
      tools: [{ tool: "read", input: { filePath: "orders/4471.json" }, ms: 400 }],
      text: "Ik zie dat order 4471 via de vervangende vervoerder is verzonden en op 23 oktober is bezorgd in plaats van 18 oktober. Voordat ik het antwoord schrijf: hoe wil je de klant tegemoetkomen?",
      open: true,
    }),
  ];
  base.questions.push({
    id: "q-complaint",
    chatId: "c-complaint",
    fields: [
      {
        key: "compensation",
        title: "Tegemoetkoming",
        description: "Hoe wil je de klant tegemoetkomen?",
        multiple: false,
        custom: true,
        options: [
          { value: "discount", label: "10% korting op de volgende bestelling", description: "Kortingscode, 3 maanden geldig" },
          { value: "shipping", label: "Verzendkosten terugbetalen", description: "€ 6,95 terug op de rekening" },
          { value: "refund", label: "Volledige terugbetaling", description: "Klant houdt de producten" },
        ],
      },
    ],
  });

  // Financiën ------------------------------------------------------------------
  const finance = "p-finance";
  const tBtw = now - 9 * DAY;
  const tInv = now - 3 * HOUR;
  base.chats.push(
    chat(finance, "c-btw", "Btw-aangifte Q3 controleren", tBtw, tBtw + 11 * MIN, { pinned: true }),
    chat(finance, "c-invoices", "Openstaande facturen oktober", tInv, tInv + 1 * MIN, { status: "failed", model: "gpt-5-2" }),
  );
  base.messages["c-btw"] = [
    userMessage("c-btw", "m-bt-1", tBtw, "Controleer de btw-aangifte van Q3 op fouten voordat ik hem indien."),
    assistantMessage("c-btw", "m-bt-2", tBtw + 3_000, {
      reasoning: "Eerst de aangifte zelf, dan de in- en verkoopboeken van juli tot en met september naast elkaar leggen.",
      tools: [
        { tool: "read", input: { filePath: "administratie/btw-q3-concept.pdf" }, ms: 1_200 },
        { tool: "read", input: { filePath: "administratie/inkoopboek-2026-q3.xlsx" }, error: "Bestand is beveiligd met een wachtwoord", ms: 400 },
        { tool: "read", input: { filePath: "administratie/inkoopboek-2026-q3.csv" }, ms: 900 },
        { tool: "read", input: { filePath: "administratie/verkoopboek-2026-q3.csv" }, ms: 800 },
      ],
      text: BTW_TEXT,
    }),
  ];
  base.messages["c-invoices"] = [
    userMessage("c-invoices", "m-in-1", tInv, "Welke facturen van oktober zijn nog niet betaald? Zet ze op volgorde van vervaldatum."),
    assistantMessage("c-invoices", "m-in-2", tInv + 1_500, { model: "gpt-5-2", error: { kind: "budget_exceeded", detail: null } }),
  ];

  // Verhuizing (archived) --------------------------------------------------------
  const move = "p-verhuizing";
  const tMove = now - 95 * DAY;
  base.chats.push(chat(move, "c-move", "Checklist verhuizing", tMove, tMove + 20 * MIN));
  base.messages["c-move"] = [
    userMessage("c-move", "m-mv-1", tMove, "Maak een checklist voor de verhuizing op 1 oktober."),
    assistantMessage("c-move", "m-mv-2", tMove + 3_000, { tools: [{ tool: "write", input: { filePath: "verhuizing/checklist.md" }, ms: 700 }], text: MOVE_TEXT }),
  ];

  // Configuration ------------------------------------------------------------------
  base.instructions[offertes] = "# Offertes\n\n- Gebruik altijd het sjabloon in sjablonen/sjabloon-offerte.md.\n- Bedragen excl. btw, met het totaal incl. btw eronder.\n- Offertenummers: 2026-<volgnummer>-<klant>.\n";
  base.instructions[service] = "# Klantenservice\n\n- Schrijf in de je-vorm, vriendelijk en kort.\n- Bied nooit meer dan 15% korting zonder overleg.\n";
  base.skills[offertes] = [
    {
      skill: { name: "offerte-schrijven", description: "Een offerte opstellen volgens ons sjabloon en onze prijslijst.", scope: "project", error: null },
      content: "# Offerte schrijven\n\n1. Lees sjablonen/sjabloon-offerte.md en de actuele prijslijst.\n2. Zoek de klant op in klanten/.\n3. Reken alles uit excl. btw en zet het totaal incl. btw eronder.\n4. Sla op in offertes/ met het volgende nummer.",
    },
    {
      skill: { name: "prijsberekening", description: "Uren en pakketten omrekenen naar bedragen.", scope: "project", error: null },
      content: "# Prijsberekening\n\nGebruik de tarieven uit de prijslijst van het lopende jaar. Rond af op hele euro's per regel.",
    },
  ];
  base.skills[marketing] = [
    {
      skill: { name: "huisstijl-teksten", description: "Teksten in onze huisstijl: informeel, kort, concreet.", scope: "project", error: null },
      content: "# Huisstijl\n\n- Je-vorm.\n- Maximaal drie zinnen per alinea.\n- Elke tekst eindigt met één duidelijke volgende stap.",
    },
  ];
  base.commands[offertes] = [
    { name: "offerte", description: "Nieuwe offerte volgens sjabloon", template: "Schrijf een offerte voor $ARGUMENTS volgens ons sjabloon en de prijslijst van dit jaar.", scope: "workspace" },
    { name: "opvolgmail", description: "Opvolgmail voor een openstaande offerte", template: "Schrijf een korte, vriendelijke opvolgmail voor de offerte aan $ARGUMENTS.", scope: "workspace" },
  ];
  base.connections[offertes] = [
    { name: "hubspot", kind: "remote", target: "https://mcp.hubspot.com/anthropic", enabled: true, status: "connected", error: null, scope: "project" },
    { name: "exact-online", kind: "remote", target: "https://mcp.exact.example/v1", enabled: true, status: "needs_auth", error: null, scope: "project" },
  ];
  base.connections[marketing] = [
    { name: "google-drive", kind: "remote", target: "https://drivemcp.googleapis.com/mcp/v1", enabled: true, status: "connected", error: null, scope: "project" },
    { name: "mailchimp", kind: "remote", target: "https://mcp.mailchimp.example", enabled: false, status: "disabled", error: null, scope: "project" },
  ];
  base.connections[finance] = [
    { name: "bestanden-zoeker", kind: "local", target: "npx -y @modelcontextprotocol/server-filesystem ~/Administratie", enabled: true, status: "failed", error: "Het programma stopte direct na het starten.", scope: "project" },
  ];
  base.runModes[offertes] = "default";
  base.runModes[finance] = "approve";
  base.folders[finance] = [`/Users/demo/Administratie`];
  base.files[offertes] = [
    file("AGENTS.md", 412, now - 30 * DAY),
    file("prijslijst-2026.md", 3_210, now - 90 * DAY),
    file("sjablonen/sjabloon-offerte.md", 2_048, now - 100 * DAY),
    file("klanten/bakkerij-van-dijk.md", 1_380, now - 2 * DAY),
    file("offertes/2026-031-bakkerij-van-dijk.md", 2_457, tVanDijk + 3 * MIN),
    file("offertes/2026-032-fysiopraktijk-de-linde.md", 2_301, now - 3 * DAY),
    file("offertes/2026-033-tegelhandel-mertens.md", 3_880, now - 2 * DAY),
  ];
  base.files[marketing] = [file("nieuwsbrieven/2026-10-oktober.md", 4_102, now - 30 * DAY), file("webinar/draaiboek.md", 5_330, now - 8 * DAY)];
  base.files[service] = [file("AGENTS.md", 188, now - 40 * DAY), file("huisstijl.md", 1_920, now - 120 * DAY), file("faq/antwoorden-oktober.md", 2_840, tFaq + 5 * MIN), file("tickets/oktober-export.csv", 88_420, now - 7 * DAY)];
  base.files[finance] = [file("administratie/btw-q3-concept.pdf", 182_330, now - 10 * DAY), file("administratie/inkoopboek-2026-q3.csv", 42_118, now - 10 * DAY)];
  base.audit[offertes] = [
    { id: "a1", action: "skills.update", summary: "Skill offerte-schrijven bijgewerkt", actor: "Jij", at: now - 12 * DAY },
    { id: "a2", action: "mcp.add", summary: "Connectie hubspot toegevoegd", actor: "Jij", at: now - 40 * DAY },
    { id: "a3", action: "commands.add", summary: "Commando /opvolgmail toegevoegd", actor: "Jij", at: now - 41 * DAY },
  ];
  base.usage[offertes] = { period: "month", spend: 18.4, currency: "EUR", maxBudget: 50, budgetResetAt: now + 4 * DAY, byModel: [{ model: "claude-sonnet-5-5", spend: 16.9, tokens: 1_840_000 }, { model: "claude-haiku-5-5", spend: 1.5, tokens: 690_000 }] };
  base.usage[marketing] = { period: "month", spend: 31.75, currency: "EUR", maxBudget: 50, budgetResetAt: now + 4 * DAY, byModel: [{ model: "claude-sonnet-5-5", spend: 22.1, tokens: 2_310_000 }, { model: "gpt-5-2", spend: 9.65, tokens: 940_000 }] };
  base.usage[service] = { period: "month", spend: 6.1, currency: "EUR", maxBudget: null, budgetResetAt: null, byModel: [{ model: "claude-haiku-5-5", spend: 6.1, tokens: 2_900_000 }] };
  base.usage[finance] = { period: "month", spend: 50, currency: "EUR", maxBudget: 50, budgetResetAt: now + 4 * DAY, byModel: [{ model: "claude-sonnet-5-5", spend: 38.2, tokens: 3_400_000 }, { model: "gpt-5-2", spend: 11.8, tokens: 1_100_000 }] };

  // Routines -------------------------------------------------------------------------
  const weekly = { kind: "weekly" as const, timezone: zone, daysOfWeek: [1], hour: 8, minute: 30 };
  const inbox = { kind: "weekly" as const, timezone: zone, daysOfWeek: [1, 2, 3, 4, 5], hour: 9, minute: 0 };
  const closing = { kind: "weekly" as const, timezone: zone, daysOfWeek: [5], hour: 16, minute: 0 };
  const social = { kind: "interval" as const, timezone: zone, everyHours: 3, startHour: 9, endHour: 18, daysOfWeek: [1, 2, 3, 4, 5] };
  const weekRun: RoutineRun = { id: "run-week-1", routineId: "r-week", trigger: "scheduled", status: "succeeded", skippedReason: null, chatId: "c-week", scheduledAt: tWeek, startedAt: tWeek, finishedAt: tWeek + 3 * MIN, error: null };
  const inboxMissed: RoutineRun = { id: "run-inbox-2", routineId: "r-inbox", trigger: "scheduled", status: "skipped", skippedReason: "app_closed", chatId: null, scheduledAt: now - 20 * HOUR, startedAt: null, finishedAt: null, error: null };
  const inboxOk: RoutineRun = { id: "run-inbox-1", routineId: "r-inbox", trigger: "scheduled", status: "succeeded", skippedReason: null, chatId: "c-faq", scheduledAt: now - 2 * DAY, startedAt: now - 2 * DAY, finishedAt: now - 2 * DAY + 2 * MIN, error: null };
  const closingFailed: RoutineRun = { id: "run-close-1", routineId: "r-closing", trigger: "scheduled", status: "failed", skippedReason: null, chatId: null, scheduledAt: now - 5 * DAY, startedAt: now - 5 * DAY, finishedAt: now - 5 * DAY + 4_000, error: "Het model Mistral Large 3 is niet beschikbaar voor de key van dit project." };
  base.routines = [
    { id: "r-week", projectId: offertes, name: "Weekoverzicht offertes", prompt: "Maak een overzicht van alle offertes die deze week zijn verstuurd, met bedrag en status. Haal de status uit HubSpot.", model: null, schedule: weekly, state: "active", needsAttentionReason: null, nextRunAt: nextOccurrence(weekly, now), lastRun: weekRun, createdAt: now - 30 * DAY, updatedAt: now - 30 * DAY },
    { id: "r-inbox", projectId: service, name: "Dagelijkse samenvatting klantvragen", prompt: "Vat de nieuwe tickets van gisteren samen: aantallen per onderwerp, en de drie vragen die het snelst antwoord nodig hebben.", model: "claude-haiku-5-5", schedule: inbox, state: "active", needsAttentionReason: null, nextRunAt: nextOccurrence(inbox, now), lastRun: inboxMissed, createdAt: now - 60 * DAY, updatedAt: now - 10 * DAY },
    { id: "r-closing", projectId: finance, name: "Maandafsluiting voorbereiden", prompt: "Zet de openstaande posten van deze maand op een rij en markeer wat de boekhouder nog nodig heeft.", model: "mistral-large-3", schedule: closing, state: "needs_attention", needsAttentionReason: "Het model Mistral Large 3 is niet beschikbaar voor de key van dit project. Kies een ander model.", nextRunAt: null, lastRun: closingFailed, createdAt: now - 45 * DAY, updatedAt: now - 5 * DAY },
    { id: "r-social", projectId: marketing, name: "Social posts inplannen", prompt: "Controleer de contentkalender en zet de posts voor de komende drie uur klaar.", model: null, schedule: social, state: "inactive", needsAttentionReason: null, nextRunAt: null, lastRun: null, createdAt: now - 20 * DAY, updatedAt: now - 15 * DAY },
  ];
  base.runs = { "r-week": [weekRun], "r-inbox": [inboxMissed, inboxOk], "r-closing": [closingFailed], "r-social": [] };

  return base;
}
