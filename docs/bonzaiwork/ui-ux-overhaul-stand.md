# BonzaiWork: stand van de UI/UX-overhaul ("Vandaag")

> **Wat.** Wat er van [`ui-ux-overhaul.md`](ui-ux-overhaul.md) is gebouwd, wat niet en waarom, en hoe het is
> nagekeken. Stand: 3 november 2026, na de integratiestap (seams toegepast, copy samengevoegd, bewijs
> opnieuw geschoten).
> **Hoe nagekeken.** `pnpm typecheck` en `pnpm test` (27 bestanden, 132 tests) groen; een Playwright-smoke tegen
> de demo (14/14); 68 headless screenshots, elk bekeken; nul paginafouten in alle runs.

## Per sectie van de brief

### §3 Sitemap en routes: gebouwd

Alle routes uit §3 bestaan als typed `Route` met `href()` (`src/lib/router.ts`). Oude instellingen-secties
blijven werken als alias en vallen in hun groep (`key`, `connections`, `permissions` → Toegang;
`instructions`, `skills`, `commands` → Agent; `activity` → Technisch; `files` → Bestanden-tab; `brain` →
Brein-tab). Zonder projecten gaan `#/`, `#/routines` en `#/instellingen` naar `#/welkom`, in beide key-modi.
Een onbekend pad of project geeft een niet-gevonden-staat in de pagina met gevulde zijbalk (C6).

### §4 De shell: gebouwd

- Zijbalk in één vorm op elk scherm: Vandaag (teller, aria-label met aantal), Routines (teller), Jouw brein,
  Instellingen, projecten met StatusChip (icoon + woord; `Geen key` met slot), vastgezet eerst, max 8 plus
  "Alle projecten", persoonlijk brein eruit gefilterd (B1). Het open project klapt uit naar zijn chatlijst:
  "Nieuwe chat ⌘N" als enige gevulde control, groepen als filterpillen (lege groepen renderen niet),
  tweeregelige rijen (titel; statuswoord · tijd), routine-chats met Repeat-icoon en aria-label, vastgezette
  chats als band, archief als ingeklapte staart, zoekveld pas boven 8 chats.
- Zijbalkvoet: agenda-statusrij (`agenda-pill`, ⌘J; "Niet in BonzaiWork" als je weg bent) en het hulpmenu.
- `ProjectRuntimeProvider` zit in de projectpagina en de uitgeklapte rij; de shell remount niet bij
  projectwissel; drie runtimes blijven geparkeerd, losgelaten op `visibilitychange`.
- Bovenbalk zonder agenda- en breinpil; titel is van de pagina; "Details" (⌘\) op project en chat.
- Breedtes: ≥1280 Details-kolom (320px, `clamp(20rem,36vw,40rem)` met een geopend bestand); 1024–1279
  niet-modale overlay; 640–1023 lade; <640 lade plus tabbalk Vandaag · Projecten · Routines · Meer.
- Sneltoetsen in één tabel (`src/lib/shortcuts.ts`), inclusief ⌘⇧U "Alles gezien"; listener, palet,
  tooltips, menu's en het ⌘⇧/-blad lezen die tabel. Chords op kaarten zitten op het kaartelement, nooit op
  `window` (ook de toestemmingskaart in de chat niet meer).

### §5 Vandaag: gebouwd

