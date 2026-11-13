# Persoonlijke agent op Vandaag

Status: alle vier de fasen zijn gebouwd, in `packages/bonzaiwork-today` (server) en `apps/bonzaiwork`
(app). Getest met eenheidstests, routetests en de end-to-end-test tegen de echte server en engine; de
koppelingen met Microsoft 365 en Slack zijn alleen tegen nagebouwde tegenhangers getest, niet tegen de
echte diensten (§9). Datum: 2026-11-13. Bouwt voort op [`ui-ux-overhaul.md`](./ui-ux-overhaul.md) §5
(Vandaag), [`project-breinen-plan.md`](./project-breinen-plan.md) en de routines uit
[`frontend-contract.md`](./frontend-contract.md) §5.6.

## 0. Het probleem

Vandaag toonde wat op je wacht **van agents** (toestemmingen, vragen, mislukte chats, routines). Wat op je
wacht **van de wereld** (taken, mail, Slack, afspraken, beloftes) stond er niet. Voor iemand die moeite
heeft met kiezen en beginnen, en snel afgeleid raakt door nieuwe ideeën, helpt een overzicht alleen niet:
dat is een tweede inbox. Het doel is daarom **uitvoeren omzetten in beoordelen**: elk item komt binnen met
de eerste stap al gedaan.

## 1. Beslissingen

| # | Beslissing | Gevolg |
|---|---|---|
| T1 | Taken staan als **Markdown-checkbox** in het persoonlijke brein en in project-breinen | Eén notatie (§2); de server indexeert zonder model |
| T2 | Taken in een project-brein zijn **gedeeld** en kunnen een teamgenoot als eigenaar hebben | Elke regel heeft een eigenaar; privétaken blijven in het persoonlijke brein |
| T3 | Taken **zonder eigenaar** in een project-brein zijn team-backlog | Ze staan niet in "Start hier" tot iemand ze oppakt |
| T4 | **De agent kiest**, jij niet | "Start hier" toont één taak; "Niet nu" geeft hooguit drie keer een andere |
| T5 | Ideeën **parkeer** je zonder de taak te verlaten | `inbox.md` in het persoonlijke brein; de avondronde deelt in |
| T6 | Een gevonden belofte is een **voorstel**, geen stille toevoeging | Kaart met één klik; een fout item in de lijst kost meer vertrouwen dan de klik |
| T7 | **Lezen mag zonder klik voor de eigen rondes, versturen doet alleen de gebruiker** | De agent heeft geen tool die iets verstuurt; de server verstuurt na de klik op de kaart |
| T8 | Outlook, agenda en Slack lopen via **lokale** koppelingen | Geen OpenWork-cloud (E6): de lokale MS365-server en het eigen Slack-script |
| T9 | Verspreide taken in proza krijgen een **eenmalige opruiming** per brein | De agent stelt de omzetting voor; schrijven pas na jouw ja |
| T10 | Alles staat **uit tot je het aanzet**, per onderdeel | Instellingen → Persoonlijke agent; `BONZAIWORK_TODAY=0` zet het voor een hele installatie uit |
| T11 | De rondes draaien op **`gpt-6-luna`**, instelbaar | Eén veld in de instellingen geldt voor alle rondes |

## 2. Taken

### 2.1 Notatie

```markdown
- [ ] Offerte sturen @sam 📅 2026-11-20
- [ ] Reactie van de leverancier op het voorstel @sam ⏳ 2026-11-19
- [x] Planning rondgestuurd @sam
```

- `@naam`: de eigenaar, wie het doet of bijhoudt. Een e-mailadres in de tekst telt niet als eigenaar.
- `📅 datum`: een deadline of een belofte van de eigenaar. `⏳ datum`: de eigenaar wacht tot die datum op
  iemand anders (wie, staat in de tekst).
- Geen eigenaar in een project-brein: backlog (T3). Geen eigenaar in het persoonlijke brein: van jou.
- Geen datum: telt mee in de keuze, niet in "Komt eraan".
- Regels in een codeblok, in verborgen mappen, in `_templates/` en in `_bewaard/` tellen niet.

De regel staat ook in de app-regels van elke chat (`APP_RULES`), zodat een agent nieuwe taken meteen zo
schrijft.

### 2.2 Wie ben ik: `team.md`

Een project-brein kan in `team.md` (of `_meta/team.md`, `knowledge/team.md`) per regel een teamlid noemen:

