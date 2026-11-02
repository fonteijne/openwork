# Agenda-manager: haalbaarheidsonderzoek

Status: onderzoek, nog niets gebouwd. Datum: 2026-11-02.

## Wat we willen

Een agenda-agent die over alle projecten heen bijhoudt waar je op een dag in BonzaiWork aan werkt:

- altijd bereikbaar in een zijpaneel of overlay, maar nooit in de weg;
- een eigen LiteLLM-key, los van de projectkeys;
- je kunt ermee chatten en zelf invoeren waar je mee bezig bent;
- elk kwartier kijkt hij automatisch wat er het afgelopen kwartier gebeurde;
- dat gebeurt op de achtergrond: een lopende chat in een project merkt er niets van;
- aan het eind van de dag ligt er een log van wat je van wanneer tot wanneer deed, als basis voor boeken
  in Bridge. Het boeken zelf valt nu buiten scope.

## Conclusie

**Haalbaar, met wat er al is.** De BonzaiWork-laag heeft alle aanhaakpunten die de agenda nodig heeft. Er
hoeft geen upstream-bestand bij in `PATCHES.md`: alles past in onze eigen paden (`packages/bonzaiwork-*`,
`apps/bonzaiwork`).

| Eis | Bestaand bouwblok | Wat erbij moet |
|---|---|---|
| Zien wat er in andere sessies gebeurt | `DownstreamServerHost.onSessionActivity` volgt het begin en einde van elke beurt in elk lokaal project (`session.execution.*`); `runningSessions()` zegt welke chats nu lopen; `sessionInfo()` geeft de titel | Een tracker die deze gebeurtenissen met tijdstip opslaat |
| Inhoud van het afgelopen kwartier lezen | `host.engineRequest(workspaceId, "GET", "/api/session/:id/message")`, dezelfde route als de app | Een beperkte uitsnede (titels, laatste vragen van de gebruiker) voor de samenvatting |
| Elk kwartier, op de achtergrond | De routineplanner (`packages/bonzaiwork-routines`) draait al als timer in het serverproces, los van de UI | Een eigen timer; routineschema's kunnen niet korter dan per uur (`everyHours`, min. 1) |
| Eigen key | `KeyScope` en de sleutelbos via Electron `safeStorage` (`packages/bonzaiwork-litellm/src/keys.ts`, `apps/bonzaiwork/desktop-main/safe-storage-key-store.ts`) | Een derde scope `{ kind: "agenda" }` en een route `PUT /bonzaiwork/keys/agenda` |
| Zijpaneel of overlay | `AppShell` (`apps/bonzaiwork/src/features/shell/app-shell.tsx`) en de UI-store met paneelvoorkeuren per apparaat | Een globaal, niet-modaal paneel (zie §4) |
| Nieuwe API-routes | Downstream-routes, gebundeld in `packages/bonzaiwork-server-hooks` | Een vijfde hooks-pakket `@bonzaiwork/agenda` naast LiteLLM, breinen, routines en feedback |

## 1. Architectuur in het kort

```
 elk project (engine v2)             serverproces (OPENWORK_SERVER_HOOKS)               app (apps/bonzaiwork)
 ───────────────────────            ─────────────────────────────────────              ─────────────────────
 session.execution.* ──events──▶  @bonzaiwork/agenda                                   Agendapaneel
                                    ├─ tracker      (deterministisch, geen AI)  ◀─GET──  ├─ "Nu": project · sinds
 /api/session/:id/message ◀─read─   ├─ kwartiercheck (timer, :00 :15 :30 :45)          ├─ tijdlijn van vandaag
                                    ├─ agenda-chat   (LiteLLM, eigen key)      ◀─POST─  ├─ chat met de agenda
                                    └─ opslag ~/.bonzaiwork/agenda/YYYY-MM-DD.json      └─ zelf invoeren
                                                    │                         ◀─POST─  aanwezigheid (focus, idle)
                                                    ▼
                                         LiteLLM (agenda-key), rechtstreeks
```

Het nieuwe pakket heet `packages/bonzaiwork-agenda` en wordt in
`packages/bonzaiwork-server-hooks/src/server-hooks.ts` naast de routines gestart, op dezelfde manier
(`start(host)` met eigen `catch`, zodat een fout in de agenda nooit de modellen of routines raakt).

### 1.1 Tracker: wat er gebeurde, zonder AI

