# Onderzoek: het persoonlijke brein opnieuw opzetten

Stand: 14 november 2026, op `nightly` na de merge van upstream `v0.18.66`. Dit is een beoordeling, geen
bouwplan: wat er nu staat, wat de gevraagde wijziging raakt, een voorstel en de beslissingen die nog
open zijn. Er is niets gebouwd en niets gedraaid; wat alleen met een meting vast te stellen is, staat
als **[VERIFIEER]**.

## 1. De vraag

Het huidige persoonlijke brein ("second brain") vervangen, met vier eisen:

| # | Eis | Hoe ik hem lees |
|---|---|---|
| R1 | De logica blijft: altijd geladen, in elke projectchat beschikbaar | Het mechanisme van plan §5.1 blijft: instructies in elke chat, schrijven vanuit elk project |
| R2 | Schoon beginnen met de nieuwe project-OKF-opzet | BonzaiWork maakt de map zelf, met dezelfde opbouw als een nieuw projectbrein; nooit meer bovenop een bestaande notitiemap |
| R3 | Skills die BonzaiWork beheert | De skills in de altijd-geladen laag komen uit de app en gaan mee met een update, niet uit de map van de gebruiker |
| R4 | Een bestaand gekoppeld persoonlijk brein gaat naar een "project" | De map, de geschiedenis en de chats blijven, als gewoon project; het telt niet meer mee in elke chat |