```markdown
| Naam | Wie |
|---|---|
| @sam | Sam Jansen <sam@example.invalid> |
| @robin | Robin de Vries |
```

"Mijn" taken zijn de regels met een `@naam` waarvan de naam of het e-mailadres overeenkomt met de
git-auteur die BonzaiWork voor breinen gebruikt. Staat er geen `team.md`, of sta je er niet in, dan telt je
voornaam (`@sam`). Onder Instellingen → Persoonlijke agent kun je je `@naam` ook zelf vastleggen.

### 2.3 Index en schrijven

`GET /bonzaiwork/today/todos` leest elke keer alle Markdown-bestanden van alle breinen: puur parsen, geen
model. Afvinken verandert alleen dat ene vinkje en laat de rest van de regel en het bestand staan. Een
nieuwe taak gaat naar `taken.md` in de hoofdmap van het brein. In een gedeeld brein krijgt een nieuwe taak
jouw `@naam`, tenzij ze iemand anders noemt: zo zet je een taak bij een teamgenoot, en die ziet haar na
het bijwerken van het brein op zijn eigen Vandaag.

Een wijziging buiten een chat om legt het brein meteen vast als eigen wijziging (`BrainSync.recordOwn`) en
deelt haar zoals de modus van het brein zegt: automatisch deelt, handmatig wacht op "Wijzigingen delen".
Loopt er op dat moment een chat in het brein, dan neemt het einde van die beurt de wijziging mee.

### 2.4 Opruiming (T9)

Staan er in een brein nog taakachtige zinnen ("TODO: …", "actie: …", "nog doen: …"), dan toont Vandaag één
regel met "Opruimen". Dat start een chat in dat brein waarin de agent eerst één overzicht geeft van oud en
nieuw en vraagt of het zo goed is; pas na ja schrijft hij. In een gedeeld brein zegt de opdracht erbij dat
het team het resultaat ziet.

## 3. Koppelingen

