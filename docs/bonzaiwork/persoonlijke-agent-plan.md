# Persoonlijke agent op Vandaag: ontwerp

Status: ontwerp uit een brainstorm, nog niets gebouwd. Datum: 2026-11-13. Bouwt voort op
[`ui-ux-overhaul.md`](./ui-ux-overhaul.md) §5 (Vandaag), [`project-breinen-plan.md`](./project-breinen-plan.md)
en de routines uit [`frontend-contract.md`](./frontend-contract.md) §5.6.

## 0. Het probleem

Vandaag toont wat op je wacht **van agents** (toestemmingen, vragen, mislukte chats, routines). Wat op je
wacht **van de wereld** (taken, mail, Slack, afspraken, beloftes) staat er niet. Voor iemand die moeite
heeft met kiezen en beginnen, en snel afgeleid raakt door nieuwe ideeën, helpt een overzicht alleen niet:
dat is een tweede inbox. Het doel is daarom **uitvoeren omzetten in beoordelen**: elk item komt binnen met
de eerste stap al gedaan.

## 1. Beslissingen

| # | Beslissing | Gevolg |
|---|---|---|
| T1 | Taken staan als **Markdown-checkbox** in het persoonlijke brein en in project-breinen | Eén notatie (§2); de server indexeert zonder model |
| T2 | Taken in een project-brein zijn **gedeeld** en kunnen een teamgenoot als eigenaar hebben | Elke regel heeft een eigenaar; privétaken blijven in het persoonlijke brein |
| T3 | Taken **zonder eigenaar** zijn team-backlog | Ze staan niet in "Start hier" tot iemand ze oppakt |
| T4 | **De agent kiest**, jij niet | "Start hier" toont één taak; nooit een lijst als beginpunt |
| T5 | Ideeën **parkeer** je zonder de taak te verlaten | Inbox-bestand in het persoonlijke brein; een avondroutine deelt in |
| T6 | Een gevonden belofte is een **voorstel**, geen stille toevoeging | Kaart met één klik; een fout item in de lijst kost meer vertrouwen dan de klik |
| T7 | **Lezen mag zonder klik, versturen vraagt altijd** | Mail en Slack-berichten zijn concepten tot jij ze goedkeurt |
| T8 | Outlook, agenda en Slack lopen via **lokale** koppelingen | Geen OpenWork-cloud (E6): de bestaande lokale MS365-MCP en het Slack-script |
| T9 | Verspreide taken in proza krijgen een **eenmalige opruiming** per brein | De agent stelt de omzetting voor; jij keurt goed vóór delen |
| T10 | Alles wat gebruikers zien zit achter een **feature-flag** | Per fase uit te zetten zonder release |

## 2. Taken

### 2.1 Notatie

```markdown
- [ ] Offerte sturen @sam 📅 2026-11-20
- [ ] Reactie op voorstel (wacht op @robin) ⏳ 2026-11-19
- [x] Planning rondgestuurd @sam
```

- `@naam`: de eigenaar. Eén vaste naam per teamlid, gekoppeld aan de git-auteursnaam waarmee de app je in
  een brein al herkent (`ownAuthor` in `features/home/model.ts`).
- `📅 datum`: deadline of belofte van de eigenaar. `⏳ datum`: belofte **aan** jou (wachten op iemand).
- Geen eigenaar: backlog (T3). Geen datum: telt mee in de keuze, niet in "Komt eraan".
- De notatie moet door de OKF- en geheimencontrole van het brein komen; dat toetsen we in fase 1.

### 2.2 Index op de server

Een nieuw pakket naast `bonzaiwork-brains`, `-routines` en `-agenda`, aangesloten via
`bonzaiwork-server-hooks`:

- `GET /bonzaiwork/todos`: alle open taken over alle breinen, met brein, bestand, regel, eigenaar, datum.
  Puur parsen, geen model: direct en gratis.
- `POST /bonzaiwork/todos` en afvinken: schrijven in hetzelfde bestand, via de bestaande breinsync
  (vastleggen, delen, conflict met "Bewaar mijn versie apart").
- Twee tools op de lokale MCP-server `breinen` (`taak_toevoegen`, `taak_afvinken`), zodat agent en scherm
  dezelfde bestanden schrijven.
- `attention.list()` krijgt de nieuwe soorten (§4), zodat Vandaag bij één poll blijft.

### 2.3 Opruiming (T9)

Eenmalig per brein: de agent zoekt taakachtige zinnen in proza, zet ze om naar §2.1 met eigenaar en datum,
en toont de wijziging. Bij een project-brein wordt het resultaat gedeeld met het team, dus daar keur je
altijd eerst goed. Daarna kan `okf-lint` taakachtig proza signaleren.

## 3. Koppelingen

