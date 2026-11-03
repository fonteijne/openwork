# BonzaiWork: UI/UX-overhaul ("Vandaag")

> **Wat.** De structuur en de flows van `apps/bonzaiwork` opnieuw, met de bestaande vormgeving (zand, inkt,
> één elektrisch blauw, Manrope, pilknoppen, 24px-kaarten) als vaste waarde.
> **Waarom.** De app opent op een lijst, de zijbalk verandert van vorm per scherm, de bovenbalk is van de
> agenda-pil en "wat wacht op mij" is vanuit geen enkel scherm te zien. De beoordeling (tien deelrapporten,
> 47 screenshots, drie concepten, een jury) staat samengevat in §1; de gekozen richting in §2 en verder.
> **Regels.** `DESIGN.md` (P1–P11, S1–S7, C1–C7, V1–V7, T1–T5) en `frontend-contract.md` §7 blijven gelden.

## 1. Wat de beoordeling vond

Sterk, en dus bewaard (§11): de tokens en het thema, de composer, de tool-rail met zinnen, de
toestemmingskaart, de rijen in instellingen (S2), de typed `Route` + `href()`, de Base UI-overlays, undo
boven bevestigen, het statusvocabulaire (amber wacht, blauw bezig, rood mislukt, neutraal klaar).

Structureel zwak (hoog):

| # | Probleem | Bewijs |
|---|---|---|
| 1 | De zijbalk wisselt van vorm: buiten een project globale nav, erbinnen chatlijst; hetzelfde label "Routines" gaat naar twee bestemmingen; de hele shell remount per project. | `sidebar.tsx:160`, `app.tsx:167-170` |
| 2 | Het eerste scherm is een lijst, geen werkplek: niets om in te typen, niets om op te reageren; "1 wacht op jou" is een kleine badge rechts. | `app.tsx:119`, `projects-page.tsx:169` |
| 3 | De bovenbalk is van de agenda-pil ("Away from BonzaiWork sinds 16:30", Engels) en de brein-pil; de chattitel wordt afgekapt op ~150px. | `top-bar.tsx:18-21`, screenshot chat |
| 4 | Toestemmingen, vragen, mislukte chats, gemiste en kapotte routines, breinconflicten en voorstellen hebben vijf klokken en geen gezamenlijke plek. | `queries.ts` (20 s / 30 s / 10 s / 5 s) |
| 5 | Drie navigatielagen in projectinstellingen (zijbalk, tien secties, rij "Routines openen"); technische ids (`claude-sonnet-5-5`, mappad, "LiteLLM") in rijen. | `project-settings.tsx:1144`, C3 |
| 6 | Pillensoep: zestien ronde controls in 500px op de projectstart; twee elektrische primaries op één scherm (werkwijze-kaart + composer). | `project-home.tsx`, V7, P7 |
| 7 | Toetsenbord stopt bij ⌘K en ⌘J; geen "terug" in Electron, geen nieuwe chat, geen projectwissel. | `app-shell.tsx:74-88`, S6 |
| 8 | 1024–1279px krijgt telefoonnavigatie (lade) in een desktopvenster; de telefoon heeft alleen een hamburger. | `use-media.ts`, shell-tablet screenshot |
| 9 | Donker thema verliest de identiteit (zand wordt grijs, lavendel als primary en als disabled). | `styles.css` dark, V2 |

## 2. De richting: "Vandaag"

Een kenniswerker denkt niet in projecten maar in *wat wacht op mij, wat loopt, wat gebeurde terwijl ik weg
was, wat deed ik vandaag*. De app opent daarom op **Vandaag**: één composer die werk start in elk project,
daaronder **Voor jou** (elke open beslissing, ter plekke te beantwoorden), **Bezig**, **Terwijl je weg was**
en de werkdag (agenda). Projecten zijn containers met tabbladen; de zijbalk heeft op elk scherm dezelfde
vorm en het open project klapt daarin uit naar zijn chats.