De tracker is de bron van waarheid voor tijden. Hij gebruikt geen model, dus hij kost niets en is altijd
juist over het wat en wanneer.

- **Beurten**: `host.onSessionActivity` geeft `running` en `idle` per chat en project. De tracker zet daar
  het tijdstip van ontvangst bij en houdt per project segmenten bij (`start`, `einde`, chat-id, chattitel).
- **Aanwezigheid**: beurten alleen missen de tijd waarin je leest, nadenkt of typt. De app stuurt daarom
  elke minuut een klein signaal: welk project en welke chat open staan, of het venster focus heeft, en hoe
  lang het systeem al idle is (`powerMonitor.getSystemIdleTime()` in `apps/bonzaiwork/desktop-main`).
  Daaruit volgt "je stond van 10:05 tot 10:40 in project A, ook zonder beurt".
- **Weg**: na een instelbare idle-drempel (bijv. 5 minuten) sluit de tracker het lopende segment.
- **Nog actief?** Bij het opstarten en elk kwartier vraagt de tracker `host.runningSessions()` per project,
  zodat een gemist einde-event (engine herstart) geen segment voor altijd open laat. De routineplanner doet
  hetzelfde in `pruneLive()`.

### 1.2 Kwartiercheck: wat het betekende

Om :00, :15, :30 en :45 (lokale tijd):

1. De tracker levert de segmenten en aanwezigheid van het afgelopen kwartier.
2. Per project met activiteit haalt de check een beperkte uitsnede op via `host.engineRequest`: chattitel
   en de laatste paar gebruikersberichten van dat kwartier, afgekapt.