Dit draait twee besluiten uit [`project-breinen-plan.md`](./project-breinen-plan.md) §9 om: **N1**
("een bestaand second brain wordt gekozen, niet gekopieerd") en **N4** ("de AI mag in de hele gekozen
map schrijven"). §5.1.1 vervalt daarmee grotendeels.

## 2. Hoe het nu werkt

| Onderdeel | Waar | Wat het doet |
|---|---|---|
| Aanmaken | `apps/bonzaiwork/src/features/brain/personal-setup.tsx` | Maakt een project "Mijn brein" op een nieuwe map of op een **gekozen bestaande map**, en registreert het als `kind: "personal"` |
| Registratie | `server-hooks.ts` `register()`, `registry.ts` | Eén record met `kind: "personal"` in `brains.json`; `BrainSync.initLocal` zet de geschiedenis buiten de map (`userData/bonzaiwork/history/<id>.git`) |
| Sjabloon | `template.ts`, `templates/personal/`, `templates/common/`, `templates/vendor/` | Schrijft `AGENTS.md`, `_meta/`, `knowledge/`, `workflows/`, `_templates/` en `.opencode/skills` + `.opencode/commands` **in de map**, alleen wat ontbreekt |
| Altijd geladen | `personal.ts` `composeInstructions`, `server-hooks.ts` `refreshGlobalContext` | App-regels + `AGENTS.md` + `_meta/voorkeuren.md` (max. 32 KiB) gaan via `host.setEngineGlobalContext` naar `<OPENCODE_CONFIG_DIR>/AGENTS.md` |
| Skills in elk project | `refreshGlobalContext`, `apps/server/src/downstream-hooks.ts` | `<OPENCODE_CONFIG_DIR>/skills` is een **link naar `.opencode/skills` in de map van het persoonlijke brein** |
| Schrijven vanuit elk project | `mcp.ts` | `persoonlijk_brein_lezen/zoeken/schrijven/bewerken` en `voorkeur_voorstellen` |
| Afscherming | `server-hooks.ts` `enginePolicies`, `closedFolders` | `voorkeuren.md` niet te bewerken; uitgesloten mappen dicht (alleen bij `kind: "personal"`); andere breinen alleen via de MCP |
| Vandaag | `packages/bonzaiwork-today` | `inbox.md` en `taken.md` staan in de map van het persoonlijke brein; de drie rondes van de agent draaien als routine in dat project |

Het persoonlijke brein heeft nu dus drie rollen in één, door de gebruiker gekozen, map: de altijd-geladen
laag, een gewoon project om in te chatten, en de opslag van Vandaag.

## 3. Wat er knelt

1. **Skills zijn kopieën die nooit meer bijwerken.** `applyTemplate` schrijft alleen wat ontbreekt. Een
   verbeterde `okf-ingest` in een nieuwe build bereikt geen enkel bestaand brein. Elke map en elke
   teamrepo heeft zijn eigen, verouderende kopie.
2. **De globale skills zijn wat er toevallig in de map staat.** De link wijst naar `.opencode/skills`
   van het persoonlijke brein. In een gekozen vault is dat wat de gebruiker (of een ander hulpmiddel)
   daar neerzette, en het geldt dan in elk project. Een persoonlijk brein zonder origin slaat de
   vertrouwenscontrole over (`sync.ts`, `applyTrust`).
3. **De skills zijn geschreven voor één brein, maar gelden overal.** `okf-query` zegt "bij elke vraag over
   hoe iets zit binnen dit team" en leest `knowledge/index.md` van de map waar de chat draait. In een
   project zonder `knowledge/` slaat dat nergens op. Een teambrein heeft dezelfde skillnamen nog eens
   in zijn eigen repo; welke van de twee de engine kiest, is niet gemeten **[VERIFIEER]**.
4. **Een bestaande vault past niet in OKF.** De notities hebben geen `type` en blijven buiten de bundel;
   `/inrichten` (plan §6.7) is niet gebouwd. Wat overblijft is vrij schrijven in andermans map (N4), met
   de bekende gaten: uitgesloten mappen gelden als relatieve regel in álle projecten, en `grep` en bash
   gaan erlangs (plan §5.1.1).
5. **De herkomst is niet vastgelegd.** `brains.json` weet niet of een persoonlijk brein op een gekozen
   map of op een nieuwe map is gemaakt. Dat bepaalt de keuze in §4.3.

## 4. Voorstel

### 4.1 Het nieuwe persoonlijke brein (R1, R2)

- BonzaiWork maakt de map altijd zelf: `<standaardmap>/Mijn brein`, zoals nu de knop "Begin met een
  nieuw brein". De keuze "Kies je bestaande notitiemap" verdwijnt.
- Inhoud: dezelfde opbouw als een nieuw projectbrein (`AGENTS.md`, `_meta/schema.md`, `_templates/`,
  `knowledge/` als OKF-bundel, `workflows/`), plus `_meta/voorkeuren.md`. **Geen** `.opencode/skills` en
  geen `.opencode/commands` meer in de map (§4.2).
- Het altijd-geladen mechanisme blijft zoals het is: `composeInstructions` → `setEngineGlobalContext`,
  de grens van 32 KiB, bijwerken vóór elke beurt, de `persoonlijk_brein_*`-tools en
  `voorkeur_voorstellen`. Hier verandert geen code.
- Geschiedenis buiten de map en later een privérepo koppelen blijven. Uitgesloten mappen zijn in een
  schone map niet meer nodig; de instelling kan weg uit "Jouw brein".
- Vandaag (`inbox.md`, `taken.md`, de rondes) volgt vanzelf het record met `kind: "personal"`:
  `ensureSystem` (`packages/bonzaiwork-routines/src/routines.ts`) zet een bestaande ronde over naar het
  nieuwe project zodra `workspaceId` verandert.

### 4.2 Skills die BonzaiWork beheert (R3)

- De skills zitten al als tekst in de build (`template-files.ts`). Bij het starten schrijven de hooks ze
  naar een eigen map, `userData/bonzaiwork/skills/`, en vervangen die map elke start volledig. De versie
  is dus altijd die van de build.
- `refreshGlobalContext` geeft die map als `skillsDirectory` mee in plaats van de map uit het brein. De
  host-methode en `downstream-hooks.ts` veranderen niet; `PATCHES.md` blijft gelijk.
- De skills worden herschreven voor gebruik in elk project: werken in het brein van het huidige project
  als dat er is, en anders via de `persoonlijk_brein_*`-tools in het persoonlijke brein.
- De sjablonen voor team en persoonlijk leveren geen skills meer mee. Bestaande kopieën in teamrepo's
  blijven staan: BonzaiWork verwijdert niets uit een gedeelde repo.

Wat eerst gemeten moet worden **[VERIFIEER]**, als uitbreiding van `scripts/bonzaiwork/spikes/brains/engine-probe.mjs`:

| Vraag | Waarom |
|---|---|
| Laadt de engine `<OPENCODE_CONFIG_DIR>/commands/` in elk project? | Dan kunnen `/verwerk`, `/vastleggen`, `/onderhoud` en `/werkwijze` ook uit de app komen. Fase 0 mat alleen `AGENTS.md` en `skills/` |
| Welke skill wint bij dezelfde naam: die van de config-map of die in de projectmap? | Bestaande teamrepo's houden hun oude kopie |
| Kan een skill zijn eigen bijlagen lezen? | `closedFolders` zet `read:<config-map>/*` op deny, en `icm-architect` leest `references/*.md` met de gewone leestool. Mogelijk werkt dat nu al niet |

Eigen skills van de gebruiker vallen in dit voorstel buiten de altijd-geladen laag. Dat is een
versmalling ten opzichte van nu; zie vraag V4.

### 4.3 Een bestaand persoonlijk brein wordt een project (R4)

Bij de eerste start met de nieuwe opzet, voor elk bestaand record met `kind: "personal"`:

1. Wachten tot er geen chat loopt die erin kan schrijven (`chatsWriteIn`), dan vastleggen wat open staat.
2. Het record wordt `kind: "project"`. De map, de werkruimte, de chats, de routines van de gebruiker, de
   geschiedenis (`gitDir`) en een gekoppelde privérepo blijven ongewijzigd. Er wordt niets gekopieerd
   of verplaatst.
3. Het project krijgt een andere naam (voorstel: "Mijn notities"), zodat er geen twee keer "Mijn brein"
   staat, en verschijnt in de zijbalk tussen de projecten.
4. Het nieuwe, schone persoonlijke brein wordt gemaakt (§4.1) en de globale instructies en de
   engine-mappen worden ververst.
5. Eén kaart legt uit wat er gebeurd is en waar de notities staan.

Het oude brein is daarna te raadplegen zoals elk ander brein: `brein_lezen`/`brein_zoeken` met een
vraag vooraf, of zonder vraag als een project het aanvinkt (`reads`). Vanuit andere projecten erin
schrijven kan niet meer.

**Dit is het riskante deel.** Vier regels hangen nu aan `kind === "personal"` en vallen stil weg zodra
het record een project wordt:

| Regel | Waar | Gevolg zonder aanpassing |
|---|---|---|
| Een eigen map zonder origin is vertrouwd | `sync.ts` `applyTrust` | De vertrouwenscontrole gaat lopen op de vault en kan bestanden van de gebruiker via sparse-checkout uit de map halen |
| Alleen `.md` en geen uitgesloten mappen in de geschiedenis | `sync.ts` (`personalExcludes`) | Bijlagen en uitgesloten mappen (bijv. `Dagboek/`) komen in de geschiedenis, en bij een gekoppelde repo op de host |
| Uitgesloten mappen dicht voor de AI | `server-hooks.ts` `enginePolicies` | De AI kan mappen openen die de gebruiker had uitgesloten |
| Instellingen voor uitsluiten en privérepo | `personal-page.tsx` | Het Brein-tab van een project toont ze niet |

Deze regels moeten dus aan een eigenschap van het record hangen (bijvoorbeeld "map van de gebruiker,
geschiedenis buiten de map") in plaats van aan `kind`. Dat vraagt een nieuw veld en `version: 2` in
`brains.json`, met tests die precies deze vier gevallen dekken op een verhuisd record.

Omdat de herkomst niet is vastgelegd (§3.5), stel ik voor **elk** bestaand persoonlijk brein te
verhuizen, ook een brein dat BonzaiWork zelf op een lege map maakte. Dat is één regel zonder
herkenning, en het is wat "schoon beginnen" vraagt. Zie vraag V1.

### 4.4 Wat verder mee verandert

- UI: `personal-setup.tsx` (één knop), `personal-page.tsx` (uitsluiten weg), `copy.ts`
  (`personalExisting`, `personalExistingHint`), de demo-backend (`backend/demo/brains.ts` heeft nu een
  persoonlijk brein met `excluded: ["Dagboek"]`). Volgens `DESIGN.md`, met screenshots uit de demo.
- Docs: plan §5.1, §5.1.1, §6.7 en besluiten N1 en N4; [`frontend-contract.md`](./frontend-contract.md)
  §7.4 als het record een veld krijgt; `packages/bonzaiwork-brains/README.md`.
- `AGENTS.md` (root) vraagt zichtbaar gedrag achter een schakelaar. BonzaiWork heeft daar nog geen
  eigen mechanisme voor; de verhuizing is bovendien niet terug te draaien door een schakelaar om te
  zetten. Voorstel: de nieuwe opzet achter een build-instelling (zoals `BONZAIWORK_KEY_MODE`), en de
  verhuizing pas uitvoeren als die aan staat.

## 5. Open vragen

| # | Vraag | Mijn voorstel |
|---|---|---|
| V1 | Verhuist elk bestaand persoonlijk brein, of alleen een gekozen bestaande map? | Elk. Het onderscheid is niet vastgelegd |
| V2 | Gaat `_meta/voorkeuren.md` mee naar het nieuwe brein? | Ja, als kopie, en alleen dat bestand. Het zijn voorkeuren die de gebruiker zelf heeft goedgekeurd; zonder kopie is de AI ze in elke chat kwijt |
| V3 | Gaan `inbox.md` en `taken.md` (Vandaag) mee? | Ja, als kopie; anders verdwijnen open taken en geparkeerde gedachten van Vandaag. De originelen blijven in het project staan |
| V4 | Mogen eigen skills van de gebruiker in de altijd-geladen laag? | Nu niet. Later een map in het persoonlijke brein die de app na controle naast de beheerde skills zet |
| V5 | Verhuizen zonder vragen bij de eerste start, of na een kaart met "Nu omzetten"? | Na een kaart. Het verandert waar de AI schrijft en wat in elke chat meetelt |
| V6 | Blijft "Haal je brein op uit een repo" voor een tweede laptop? | Ja, maar alleen voor een repo die het nieuwe sjabloon al heeft |
| V7 | Hoe heet het verhuisde project? | "Mijn notities", daarna vrij te hernoemen |

## 6. Omvang en volgorde

| Stap | Inhoud | Risico |
|---|---|---|
| 0 | De drie metingen uit §4.2 | Laag; bepaalt of commando's mee kunnen en hoe dubbele skills uitpakken |
| 1 | Beheerde skills: map in `userData`, herschreven skills, sjablonen zonder skills | Laag; geen upstream-patch |
| 2 | Schoon persoonlijk brein: één manier van aanmaken, UI en copy | Laag |
| 3 | Recordveld en de vier regels van §4.3 losmaken van `kind` | Middel; raakt `sync.ts` |
| 4 | De verhuizing zelf, met de kaart en de kopieën uit V2 en V3 | Hoog; werkt op de eigen notities van gebruikers, niet terug te draaien |

Stap 1 en 2 leveren los van elkaar al iets op. Stap 4 kan pas na stap 3.

Tests: de bestaande opzet in `packages/bonzaiwork-brains/test` (echte git, twee gebruikers), aangevuld
met een verhuisd record per geval uit §4.3, en de e2e tegen de echte engine voor de beheerde skills. Op
Windows is niets hiervan getest ([`windows.md`](./windows.md)); de junction naar de skills-map blijft
daar hetzelfde punt.
