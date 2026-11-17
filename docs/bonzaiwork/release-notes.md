# Release notes

Wat testgebruikers moeten weten bij een nieuwe BonzaiWork-build. Elke PR die iets verandert wat een
gebruiker merkt of waarvoor hij iets moet doen, zet dat onder **Volgende release**. Bij het promoveren
naar `main` ([README](./README.md#promoveren-naar-main)) krijgt dat kopje de datum en de commit, gaat de
tekst mee naar de testgebruikers, en begint er een nieuw, leeg **Volgende release**.

Dit bestand is bij deze release begonnen. "Volgende release" hieronder bevat alles wat in `nightly` zit en
nog niet in `main` (`main` staat op `fbaaf397`, 2 november 2026, fonteijne/openwork#15).

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

**Vandaag en de agent**

- **Je Slack-to-do's op Vandaag** (staat uit; Instellingen → Agent op Vandaag → "To-do's uit Slack op
  Vandaag", met Slack aan). Je eigen to-do's uit Slack staan in een eigen lijstje naast "Komt eraan".
  Vink je er een af, dan is hij ook in Slack afgevinkt; "Ongedaan maken" in de melding zet hem terug.
  Je Slack-script moet de nieuwe opdrachten `todos` en `todo_done` kennen: werk het bij.

- **Nieuwe opzet van de hele app.** De zijbalk heeft Vandaag, Routines, Agent en Instellingen, met daaronder
  je projecten; het open project klapt uit naar zijn chats. Vandaag is de startpagina: wat op je wacht, over
  alle projecten.
- **Agent op Vandaag** (staat uit tot je het aanzet, bij Instellingen → Agent op Vandaag). Houdt je taken
  uit al je breinen bij, en op verzoek je Outlook-agenda, Outlook-mail en Slack. Vandaag krijgt dan:
  - "Start hier": één taak, waarom die, en de eerste stap;
  - een dagplan dat je goedkeurt, en "Komt eraan" met deadlines;
  - kaarten voor mail, Slack, toezeggingen en afspraken. De agent leest alleen; versturen doe jij, met één
    klik op de kaart;
  - drie rondes per werkdag (ochtend, tussendoor, avond), en vanaf een uur voor het einde van je werkdag
    een kaart die de dag afsluit.
- **Een gedachte parkeren** kan vanaf elke pagina (sneltoets of het palet); hij komt in de inbox van je agent.
- **Eén naam: Agent.** "Jouw brein" en "Persoonlijke agent" heten nu "Agent"; de instellingen voor taken,
  mail, Slack en de rondes heten "Agent op Vandaag". Een gedeeld projectbrein heet nog steeds "brein".
- **Chatten met je agent** vanaf de Agent-pagina: de knop "Nieuwe chat" en een lijst met de laatste chats.
- **Loskoppelen.** Je agent is los te koppelen van zijn map (zie hierboven).

**Agenda**

- **Werkdag bijhouden.** BonzaiWork houdt per kwartier bij in welk project je werkt, zonder model en zonder
  chat. Onderin de zijbalk staat waar je nu aan werkt; ⌘J / Ctrl+J opent het paneel met de dagkaart, de
  weekstrook en de tijdlijn. Kwartieren zijn te wijzigen, toe te voegen en ongedaan te maken.
- **Boeken via Bridge.** Per project stel je een Bridge-post in (projectinstellingen). De agenda maakt een
  boekdocument dat je in een chat plakt, kopieert of opslaat; die chat boekt de uren pas na jouw akkoord.

**Chats en projecten**

- **"Nieuwe chat" vraagt eerst het project** (⌘N, de knop op Vandaag of in de zijbalk, of het palet). ⏎ of
  ⌘1…9 opent de lege chat van dat project. Het invoerveld staat niet meer op Vandaag; de eerste start
  landt in de lege chat van je nieuwe project.
- **Voorkeursmodellen.** Nieuwe projecten starten met alleen de vijf voorkeursmodellen aan. In de
  projectinstellingen zet "Voorkeursmodellen aanzetten" precies die vijf aan; de schakelaar "Alle modellen
  van de key" zet alles aan of uit. Bestaande projecten blijven op "alle modellen".
- **Een connectie aanpassen** kan vanuit het menu van de connectie ("Aanpassen"); de naam blijft.
- **De chat zegt welke connectie en actie** hij gebruikte ("Gebruikte Microsoft 365: list calendar events")
  in plaats van alleen "Werkte met je connecties".
- **Een map openen** in Finder, Verkenner of de bestandsbeheerder met een icoonknop, overal waar een mappad
  staat.

**Breinen**

- **Skills en commando's zitten in de app.** `/verwerk`, `/vastleggen`, `/onderhoud` en `/werkwijze` en de
  bijbehorende skills werken in elk project en gaan mee met een update. Een nieuw brein krijgt er geen
  kopie meer van.
- **"Vraag de agent"** op de kaart "Bijwerken is gestopt": start een chat die het probleem in het brein oplost.

### Opgelost

- De eerste beurt in een net aangemaakt brein werd niet vastgelegd of gedeeld.
- Een brein bleef op "Actie nodig" staan nadat de fout in de notities was hersteld; er is nu "Opnieuw
  proberen", en "Herstellen" verschijnt alleen als BonzaiWork het zelf kan herstellen.
- De melding over een fout in een kennisbestand noemde altijd "mist de kop met het type", ook als de kop
  ongeldig was (bijvoorbeeld een titel met een dubbele punt zonder aanhalingstekens). Hij noemt nu de echte
  fout en de regel.
- De melding over een geheim in een brein noemde alleen het eerste bestand; nu alle bestanden in één keer.
- Een geslaagde wijziging van een bestand telde in de chat niet als "Gewijzigd", en een eerdere mislukte
  poging bleef als rode foutkaart staan.
- Een lange vraagkaart viel buiten beeld; hij scrolt nu binnen de chat.
- Het pijltje naast het open project in de zijbalk deed niets; het klapt de chats nu in en uit.
- Een dialoog bovenop een andere dialoog dimde de achtergrond niet.
- De skill `icm-architect` kon zijn eigen bijlagen niet lezen.
- "Openen in Slack" (en de andere "Openen in …"-links op Vandaag en links in de chat) deed niets. Ze openen nu
  in je eigen browser, en je Slack-app als die de link overneemt.

### Anders dan je gewend bent

- **Een bestaande notitiemap kiezen kan niet meer** bij het maken van een agent.
- **Eigen skills in de map van je agent** (`.opencode/skills`) tellen niet meer mee in andere projecten.
- Een brein dat nog een oude kopie van de skills in zijn repo heeft, blijft in dat project die oude versie
  gebruiken. Wil je de versie uit de app, haal de map `.opencode/skills` dan zelf uit de repo.
- Bestaande projecten houden hun naam: een al aangemaakt "Mijn brein" heet niet vanzelf "Mijn agent".
- Je agent staat niet meer tussen de projecten in de zijbalk; hij heeft zijn eigen pagina.
- De brein- en agendapil in de bovenbalk zijn weg: de agenda staat onderin de zijbalk, het brein op de
  tab Brein van het project.

### Voor de beheerder

- **Upstream**: OpenWork `v0.18.64`, `v0.18.65` en `v0.18.66` zijn meegenomen (`main` stond op een stand
  rond `v0.18.63`).
- **Schakelaars zonder nieuwe build** (omgevingsvariabelen):
  - `BONZAIWORK_MANAGED_SKILLS=0`: de oude opzet van skills en het persoonlijke brein;
  - `BONZAIWORK_TODAY=0`: de agent op Vandaag uit voor de hele installatie;
  - `BONZAIWORK_PREFERRED_MODELS`: een andere lijst voorkeursmodellen (komma-gescheiden).
- **Niet getest tegen het echte**: de agent op Vandaag tegen echte Outlook- en Slack-accounts (zie
  [`persoonlijke-agent-plan.md`](./persoonlijke-agent-plan.md)). Of het boeken met de echte Bridge CLI is
  getest, staat nergens vastgelegd; ga daar bij deze release niet van uit.
- **Niet getest op macOS**: de verpakte build met echte LiteLLM voor `v0.18.64` tot en met `v0.18.66`; de
  laatste stand die daar wel op getest is, is `v0.18.63`. Op Windows is niets getest
  ([`windows.md`](./windows.md)).
