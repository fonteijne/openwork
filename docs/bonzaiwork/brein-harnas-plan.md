# BonzaiWork Brein: harnas + persoonlijk brein (volgende iteratie)

Status: **voorstel, beslissingen H1–H7 genomen (09-11-2026); fase 0 gedaan**, uitkomsten in [`project-breinen-fase0.md`](./project-breinen-fase0.md) §9 en hieronder verwerkt. Bouwt voort op
[`project-breinen-plan.md`](./project-breinen-plan.md); metingen komen in [`project-breinen-fase0.md`](./project-breinen-fase0.md) §9.

## Context

BonzaiWork heeft nu **projectbreinen** (teamrepo's via SSH, OKF/ICM, sync per beurt) en één **persoonlijk brein**
("Jouw brein", `kind: "personal"`), waarvan `AGENTS.md` + `_meta/voorkeuren.md` en `.opencode/skills/` in elke chat
meetellen via `<OPENCODE_CONFIG_DIR>/AGENTS.md` en een junction `<OPENCODE_CONFIG_DIR>/skills`
(`apps/server/src/downstream-hooks.ts:516`, `packages/bonzaiwork-brains/src/server-hooks.ts:322`). Het persoonlijke
brein heeft al git-geschiedenis zonder origin (`<state>/history/<id>.git`) met een optionele privérepo
(`BrainSync.initLocal`, `/remote`).

Wat ontbreekt, en wat de gebruiker merkt na een paar projecten:

1. **Geen plek voor skills die in meerdere projecten gelden.** Technisch bestaat die (persoonlijke `.opencode/skills/`),
   maar de UI toont ze niet, je kunt ze niet aanmaken, en een skill uit een project is niet "over te nemen".
   `listSkills` (`apps/server/src/skills.ts`) scant die map niet, en `globalConfig` staat in de UI vast op `false`.
2. **Meegeleverde skills veranderen nooit mee.** `applyTemplate` kopieert `okf-*`, `icm-architect` en de commando's
   in elk brein bij het inrichten en schrijft daarna alleen wat ontbreekt. Release management kan dus niets aan een
   bestaand brein toevoegen of verbeteren. Er is geen "harnas" als apart, versiebeheerd ding.
3. **Het persoonlijke brein is passief.** Het groeit alleen als de AI midden in een beurt iets vastlegt. Niets kijkt
   projectoverstijgend terug (mensen die in meerdere projecten voorkomen, besluiten, voorkeuren).
4. **Er is geen eigen agent voor het brein.** De chat op `#/brein` gebruikt de gewone Uitvoeren-agent.

Doel van deze iteratie: **"jouw brein" wordt het BonzaiWork Brein = een meegeleverd en versiebeheerd harnas
(skills, commando's, agent, app-regels) + het persoonlijke brein van de gebruiker (voorkeuren, mensen, kennis, eigen
skills), op de achtergrond bijgehouden door een dagelijkse routine, met een eigen agent waarmee je kunt chatten.**
Projectbreinen krijgen dezelfde harnas-onderdelen zonder kopie, zodat alle breinen op dezelfde manier worden bijgehouden.

Genomen beslissingen (overleg 09-11):

| # | Vraag | Besluit |
|---|---|---|
| H1 | Hoe komt het harnas bij gebruikers? | **App-releases én een harnas-repo** (SSH, alleen-lezen) als tweede bron |
| H2 | Achtergrond | **Dagelijkse verwerkingsroutine in Jouw brein + `/onthoud` op verzoek** |
| H3 | Harnas-onderdelen in een projectbrein | **Blijven in de repo** (een projectbrein moet ook zonder BonzaiWork werken, bijv. uitgecheckt in Claude Code). Een verouderde kopie geeft een **kaart** op het Brein-tab. **Ongewijzigd**: "Bijwerken naar <versie>" of "Uit het project halen" (dan levert het harnas hem globaal en houdt hem actueel). **Door het team aangepast**: de kaart meldt dat er een nieuwere versie in het harnas is, met "Verschillen bekijken", "Harnasversie overnemen" (de eigen aanpassingen gaan verloren; de oude versie blijft in de geschiedenis) of "Zo laten" (onthouden tot de volgende harnasversie). Nooit stil overschrijven |
| H4 | Persoonlijke agent | **Eigen agent "Brein" uit het harnas** (definitie meegeleverd, in elke agent-kiezer) |
| H5 | Bestaand persoonlijk brein | **Wordt een gewoon project** ("<naam> (tot <datum>)", geschiedenis blijft, alleen-lezen te raadplegen); het nieuwe Jouw brein start leeg vanuit het harnas |
| H6 | Skills-hub en beheerde MCP-hub via Bonzai LiteLLM | **Nu niets**, later een apart ontwerp. Hier alleen: geen keuze maken die dat blokkeert (harnas-repo gebruikt dezelfde mappen als de bundel; bronnen zitten achter één functie in `harness.ts`) |
| H7 | ICM-werkwijzen en skills overlappen | **Uitzoeken in fase 0** (E7), richting: een werkwijze als skill-pakket, zodat één formaat door harnas, repo en later de hub gaat |

Uitgangspunten die blijven: 0 nieuwe upstream-patches (alles via `downstream-hooks.ts` en de hooks-pakketten; `PATCHES.md`
groen), synchronisatie is code en geen instructie, alleen SSH, de AI doet geen git, Nederlandse UI volgens `DESIGN.md`.

## Het model in één plaat

```
<OPENCODE_CONFIG_DIR>/                         door de hooks samengesteld; engine laadt het in elk project
  AGENTS.md                                    app-regels (harnas) + persoonlijke AGENTS.md + voorkeuren   (bestaat)
  skills/                                      ECHTE map met per skill een junction                        (nieuw: nu 1 junction)
    okf-query -> <app>/resources/harness/skills/okf-query          bron 1: meegeleverd (app-versie)
    offerte-check -> <harnas-repo>/skills/offerte-check            bron 2: harnas-repo (alleen-lezen brein)
    mijn-samenvatting -> <persoonlijk brein>/.opencode/skills/...  bron 3: eigen skills
  command/  (KOPIEËN: /verwerk, /vastleggen, /onderhoud, /werkwijze, /onthoud)                      gemeten E1, E4
  agent/    brein.md                            de agent "Brein", als KOPIE (een link ziet de engine niet live) gemeten E1, E4

Voorrang bij gelijke naam: project > eigen > harnas-repo > meegeleverd (projectskill wint al in de engine, H3).

Projectbrein-repo (zelfstandig bruikbaar, H3):
  .opencode/skills/okf-query/SKILL.md            kopie uit het harnas, met regel "harness: okf-query@1.4" in de frontmatter
  .opencode/commands/verwerk.md                  idem
  AGENTS.md, _meta/, _templates/, knowledge/, workflows/
```

Een kopie draagt zijn herkomst in de frontmatter (`harness: <naam>@<versie>`), zodat de sync zonder byte-vergelijking
weet of hij ongewijzigd is: inhoud gelijk aan de meegeleverde versie met dat nummer → ongewijzigd. Bestaande kopieën
zonder die regel worden vergeleken met alle ooit meegeleverde versies (`harness.json` houdt per onderdeel een
lijst `sha256` per versie bij).

Harnas-manifest: `harness.json` `{ version, skills[], commands[], agents[], schemaTypes[] }` in de bundel, en hetzelfde
bestand in de root van een harnas-repo. De UI toont per onderdeel waar het vandaan komt en welke versie.

## Fase 0: meten (1 dag), vóór er code komt

**Gedaan (09-11)**: `scripts/bonzaiwork/spikes/brains/harness-probe.mjs` (23 controles op OpenCode v2.2.0, alle
`ok`) en `e6-gitdir.test.ts`; uitkomsten en gevolgen in [`project-breinen-fase0.md`](./project-breinen-fase0.md) §9.
Kort: E1 ja (ook meervoud), E2 ja, E3 project wint, E4 ja maar agent- en commandobestanden als kopie (niet als link),
E5 ~100 ms voor 54 chats met bekende berichtvormen, E6 ja zonder wijziging, E7 ja voor de engine; `workflows.ts` en
`icm.ts` moeten het skill-pad leren. De vragen zoals gesteld:

- **E1** Laadt de gepinde OpenCode v2 `command/*.md` en `agent/*.md` uit `OPENCODE_CONFIG_DIR` (zoals `skills/`), live,
  ook in sub-taken? Zo nee: commando's blijven per brein (zoals nu) en de agent komt via `agent` in de globale
  runtime-config (`writeGlobalRuntimeOpencodeConfig`, zelfde route als `mcp`).
- **E2** Werkt `skills/` als echte map met per-skill junctions (i.p.v. één junction), en pikt de engine toevoegen en
  weghalen van een junction live op?
- **E3** Welke skill wint bij dezelfde naam in project en config-map (nodig voor H3: oude projectkopie moet winnen)?
- **E4** Kan een agent uit `agent/` worden gestart met `POST /api/session/:id/agent` en ziet `GET /api/agent` hem?
- **E5** Sessies van vandaag in alle lokale mappen ophalen via `host.engineRequest` (`GET /api/session`, berichten), voor
  de dagroutine; wat kost dat bij ~20 chats.
- **E6** Werkt `BrainSync` voor `kind: "project"` met `gitDir` buiten de map en `remote: null` (status `local_only`)?
  Nodig voor H5: het oude persoonlijke brein wordt een gewoon brein-project met zijn bestaande geschiedenis in
  `<state>/history/<id>.git`. Zo nee: de geschiedenis als `.git` in de map zetten als de map niet in een cloudmap staat
  (`isCloudFolder`), anders alleen de map behouden en de geschiedenis via de bestaande `/history`-route laten lezen.
- **E7** Overlap ICM en skills (H7). Inventariseer wat een werkwijze (`workflows/<naam>/CONTEXT.md` + stappen, gedraaid
  door `workflows.ts`) deelt met een skill (`SKILL.md` + bronnen, gekozen door de engine op beschrijving). Voorstel om te
  toetsen op de bestaande voorbeeldwerkwijzen: **een werkwijze als skill-pakket**: `.opencode/skills/<naam>/SKILL.md`
  (beschrijving, wanneer te gebruiken) met daarin `workflow/CONTEXT.md` en de stappen; `workflows.ts` vindt werkwijzen
  dan in `workflows/*` én in skills met een `workflow/`-map. Winst: één formaat voor harnas, repo en later de hub, en
  een werkwijze is in Claude Code nog steeds een leesbare skill. Te meten: ziet de engine `SKILL.md` nog als skill met
  zo'n submap, en blijft de ICM-structuurcontrole (`icm.ts`) werken op het nieuwe pad. Uitkomst bepaalt of 1.1 de
  harnas-werkwijzen (`/werkwijze`, `icm-architect`) zo verpakt.

## Fase 1: het harnas (meegeleverd) en eigen skills

### 1.1 Nieuw pakket `packages/bonzaiwork-harness`

- `harness/skills/`, `harness/commands/`, `harness/agents/brein.md`, `harness/schema/` (OKF-typen die het harnas
  levert, waaronder `Person`, `Organisation`, `Project`, `Decision`), `harness.json` met `version`.
- **Verhuizen** uit `packages/bonzaiwork-brains/templates/common/.opencode/*` en `templates/vendor/icm-architect`
  (MIT-vermelding mee) naar het harnas-pakket. `templateTargets()` (`template.ts`) leest de skills en commando's
  voortaan uit het harnas en schrijft ze **wel** in een projectbrein (H3, met `harness: <naam>@<versie>` in de
  frontmatter), maar **niet** in het persoonlijke brein (daar levert het harnas ze globaal). `test/template.test.ts`
  aanpassen; `TEMPLATE_FILES` houdt `AGENTS.md`, `_meta/`, `_templates/`, `workflows/CONTEXT.md`.
- Bundelen als tekst (zelfde patroon als `template-files.ts`) én als `extraResources` in
  `apps/desktop/electron-builder.bonzaiwork.mjs` (eigen bestand, geen patch), zodat de junctions naar echte mappen wijzen.
  Headless: de hooks schrijven de bundel uit naar `<state>/harness/<version>/` en linken daarheen. Dat werkt ook in de
  verpakte app, dus **één route**: altijd uitschrijven naar `<state>/harness/<version>/`, oude versies opruimen.
- Werkwijzen uit het harnas (`/werkwijze`, `icm-architect`) als **skill-pakket** (H7, fase 0 §9.1): `SKILL.md` met
  daaronder `workflow/`. `workflows.ts` (`listWorkflows`, `readWorkflow`, `startStage`, `newRun`) vindt werkwijzen in
  `workflows/<naam>/` én `.opencode/skills/<naam>/workflow/`; `icm.ts` controleert beide paden (`STAGE_CONTRACT`).
- Nieuwe skill in het harnas: `brein-mensen` (iemand opzoeken en bijwerken in `knowledge/mensen/`), commando `/onthoud`
  (leg uit deze chat vast wat projectoverstijgend is: mensen, besluiten, voorkeuren via `voorkeur_voorstellen`).
- Agent `brein.md`: prompt (Nederlands, verwijst naar de breinen-tools en de routering in de persoonlijke `AGENTS.md`),
  `tools`: breinen-MCP + lezen/zoeken; model = `BONZAIWORK_DEFAULT_MODEL`. Naam in `AGENT_NAMES` (`live/index.ts:214`): "Brein".

### 1.2 Samengestelde config-map (`downstream-hooks.ts`, ons bestand)

- `setEngineGlobalContext({ instructions, skills: Record<name, path>, commands?: Record<name, text>, agents?: Record<name, text> })`.
  `skills/` wordt een echte map (0700); per naam een junction; verdwenen namen worden verwijderd; een niet-link in de
  map blijft staan met een waarschuwing (zoals nu). Oude vorm (één junction) wordt bij de eerste start vervangen.
  `command/` en `agent/` krijgen **kopieën** (atomisch geschreven, zoals `AGENTS.md`): fase 0 E4 mat dat de engine een
  via een link gewijzigd agentbestand niet oppikt, een rechtstreeks geschreven bestand wel. Verandert een skill achter
  een bestaande junction (eigen skill bewerkt), dan maakt de hook de junction opnieuw (weghalen + aanmaken; E2).
- `apps/server/test/downstream-hooks.test.ts` uitbreiden: toevoegen, weghalen, bestaande niet-link.

### 1.3 Hooks (`packages/bonzaiwork-brains/src/server-hooks.ts`, nieuw `harness.ts`)

- `harness.ts`: bronnen verzamelen → `{ name, path, source: "bundled" | "repo" | "personal", version }[]`, voorrang
  eigen > repo > meegeleverd, namen die botsen met een projectskill mogen gewoon mee (E3: het project wint, de engine
  noemt hem één keer).
- `refreshGlobalContext()` roept dat aan; de `signature` neemt de lijst mee. Aanroepen ook bij wijziging van
  `<persoonlijk>/.opencode/skills` (file-watch via `fs.watch` met debounce, of bij elke pull zoals nu).
- `APP_RULES` (`personal.ts`) uitbreiden met één regel over `/onthoud` en de agent Brein; blijft buiten elke repo.
- Route `GET /bonzaiwork/harness` (client) → `{ version, items: [{ kind, name, source, version, path }] }` en
  `Capabilities.harness = probe("/bonzaiwork/harness")` (ons flag-mechanisme, DESIGN.md P4: zichtbaar maar vergrendeld
  zonder). Server-kant uit te zetten met `BONZAIWORK_HARNESS=0` in de hooks-opties, zodat het zonder release uit kan.
- **Verouderde kopieën in een projectbrein (H3)**: na elke pull en bij het openen vergelijkt de sync de kopieën onder
  `.opencode/skills/` en `.opencode/commands/` met het harnas (frontmatter-regel, anders sha-lijst). Ouder dan het
  harnas → `BrainStatus.outdated: [{ name, from, to, modified: boolean }]`; `modified` is waar als de inhoud afwijkt van
  elke ooit meegeleverde versie (het team paste hem aan). Een onderdeel zonder herkenbare herkomst (eigen skill met
  toevallig dezelfde naam) telt niet mee. Routes (host): `POST /bonzaiwork/brains/:id/harness/update { names }` (nieuwe
  versie schrijven, één commit "BonzaiWork-onderdelen bijgewerkt naar <versie>" via het `finishTurn`-pad zonder chat;
  bij `modified` vervangt hij de aangepaste versie, die in de geschiedenis blijft en met de bestaande `/restore`-route
  terug kan), `POST /bonzaiwork/brains/:id/harness/remove { names }` (kopie verwijderen, commit "… uit het project
  gehaald; BonzaiWork levert ze"), `GET /bonzaiwork/brains/:id/harness/diff?name=` (client; unified diff tussen de
  kopie en de harnasversie, voor "Verschillen bekijken") en `POST /bonzaiwork/brains/:id/harness/dismiss { names }`
  ("Zo laten": per gebruiker in `brains.json`, tot er een nieuwere harnasversie is). Een alleen-lezen brein toont de
  kaart alleen ter informatie (niets te committen).
- **Migratie van het bestaande persoonlijke brein (H5)**, eenmalig bij de eerste start met harnas aan: record
  `kind: "personal"` → `kind: "project"`, zelfde `path`, `gitDir`, `remote` (als er een privérepo hing) en `mode`;
  workspace hernoemen naar "<naam> (tot <datum>)"; `<OPENCODE_CONFIG_DIR>/AGENTS.md` opnieuw schrijven zonder de oude
  voorkeuren. Op Jouw brein verschijnt de inrichtkaart (bestaand `SetupCard`) met één extra zin en een link naar het
  oude project; het nieuwe brein kan het oude lezen via `brein_lezen` (bestaand, alleen-lezen) en `/onthoud` kan
  voorkeuren overnemen als voorstelkaart. Niets wordt verwijderd. Afhankelijk van E6.

### 1.4 Eigen skills in het persoonlijke brein

- **Wat meegaat in git** (afwijking van N5 voor `kind: "personal"`): alle tekstbestanden onder `.opencode/skills/**`,
  `.opencode/commands/**` (niet alleen `.md`), met de bestaande geheimenscan en 10 MB-grens. In `trust.ts`
  `personalExcludes` en in `sync.ts` de `add`-stap (`git add -- '*.md'` → plus die paden). Test in `personal.test.ts`.
- Routes (host): `POST /bonzaiwork/brains/:personal/skills/adopt { fromWorkspaceId, name, move: boolean }` (kopieert
  `<project>/.opencode/skills/<name>` naar het persoonlijke brein; bij `move` verwijdert hij de projectkopie in de
  volgende beurt-commit van dat brein), `PUT/DELETE /bonzaiwork/brains/:personal/skills/:name` (schrijven via
  `brainPath`-achtige controle, alleen tekst). `listSkills` zelf niet patchen: de UI leest harnas + eigen via
  `/bonzaiwork/harness` en projectskills via de bestaande route.
- `saveSkill`/`removeSkill` voor `scope: "global"` in `apps/bonzaiwork/src/backend/live/index.ts:967` gaan naar deze
  routes i.p.v. `unsupported(...)`.

### 1.5 UI (`apps/bonzaiwork/src/features/brain/`, `settings/werkwijzen.tsx`, `copy.ts`)

- **Jouw brein → sectie "Werkwijzen en skills"**: drie groepen met herkomst-chip: "Van BonzaiWork <versie>"
  (alleen-lezen, Openen), "Uit het harnas van je team" (fase 2), "Van jou" (Openen, Bewerken, Nieuwe skill,
  Verwijderen). Lege staat met één zin.
- **Projectinstellingen → Agent → Werkwijzen** (`MethodsSection`): rij-actie "Overal gebruiken" (→ `/skills/adopt`)
  bij projectskills; globale rijen tonen herkomst en zijn alleen vanuit Jouw brein te bewerken (link).
- **Brein-tab → kaart "Onderdelen van BonzaiWork zijn verouderd"** (`Callout`, zelfde schil als Actie nodig): per
  onderdeel naam en "1.2 → 1.4". Ongewijzigd: knoppen **Bijwerken** en **Uit het project halen**, met één zin uitleg
  bij de tweede ("Dan werkt dit onderdeel alleen nog in BonzaiWork, en blijft het vanzelf actueel"). Aangepast door het
  team: tekst "Jullie hebben deze versie aangepast; BonzaiWork heeft een nieuwere", knoppen **Verschillen bekijken**
  (diff in de Details-kolom, zelfde lezer als bestanden), **Harnasversie overnemen** (met bevestiging: "Jullie
  aanpassingen gaan uit het bestand; de vorige versie blijft in de geschiedenis") en **Zo laten**. Ook als
  aandachtsitem op Vandaag (`attention.list()`), zonder blokkade van chatten.
- **Jouw brein na de migratie (H5)**: inrichtkaart met "Je vorige brein staat als project <naam> (tot <datum>)" en
  link; na inrichten een rij "Overnemen uit je vorige brein" die een chat met de agent Brein start met een vaste
  opdracht (lees het oude brein, stel voorkeuren voor, neem mensen en kennis over als concepten).
- **Agent-kiezer** in de composer toont "Brein"; op `#/brein` is hij standaard. In een project kiesbaar.
- Woorden: "harnas" niet in beeld (C3); zeg "Van BonzaiWork", "Van je team", "Van jou". Nieuwe teksten in `copy.ts`.
- Demo-backend (`backend/demo/`) krijgt harnas-items en eigen skills; screenshots headless voor de PR.

### 1.6 Klaar als

Een skill uit project X staat na "Overal gebruiken" in Jouw brein, is in project Y beschikbaar, staat in de
geschiedenis van het brein (incl. een niet-`.md` script) en komt mee op een tweede laptop na "Privérepo koppelen". Een
nieuwe app-versie met een gewijzigde `okf-query` is in elk gewoon project meteen de nieuwe versie; een projectbrein met
een ongewijzigde oude kopie toont de kaart, "Bijwerken" geeft één commit die een tweede gebruiker na zijn pull ziet,
"Uit het project halen" laat het harnas het overnemen; een door het team aangepaste kopie blijft ongemoeid (H3). Een
bestaand persoonlijk brein is na de upgrade een gewoon project met zijn geschiedenis, en het nieuwe Jouw brein start
leeg (H5). `/onthoud` werkt in elke chat. Agent "Brein" staat in de kiezer en antwoordt op `#/brein`.

## Fase 2: harnas-repo (H1) en de dagelijkse verwerking (H2)

### 2.1 Harnas-repo

- Een **brein van soort `harness`** (`BrainKind` + `"harness"`; `registry.ts` `KINDS`, `sync.ts`, contract §7.5):
  altijd `mode: read_only`, geen project in de zijbalk, één per installatie. Instellen onder App-instellingen →
  Breinen → "Harnas van je team": link plakken, "Verbinding testen", vertrouwensstap (bestaand: `trust.ts`, sparse-checkout
  voor agents/commando's met shell). Bijwerken met de bestaande periodieke fetch (10 min) + fast-forward als het rustig is.
- Inhoud: `harness.json`, `skills/`, `commands/`, `agents/`, `schema/` (zelfde indeling als de bundel; H6: geen eigen
  formaat, zodat een latere hub dezelfde mappen kan serveren). `harness.ts` neemt hem als bron `repo` mee; verandert
  hij, dan `refreshGlobalContext()`. Onderdelen uit de repo komen ook in de kaart van H3 als een projectbrein er een
  oudere kopie van heeft.
- Wat alleen de app kan afdwingen blijft in de bundel (`APP_RULES`, de breinen-MCP-policies). De repo levert geen
  `opencode.json`; staat hij er wel, dan negeren met melding.
- Beheerdoc: hoofdstuk in `docs/bonzaiwork/brein-beheer.md` ("Een harnas-repo beheren": structuur, versienummer, hoe
  een skill testen vóór je pusht, branch-bescherming).

### 2.2 Dagelijkse verwerking

**Zo ziet een dag eruit.** De gebruiker werkt in zijn projecten; niets gebeurt extra. Om 17:30 start de bestaande
routineplanner een nieuwe chat in Jouw brein met de agent Brein en de vaste opdracht uit het harnas. De agent vraagt
met `gesprekken_lezen` de chats van die dag op (bijv. zes chats uit drie projecten), leest ze, en werkt het brein bij
met de tools die hij al heeft: een `Person`-concept in `knowledge/mensen/` (draft, chat als bron), een besluit in
`knowledge/projecten/<project>.md`, een voorkeur via `voorkeur_voorstellen` (kaart op Vandaag). De Stop-hook legt het
vast in de geschiedenis. De volgende ochtend staat die chat onder Jouw brein met drie regels wat er veranderde; de
gebruiker vraagt door of corrigeert in dezelfde chat.

- **Geen nieuwe verbinding en geen nieuwe server.** `gesprekken_lezen({ sinds, tot?, project? })` is één extra tool op
  de bestaande lokale MCP-server `breinen` (`mcp.ts`), die al in de globale engine-config staat en via de
  loopback-route met lokaal token bereikbaar is. De server haalt de chats op zoals de Stop-hook de engine nu al
  bevraagt (`host.engineRequest`: `GET /api/session` per lokale map, daarna de berichten). Antwoord per chat: titel,
  project, tijd, de gebruikersberichten en de eindantwoorden als tekst; geen tool-aanroepen of tussenstappen.
- **Grenzen.** Alleen lokale chats van deze gebruiker. Verwerkingschats zelf (herkenbaar aan de routine) worden
  overgeslagen, anders leest hij zijn eigen samenvattingen. De tool werkt alleen in Jouw brein en in die routine:
  vanuit elke andere map weigert hij (zelfde controle als `persoonlijk_brein_schrijven` nu: de aanroepende map moet
  het persoonlijke brein zijn), zodat een chat in een teambrein nooit andere projecten kan uitlezen. Policy allow,
  want het is eigen data en de map is al de grens.
- **Routine "Dagelijkse verwerking"** (bestaande planner, `packages/bonzaiwork-routines`): in Jouw brein, standaard
  17:30, prompt uit het harnas (`harness/commands/dagverwerking.md`, zodat release management hem bijstelt). Opdracht:
  lees de chats sinds de vorige run (`knowledge/log.md` als bron van "vorige run"), werk `knowledge/mensen/`,
  `knowledge/projecten/<project>.md` en besluiten bij als `draft`-concepten met de chat als `sources`-verwijzing
  (`resource: bonzaiwork://chat/<id>`), stel voorkeuren voor met `voorkeur_voorstellen`, eindig met drie regels wat er
  veranderde. Op Jouw brein een rij "Dagelijkse verwerking" (Inplannen / Gepland, zelfde patroon als `copy.brain.news`),
  en in de geschiedenis staan die commits onder de routinechat (bestaande `BonzaiWork-Chat`-trailer).
- Gemiste runs (app dicht) niet inhalen (bestaand gedrag); de volgende run leest gewoon sinds de laatste log-regel.
- OKF: de harnas-`schema/` levert `Person`/`Project`/`Decision`; `okf.ts` accepteert typen uit harnas én `_meta/schema.md`.

### 2.3 Klaar als

Twee gebruikers met dezelfde harnas-repo zien een nieuwe skill binnen 10 minuten in elk project, zonder app-update. Na
een dag werken in twee projecten bevat Jouw brein een `Person`-concept voor iemand die in beide voorkwam, met bron, en
een voorkeursvoorstel staat als kaart op Vandaag. Verwerking leest nooit chats vanuit een projectbrein.

## Fase 3 (later, niet in dit plan uitgewerkt)

`/onthoud` koppelen aan "Zal ik dit vastleggen?"; harnas-skills met scripts (trust); hybride zoeken (bestaand fase 3);
agent Brein als sub-agent (`@brein`) in projectchats. **Skills-hub en beheerde MCP-hub via Bonzai LiteLLM (H6)**: apart
ontwerp; aanknopingspunten die er dan al liggen zijn de bronnenlijst in `harness.ts`, de LiteLLM-proxyroute met de
gebruikerskey en `updateEngineMcp` + vertrouwensstap in `downstream-hooks.ts`.

## Bestanden (kern)

| Bestand | Wijziging |
|---|---|
| `packages/bonzaiwork-harness/**` | nieuw: skills, commands, agents, schema, `harness.json`, `src/index.ts` (bundel als tekst), tests |
| `packages/bonzaiwork-brains/templates/common/.opencode/**`, `templates/vendor/**` | verhuizen naar harnas; `template.ts`, `template-files.ts`, `test/template.test.ts` |
| `packages/bonzaiwork-brains/src/harness.ts` | nieuw: bronnen, voorrang, uitschrijven naar `<state>/harness/<version>/` |
| `packages/bonzaiwork-brains/src/server-hooks.ts` | `refreshGlobalContext`, route `/bonzaiwork/harness`, skills-routes, soort `harness` |
| `packages/bonzaiwork-brains/src/personal.ts`, `trust.ts`, `sync.ts` | `APP_RULES`; tekstbestanden onder `.opencode/` mee in git (persoonlijk) |
| `packages/bonzaiwork-brains/src/mcp.ts` | `gesprekken_lezen` |
| `packages/bonzaiwork-brains/src/registry.ts` | `KINDS` + `harness`; migratie personal → project (H5) |
| `packages/bonzaiwork-brains/src/sync.ts`, `server-hooks.ts` | `outdated` in `BrainStatus`, routes `harness/update` en `harness/remove` (H3) |
| `apps/bonzaiwork/src/features/brain/brain-tab.tsx`, `cards.tsx` | kaart verouderde onderdelen; aandachtsitem op Vandaag |
| `apps/server/src/downstream-hooks.ts` (+ test) | samengestelde `skills/`, `command/`, `agent/` |
| `apps/bonzaiwork/src/backend/{types,live/index,live/brains,demo/brains}.ts` | `Capabilities.harness`, client, demo |
| `apps/bonzaiwork/src/features/brain/personal-page.tsx`, nieuw `skills-section.tsx` | sectie werkwijzen/skills, dagverwerking-rij |
| `apps/bonzaiwork/src/features/settings/werkwijzen.tsx` | herkomst-chips, "Overal gebruiken" |
| `apps/bonzaiwork/src/copy.ts` | teksten |
| `apps/desktop/electron-builder.bonzaiwork.mjs` | niets als "altijd uitschrijven naar state" werkt (1.1) |
| `docs/bonzaiwork/brein-harnas-plan.md` (nieuw), `frontend-contract.md` §7.5, `brein-beheer.md`, `project-breinen-fase0.md` §9, `README.md` | ontwerp, contract, beheer, metingen |

## Verificatie

- Fase 0 (gedaan): `bun scripts/bonzaiwork/spikes/brains/harness-probe.mjs` blijft bij elke engine-update draaien,
  naast `engine-probe.mjs`; een veranderd antwoord blokkeert de update.
- Unit: `pnpm --filter @bonzaiwork/harness test`, `pnpm --filter @bonzaiwork/brains test` (nieuw: `harness.test.ts`
  voorrang en opruimen van oude versies; `personal.test.ts` niet-`.md` skillbestand in de geschiedenis; `template.test.ts`
  zonder skills), `apps/server/test/downstream-hooks.test.ts` (samengestelde map).
- Unit (H3/H5): twee gebruikers op één bare repo: gebruiker A klikt "Bijwerken" → B ziet de nieuwe versie na pull;
  een door B aangepaste kopie staat in `outdated` met `modified: true`, "Harnasversie overnemen" vervangt hem en
  `/restore` zet hem terug, "Zo laten" verbergt hem tot een nieuwere harnasversie; een eigen skill met dezelfde naam
  maar zonder herkomst komt nooit in `outdated`; "Uit het project halen" verwijdert en commit; een bestaand
  persoonlijk brein (fixture met geschiedenis en voorkeuren) wordt een project met dezelfde geschiedenis en de
  globale `AGENTS.md` bevat de oude voorkeuren niet meer.
- e2e: `pnpm --filter @bonzaiwork/brains e2e` uitbreiden: skill overnemen → zichtbaar in tweede workspace; agent
  Brein via `GET /api/agent`; `gesprekken_lezen` geweigerd vanuit een projectbrein, toegestaan in Jouw brein; een
  projectbrein zonder BonzaiWork (kale checkout) bevat alle harnas-skills en -commando's als gewone bestanden.
- UI headless (`pnpm --filter @bonzaiwork/app dev` + demo-backend): screenshots Jouw brein (skills-sectie, dagverwerking),
  projectinstellingen (herkomst-chip, Overal gebruiken), agent-kiezer; regel-ids uit `DESIGN.md` in de PR.
- `node scripts/bonzaiwork/check-patches.mjs` groen (0 nieuwe patches); typecheck van alle `@bonzaiwork/*` en
  `openwork-server`; verpakte smoketest draait de bestaande stappen plus "harnas-skill aanwezig in config-map".