De focusregel voor elk scherm (P7, T4): **het eerste wat jou nodig heeft is het focale element; is er
niets, dan de composer.**

Geleend van de andere concepten: één sneltoetsentabel (S6), de telefoon-tabbalk, de live stappenvouw,
focus die na een kaart doorschuift, de projectwisselaar in de projectkop, de agenda-rij per project,
`Chip`/`StatusChip`/`Callout`/`Tabs`-primitieven, de documentlezer naast de chat.

## 3. Sitemap en routes

```
#/                          Vandaag                                   (nieuw; was: projectenlijst)
#/projecten                 Alle projecten (lijst, archief, nieuw)    (was #/)
#/p/:id                     Project · Werk (composer, Voor jou van dit project, Verder gaan, Gemaakt)
#/p/:id/c/:chat             Chat                                      (ongewijzigd)
#/p/:id/bestanden           Project · Bestanden                       (uit instellingen)
#/p/:id/routines[/:rid]     Project · Routines                        (ongewijzigd pad)
#/p/:id/brein               Project · Brein                           (uit instellingen)
#/p/:id/instellingen[/:g]   Project · Instellingen; g = project | agent | toegang | technisch
                            (oude secties blijven als alias: general→project, key→agent,
                             instructions→agent, skills→agent, commands→agent, connections→toegang,
                             permissions→toegang, files→/bestanden, activity→technisch, brain→/brein)
#/routines[/:rid]           Routines (alle projecten)
#/brein                     Jouw brein (persoonlijk brein; geen projectrij meer)
#/instellingen[/:g]         App-instellingen; g = toegang | weergave | agenda | breinen | alle | technisch
#/welkom                    Eerste start, één scherm
(geen route)                Agenda-paneel (⌘J, zijbalkvoet, palet); ⌘K-palet
```

Zonder projecten gaan `#/`, `#/routines` en `#/instellingen` naar `#/welkom`. Een onbekend id geeft een
niet-gevonden-staat in de pagina; de zijbalk blijft gevuld (C6).

## 4. De shell

**Zijbalk** (zand, 256px, overal dezelfde vorm):

```
⌘K  BonzaiWork                      [Demo]
Vandaag                               · 3      (aantal in Voor jou; aria-label "Vandaag, 3 wachten op jou")
Routines                              · 1      (aandacht nodig / gemist)
Jouw brein
Instellingen
Projecten                               +
▸ ◉ Offertes 2026         Wacht op jou        (StatusChip: icoon + woord, nooit alleen kleur; V2, C5)
▾ ◉ Marketing Q4          Bezig
     + Nieuwe chat                    ⌘N      (de ene gevulde control in het open project; P7)
     [Alle · Social]                           (groepen als filterpillen; lege groepen renderen niet)
     ● Webinar-uitnodiging  Bezig · 2 min      (tweeregelige rij: titel; status-woord · tijd)
     ↻ Nieuwsbrief november · gisteren         (routine-chat: Repeat-icoon met aria-label)
     Gearchiveerd (1)                          (ingeklapte staart)
▸ ◉ Klantenservice        Wacht op jou
▸ ◉ Financiën             Mislukt
▸ ◉ Website-teksten       Geen key            (lock, P4)
────────────────────────────────────────
⏱ Offertes 2026 · sinds 13:30        ⌘J      (agenda-statusrij; "Niet in BonzaiWork" als je weg bent;
                                               gedempt als bijhouden uit staat; lock zonder agenda op de server)
?                                              (menu: Sneltoetsen ⌘⇧/, Feedback sturen, Over, enginestatus)
```

- Projectrijen: vastgezet eerst, daarna op activiteit; maximaal 8 ingeklapt zichtbaar + "Alle projecten";
  gearchiveerd nooit. Het open project (route `#/p/:id/*`) staat altijd uitgeklapt; de gebruiker kan
  andere rijen handmatig openklappen (één tegelijk).