| Bron | Koppeling | Lezen | Schrijven |
|---|---|---|---|
| Outlook-mail en -agenda | de bestaande lokale MS365-MCP, op app-niveau geregistreerd | zonder klik voor de routine van de persoonlijke agent | altijd een toestemmingskaart |
| Slack | het bestaande shellscript (JSON-uitvoer, kan posten), ingepakt als MCP-tools of skill | leescommando's vooraf goedgekeurd | posten vraagt altijd |
| Breinen | MCP-server `breinen` | bestaand | bestaand, plus de taaktools |

Het script inpakken is nodig omdat een kale shell-aanroep elke keer een toestemmingskaart geeft.

## 4. Vandaag

Nieuwe volgorde; secties zonder inhoud worden niet getoond (bestaande regel):

1. **Composer**, met **Parkeren** naast versturen (T5): tekst gaat naar `inbox.md` in het persoonlijke
   brein, toast "Geparkeerd", je blijft waar je was.
2. **Start hier** (nieuw, het focale element): één taak, één regel waarom (deadline, iemand wacht, afspraak
   vandaag), de eerste stap van vijf minuten. Acties: **Start** (opent een chat waarin de agent al begonnen
   is en meldt aanwezigheid voor dat project), **Niet nu** (de volgende; na drie keer stopt het wisselen),
   **Klaar**.
3. **Voor jou** (bestaand, maximaal 5 kaarten), aangevuld met:
   - mail of Slack-draad: waarom het jou nodig heeft, plus een conceptantwoord · Versturen · Bewerken ·
     Later · Niet voor mij;
   - afspraak: voorbereiding staat klaar, de kaart verschijnt 30 minuten vooraf;
   - gevonden belofte: "Belofte gevonden: … · Toevoegen · Negeren" (T6);
   - taak van een teamgenoot aan jou.
4. **Komt eraan** (nieuw): deadlines, afspraken en beloftes voor zeven dagen, gegroepeerd *vandaag · deze
   week · later*; te laat in amber. Bij een verlopen `⏳` kan de agent een herinnering opstellen.
5. **Bezig**, **Terwijl je weg was**, **Je werkdag**, **Projecten**: ongewijzigd. Tijdens een focussessie
   blijft bovenaan één regel staan: "Je was bezig met …".

Nieuwe soorten in `AttentionItem`, elk met bron en bron-id zodat een item maar één keer verschijnt (het
patroon van upstreams `packages/automations/src/proactive.ts`): `todo`, `message` (mail of Slack),
`meeting`, `commitment`.

## 5. De persoonlijke agent

Routines in het persoonlijke project, met de breinen die ze zonder klik mogen lezen:

| Routine | Wanneer | Doet |
|---|---|---|
| Ochtend | begin werkdag | leest taken, agenda, mail, Slack; kiest de top 3; stelt een dagplan voor in de gaten van de agenda; schrijft conceptantwoorden en voorbereidingen |
| Tussendoor | om de paar uur | nieuwe mail en Slack, nieuwe beloftes, verlopen `⏳` |
| Avond | einde werkdag | deelt `inbox.md` in bij het juiste brein; wekelijks: "nog relevant?" voor oude taken |

De routine schrijft een gestructureerd dagbestand in het persoonlijke brein; Vandaag toont alleen dat
bestand en de index. De keuze voor "Start hier" is zo veel mogelijk een vaste rangorde (te laat → vandaag
→ iemand wacht → afspraak vandaag → oudste), de agent schrijft alleen de reden en de eerste stap.

Beperking: routines draaien alleen als de app open is. Een gemiste ochtendronde verschijnt als de
bestaande kaart "Nu uitvoeren".

## 6. Fasen

| Fase | Inhoud | Koppelingen |
|---|---|---|
| 1 | Notatie, index, taaktools, opruiming, **Start hier**, **Parkeren**, **Komt eraan** voor taken | geen |
| 2 | Agenda: afspraken in Komt eraan, dagplan, voorbereiding | MS365-MCP (agenda) |
| 3 | Mail: kaarten met concept, gevonden beloftes | MS365-MCP (mail) |
| 4 | Slack: idem | Slack-script, ingepakt |

Fase 1 toetst al of het hulpmiddel helpt bij beginnen, zonder externe koppeling.

## 7. Open punten

- Koppeling `@naam` ↔ git-auteursnaam: waar leggen we de vaste namen per team vast?
- Doorstaat de notatie (emoji, `@`) de OKF-controle, of krijgen taken een eigen bestand per brein?
- Kan de MS365-MCP lees- en schrijftools apart aanbieden, zodat T7 per tool af te dwingen is?
- Kosten: hoeveel tokens kost een tussendoor-ronde op een drukke dag, en met welk voorkeursmodel?
- Twee mensen vinken dezelfde regel af: volstaat de bestaande conflictafhandeling?
