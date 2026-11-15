# Release notes

Wat testgebruikers moeten weten bij een nieuwe BonzaiWork-build. Elke PR die iets verandert wat een
gebruiker merkt of waarvoor hij iets moet doen, zet dat onder **Volgende release**. Bij het promoveren
naar `main` ([README](./README.md#promoveren-naar-main)) krijgt dat kopje de datum en de commit, gaat de
tekst mee naar de testgebruikers, en begint er een nieuw, leeg **Volgende release**.

Dit bestand is pas bij deze release begonnen: wat er eerder veranderde, staat er niet in.

## Volgende release

### Doen na het bijwerken: je agent schoon opzetten

Je persoonlijke brein heet nu **Agent** en begint voortaan leeg, in een map die BonzaiWork zelf maakt. Had
je een eigen notitiemap gekoppeld (bijvoorbeeld een Obsidian-vault), dan blijft die werken zoals hij was,
maar hij stapt niet vanzelf over. Overstappen doe je zelf, één keer:

1. **Agent → Technische details → Loskoppelen.** De map blijft staan met alles erin en wordt een gewoon
   project met de naam die het al had.
2. **Agent → "Maak je agent".** Er komt een nieuwe map "Mijn agent" naast je projecten.
3. **Kopieer wat mee moet** van de oude map naar "Mijn agent": `_meta/voorkeuren.md`, en als je de agent
   op Vandaag gebruikt ook `taken.md` en `inbox.md`. Zonder deze stap is de AI je voorkeuren kwijt en
   staan je open taken niet meer op Vandaag.

Let op voordat je loskoppelt:

- **Uitgesloten mappen gaan open.** Had je mappen uitgesloten (bijvoorbeeld `Dagboek/`), dan kan de AI
  daar na het loskoppelen in komen als je in dat project chat. Zet ze eerst buiten de map als dat niet mag.
- **Een gekoppelde privérepo stopt.** BonzaiWork deelt de map na het loskoppelen niet meer met die repo, en
  houdt er geen geschiedenis meer van bij ("Zet deze notitie terug" werkt daar niet meer).
- **De rondes van de agent op Vandaag** verdwijnen tot er een nieuwe agent is; hun rungeschiedenis begint
  opnieuw.
- Niet terwijl er een chat loopt: BonzaiWork weigert dan en zegt het.

Er is geen knop die dit in één keer doet. Die is gebouwd en bewust niet meegenomen
(fonteijne/openwork#45, gesloten): voor het huidige aantal testgebruikers woog het risico in de
synchronisatie niet op tegen deze drie stappen. De code staat nog in die PR.

### Nieuw

- **Skills en commando's zitten in de app.** `/verwerk`, `/vastleggen`, `/onderhoud` en `/werkwijze` en de
  bijbehorende skills werken in elk project en gaan mee met een update. Een nieuw brein krijgt er geen
  kopie meer van.
- **De skill `icm-architect` kan zijn eigen bijlagen weer lezen.** Dat ging stil mis.
- **Eén naam: Agent.** "Jouw brein" en "Persoonlijke agent" heten nu "Agent"; de instellingen voor taken,
  mail, Slack en de rondes heten "Agent op Vandaag". Een gedeeld projectbrein heet nog steeds "brein".
- **Loskoppelen.** Je agent is los te koppelen van zijn map (zie hierboven).

### Anders dan je gewend bent

- **Een bestaande notitiemap kiezen kan niet meer** bij het maken van een agent.
- **Eigen skills in de map van je agent** (`.opencode/skills`) tellen niet meer mee in andere projecten.
- Een brein dat nog een oude kopie van de skills in zijn repo heeft, blijft in dat project die oude versie
  gebruiken. Wil je de versie uit de app, haal de map `.opencode/skills` dan zelf uit de repo.
- Bestaande projecten houden hun naam: een al aangemaakt "Mijn brein" heet niet vanzelf "Mijn agent".

### Voor de beheerder

- `BONZAIWORK_MANAGED_SKILLS=0` zet de oude opzet terug (skills uit het persoonlijke brein, een kopie in
  elk nieuw brein, een bestaande map kiezen), zonder nieuwe build.
- Niet getest: de verpakte build op macOS en Windows met deze wijzigingen.