- `ProjectRuntimeProvider` verhuist uit `app.tsx` naar de projectpagina en de uitgeklapte zijbalkrij; de
  zijbalk remount niet bij projectwissel. De laatste drie runtimes blijven in leven (LRU) zodat terugkeren
  direct is (P11); afbouwen op `visibilitychange`.
- Lucide-iconen, 16px; geen emoji, geen sparkle voor AI (V5). Brein-icoon: `BookOpen`.

**Bovenbalk** (48px): titel 16px/600 is het focale element; rechts hoogstens twee paginacties en op
chat/project een gelabelde "Details"-knop (⌘\). De agenda-pil en de brein-pil verdwijnen uit de
bovenbalk. Op de telefoon links een `≡`; de twee ongelabelde icoontjes worden één `⋯`-menu met woorden.

**Breedtes.** ≥1280: zijbalk + inhoud + optionele Details-kolom (320px; bij een geopend bestand
`clamp(20rem,36vw,40rem)`). 1024–1279: zijbalk + inhoud; Details als niet-modale overlay die open blijft
bij navigeren. 640–1023: zijbalk als lade (`Sheet`), zelfde boom. <640: lade plus **tabbalk onderaan**
(Vandaag · Projecten · Routines · Meer); "Meer" is een lijst met woorden (Jouw brein, Agenda,
Instellingen, Sneltoetsen, Feedback). De composer plakt onderaan op elk oppervlak (duimbereik).

**Sneltoetsen** (één tabel in `src/lib/shortcuts.ts`; de window-listener, het palet, tooltips, menu's en
het ⌘⇧/-blad lezen allemaal dezelfde tabel; Windows/Linux tonen Ctrl via `src/lib/platform.ts`):

| Chord | Actie | Chord | Actie |
|---|---|---|---|
| ⌘0 | Vandaag | ⌘K | Zoeken |
| ⌘N | Nieuwe chat (in het open project; op Vandaag: focus de composer) | ⌘⇧N | Nieuw project |
| ⌘⇧P | Project wisselen (menu) | ⌘1…⌘9 | Vastgezet project n (stabiele volgorde) |
| ⌘J | Agenda | ⌘\ | Details |
| ⌘/ | Zijbalk in-/uitklappen | ⌘, | Instellingen |
| ⌘[ / ⌘] | Terug / vooruit (in-app routestapel) | ⌘⇧/ | Sneltoetsen tonen |
| ⏎ / esc / 1–9 | alleen op de **gefocuste** kaart in Voor jou of boven de composer | | |

Enkelvoudige toetsen zijn inert zolang de focus in een input, textarea, contenteditable of overlay staat.
Nooit een window-brede ⏎ voor toestemmingen (herstelt twee bestaande bugs).

## 5. Vandaag (`#/`)

Volgorde, en alleen secties met inhoud renderen (geen kop voor een lege sectie):

1. **Composer** met vooraan een **projectpil** (tegel in projectkleur + naam; `Popover` om te wisselen;
   standaard het laatst gebruikte project, anders het eerste vastgezette). Placeholder "Waar ga je aan
   werken?". Zonder key op dat project blijft de composer zichtbaar en neutraal met één rij "Key koppelen"
   (P4, C5). ⏎ maakt de chat (`chats.create` + `chats.send`) en opent hem met het bericht al verstuurd.