Composer met projectpil (Popover met projecttegels, `Geen key` per project, laatst gebruikt project
onthouden), zonder key één rij "Key koppelen"; ⏎ maakt de chat en opent hem met het bericht verstuurd. Voor
jou uit `attention.list()` (één poll): toestemming, vraag (RadioCards, 1–9), mislukte chat ("Mislukt: …",
Opnieuw = revert + send), routine (model-`Select` op de rij of "Key koppelen"; gemist "De app was dicht om
09:00 · Nu uitvoeren"), brein (conflict/vertrouwen/fout met link naar het Brein-tab; "Nu niet" op de
vertrouwenskaart wordt gerespecteerd), voorkeursvoorstel. Max 5 kaarten, dan "Nog n". Na een antwoord gaat de
kaart weg, verschuift de focus naar de volgende kaart en meldt de actie presence voor dat project. Bezig met
Stop; Terwijl je weg was (sinds `lastSeenAt`, "Alles gezien" ⌘⇧U); Je werkdag ("di 3 nov · 5u 15m
bijgehouden · 30m zonder post", amber alleen op de ontbrekende post) met de volgende routine; Projecten
(max 5, tweede regel is de echte link naar wat wacht). Lege secties renderen niet; leeg Voor jou is één regel.

Niet gebouwd:
- Bezig toont titel, shimmerend "Bezig" en Stop, niet de lopende stapzin: daarvoor zou Vandaag per lopende
  chat berichten moeten lezen (een verzoek per chat, geen runtime op Vandaag).
- "Vraag je beheerder" met de eigenaar als rij: `Backend` kent geen eigenaar van een key. De kaart linkt naar
  de Toegang- of Agent-groep per fout.
- Opnieuw stuurt de tekst van het laatste bericht opnieuw, niet de bijlagen.

### §6 Project: gebouwd

Projectkop met tegel en naam als wisselaar (Menu met statuswoorden, ⌘⇧P), tabs Werk · Bestanden n ·
Routines n · Brein · Instellingen (pilstrook op de telefoon met het actieve tab in beeld), Details rechts.
- Werk: composer zonder H1 ("Waar werk je aan in Offertes 2026?"), suggesties uit de projectcommando's en de
  vervolgvraag van de nieuwste chat, Voor jou van dit project (hetzelfde kaartobject als Vandaag), Verder
  gaan (3 chats met resultaatzin), Gemaakt in dit project (documentrijen: Openen, Tonen in map).
- Bestanden: rijen met naam, map, "Gewijzigd …", lezer in Details, Uploaden en Map tonen.
- Brein: statusregel met team, Actie nodig-kaart, kennis met "Klopt", geschiedenis, Onderhoud, git-feiten
  achter "Technische details"; geen brein: "Dit project delen als brein" en "Brein van je team ophalen".
- Instellingen: pilstrook Project · Agent · Toegang · Technisch, Overzicht eerst, geen tweede rail. Key-rij
  "Gekoppeld …4d1e" zonder leveranciersnaam, modellen op naam, uitvoermodus als SegmentedControl,
  connecties met statusgestuurde actie, instructies autosavend met starterchips, werkwijzen samen.
- Details: op Werk Brein · Werkwijze (fasebalk, controlevraag) · Routine · Project (key, verbruik als
  Progress, agenda-rij "Deze week … · post … · Wijzigen", Technische details); op een chat eerst Resultaat
  (Openen, Vraag hierover), dan Routine-herkomst, Brein, Details. Een geopend bestand staat als `?bestand=`
  in de hash en overleeft chatwissels en ⌘[.

Niet gebouwd:
- "Gewijzigd in welke chat" op Bestanden alleen voor chats waarvan de berichten deze sessie geladen zijn;
  een veld `ProjectFile.changedBy` op de backend ontbreekt nog.
- Het model-id staat als hint in de Select-lijst, niet in een tooltip op de trigger (de Tooltip kan een
  samengestelde Select niet veilig omhullen).
- Plugins onder Technisch is een vergrendelde rij: de backend heeft nog geen plugin-oppervlak.

### §7 Chat: gebouwd

Kop met terug-chevron (⌘[), titel 16px/600, StatusChip, ⋯-menu, Details. Toestemmingskaart v2 (chords op de
kaart, commando's letterlijk in mono, "Altijd in dit project" alleen met `scope`, statusregel "terug te
draaien"), vraagkaart met RadioCards zonder kaart-in-kaart, live stappenvouw ("▸ n stappen", één
shimmerende stapzin; afgerond "Gewerkt 7 s · 2 stappen"), gestopt ≠ mislukt ("Gestopt door jou · 2 s · 2
stappen", Ga verder), mislukte stap met fix en "Technische details", beurtfout zonder leveranciersnaam
("Budget verhogen" opent Toegang), Dit leverde op met bestandschips, Kopieer en "Nogmaals met ander model",
"Maak hier een routine van" op eigen berichten, composer met wachtende-beslissing-staat, "Stuur bij"-staat
met "⏎ bijsturen · ⌘⏎ na afloop" en een gelabelde Skills-pil; onderpadding gemeten aan de composer.

Niet gebouwd:
- "Bekijk verschil" bij schrijftoestemmingen: `PermissionRequest` draagt geen diff.
- Meerdere wachtende beslissingen tonen alleen de eerste (geen "1 van 3").
- "Gestopt door jou" is na een herlaadbeurt alleen zichtbaar als een stap de engine-markering draagt; een
  duurzame `stopped`-markering in het contract ontbreekt nog.
- De ⌘⏎-wachtrij leeft in de open chatweergave; weggaan voor het einde van de beurt laat het bericht vallen.

### §8 Routines, agenda, breinen: gebouwd

- Routines: groepen Aandacht → Gemist → Vandaag → Later → Gepauzeerd, de fix op de rij, run-rijen als
  resultaatzin ("Wacht op jou" als de chat wacht), "Nu uitvoeren" → "Gestart · Chat openen", editor als zin
  (Opdracht → Naam → Wanneer met de volgende drie momenten → Project; Meer opties), fouten per veld, lege
  staat met drie startroutines. De zin "draait alleen terwijl…" staat alleen bij Gemist.
- Agenda: statusrij in de zijbalkvoet, paneel met Dagkaart (totalen per post, "Zonder post" met inline
  "Kies post", "Niet geboekt"), weekstrook, tijdlijn in projectkleur, editor als driekeuze met één
  tijdbereik, "Boek in een chat" met het boekdocument als `.md`-bijlage; labels "Niet in BonzaiWork" en
  "Niet boeken", de data houden "Away from BonzaiWork" (A2). Palet-actie "Agenda".
- Breinen: Jouw brein als zijbalkitem (`#/brein`), geen onboardingstap, één Actie nodig-kaart (conflict,
  vertrouwen, fout) op Vandaag, het Brein-tab en boven de chatcomposer; "Nu niet" wordt een onthouden rij;
  werkwijze-controlekaart boven de composer van de chat die de stap afrondde; brein koppelen in één stap.

Niet gebouwd:
- Native tijd- en datumvelden in de routine-editor volgen de taal van het systeem; er is geen eigen
  DateField/TimeField-primitief.
- De weekstrook haalt tot zeven dagen los op (gedeelde cache); een `agenda.week()`-route ontbreekt.
- De live backend vult `Chat.preview` nog niet; run-rijen tonen daar de chattitel.
- Live markeert alleen de chat van de laatste run per routine als routine-chat (`routineId`); oudere
  run-chats krijgen geen Repeat-icoon, want de routinelijst draagt alleen `lastRun`.
- "Uit een gedeeld brein" in de dialoog Nieuw project gebruikt nog de eigen stroom, niet `useJoinBrain()`.

### §9 Data: gebouwd

`AttentionItem` (met `model` op de routine-variant), `attention.list()`, `chats.recent(limit)`,
`Chat.preview`, `ProjectSummary.failedCount` en `PermissionRequest.scope` staan in `src/backend/types.ts` en
in beide backends. Per apparaat: `lastSeenAt`, laatst gebruikt project, uitgeklapte rij, Details, zijbalk,
chatgroepfilter. De demo-seed vult de thuisstaat (chats na `lastSeenAt`, previews, een mislukte chat, een
routine-run met chat, een gearchiveerde chat).

### §10 Copy: gebouwd

Alle teksten in `src/copy.ts` onder `copy.home`, `copy.shell`, `copy.project`, `copy.attention` en de
bestaande secties; geen feature-lokale copybestanden meer. Geen "LiteLLM", "workspace" of model-id in een
rij (de server-URL op `#/welkom` is data, het label heet "Server").

### §11 Wat blijft: aangehouden

Tokens en thema, het pre-paint-skelet (nu met de Vandaag-vorm), het composer-object, de tool-rail, de
Base UI-overlays, undo-toasts, het agendamodel, de demo met URL-schakelaars en alle smoketest-testids.
`scripts/smoke-packaged.mjs` volgt de nieuwe eerste start (naam + key + Begin → Vandaag).

### §12 Primitieven: gebouwd

`Tabs`, `SegmentedControl` (met `wrap` en `scroll`), `RadioCards`, `Popover`, `Disclosure`, `Chip`/`StatusChip`,
`Callout` (focusring hersteld: `focus-visible:outline-solid`), `Progress`, `Kbd`-rij en `Command` (het
⌘K-palet) in `src/components/ui`.

Niet gebouwd: de `/`-lijst in de composer gebruikt nog zijn eigen listbox in plaats van `Command`; het palet
kent nog geen gescoopte openingen (⌘⇧P alleen projecten).

## Integratiestap: wat er nog veranderde

- Composer: de pillenrij scrolt op de telefoon zijwaarts in plaats van afgekapt te worden; verzenden/stoppen
  houdt zijn plek.
- Werk-tab op de telefoon: geen lege marge boven de eerste sectie als de composer onderaan staat.
- Stoppen ververst de samenvattingen, zodat "Bezig" in de zijbalk meteen verdwijnt.
- Brein-tab: scheidingspunt tussen de staat en "gedeeld met …".

## Review: wat er na drie reviewers veranderde

Drie reviews (DESIGN.md en beeld, correctheid van beide backends, toegankelijkheid en toetsenbord). Alle
hoge en middelzware punten zijn opgelost; van de lage zijn er twee deels gedaan (zie onder).

**Toetsenbord en focus**
- Vandaag zet bij binnenkomst geen focus meer op de eerste kaart (S5). Eén esc of ⏎ beantwoordt dus nooit
  een beslissing die niemand bekeek. De eerste kaart is focaal door gewicht: alleen zijn actie is de gevulde
  primary; de andere kaarten tonen de ringknop, die pas gevuld wordt als de focus in die kaart staat (P7, V2).
- Focus schuift alleen door na een antwoord van de persoon zelf. Chords op kaarten (`src/lib/card-keys.ts`,
  gedeeld door Vandaag, Werk en de chat): een ingedrukt gehouden toets (`event.repeat`) telt niet, ⏎ telt
  niet in de eerste 300 ms na een focus door script, en esc (weigeren, overslaan; niet terug te draaien, P8)
  telt alleen op een kaart waar de persoon zelf de focus zette (Tab of klik).
- Zichtbare focusring op Tabs, SegmentedControl, RadioCards, de pil-Select en Disclosure (V7, WCAG 2.4.7).
- De Details-overlay (1024–1279) is `data-nonmodal`: ⌘\ sluit hem van binnenuit en ⌘K werkt daar.
- Na een routewissel zonder focus (lade dicht, trigger weg) staat de focus op de paginakop; elke pagina zet
  `document.title` ("Routines · BonzaiWork").
- Aanraakdoelen onder `pointer: coarse` zijn 44px (knoppen, tabs, segmenten, pil-Select, zijbalkchevron).
- `Kbd` zonder 80%-opacity (AA op 11px); de scrollknop "Naar nieuwste" volgt reduced motion.

**Toegankelijkheid**
- `Callout` is een `group` (geen landmark) met als naam soort + zin ("De agent vraagt toestemming |
  Bestanden wijzigen prijslijst-2027.md"), de statusregel als beschrijving en `aria-keyshortcuts`.
- De chat heeft één verborgen live-regio: stapwissel hoogstens elke 5 s, klaar/mislukt/wacht meteen
  ("Bezig: Leest …", "Klaar · 3 stappen", "Wacht op jou: toestemming"). Op Vandaag zegt Bezig één zin als een
  chat de sectie verlaat ("… is klaar"); de `role="status"` per rij is weg.

**Beeld en copy**
- Mislukte chat met een oorzaak die blijft (budget op, key geweigerd, model weg): de fix is de ⏎-actie,
  Opnieuw secundair; bij netwerk/te veel verzoeken blijft Opnieuw eerst (T2, C6).
- Kaartcontext is gewone tekst; elk "·" hoort bij het item erna, een lange routinereden staat op een eigen
  regel (C7). Op Routines staat "Routines draaien alleen …" op een eigen regel.
- Previews lezen als zinnen: "Week 44: 4 offertes verstuurd, 1 akkoord. Opvallend: De offerte …" (C4).
- Resultaat in Details telt alleen afgeronde stappen: een schrijfactie die op toestemming wacht is niet
  "Gewijzigd" (P1, P9).
- Details herhaalt de pagina niet: geen Brein op het Brein-tab, geen Routine op Routines, geen Project
  (key, verbruik, agenda) op Instellingen.
- De projectwisselaar toont per project het statuswoord (StatusChip, slot bij Geen key).
- Zijbalk: korte woorden (Bezig, Wacht), Mislukt en Geen key als icoon met het woord voor hulptechnologie
  en als tooltip; de projectnaam houdt zijn ruimte.
- Instellingen: Engine en Wijzigingen staan niet meer in het Overzicht; het Overzicht is open op de landing
  van het tab en een ingeklapte rij "Overzicht" zodra een groep gekozen is.
- `usageLocked` noemt geen leverancier meer ("Verbruik niet op te vragen · je beheerder zet dit aan");
  `src/copy.test.ts` houdt "LiteLLM", "workspace" en "MCP" uit alle copy-waarden.
- Brein-tab onderhoud: rij "Indeling" met knop "Brein inrichten". Routine-editor: gekozen dagen in de
  chip-stijl (actief, ring, vinkje), niet elektrisch. Uitgeschakelde primary is gedempt grijs, geen
  lavendel. Composer onder een toestemming: "Kies eerst hierboven of dit mag". 404: één titel in de balk,
  in de pagina "Deze link klopt niet meer" + Naar Vandaag.

**Correctheid**
- Live `chats.recent` neemt de runstatus van de engine (per project `activeSessions`), niet alleen van de
  eventstroom; `attention.list` (10 s) schrijft die status terug en ruimt verouderde bezig/wacht-standen per
  project op. Een chat die stopte terwijl niemand luisterde wordt één keer gelezen: een fout op het laatste
  bericht maakt hem een onthouden mislukking (kaart en `failedCount`). Stoppen zet de chat op idle.
- Vandaag-composer, Werk-tab en "Boek in een chat" zetten chat en bericht in de projectstore vóór de chat
  opent (`src/features/chat/first-message.ts`); faalt het versturen, dan gaat de tekst terug in de composer
  van die chat en biedt de toast "Opnieuw versturen" met dezelfde bijlagen.
- Live toestemmingen en vragen houden een vaste `at` (eerste keer gezien), dus de kaartvolgorde springt niet.
- Live markeert routine-chats (laatste run per routine, zie Niet gebouwd §8).
- Palet en Vandaag delen één `RECENT_LIMIT` (één cache, één poll).
- `scripts/smoke-packaged.mjs` opent Feedback via het hulpmenu (`data-testid="help-menu"`, dan het menu-item).

**Niet gedaan, en waarom**
- Een undo op "Geweigerd": de engine kent geen terugdraaien van een antwoord. In plaats daarvan telt esc
  alleen op een kaart die de persoon zelf focuste.
- `attention.list` haalt breinen en voorstellen nog zelf op naast `useBrains`/`useProposals`: optioneel in de
  review, en het samenvoegen raakt de cache-sleutels van vier schermen.
- "Details" op Bestanden en Instellingen staat niet standaard dicht: met de weggelaten groepen herhaalt hij
  daar niets meer, en een open/dicht per tab zou de onthouden keuze (per apparaat) breken.

Bewijs: de volledige set in `screenshots/overhaul/` is opnieuw geschoten (zelfde namen). Een Playwright-probe
bevestigde: bij binnenkomst op Vandaag staat de focus op `body` en esc laat de toestemming staan; na
Toestaan staat de focus op de vraagkaart en een directe esc slaat niets over; de tab-focusring is 2px solid;
in de overlay sluit ⌘\ en opent ⌘K; na navigatie uit de lade staat de focus op de H1 en de titel is
"Routines · BonzaiWork"; aanraakdoelen in lade en composer zijn 44px; het eerste bericht staat er binnen
120 ms; nul paginafouten.

## Bewijs (§13)

Gemaakt met een headless Playwright-script tegen de demo (geen server), klok op 16:40 zodat de agenda
kwartieren heeft, browsertaal nl-NL. Map: [`screenshots/overhaul/`](screenshots/overhaul/). Elk scherm in
drie varianten: `naam.png` (1280×820 licht), `naam-dark.png` (1280×820 donker), `naam-phone.png` (390×844
licht).

| Scherm | Bestanden |
| --- | --- |
| Vandaag met kaarten | `vandaag`, `vandaag-volledig` (1280×2200, alle secties) |
| Vandaag leeg (`?demo=leeg` na het eerste project) | `vandaag-leeg` |
| Welkom (eerste start) | `welkom` |
| ⌘K-palet | `palet` |
| ⌘⇧/ sneltoetsen | `sneltoetsen` |
| Agenda met Dagkaart en ontbrekende post | `agenda-dagkaart` (telefoon via Meer → Agenda) |
| Project Werk | `project-werk` |
| Projectwisselaar (⌘⇧P) | `project-wisselaar` (alleen 1280) |
| Bestanden | `project-bestanden` |
| Brein | `project-brein` |
| Instellingen Overzicht + Project, en Agent | `project-instellingen`, `project-instellingen-agent` |
| Chat met wachtende kaart | `chat-wacht` |
| Chat lopend met stappenvouw | `chat-bezig` |
| Chat gestopt | `chat-gestopt` |
| Chat mislukt | `chat-mislukt` |
| Chat afgerond met Resultaat | `chat-klaar` |
| Routines met gemiste run | `routines` |
| Routine-editor | `routine-editor` |
| Jouw brein | `jouw-brein` |
| App-instellingen | `app-instellingen` |
| Niet gevonden | `niet-gevonden` |
| Telefoon: tabbalk en lade | elke `-phone`-opname toont de tabbalk; `zijbalk-lade-phone` |

## Verificatie

- `pnpm typecheck`: geen fouten. `pnpm test`: 27 bestanden, 132 tests groen.
- Smoke (Playwright, demo): `?demo=leeg` → `#/welkom` met `litellm-key-input`, `litellm-key-submit`,
  `litellm-server` (met URL) en `project-name` → Begin → Vandaag (`composer-input`, `agenda-pill`) →
  `#/projecten` (`new-workspace`, `workspace-item`) → dialoog Nieuw project (`project-create`) → Werk-tab →
  bericht via `composer-input` + `composer-send` → chat (`chat-messages`) → antwoord met
  `data-role="assistant"`; nul paginafouten. 14/14.
- Screenshotruns: nul paginafouten en consolefouten.

## Open punten

| Punt | Waar |
| --- | --- |
| Duurzame stop-markering op een beurt | `types.ts` + beide backends |
| `ProjectFile.changedBy` voor "in welke chat" | `types.ts` + beide backends |
| `Chat.preview` in live | `src/backend/live/index.ts` |
| `agenda.week()` in één aanroep | agenda-contract |
| `chats.search` over alle projecten | `types.ts` + beide backends |
| Gescoopt palet (⌘⇧P alleen projecten) | `ui-store.ts`, `command-palette.tsx` |
| `/`-lijst op het `Command`-primitief | `composer.tsx` |
| "Uit een gedeeld brein" via `useJoinBrain()` | `new-project-dialog.tsx` |
| Eigen tijd- en datumveld | `src/components/ui` |
| Een demo-run waarvan de chat wacht ("Wacht op jou" in screenshots) | `demo/seed.ts` |