3. Eén model-aanroep met de agenda-key maakt per project één regel ("Offerte-template aangepast en
   prijstabel nagerekend").
4. Het resultaat wordt een kwartierregel in het daglog. Lukt de aanroep niet (geen key, budget op,
   LiteLLM onbereikbaar), dan blijft de regel staan met alleen de deterministische gegevens ("Project A,
   chat 'Offerte Q4'") en een markering "nog samen te vatten". Het volgende kwartier probeert hij het opnieuw.
5. Geen activiteit en geen aanwezigheid: geen aanroep, geen kosten.

Een kwartier dat viel terwijl de app dicht was, wordt niet ingehaald; het blijft leeg (zoals bij
routines, R1). Zelf invullen kan wel.

### 1.3 Waarom de check niet via de engine loopt

Routines starten een gewone chat in een project (contract §7.4); die verschijnt in de chatlijst. Voor de
agenda zou dat elk kwartier een chat opleveren, met toestemmingsvragen en een plek in de wachtrij van de
engine. Daarom praat de agenda **rechtstreeks met LiteLLM**, net als de bestaande proxy
(`packages/bonzaiwork-litellm/src/proxy.ts`) maar met de agenda-key:

- geen sessie in je project, dus niets in je chatlijst en geen kaart boven je composer;
- geen beurt in de engine, dus je eigen chat wacht nergens op;
- geen bestands- of shell-tools, dus ook geen toestemmingen nodig.

De agenda-chat werkt op dezelfde manier: een eigen route met een klein, vast setje tools die het
hooks-pakket zelf uitvoert (`daglog_lezen`, `invoer_toevoegen`, `invoer_wijzigen`, `dag_samenvatten`).

Alternatief, als we later wél engine-tools (skills, MCP, breinen) in de agenda-chat willen: een verborgen
agenda-workspace in `~/.bonzaiwork/agenda`. Die krijgt via `keyMode=workspace` vanzelf zijn eigen key, maar
moet dan overal uit de projectlijst gefilterd worden. Voor de eerste versie is dat niet nodig.

### 1.4 Eigen key

`KeyScope` krijgt een derde vorm, `{ kind: "agenda" }` (opgeslagen als `agenda` in dezelfde versleutelde
sleutelbos). Routes `PUT` en `DELETE /bonzaiwork/keys/agenda` met het host-token, zoals de bestaande
`/bonzaiwork/keys/user`. De app-instellingen krijgen een sectie "Agenda" met de key en het model.
Zonder key werkt de tracker gewoon door; alleen de samenvattingen en de chat staan op slot (DESIGN.md P4,
C5: "Koppel een key voor de agenda").

Een aparte virtual key in LiteLLM geeft ook een eigen budget en eigen verbruikscijfers, los van de projecten.

## 2. Gegevens

Eén bestand per dag in `~/.bonzaiwork/agenda/` (`BONZAIWORK_STATE_DIR`, net als `routines.json`), mode
`0600`, atomisch geschreven.

```ts
type AgendaDay = {
  version: 1;
  date: string;                       // "2026-11-02", lokale datum
  segments: Array<{                   // tracker, ruwe tijden
    id: string;
    workspaceId: string;
    sessionId: string | null;         // null = project open zonder chat
    kind: "turn" | "presence";
    start: number;                    // ms
    end: number | null;               // null = loopt nog
  }>;
  quarters: Array<{                   // kwartiercheck
    start: number;                    // 10:15
    projects: Array<{ workspaceId: string; minutes: number; summary: string | null }>;
    status: "summarized" | "pending" | "empty" | "app_closed";
  }>;
  entries: Array<{                    // door jou ingevoerd of gecorrigeerd
    id: string;
    start: number;
    end: number;
    workspaceId: string | null;       // null = werk buiten een project (overleg, telefoon)
    label: string;
    note: string | null;
    source: "user" | "agent";
  }>;
  chat: Array<{ role: "user" | "assistant"; text: string; at: number }>;
};
```

Het **dagoverzicht** is een afgeleide: aaneengesloten kwartieren per project worden blokken
("09:00–10:45 · Project A · 1u45"), jouw eigen invoer gaat altijd voor, en je kunt elk blok aanpassen of
splitsen. Dat overzicht is later de invoer voor Bridge.

### Routes

| Route | Doel |
|---|---|
| `GET /bonzaiwork/agenda/day?date=` | Daglog en het afgeleide dagoverzicht |
| `POST /bonzaiwork/agenda/entries` | Zelf invoeren ("van 13:00 tot 14:00 overleg met team") |
| `PATCH /bonzaiwork/agenda/entries/:id` | Blok of invoer wijzigen |
| `DELETE /bonzaiwork/agenda/entries/:id` | Invoer verwijderen (met ongedaan maken, P8) |
| `POST /bonzaiwork/agenda/presence` | Aanwezigheidssignaal van de app (elke minuut) |
| `POST /bonzaiwork/agenda/chat` | Bericht aan de agenda; antwoord als stream |
| `POST /bonzaiwork/agenda/check` | Nu een check doen (handmatig, voor tests) |
| `GET /bonzaiwork/agenda/export?date=&format=md\|csv` | Dagoverzicht exporteren |
| `PUT`/`DELETE /bonzaiwork/keys/agenda` | Agenda-key koppelen of loskoppelen |

Schrijven vraagt het host-token en niets verandert op een alleen-lezen apparaat, zoals bij routines.

## 3. Niet uit je flow halen

Dit is de belangrijkste eis. Hoe het ontwerp dat waarborgt:

| Risico | Maatregel |
|---|---|
| Een check opent een chat of kaart in je project | De check loopt niet via de engine (§1.3); hij maakt geen sessie en stelt geen vraag |
| Een check vertraagt je lopende beurt | Eigen LiteLLM-aanroep buiten de engine; hooguit één kleine aanroep per kwartier |
| Focus springt weg | Het paneel is niet-modaal (zie §4); geen toast, geen geluid, geen melding van het besturingssysteem |
| De UI hapert tijdens een check | De check draait in het serverproces; het paneel haalt het daglog op met TanStack Query zodra het open is, en anders niet |
| De agenda vraagt iets terug | Nooit uit zichzelf. Twijfel (bijv. "twee projecten tegelijk actief") zet hij als markering in het dagoverzicht, die je oppakt wanneer je wilt |
| Het aanwezigheidssignaal kost tijd | Eén klein `POST` per minuut, via `requestIdleCallback` (`apps/bonzaiwork/src/lib/idle.ts`) |

Het enige zichtbare teken van een check: in het paneel en in de pil in de bovenbalk verschijnt de nieuwe
kwartierregel. Wie het paneel dicht heeft, ziet niets.

## 4. UI: zijpaneel of overlay

De shell is nu `zijbalk | pagina`, en op projectpagina's staat rechts al de sidecar (projectgebonden).
De agenda is globaal en hoort daarom op shellniveau.

Voorstel, in drie standen:

1. **Pil in de bovenbalk** (altijd): "Project A · sinds 10:15". Klik of `⌘J` opent het paneel. Dit is de
   "altijd beschikbaar, niet in de weg"-stand.
2. **Paneel als overlay** (standaard): schuift rechts over de pagina, **niet-modaal**. De bestaande
   `Sheet` in `components/ui/overlay.tsx` is een modale Base UI-dialoog die de focus pakt; die is hiervoor
   niet geschikt. We hebben een variant nodig zonder focus-trap en zonder achtergrond, zodat je in je
   chat verder typt terwijl het paneel open staat. `Esc` in het paneel sluit het; daarbuiten niet.
3. **Vastgezet** (brede schermen): een eigen kolom rechts, onthouden per apparaat in de UI-store
   (`bonzaiwork.agenda`, zoals `bonzaiwork.sidecar`). Staan sidecar en agenda allebei vast, dan wint de
   laatst geopende en klapt de andere in tot een smalle rand.

Inhoud van het paneel (één focus per scherm, P7: de tijdlijn van vandaag):

- bovenaan "Nu": huidig project en sinds wanneer;
- de tijdlijn van vandaag in blokken, met per blok project, tijd en samenvatting; klik om te bewerken;
- onderaan één invoerveld: chat met de agenda, of gewoon "13:00–14:00 overleg sprint" typen; de agenda
  maakt daar een invoer van;
- knop "Dag afsluiten": toont het dagoverzicht met totalen per project en exporteert als Markdown of CSV.

Teksten Nederlands, volgens DESIGN.md C1–C7; kleuren en vormen uit `apps/bonzaiwork/src/styles.css`.

## 5. Wat (nog) niet kan of lastig is

- **App dicht = geen meting.** De tracker draait in het serverproces van de desktopapp. Werk buiten
  BonzaiWork of met de app dicht zien we niet; dat vul je zelf aan.
- **Parallel werk.** Twee projecten tegelijk met een lopende beurt: de tracker ziet beide. Het dagoverzicht
  rekent dan de tijd toe aan het project dat open stond (aanwezigheid), en markeert het kwartier.
- **Lange beurten.** Een beurt van 20 minuten zonder dat je kijkt telt mee als "bezig". Of dat boekbare tijd
  is, is een keuze (zie open vragen).
- **Kosten.** Hooguit 32 aanroepen op een werkdag van 8 uur, met een kleine invoer. Met een goedkoop model
  verwaarloosbaar; het eigen key-budget in LiteLLM begrenst het hoe dan ook.
- **Privacy.** Uitsneden van chats gaan naar LiteLLM, dezelfde route als de chats zelf. Het daglog blijft
  lokaal en komt niet in een brein of repository, tenzij je dat later wilt.

## 6. Bouwvolgorde

| Fase | Inhoud | Omvang |
|---|---|---|
| 1 | `@bonzaiwork/agenda`: tracker, opslag, `GET day`, zelf invoeren, aanwezigheid; pil + paneel (alleen-lezen tijdlijn en invoer); demo-backend | M |
| 2 | Agenda-key en instellingen; kwartiercheck met samenvatting; markeringen bij twijfel | M |
| 3 | Agenda-chat met de vaste tools; dagoverzicht met bewerken en export | M |
| 4 (later) | Projectkoppeling naar Bridge (projectcode/activiteit per project) en boeken | buiten scope |

Fase 1 is zonder AI al bruikbaar: aan het eind van de dag zie je per project van wanneer tot wanneer je
bezig was.

Tests zoals bij routines: `bun test` in het pakket met een nep-host (gesimuleerde activiteit, klok,
`engineRequest`), en specs voor het paneel via de demo-backend in headless Chrome (AGENTS.md
"Verify changes headless").

## 7. Open vragen

| # | Vraag | Gevolg |
|---|---|---|
| A1 | In welke eenheid boeken we in Bridge (kwartier, half uur, minuut)? | Afronding in het dagoverzicht |
| A2 | Telt een lopende beurt zonder dat je kijkt als gewerkte tijd? | Regels in de tracker (aanwezigheid vereist of niet) |
| A3 | Na hoeveel minuten idle ben je "weg"? | Standaarddrempel, instelbaar |
| A4 | Leggen we nu al per project een Bridge-code vast (in de projectmetadata)? | Maakt fase 4 later eenvoudiger |
| A5 | Hoe lang bewaren we daglogs? | Opruimen na N dagen, of nooit |
| A6 | Een aparte LiteLLM-key per gebruiker voor de agenda, door wie aangemaakt? | Onboarding en instellingen |
| A7 | Moet de agenda-chat ook breinen of skills kunnen gebruiken? | Dan de verborgen agenda-workspace (§1.3) in plaats van rechtstreeks LiteLLM |