2. **Voor jou** (teller in de kop; maximaal 5 kaarten, daarna "Nog n" als disclosure). Volgorde:
   toestemmingen en vragen (de agent staat stil) → mislukte chats → routines met aandacht → gemiste
   routines → breinconflict/-vertrouwen/-fout → voorkeursvoorstellen. Elke kaart is één `Callout` met het
   object dat de gebruiker al kent: projecttegel · chattitel · tijd, één statusregel die actie · data ·
   risico noemt (P9; shell-commando's letterlijk in mono), acties met chords, "Chat openen" als echte
   link. Na een antwoord verdwijnt de kaart, de pagina blijft (P11, S5) en de focus schuift naar de
   volgende kaart. Elke inline actie meldt presence voor dat project (`agenda.reportPresence`).
   - Mislukte chat: "Mislukt: het budget van de key is op · Opnieuw" (Opnieuw = `revert` + `send`, toast
     "Opnieuw gestart · Chat openen"); "Vraag je beheerder" is een rij met de eigenaar, nooit een knop die
     niets doet (C3, C6).
   - Routine met aandacht: de fix op de rij (model-`Select`, "Key koppelen"); gemist: "De app was dicht om
     09:00 · Nu uitvoeren".
   - Leeg: één regel "Niets wacht op je · volgende routine ma 08:30" (C6).
3. **Bezig**: rijen met project · chattitel · de lopende stap als zin met shimmer (V6) · Stop.
4. **Terwijl je weg was** (sinds `lastSeenAt` per apparaat in `localStorage`): afgeronde chats en
   routine-runs als resultaatzin (`Chat.preview`, anders titel), breinwijzigingen van collega's; kop met
   "Alles gezien" (⌘⇧U) die `lastSeenAt` zet. Maximaal 8 rijen.
5. **Je werkdag** (niet "Vandaag": naamconflict): één regel "ma 2 nov · 5u 15m bijgehouden · 30m zonder
   post" (amber alleen op de ontbrekende post) die het agenda-paneel opent; daaronder de volgende routine.
6. **Projecten**: compacte rijen (tegel · naam · StatusChip · aantal chats), maximaal 5, dan "Alle
   projecten". De tweede regel is het ding dat jou nodig heeft, als echte link naar die chat.

Geen uitlegzinnen in het eerste scherm (P1); één focaal element (de eerste kaart, anders de composer).

## 6. Project (`#/p/:id/*`)

Kop: projecttegel + **naam als wisselaar** (`Menu` met statuswoorden, ⌘⇧P), tabbladen **Werk · Bestanden 12 ·
Routines 1 · Brein · Instellingen** (`Tabs`-primitief; op de telefoon een horizontale pilstrook met het
actieve tab in beeld), rechts "Details" (⌘\).

- **Werk**: composer (placeholder "Waar werk je aan in Offertes 2026?"; de H1 vervalt, V1) → Voor jou van
  dit project → **Verder gaan** (3 nieuwste chats met resultaatzin) → **Gemaakt in dit project** (nieuwste
  bestanden als documentrijen: Openen, Tonen in map). Suggesties: de projectcommando's en de vervolgvraag
  uit de nieuwste chat; geen generieke prompts. Werkwijzen (ICM) staan in de Details-kolom, met de
  controlevraag als `Callout` boven de composer van de chat die hem afrondde, niet als tweede primary.
- **Bestanden**: `config.files` als rijen (naam, map, gewijzigd wanneer en in welke chat als bekend),
  lezer in de Details-kolom, acties "Uploaden" en "Map tonen".
- **Routines**: de routines van dit project, zelfde rijobject als de globale pagina.
- **Brein**: statusregel met team; **Actie nodig**-object bovenaan als dat zo is; kennisrijen (OKF-type,
  statuschip, "Klopt" inline); geschiedenis; git-feiten achter "Technische details" (P3). Geen brein:
  één rij "Dit project delen als brein" + "Brein van je team ophalen" (lock met reden als
  `capabilities.brains` uit staat).
- **Instellingen**: vier groepen als pilstrook (Project · Agent · Toegang · Technisch); eerst een
  "Overzicht" van rijen met de huidige stand (S2), dan de groep. Geen tweede rail, geen rij "Routines
  openen". Inhoud:
  - *Project*: naam (inline, undo), uiterlijk (kleur+icoon in een `Popover`), beschrijving, map,
    Bridge-post (hier, ter plekke; de agenda-rij "Deze week 6u 15m · post: … · Wijzigen"), onder "Meer":
    exporteren, archiveren, uit BonzaiWork halen.
  - *Agent*: instructies als proportionele, autosavende editor met starterchips; standaardmodel
    (`Select` op naam, id in tooltip) en "Modellen in dit project · Alle (9)"; skills en commando's samen
    als "Werkwijzen" (titel + wanneer).
  - *Toegang*: key-rij ("Gekoppeld …4d1e", Vervangen, Ontkoppelen in overflow; nooit het woord LiteLLM);
    uitvoermodus als `SegmentedControl`; extra mappen; connecties met logo en status-gestuurde actie
    (Opnieuw inloggen, Inschakelen); andere breinen die dit project leest.
  - *Technisch* (ingeklapt): pad, activiteitenlog, engine, plugins.
- **Details-kolom** (≥1280 kolom; daaronder overlay; telefoon sheet): op Werk *Brein · Werkwijze · Routine ·
  Project (key, verbruik, Technische details)*; op een chat eerst **Resultaat** (documentrijen: Openen,
  Tonen in map, Vraag hierover), dan Routine (herkomst, Pauzeren), Brein (één regel), en een disclosure
  "Details" (status, model, tijden, tokens, groep, notitie). Herhaalt nooit rijdata uit de pagina. Een
  geopend bestand staat in de hash (`?bestand=`) zodat het chatwissels en ⌘[ overleeft.

## 7. Chat (`#/p/:id/c/:chat`)

- Kop: terug-chevron (⌘[), titel 16px/600, `StatusChip` met woord, `⋯`-menu, "Details".
- **Toestemmingskaart v2** (T4, P9): chords op het kaartelement, commando's letterlijk in mono, "Altijd in
  dit project" alleen als de engine een bereik meegeeft (`PermissionRequest.scope`), geen uitleg over de
  interface ("Je kunt dit later terugdraaien…" wordt een statusregel "terug te draaien").
- Vraagkaart: opties als `RadioCards` zonder kaart-in-kaart (S1); primary pas actief na een keuze.
- **Live stappenvouw** (T1, V6): tijdens het lopen één shimmerende stapzin, eerdere stappen vouwen naar
  "▸ n stappen"; afgerond "Gewerkt 7 s · 2 stappen". Chevron links, draait 90° (S3).
- **Gestopt is niet mislukt** (C5): "Gestopt door jou · 12 s · 3 stappen", "Ga verder".
- Mislukking blijft inline met de fix (T2) en buiten de ingeklapte rail; ruwe fout onder "Technische
  details"; "Budget verhogen" opent de key-rij in Toegang of noemt wie het kan.
- **Dit leverde op**: één rij per beurt met bestandschips (Openen); hover-acties Kopieer · Nogmaals met
  ander model (`fork` + `send`).
- Composer (T5): wachtende beslissing → "Beantwoord eerst de vraag hierboven", verzenden uit; lopend →
  placeholder "Stuur bij: de agent neemt dit mee", chords "⏎ bijsturen · ⌘⏎ na afloop"; `/` als gelabelde
  "Skills"-pil; scrollgebied met onderpadding ter hoogte van de composer (fix donker thema).
- Opnieuw voert de beurt opnieuw uit (`revert` + `send`) in plaats van een dubbel bericht.

## 8. Routines, agenda, breinen

**Routines** (`#/routines`, tab in project): resultaten eerst. Groepen *Aandacht → Gemist → Vandaag → Later →
Gepauzeerd*; de fix op de rij; run-rijen als resultaatzin met "Wacht op jou" als de chat wacht (R2); "Nu
uitvoeren" toast "Gestart · Chat openen"; editor als zin (Opdracht → Wanneer met de volgende drie
momenten eronder → Project; Model/Tijdzone/Breinen onder "Meer opties"; fouten per veld); lege staat met
drie startroutines; vanuit elk eigen bericht "Maak hier een routine van" (voorgevulde editor). De
uitlegzin "draait alleen terwijl…" staat alleen in de gemiste staat (P1).

**Agenda**: de pil verhuist naar de zijbalkvoet (zelfde `agenda-pill`-testid, zelfde ⌘J). Het paneel
opent met een **Dagkaart**: totalen per Bridge-post, rijen "Zonder post" met inline "Kies post"
(`settings().recentPosts` → `setProjectPost`), "Niet geboekt"-totaal; dan de weekstrook en "Vandaag";
dan de tijdlijn (blokken in projectkleur-token, weg als hairline-grijs, amber alleen op een ontbrekende
post). Editor als driekeuze (Project · Meeting of anders · Niet boeken) met één tijdbereik; esc annuleert.
Primaire export "Boek in een chat" (`chats.create` + `send` met het boekdocument als `.md`-bijlage in een
onthouden project); kopiëren en opslaan secundair. Labels "Niet in BonzaiWork" / "Niet boeken"; de data
houden "Away from BonzaiWork" (beslissing A2). Alle bestaande `agenda-*`-testids blijven.

**Breinen**: "Jouw brein" is een zijbalkitem (`#/brein`), geen projectrij; de onboardingstap vervalt en
wordt aangeboden bij het eerste voorstel. Het projectbrein is het Brein-tab. Eén **Actie nodig**-object
(`Callout`) op Vandaag, op het Brein-tab en boven de chatcomposer, met eigen tekst voor conflict ("Jij en
Sanne wijzigden hetzelfde") en fout ("Bijwerken is gestopt"); "Nu niet" op de vertrouwenskaart wordt een
onthouden rij met "Toestaan". Werkwijzen volgen vanuit de chat (fasebalk in Details, controlekaart boven
de composer). Brein koppelen in één stap (plak → controle bij blur → naam/map voorgevuld → Brein-tab).

## 9. Data: wat er is, wat erbij komt

Alles op Vandaag kan vandaag al met fan-out (`projects.summary`, `chats.list`, `interactions.*`,
`routines.list(null)`, `brains.list`, `proposals`, `agenda.day`). Kleine `Backend`-aanvullingen, in demo
én live (live itereert projecten en hergebruikt `runStates`, `routinesList`, `brains.list`):

```ts
export type AttentionItem =
  | { kind: "permission"; projectId; chatId; chatTitle; request: PermissionRequest; at }
  | { kind: "question"; projectId; chatId; chatTitle; request: QuestionRequest; at }
  | { kind: "chat_failed"; projectId; chatId; chatTitle; error: ChatError; at }
  | { kind: "routine"; projectId; routineId; name; reason: "needs_attention" | "failed" | "missed"; detail: string | null; at }
  | { kind: "brain"; projectId; state: "conflict" | "needs_trust" | "error"; at }
  | { kind: "proposal"; proposal: PreferenceProposal; at };

attention: { list(): Promise<AttentionItem[]> };          // één poll van 10 s vervangt vijf klokken
chats.recent(limit: number): Promise<Chat[]>;              // over projecten heen; palet + "Terwijl je weg was"
Chat.preview: string | null;                               // laatste assistentregel; rijen lezen als resultaat
ProjectSummary.failedCount: number;
PermissionRequest.scope: string | null;                    // "Altijd in dit project" alleen met bereik
```

Per apparaat (`readLocal`/`writeLocal`): `lastSeenAt`, laatst gebruikt project, uitgeklapte zijbalkrij,
Details open/dicht, zijbalk ingeklapt. De demo-seed krijgt data die de thuisstaat vult: chats afgerond na
`lastSeenAt`, een `preview` per chat, een mislukte chat, een routine-run met chat.

## 10. Copy

Verb-first, zin-case, nooit "LiteLLM", "workspace", "MCP" of een model-id in een rij (C1, C3, C7). Nieuwe
sleutels: `copy.home` (Vandaag), `copy.shell` (zijbalk, tabbalk, sneltoetsen), `copy.project` (tabs,
details), `copy.attention` (kaarten per soort). Een actie houdt zijn naam door de flow: "Nu uitvoeren" →
"Gestart"; "Boek in een chat" → "Geboekt" (C2). Vermijd dubbele namen: de pagina heet "Vandaag", de
agendasectie "Je werkdag".

## 11. Wat blijft

Tokens en thema (`styles.css`, `theme.ts`), de pre-paint-skeleton in `index.html` (uitgebreid met de
Vandaag-skeleton), het composer-object, de tool-rail en `describeTool`, het kaartobject voor
toestemmingen, `Row`/`Section`/`Locked`/`EmptyState`/`Skeleton`, typed routes met echte anchors en
`aria-current`, chunking en intent-prefetch, de Base UI-overlays, undo-toasts, `describeSchedule`/
`nextOccurrences`, het agendamodel en het boekdocument, de demo-backend met URL-schakelaars, de
projectruntime-store, de testids van de smoketest (`litellm-key-input`, `litellm-key-submit`,
`litellm-server`, `new-workspace`, `workspace-item`, `composer-input`, `composer-send`, `chat-messages`,
`data-role="assistant"`, `agenda-*`).

Donker thema: zand-tokens voor de zijbalk (`--sand-*` donker warm, niet `--ink-2`), hairlines ≥ 0,16
alfa, verzadigd elektrisch primary met lichte tekst, aparte inverse-tokens voor toast/tooltip; lavendel
niet langer voor "uitgeschakeld".

## 12. Nieuwe primitieven (`src/components/ui`, Base UI, P5)

`Tabs`, `SegmentedControl` (RadioGroup), `RadioCards`, `Popover`, `Disclosure` (details/summary met
draaiende chevron, S3), `Chip` en `StatusChip` (icoon + woord; `running | waiting | failed | idle |
locked`), `Callout` (één kaartschil voor toestemming, vraag, brein, voorstel, routine-aandacht:
icoon, vette zin, mono-chip, statusregel, acties met chords, amber ring alleen als er een beslissing
openstaat), `Progress` (verbruik), `Kbd`-rij voor chords. Alle zwevende oppervlakken via Base UI (S7).

## 13. Bewijs (P10)

Headless screenshots in de demo, 1280×820 en 390×844, licht en donker, in
`docs/bonzaiwork/screenshots/overhaul/`: Vandaag met kaarten, Vandaag leeg (`?demo=leeg` na eerste
project), project Werk, Bestanden, Brein, Instellingen (Overzicht + een groep), chat met wachtende kaart,
chat lopend met stappenvouw, chat gestopt, chat mislukt, Routines met gemiste run, routine-editor, agenda
Dagkaart met ontbrekende post, ⌘K, ⌘⇧/, welkom, 404, telefoon-tabbalk. `pnpm typecheck` en `pnpm test`
groen; de smoketest-testids aanwezig.

## 14. Open beslissingen

| # | Beslissing | Gekozen |
|---|---|---|
| A2 | Agenda-pil uit de bovenbalk naar de zijbalkvoet (tegen agenda-plan §7.2 "op elke pagina" in). | Ja: nog steeds op elke pagina, maar de titel is weer van de pagina. |
| A3 | Presence op Vandaag: inline acties melden het project van de kaart; de pagina zelf telt als "Niet in BonzaiWork". | Ja; een "plak-regel" (laatste project één kwartier vasthouden) komt later met de agenda-eigenaar. |
| B1 | "Mijn brein" verlaat de projectenlijst; blijft als project bestaan in de backend. | Ja: `#/brein` toont dat project; de lijst filtert het eruit. Chatten met het brein blijft kunnen: "Nieuwe chat" en de laatste chats op `#/brein`; in een chat van het brein staat de chatlijst onder "Jouw brein" in de zijbalk. |
| S1 | Oude instellingen-hashes blijven werken als alias. | Ja. |