| Bron | Hoe | Lezen | Versturen |
|---|---|---|---|
| Outlook-agenda en -mail | de server start zelf de lokale MS365-server ([softeria/ms-365-mcp-server](https://github.com/Softeria/ms-365-mcp-server), stdio) met de opdracht uit de instellingen | `get-calendar-view`, `read-mail-text` (anders `list-mail-messages`) | `reply-mail-message`, alleen na de klik op de kaart |
| Slack | de server draait het eigen Slack-script (pad in de instellingen), dat JSON geeft | `unreads`, `history`, `get_thread`, `search` | `reply` of `post_message`, tekst op stdin, alleen na de klik |
| Breinen | de bestaande lokale server `breinen` | bestaand | bestaand |

De agent praat **niet** rechtstreeks met de MS365-server of het script. Hij krijgt een eigen, kleine set
tools (lokale server `vandaag`, zeventien tools) waarvan er geen enkele iets verstuurt. Daarmee is T7 geen
afspraak in een prompt, maar een eigenschap van de bouw: de enige plek waar een bericht de laptop verlaat
is de route `POST /bonzaiwork/today/items/send`, die de app alleen aanroept bij "Versturen".

De tools die mail, agenda of Slack lezen vragen in een gewone chat eerst toestemming (de gewone kaart van
de engine). Alleen de eigen rondes van de agent krijgen dat antwoord vanzelf.

De MS365-server kent zelf ook `--read-only` en `--enabled-tools`; wie dat wil, zet het in de opdracht.
Met `--read-only` kan BonzaiWork geen antwoord per mail versturen; "Versturen" meldt dan dat het niet lukte en de kaart blijft staan.

## 4. Vandaag

De pagina blijft kort. Op een breed venster (vanaf 1280 px) staan er twee kolommen: links het werk
(composer, "Start hier", "Voor jou", Bezig, "Terwijl je weg was"), rechts de dag ("Komt eraan", het
dagplan, "Je werkdag"), en die rechterkolom blijft staan terwijl links scrolt. In één kolom toont "Komt
eraan" alleen wat te laat of vandaag is (hooguit drie regels, de rest achter "Nog n") en is het dagplan
één regel tot je het opent. Met de agent aan toont "Voor jou" drie kaarten in plaats van vijf, en valt de
projectenlijst op een desktop weg: die staat al in de zijbalk. Een kaart voor mail of Slack is dicht drie
regels (wie, waarom, het begin van het concept); "Antwoord bekijken" opent het bewerkbare antwoord, en
pas dan staat er "Versturen".

Volgorde; secties zonder inhoud worden niet getoond:

1. **Composer**, met **Parkeren** (⌥⏎) zodra er tekst staat: de gedachte gaat naar `inbox.md`, toast
   "Geparkeerd", je blijft waar je was.
2. **Je was bezig met …**: één regel zolang een taak je focus is, met "Chat openen", "Klaar", "Stoppen".
3. **Start hier**: één taak, één regel waarom, de eerste stap. **Start** maakt een chat in het project
   van de taak waarin de agent de eerste stap al doet, en meldt aanwezigheid voor de agenda. **Klaar**
   vinkt af. **Niet nu** (esc) geeft de volgende, hooguit drie keer per dag. Daaronder het **dagplan** om
   goed te keuren, de regel **Opruimen**, en in de kop "Taak toevoegen".
4. **Voor jou** (bestaand; met de agent aan maximaal 3 kaarten), aangevuld met kaarten uit de wereld, na wat een agent
   stilzet en vóór mislukte chats:
   - afspraak die binnen een halfuur begint, met de voorbereiding als die er is · Gezien;
   - mail of Slack-draad: waarom het jou nodig heeft, het concept in een bewerkbaar veld, en in de
     statusregel wat versturen doet · Versturen · Later (morgen weer) · Niet voor mij;
   - gevonden belofte · Toevoegen · Negeren.
5. **Komt eraan**: deadlines, beloftes en afspraken, gegroepeerd *te laat · vandaag · deze week · later*,
   te laat in amber; een taak vink je hier af.
6. **Bezig**, **Terwijl je weg was**, **Je werkdag**, **Projecten**: ongewijzigd.

De volgorde voor "Start hier" is vast: te laat → vandaag → een verlopen "wacht op" → de top van het
dagplan → deze week → de rest. De agent schrijft alleen de reden en de eerste stap.

Schermafbeeldingen: `screenshots/agent-1-vandaag.png` tot en met `agent-11-donker.png`.

## 5. De persoonlijke agent

Drie routines in het project van het persoonlijke brein, zichtbaar op de pagina Routines. BonzaiWork
houdt hun opdracht bij; schema, model en aan/uit blijven van jou. Een gemiste ronde (de app was dicht)
verschijnt als de bestaande kaart "Nu uitvoeren".

| Ronde | Standaard | Doet |
|---|---|---|
| Ochtend | werkdagen, begin van de werktijd | kiest de top drie, schrijft per taak de eerste stap, stelt het dagplan voor, bereidt de afspraken van vandaag voor, loopt ongelezen berichten na |
| Tussendoor | werkdagen, om de twee uur | alleen wat nieuw is: berichten, beloftes, een verlopen "wacht op" |
| Avond | werkdagen, een halfuur voor het einde | deelt de geparkeerde gedachten in; op vrijdag een lijst "nog relevant?" |

Wat een ronde meldt heeft een sleutel uit bron en id: hetzelfde bericht geeft nooit een tweede kaart, en
wat je afhandelde of wegklikte komt niet terug.

### Kosten

Niet gemeten met een echt model; dit is een schatting, de echte cijfers komen uit de eerste week (de
rondes zijn gewone chats, het verbruik staat bij het project van het persoonlijke brein).

- Vast per ronde: de tools van de agent ongeveer 1.700 tokens, de breintools 800, de opdracht 500–700,
  plus de eigen systeemtekst van de engine.
- Wisselend: hooguit 15 mails van elk 1.500 tekens (ongeveer 6.500 tokens), de uitvoer van het
  Slack-script tot 24.000 tekens (ongeveer 7.000 tokens), hooguit vijf kaarten.
- Een tussenronde op een drukke dag leest zo 20.000–30.000 unieke tokens. Omdat elke stap de context
  opnieuw meestuurt, kan dat zonder caching oplopen tot een paar honderdduizend invoertokens per ronde.

Wat de bouw doet om het laag te houden: een mail die een ronde al las wordt niet opnieuw aangeboden, de
agenda en de taken leest de server zelf zonder model, en de tussenronde krijgt de opdracht niets te
melden als er niets nieuws is.

## 6. Instellingen

Instellingen → **Persoonlijke agent**: de schakelaar, het model van de rondes, je `@naam`, per bron een
schakelaar met de stand (Werkt · Nog niet ingesteld · Werkt niet), de opdracht voor Microsoft 365, het pad
van het Slack-script, "Koppelingen testen", en de rondes met "Nu uitvoeren".

Aanzetten voor het eerst:

1. Maak je persoonlijke brein aan (Jouw brein) als dat er nog niet is.
2. Zet de schakelaar aan. Taken, "Start hier", Parkeren en "Komt eraan" werken nu, zonder koppeling.
3. Zet Outlook-agenda en -mail aan. De opdracht staat standaard op `npx -y @softeria/ms-365-mcp-server`;
   pas hem aan als jouw server anders start. Je moet daar al zijn ingelogd.
4. Zet Slack aan en vul het pad naar het script in.
5. Druk op "Koppelingen testen".

## 7. Waar de code staat

```
packages/bonzaiwork-today/
  src/notation.ts    de notatie, team.md, "wie ben ik"                  (puur)
  src/rank.ts        de keuze voor Start hier, Komt eraan               (puur)
  src/read.ts        JSON teruglezen, voor de server en de app          (puur)
  src/scan.ts        de index over de breinen, afvinken, toevoegen, inbox
  src/connectors.ts  de MS365-server over stdio en het Slack-script
  src/agent.ts       de drie rondes en hun opdrachten
  src/mcp.ts         de tools van de agent (lokale server "vandaag")
  src/service.ts     alles wat Vandaag doet, voor routes en tools
  src/hooks.ts       routes, engine-registratie, rondes bijhouden
apps/bonzaiwork/src/
  backend/live/today.ts, backend/demo/today.ts
  features/today/    secties, kaarten, instellingen
```

Aangepast buiten het nieuwe pakket: routines kunnen door de app zelf bijgehouden worden
(`ensureSystem`), een brein legt een wijziging buiten een chat vast (`recordOwn`), en de composer kent
"Parkeren".

## 8. De open punten van het ontwerp

| Vraag | Antwoord |
|---|---|
| Koppeling `@naam` ↔ git-auteur | `team.md` in het project-brein (§2.2). Het sjabloon voor nieuwe breinen maakt het bestand nog niet aan |
| Doorstaat de notatie de controles? | Ja: `@naam` en de datum-emoji komen door de OKF- en geheimencontrole, ook in een concept onder `knowledge/` en met `team.md` (`packages/bonzaiwork-brains/test/todos.test.ts`) |
| Lezen en schrijven apart bij MS365? | Ja, en strenger dan gevraagd: de agent bereikt de MS365-server alleen via leestools van BonzaiWork; versturen kan alleen de server, na de klik (§3) |
| Kosten en model | `gpt-6-luna`, instelbaar. Kosten: schatting in §5, niet gemeten |
| Twee mensen vinken dezelfde regel af | Geen conflict: git ziet twee keer dezelfde wijziging. Verschillende regels in één bestand voegen ook samen. Vinkt de één af terwijl de ander dezelfde regel herschrijft, dan volgt het bestaande conflict met "Bewaar mijn versie apart"; niets gaat verloren (zelfde testbestand) |

## 9. Wat niet tegen het echte is getest

- **Microsoft 365**: de aanroepen zijn geschreven naar de toolnamen en parameters van de MS365-server
  (broncode gelezen) en getest tegen een nagebouwde server. Inloggen, je tenant en de echte antwoorden van
  Graph zijn niet geprobeerd.
- **Slack**: de aanroepen volgen de opdrachten van het script en zijn getest tegen een nagebouwd script.
  De uitvoer van `unreads` en `history` gaat ongewijzigd naar de agent; hoe goed de agent die leest is niet
  gemeten.
- **De rondes met een echt model**: de opdrachten zijn niet met `gpt-6-luna` gedraaid. De end-to-end-test
  bewijst de leidingen (tools bereikbaar, vragen bij lezen, de ronde leest zonder klik), niet de kwaliteit
  van de keuzes en concepten.
- **Windows**: niet getest (zie [`windows.md`](./windows.md)).

Eerste proef: zet alleen de schakelaar aan (zonder koppelingen), laat de opruiming op één brein los, en
kijk een paar dagen of "Start hier" de goede taak kiest. Zet daarna de agenda aan, dan mail, dan Slack.
