# BonzaiWork: frontend-contract

> **Voor wie.** Designers die de BonzaiWork-schermen ontwerpen, en de developers die ze bouwen.
> **Wat.** Per scherm en per functie: wat de backend (de lokale OpenWork-server en de engine) nu al kan, hoe de UI
> het aanroept en wat we zelf nog moeten bouwen.
> **Stand.** Upstream `dev` op `2aa4481` (`v0.18.63` + t/m #6620), OpenCode v2 (v1 draait mee, onze UI gebruikt hem niet). Gecontroleerd tegen de code op 28-10-2026.
> Achtergrond: [`referentie.md`](./referentie.md) (opdracht) en [`README.md`](./README.md) (wat de spike opleverde).

## Statuslegenda

| Label | Betekenis voor de designer |
|---|---|
| ✅ **Kan nu** | De backend levert dit al. Ontwerpen en bouwen kan direct. |
| 🟡 **Kan nu, met kanttekening** | Werkt, maar met een beperking die je in het ontwerp moet meenemen (staat erbij). |
| 🔨 **Bouwen** | Bestaat niet in OpenWork. Wij bouwen het in BonzaiWork (eigen routes of eigen opslag). Ontwerp het gerust; de datavelden staan in [§7](#7-nieuwe-bonzaiwork-api). |
| ⛔ **Buiten scope** | Niet ontwerpen voor deze ronde. |

---

## 1. In één oogopslag

| Gebied | Status | Kort |
|---|---|---|
| Projecten aanmaken, hernoemen, verwijderen, lijst | ✅ | Een project is een OpenWork-**workspace** (een map). |
| Projectbeschrijving, kleur/icoon, pinnen, archiveren | 🔨 | Eigen metadata-opslag naast de workspace. |
| Key per project (LiteLLM virtual key) | ✅ | Bestaat al in de spike (`keyMode=workspace`). Koppelen, vervangen, ontkoppelen. |
| Standaardmodel per project | ✅ | `default-model` per workspace. |
| Kosten/verbruik per project | 🔨 | Tokens per bericht zijn er; echte kosten halen we uit LiteLLM per key. |
| Projectinstructies | 🟡 | Kan via een `AGENTS.md` in de projectmap; een eigen veld is 🔨. |
| Skills, commando's, connecties (MCP) per project | ✅ | Per workspace te lezen en te beheren. |
| Bestanden in het project | ✅ | Lijst, lezen, schrijven, uploaden. |
| Chats per project: lijst, starten, hernoemen, verwijderen | ✅ | |
| Chats groeperen binnen een project | ✅ | "Session groups" bestaan al. |
| Chats archiveren, pinnen, zoeken in inhoud | 🔨 | Archiveren kan niet in de v2-engine; zoeken op titel kan client-side. |
| Chat: streamen, stoppen, vervolgvragen, toestemmingen, bijlagen, forken, terugdraaien | ✅ | |
| Chat: takenlijst (todo's) van de agent | ⛔ | Niet beschikbaar in de v2-engine. Niet ontwerpen. |
| Sidecar met chat-informatie | 🟡 | Meeste velden zijn er (model, tokens, tijden, bestanden, status); totalen rekenen we zelf uit. |
| Routines (geplande taken) | 🔨 | OpenWork plant via Den (`/ee`), dat mogen we niet gebruiken. Eigen planner in de app. |
| Feedback sturen (fout of idee → GitHub-formulier) | ✅ | Gebouwd voor #9; zie [`feedback.md`](./feedback.md) en [§7.5](#75-feedback). |
| Instellingenpagina (app + project) | ✅ / 🔨 | Wat er per instelling kan, staat in [§5.5](#55-projectinstellingen) en [§5.7](#57-app-instellingen). |
| Voice recording / meetings | ⛔ | Bewust buiten scope (werkstroom D komt later). |
| Providers kiezen, inloggen bij OpenWork Cloud, marketplace | ⛔ | Nooit (LiteLLM is de enige provider, E4; geen Den, E7). |

---

## 2. Begrippen

| BonzaiWork (UI) | OpenWork (backend) | Toelichting |
|---|---|---|
| **Project** | Workspace (`workspaceType: "local"`) | Eén map op schijf. Alle chats, skills, connecties en bestanden van het project horen bij die map. |
| **Chat** | Session (engine) | Een gesprek met de agent. Hoort via zijn "home" bij precies één workspace. |
| **Groep** (binnen een project) | Session group | Optionele indeling van chats in een project, bijv. "Offertes", "Research". |
| **Key** | LiteLLM virtual key | Per project (of per gebruiker, zie O1). Staat in de OS-keychain, nooit zichtbaar in de UI; alleen een hint ("…a1b2"). |
| **Model** | Model van provider `litellm` | De lijst komt uit LiteLLM met de key van het project. |
| **Routine** | (Automation, maar dan lokaal) | Een prompt die op een schema in een project draait en een nieuwe chat oplevert. |
| **Skill** | Skill (`.opencode/skills/<naam>/SKILL.md`) | Herbruikbare instructie die de agent kan oppakken. |
| **Connectie** | MCP-server | Externe tool of databron voor de agent. |
| **Commando** | Command | Snelkoppeling in de composer (`/naam`). |

### Waarom project = workspace

Een workspace heeft in OpenWork al alles wat een project nodig heeft: een eigen map, eigen chats, eigen skills
en connecties, een standaardmodel en (in BonzaiWork) een eigen key. Wat ontbreekt is **projectmetadata**
(beschrijving, kleur, gepinde en gearchiveerde chats, routines) en **overzichtsdata** (aantallen, verbruik).
Die bouwen we als een dunne BonzaiWork-laag eromheen, zonder upstream-bestanden aan te passen.

"Project first" betekent in de UI: de gebruiker maakt eerst een project aan, en elke chat start **binnen** een
project. Er bestaan geen losse chats. De server maakt de map zelf aan als die nog niet bestaat, dus een project
kan ook zonder mapkiezer worden aangemaakt (bijv. standaard onder `~/BonzaiWork/<projectnaam>`, zie P2).

---

## 3. Hoe de UI de backend aanspreekt

```
BonzaiWork UI (React, in Electron)
  │  Bearer <client-token>             │  X-OpenWork-Host-Token <host-token>
  ▼                                    ▼
Lokale OpenWork-server (http://127.0.0.1:<poort>)
  ├─ /workspaces, /workspace/:id/...      projecten, skills, MCP, bestanden, groepen, model
  ├─ /workspace/:id/opencode2/api/...     de engine (OpenCode v2): chats, berichten, live events
  └─ /bonzaiwork/...                      onze eigen routes: keys, modellen, status (+ alles uit §7)
        └─ LiteLLM (enige provider, key wordt per project toegevoegd door de server)
```

| Laag | Basis-URL | Client in code |
|---|---|---|
| OpenWork-server | `<baseUrl>` | `createOpenworkServerClient` (`apps/app/src/app/lib/openwork-server.ts`) |
| Engine per project | `<baseUrl>/workspace/<workspaceId>/opencode2` | `createClientV2` (`apps/app/src/app/lib/opencode-v2-adapter.ts`). Gebruik **altijd** `/opencode2`: `/opencode` is de v1-engine, die LiteLLM-only niet afdwingt. |
| BonzaiWork | `<baseUrl>/bonzaiwork` | `bonzaiworkApi` (`apps/bonzaiwork/src/lib/bonzaiwork-api.ts`) |

**Twee soorten rechten.** Gewone acties gebruiken het client-token. Beheeracties (project aanmaken, hernoemen,
verwijderen; keys koppelen) vragen het **host-token**. In de desktop-app heeft de UI beide; voor het ontwerp
betekent dit alleen dat die acties bij een alleen-lezen-installatie uitgegrijsd kunnen zijn (`read_only`).

**Live bijwerken.** De engine levert een live eventstream (`GET /workspace/:id/opencode2/api/event`, SSE) voor streaming
tekst, toolactiviteit, toestemmingsvragen en status. De huidige spike pollt nog; de nieuwe UI gebruikt de stream.
Projectwijzigingen (groepen) hebben een eigen eventlijst (`/workspace/:id/session-groups/events`).

---

## 4. Navigatie (sitemap)

```
Onboarding (eerste start: key koppelen)
└─ App-shell
   ├─ Projectoverzicht                         §5.2
   │   └─ Nieuw project (dialoog)              §5.3
   ├─ Project
   │   ├─ Projectdetail: chatlijst + chat + sidecar   §5.4
   │   ├─ Routines van dit project             §5.6
   │   └─ Projectinstellingen                  §5.5
   ├─ Routines (alle projecten)                §5.6
   └─ App-instellingen                         §5.7
```

---

## 5. Schermen

Per scherm: doel, de data die je kunt tonen, en de acties met status en backend-aanroep.

### 5.1 Onboarding

Doel: eerste start. De LiteLLM-URL zit in de build (O3), dus de gebruiker plakt alleen een key.

| Functie | Status | Backend |
|---|---|---|
| Key plakken en controleren (fout bij ongeldige key) | ✅ | `PUT /bonzaiwork/keys/user` (host). Foutcodes: `key_rejected`, `litellm_unreachable`, `invalid_key`. |
| Melding "keys worden alleen in het geheugen bewaard" (Linux zonder keychain) | ✅ | `GET /bonzaiwork/status` → `keyStorePersistent: false` |
| Bij `keyMode=workspace`: geen app-key; de key hoort bij het eerste project | ✅ | Onboarding gaat dan direct naar "Nieuw project" (§5.3). |

### 5.2 Projectoverzicht

Doel: alle projecten in één oogopslag, en het startpunt voor "nieuw project".

**Velden per projectkaart/-rij**

| Veld | Status | Bron |
|---|---|---|
| Naam | ✅ | `GET /workspaces` → `displayName \|\| name` |
| Map (pad) | ✅ | `path` |
| Key gekoppeld ja/nee + hint | ✅ | `GET /bonzaiwork/status` → `workspaces[{ id, hasKey, keyHint }]` |
| Standaardmodel | ✅ | `GET /workspace/:id/default-model` |
| Aantal chats, laatste activiteit | 🟡 | Per project de chatlijst ophalen (`GET /workspace/:id/opencode2/api/session`). Bij veel projecten traag: aggregatie in §7.2 (🔨). |
| "Er draait nu iets" (agent bezig) | ✅ | `GET /workspace/:id/opencode2/api/session/active` |
| Beschrijving, kleur/icoon | 🔨 | §7.1 projectmetadata |
| Pinnen / archiveren van een project | 🔨 | §7.1 |
| Verbruik deze maand (kosten) | 🔨 | §7.3, uit LiteLLM per key |
| Volgende routine | 🔨 | §7.4 |

**Acties**

| Actie | Status | Backend |
|---|---|---|
| Project openen | ✅ | – (navigatie) |
| Nieuw project | ✅ | §5.3 |
| Hernoemen | ✅ | `PATCH /workspaces/:id/display-name` (host) |
| Verwijderen | 🟡 | `DELETE /workspaces/:id` (host). **Haalt het project alleen uit BonzaiWork; de map en bestanden blijven staan.** Zeg dat in de bevestiging. |
| Sorteren/filteren op naam | ✅ | client-side |
| Sorteren op laatste activiteit | 🟡 | zie "aantal chats" hierboven |

### 5.3 Nieuw project (dialoog)

| Veld/actie | Status | Backend |
|---|---|---|
| Naam | ✅ | `POST /workspaces/local` (host) `{ folderPath, name, preset: "starter" }` |
| Map kiezen (bestaande map) | ✅ | desktop-mapkiezer (`pickDirectory`) |
| Geen map kiezen: automatisch onder een standaardmap | ✅ | De server maakt de map aan. Standaardlocatie is een productkeuze (P2). |
| Key koppelen (bij `keyMode=workspace`) | ✅ | `PUT /bonzaiwork/keys/workspace/:id` (host) |
| Standaardmodel kiezen | ✅ | `PUT /workspace/:id/default-model` |
| Beschrijving, kleur/icoon | 🔨 | §7.1 |
| Projectinstructies | 🟡 | `AGENTS.md` in de map schrijven via `POST /workspace/:id/files/content`. Zie §5.5. |
| Sjablonen ("start met een project voor X") | 🔨 | Kan later: een sjabloon is een set skills + instructies + routines die we na het aanmaken wegschrijven. |

### 5.4 Projectdetail (chatlijst + chat + sidecar)

Indeling: links de chats van dit project, midden de geopende chat, rechts een **sidecar** met informatie over de
chat (en, zonder geopende chat, over het project).

#### a. Chatlijst (links)

| Functie | Status | Backend |
|---|---|---|
| Alle chats van het project, nieuwste eerst, met paginering | ✅ | `GET /workspace/:id/opencode2/api/session?limit=&cursor=` → `nextCursor` |
| Per chat: titel, aangemaakt, laatst bijgewerkt, model | ✅ | velden `title`, `time.created`, `time.updated`, `model` |
| Titel wordt automatisch gezet | ✅ | De engine geeft een titel; tot dan is er een tijdelijke titel. |
| Indicator "bezig" | ✅ | `api/session/active` of de eventstream |
| Indicator "wacht op jou" (toestemming of vraag open) | ✅ | permission- en question-lijsten van de engine (zie b) |
| Subtaken van de agent (subagents) verbergen of inklappen | ✅ | chats met `parentID` zijn subtaken van een andere chat |
| Nieuwe chat | ✅ | `POST api/session` met `{ directory, model }` |
| Hernoemen | ✅ | `PATCH api/session/:sessionId` `{ title }` |
| Verwijderen | ✅ | `DELETE api/session/:sessionId` (definitief) |
| Groeperen in groepen (maken, hernoemen, volgorde, chat verplaatsen, verwijderen) | ✅ | `/workspace/:id/session-groups` (GET/POST/PUT, PATCH `reorder`, `assignments/:sessionId`, `:groupId`, DELETE) |
| Zoeken op titel | ✅ | client-side |
| Zoeken in de inhoud van chats | 🔨 | Geen zoek-endpoint. §7.2. |
| Archiveren | 🔨 | **De v2-engine kan niet archiveren** (`V2_SESSION_ARCHIVE_UNAVAILABLE`). Wij houden een eigen archieflijst bij (§7.1). |
| Pinnen | 🔨 | §7.1 |
| Chats uit Claude Code importeren | ✅ | `/workspace/:id/claude-import/code` (lijst + import). Optioneel, laag in prioriteit. |

#### b. Chat (midden)

| Functie | Status | Backend |
|---|---|---|
| Bericht sturen | ✅ | `POST api/session/:id/...` via `session.promptAsync` |
| Antwoord live laten verschijnen (streaming) | ✅ | eventstream `api/event` |
| Stoppen | ✅ | `session.abort` |
| Model kiezen per chat | ✅ | model per bericht of `session.setModel`; lijst uit `GET /bonzaiwork/status` → `models` |
| Toolactiviteit tonen ("Las 3 bestanden", "Zocht op het web") | ✅ | message parts van het type tool (DESIGN.md C4, T1) |
| Toestemming vragen voor een actie (toestaan / altijd / weigeren) | ✅ | engine `permission.list` / `permission.reply` (DESIGN.md T4) |
| Vraag van de agent beantwoorden (keuzes) | ✅ | engine `question.list` / `question.reply` |
| Bijlagen meesturen (bestanden) | ✅ | file parts in de prompt; uploaden naar de projectmap via `POST /workspace/:id/inbox` |
| Skill of commando kiezen in de composer (`/`) | ✅ | engine `api/command`, `api/skill`; skill-bijlagen bij een bericht |
| Agent kiezen (bijv. "plan" of "build") | ✅ | engine `api/agent` |
| Doorgaan vanaf een eerder bericht (forken) | ✅ | `POST api/session/:id/fork` `{ before }` |
| Terugdraaien tot een bericht (incl. bestanden) en weer herstellen | ✅ | `revert/stage` en `DELETE revert` |
| Fouten van LiteLLM leesbaar tonen | ✅ | foutcodes; nooit ruwe providertekst (DESIGN.md C6, T2) |
| Takenlijst van de agent (todo's) | ⛔ | v2 geeft altijd een lege lijst. Niet ontwerpen. |
| Samenvatten/compacteren op verzoek, shell-commando vanuit de chat | ⛔ | Niet in v2. |
| Run-modus (hoeveel toestemming de agent krijgt) | ✅ | `GET/PUT /workspace/:id/permissions/mode` (per project, zie §5.5) |
| Chat delen met iemand anders | ⛔ | Hangt aan OpenWork Cloud. |
| Inspreken (dictaat) | ⛔ | Valt onder voice, buiten scope. |

#### c. Sidecar (rechts)

| Veld | Status | Bron |
|---|---|---|
| Model van de chat | ✅ | `session.model` / per bericht `resolvedModel` |
| Aangemaakt, laatst actief | ✅ | `time.created`, `time.updated` |
| Status (bezig, wacht op jou, klaar, mislukt) | ✅ | eventstream, `session/active`, laatste bericht met `error` |
| Tokens (input, output, reasoning, cache) per bericht en opgeteld | 🟡 | per assistant-bericht `tokens`; **optellen doet de UI** (of §7.2) |
| Kosten van de chat | 🔨 | `cost` per bericht is voor onze LiteLLM-provider onbetrouwbaar (vaak 0). Echte kosten uit LiteLLM (§7.3). |
| Bestanden die de agent in deze chat las of wijzigde | 🟡 | af te leiden uit de tool-parts (bestandspaden). Een kant-en-klare "gewijzigde bestanden"-lijst per chat is er niet in v2; afleiden of 🔨. |
| Bestand openen / preview | ✅ | `GET /workspace/:id/files/content`, `.../files/raw`, `.../files/stat` |
| Gemaakte artefacten (outbox) | 🟡 | `GET /workspace/:id/artifacts`, alleen als de outbox aanstaat; niet per chat gefilterd. |
| Gebruikte skills en connecties in deze chat | 🟡 | af te leiden uit de tool-parts |
| Groep van de chat (wijzigen) | ✅ | session-groups `assignments` |
| Subtaken (subagents) van deze chat | ✅ | chats met `parentID` = deze chat |
| Routine die deze chat startte | 🔨 | §7.4 (run → chat-koppeling) |
| Notities of labels bij een chat | 🔨 | §7.1 |
| Zonder geopende chat: projectinfo (key, model, verbruik, volgende routine) | ✅ / 🔨 | zie §5.2 |

### 5.5 Projectinstellingen

Voorstel: één pagina met secties of tabs. Volg DESIGN.md S2 (compacte rijen: label links, huidige stand rechts).

| Sectie / instelling | Status | Backend |
|---|---|---|
| **Algemeen:** naam | ✅ | `PATCH /workspaces/:id/display-name` (host) |
| Algemeen: map tonen / openen in Finder | ✅ | `path`; openen via desktop-IPC |
| Algemeen: beschrijving, kleur/icoon | 🔨 | §7.1 |
| Algemeen: project verwijderen | 🟡 | `DELETE /workspaces/:id`, map blijft staan |
| Algemeen: project exporteren | ✅ | `GET /workspace/:id/export` |
| **Key & modellen:** gekoppelde key (hint), vervangen, ontkoppelen | ✅ | `PUT` / `DELETE /bonzaiwork/keys/workspace/:id` (host). Gebruik het `secret-input`-patroon. |
| Key & modellen: beschikbare modellen voor deze key, verversen | 🟡 | `GET /bonzaiwork/status` → `models`, `POST /bonzaiwork/models/refresh`. **Nu één lijst voor alle keys samen**; per project filteren is 🔨 (§7.1). |
| Key & modellen: standaardmodel | ✅ | `GET/PUT /workspace/:id/default-model` |
| Key & modellen: budget en verbruik van de key | 🔨 | §7.3 (budget beheren blijft in LiteLLM; de app toont het) |
| **Instructies:** vaste instructies voor de agent in dit project | 🟡 | `AGENTS.md` in de projectmap lezen/schrijven (`/workspace/:id/files/content`). **[VERIFIEER]** dat v2 `AGENTS.md` in de workspace-root laadt. Een eigen veld los van de map is 🔨. |
| **Skills:** lijst, openen, aanmaken/bewerken, verwijderen | ✅ | `GET /workspace/:id/skills`, `GET .../skills/:name`, `POST .../skills` (aanmaken/bijwerken), verwijderen |
| **Commando's:** lijst, aanmaken/bewerken, verwijderen | ✅ | `GET /workspace/:id/commands`, upsert, `DELETE .../commands/:name` |
| **Connecties (MCP):** lijst, toevoegen, aan/uit, verwijderen, opnieuw inloggen | ✅ | `GET /workspace/:id/mcp`, `POST .../mcp`, `POST .../mcp/:name/enabled`, `DELETE .../mcp/:name`, `DELETE .../mcp/:name/auth`; status via engine `api/mcp` |
| Connecties: catalogus van kant-en-klare connecties | 🔨 | OpenWork's catalogus komt uit Den/marketplace (⛔). Een eigen, kleine lijst kan. |
| **Toestemmingen:** run-modus | ✅ | `GET/PUT /workspace/:id/permissions/mode` |
| Toestemmingen: extra mappen waar de agent bij mag | ✅ | `GET/PUT /workspace/:id/authorized-folders` |
| **Bestanden:** bestanden in het project, uploaden | ✅ | `/workspace/:id/files/*`, `/workspace/:id/inbox` |
| **Routines** van dit project | 🔨 | §5.6 |
| **Activiteit:** log van configuratiewijzigingen | ✅ | `GET /workspace/:id/audit?limit=` |
| Plugins (OpenCode-plugins) | ✅ | `/workspace/:id/plugins`. Voor eindgebruikers verbergen (technisch). |

### 5.6 Routines

Een routine is: **in project X, op schema Y, stuur prompt Z (met model M) en maak daar een nieuwe chat van.**

**Waarom 🔨.** OpenWork's "Automations" worden gepland, opgeslagen en geclaimd door **Den** (`ee/`). Den gebruiken we
niet (E7). Wat we wel kunnen hergebruiken (MIT, buiten `/ee`):

- de schema-typen en -berekening uit `@openwork/types` (`automationScheduleSchema`, `nextAutomationOccurrence`,
  `previewAutomationSchedule`, `formatAutomationSchedule`): eenmalig, dagelijks, wekelijks, en "elke N uur binnen
  een venster", inclusief tijdzones en zomertijd;
- de levenscyclus en statussen (`active`, `inactive`, `needs_attention`, `archived`; runs `queued` … `succeeded`,
  `failed`, `cancelled`, `skipped`).

De planner zelf, de opslag en het starten van de chat bouwen we in `packages/bonzaiwork-*` (§7.4).

**Belangrijk voor het ontwerp: een routine draait alleen als de app open is.** Er is geen server in de cloud.
Een run die viel terwijl de app dicht was, is **gemist**. Ontwerp daarvoor een duidelijke staat ("Gemist: app
was gesloten") en "Nu uitvoeren". Of gemiste runs bij het openen alsnog draaien, is beslissing R1.

| Functie | Status | Toelichting |
|---|---|---|
| Lijst van routines (per project en over alle projecten) | 🔨 | naam, project, schema in woorden, volgende run, laatste run + uitkomst, aan/uit |
| Routine aanmaken/bewerken: naam, project, prompt, model, schema | 🔨 | schema-editor: eenmalig / dagelijks / wekelijks (dagen) / elke N uur tussen X en Y |
| Voorbeeld van de volgende runs in de editor | 🔨 | met `previewAutomationSchedule` (rekenwerk bestaat al ✅) |
| Schema in gewone taal ("Elke werkdag om 09:00") | 🔨 | met `formatAutomationSchedule` (bestaat al ✅) |
| Aan/uit zetten, archiveren, verwijderen | 🔨 | |
| Nu uitvoeren | 🔨 | |
| Runhistorie met status, duur, link naar de chat | 🔨 | elke run is een gewone chat in het project |
| "Heeft aandacht nodig" (bijv. key ongeldig, model weg) | 🔨 | |
| Melding als een routine klaar of mislukt is | 🔨 | OS-notificatie via Electron |
| Routine voorstellen vanuit een chat ("Doe dit elke maandag") | 🔨 | later; vraagt een tool voor de agent |
| Agenda-triggers (voor/na een meeting) | ⛔ | Bij OpenWork alleen in de cloud, en hangt samen met meetings. |
| Draaien terwijl de app dicht is | ⛔ | Vraagt een server; buiten scope. |

### 5.7 App-instellingen

| Instelling | Status | Backend |
|---|---|---|
| LiteLLM-server (alleen tonen) | ✅ | `GET /bonzaiwork/status` → `litellmBaseUrl` |
| Persoonlijke key (bij `keyMode=user`): hint, vervangen, ontkoppelen | ✅ | `PUT` / `DELETE /bonzaiwork/keys/user` (host) |
| Overzicht van alle projecten met hun key-status | ✅ | `status.workspaces` |
| Waarschuwing "keys niet blijvend opgeslagen" | ✅ | `keyStorePersistent` |
| Globale skills en commando's (voor alle projecten) | ✅ | `includeGlobal` / `scope: "global"` op de skill- en commando-routes |
| Persoonlijke omgevingsvariabelen (bijv. tokens voor connecties) | ✅ | `GET/PUT /env`, `DELETE /env/:key` |
| App-versie, engine-versie | ✅ | `GET /runtime/versions` |
| Updates | 🔨 | Werkstroom C (updater-hook) |
| Taal, thema | 🔨 | client-side |
| Standaardmap voor nieuwe projecten | 🔨 | client-side voorkeur (P2) |

---

## 6. Niet ontwerpen (buiten scope)

| Wat | Waarom |
|---|---|
| Voice recording, meetings, transcriptie, dictaat | Bewust later (werkstroom D). Laat ruimte in de composer, maar geen knop. |
| Providers toevoegen of wisselen, API-keys van OpenAI/Anthropic | LiteLLM is de enige provider (E4). |
| Inloggen bij OpenWork, organisaties, teams, marketplace, cloud-plugins | Den en OpenWork Cloud gebruiken we niet (E6, E7). |
| Chats delen via een link, cloud-computer, remote sessies | Hangt aan OpenWork Cloud. |
| Agent-takenlijst (todo's), compacteren op verzoek, shell vanuit de chat | Niet beschikbaar in OpenCode v2. |
| Workbot, Slack-bot, MCP-gateway | `/ee`. |

---

## 7. Nieuwe BonzaiWork-API

Alles hieronder komt in **onze eigen code**: routes via het bestaande aanhaakpunt `OPENWORK_SERVER_HOOKS`
(`packages/bonzaiwork-litellm`, of een nieuw `packages/bonzaiwork-projects`). Geen nieuwe upstream-patches.
De velden zijn een voorstel, bedoeld zodat de designer weet welke data er komt. Namen kunnen nog wijzigen.

### 7.1 Projectmetadata

Opslag: een eigen bestand in de app-data (niet in de projectmap, zodat het niet in git van de gebruiker belandt).

```ts
type ProjectMeta = {
  workspaceId: string;
  description: string | null;
  color: string | null;          // token uit de palette, geen vrije hex
  icon: string | null;           // lucide-naam
  pinned: boolean;
  archivedAt: number | null;
  pinnedChatIds: string[];
  archivedChatIds: string[];
  chatNotes: Record<string, string>;
  allowedModels: string[] | null; // null = alle modellen van de key
};
```

| Route | Doel |
|---|---|
| `GET /bonzaiwork/projects` | Alle projecten: workspace-info + `ProjectMeta` + key-status in één antwoord |
| `GET /bonzaiwork/projects/:id` | Eén project |
| `PATCH /bonzaiwork/projects/:id` | Metadata wijzigen |

### 7.2 Overzichtsdata en zoeken

| Route | Doel |
|---|---|
| `GET /bonzaiwork/projects/:id/summary` | `{ chatCount, lastActivityAt, runningCount, waitingCount, tokens: { input, output }, nextRoutineAt }` |
| `GET /bonzaiwork/projects/:id/chats/search?q=` | Zoeken in titels en berichttekst; geeft chat-id, titel en een tekstfragment |

Kan in eerste instantie client-side (chatlijst + berichten ophalen); de route wordt nodig zodra projecten veel
chats hebben.

### 7.3 Verbruik en budget (uit LiteLLM)

De key-route weet welke virtual key bij een project hoort. LiteLLM houdt verbruik per key bij.

| Route | Doel |
|---|---|
| `GET /bonzaiwork/projects/:id/usage?period=month` | `{ spend, currency, maxBudget, budgetResetAt, byModel: [{ model, spend, tokens }] }` |

**[VERIFIEER]** welke LiteLLM-endpoints een virtual key over zichzelf mag lezen (`/key/info`, spend-logs) zonder
admin-key. Lukt dat niet, dan tonen we alleen tokens (🟡) en komt kosten-per-project later.

### 7.4 Routines

```ts
type Routine = {
  id: string;
  workspaceId: string;
  name: string;
  prompt: string;
  model: string | null;                 // null = standaardmodel van het project
  schedule: AutomationSchedule;         // uit @openwork/types, zonder "calendar"
  state: "active" | "inactive" | "needs_attention" | "archived";
  needsAttentionReason: string | null;
  nextRunAt: number | null;
  lastRun: RoutineRun | null;
  createdAt: number;
  updatedAt: number;
  brains: string[];                     // breinen (workspace-id's) die de routine zonder vragen mag lezen
};

type RoutineRun = {
  id: string;
  routineId: string;
  trigger: "scheduled" | "manual" | "recovery";
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "skipped";
  skippedReason: "app_closed" | null;
  chatId: string | null;                // de chat die de run opleverde
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
};
```

| Route | Doel |
|---|---|
| `GET /bonzaiwork/routines?workspaceId=` | Lijst (alle of per project) |
| `POST /bonzaiwork/routines` | Aanmaken |
| `PATCH /bonzaiwork/routines/:id` | Wijzigen, aan/uit, archiveren |
| `DELETE /bonzaiwork/routines/:id` | Verwijderen |
| `POST /bonzaiwork/routines/:id/run` | Nu uitvoeren |
| `GET /bonzaiwork/routines/:id/runs` | Runhistorie |
| `POST /bonzaiwork/routines/preview` | Volgende N runs voor een schema (voor de editor) |

Gebouwd in `packages/bonzaiwork-routines` (opslag in `<userData>/bonzaiwork/routines.json`). Een run gaat via
de eigen `/workspace/:id/opencode2`-proxy van de server, dus precies als een chat uit de app. Leest de AI in
een routine een brein dat bij de routine staat, dan beantwoordt de planner de vraag "Mag BonzaiWork in het
brein … kijken?" zelf (één keer per vraag); andere breinen wachten op de gebruiker. Een run die viel terwijl de
app dicht was, staat als "gemist" (`skipped`, `app_closed`) en wordt niet ingehaald (R1).

Uitvoering: de planner draait in het serverproces (het draait zolang de app open is), maakt een chat aan in het
project en stuurt de prompt, precies zoals de UI dat doet. Runs zijn dus gewone chats en verschijnen in de chatlijst.

### 7.5 Breinen

Gebouwd in fase 1 van [`project-breinen-plan.md`](./project-breinen-plan.md) (§8). Server:
`packages/bonzaiwork-brains/src/server-hooks.ts`; UI-client: `apps/bonzaiwork/src/backend/live/brains.ts`.
`Capabilities.brains` gaat aan als `GET /bonzaiwork/brains` antwoordt; zonder staat alles zichtbaar maar
vergrendeld met de reden (DESIGN.md P4).

```ts
type BrainKind = "project" | "personal";
type BrainState = "synced" | "syncing" | "behind" | "ahead" | "offline" | "conflict"
  | "read_only" | "local_only" | "needs_trust" | "error";
type BrainStatus = {
  kind: BrainKind;
  state: BrainState;              // local_only: persoonlijk brein zonder eigen repo
  mode: "auto" | "manual" | "read_only" | "proposal";
  remote: string | null;          // SSH-vorm, bijv. git@gitlab.com:team/brein.git
  branch: string;
  ahead: number;
  behind: number;
  lastSyncAt: number | null;
  conflictFiles: string[];
  conflictBy: string | null;      // naam van wie de andere wijziging deed
  merging: boolean;               // beide versies staan in de notities; een chat voegt samen
  error: string | null;           // Nederlands; Engelse git/ssh-tekst alleen in de log
  pendingTrust: { path: string; kind: "config" | "plugin" | "agent" | "command" | "script"; mcpServers: string[] }[];
  unshared: { path: string; reason: "not_markdown" | "too_large" }[];
  warnings: string[];             // OKF/ICM-structuur (Nederlands)
  excluded: string[];             // persoonlijk brein: mappen die de AI niet opent
  proposal: { branch: string; url: string | null; manual: boolean } | null; // "via voorstel"
};
```

| Route | Auth | Doel |
|---|---|---|
| `GET /bonzaiwork/brains` | client | alle breinen: `{ brains: [{ workspaceId, path, status }] }` |
| `POST /bonzaiwork/brains/check-remote` | host | `{ url }` → `{ ok, sshUrl, name, empty }` of `{ ok: false, problem, message, host? }` ("Verbinding testen") |
| `POST /bonzaiwork/brains/trust-host` | host | `{ url, fingerprints }`: onbekende host na bevestiging opslaan; `409` als de sleutel intussen anders is |
| `POST /bonzaiwork/brains/clone` | host | `{ url, folderPath }` → `202 { jobId }`; de map moet leeg zijn of niet bestaan |
| `GET /bonzaiwork/brains/jobs/:jobId` | host | `{ state: "running" \| "done" \| "failed", error, problem, status }` |
| `PUT /bonzaiwork/brains/:workspaceId` | host | registreren `{ jobId?, kind, mode?, trusted?, excluded? }` (persoonlijk zonder `jobId`: geschiedenis buiten de map plus sjabloon), of `{ mode }` wijzigen |
| `DELETE /bonzaiwork/brains/:workspaceId` | host | synchronisatie uitzetten; de map blijft |
| `GET /bonzaiwork/brains/:workspaceId/status` | client | `BrainStatus` |
| `POST /bonzaiwork/brains/:workspaceId/pull` | client | vóór een beurt: projectbrein en persoonlijk brein bijwerken (max. ~5 s), dan de globale instructies |
| `POST /bonzaiwork/brains/:workspaceId/sync` | client | "Wijzigingen delen" / "Opnieuw proberen" |
| `GET /bonzaiwork/brains/:workspaceId/history` | client | `{ entries: [{ commit, author, at, title, chatId, files }] }` |
| `POST /bonzaiwork/brains/:workspaceId/resolve` | client | `{ strategy: "keep-mine-apart" }`, of `{ strategy: "ai" }` → `{ files, by, prompt, status }`: de app start een chat met `prompt` |
| `POST /bonzaiwork/brains/:workspaceId/trust` | host | `{ paths }`: onderdelen die iets kunnen uitvoeren toestaan |
| `POST /bonzaiwork/brains/:workspaceId/repair` | host | "Herstellen" na een fout (config, remote, herschreven geschiedenis) |
| `PUT /bonzaiwork/brains/:workspaceId/excluded` | host | `{ folders }`: uitgesloten mappen (persoonlijk brein) |
| `POST /bonzaiwork/brains/:workspaceId/remote` | host | `{ url }`: privérepo aan het persoonlijke brein koppelen |
| `POST /bonzaiwork/brains/:workspaceId/restore` | client | `{ commit, path? }`: notitie terugzetten, of zonder `path` de beurt terugdraaien |
| `GET` / `PUT /bonzaiwork/brains/:workspaceId/reads` | client / host | `{ brains }`: andere breinen die dit project zonder vragen mag raadplegen; de server beantwoordt die vragen |
| `GET /bonzaiwork/brains/:workspaceId/workflows` | client | `{ workflows: [{ name, title, task, runs, stages: [{ id, task, outputs, check: { kind, text }, state, failure, missing }] }] }`; `state`: `waiting` / `ready` / `check` / `done` / `failed` |
| `POST /bonzaiwork/brains/:workspaceId/workflows/:name/stages/:stage/start` | client | `{ title, prompt }` voor een nieuwe chat; `409 { code: "missing_input", missing }` |
| `POST /bonzaiwork/brains/:workspaceId/workflows/:name/stages/:stage/check` | client | `{ verdict: "pass" \| "fail", reason? }` van een persoon, of `{ model: true }` → `{ title, prompt }` |
| `POST /bonzaiwork/brains/:workspaceId/workflows/:name/runs` | client | `{ subject }`: nieuwe run, de vorige naar `_runs/` |
| `GET /bonzaiwork/brains/:workspaceId/candidate` | host | `{ repository: { remote, branch, ssh } \| null }`: is de projectmap al een git-repo? |
| `POST /bonzaiwork/brains/:workspaceId/adopt` | host | "Als brein synchroniseren": repo met SSH-link wordt een brein zoals hij is |
| `POST /bonzaiwork/brains/:workspaceId/publish` | host | `{ url, name }`: "Deel als nieuw brein" in een lege repo; `409 remote_not_empty` / `already_repository` |
| `POST /bonzaiwork/brains/:workspaceId/setup` | host | `{ name, description }`: breinsjabloon in een lege repo, daarna delen |
| `GET /bonzaiwork/brains/:workspaceId/concept?path=` | client | `{ concept }`: OKF-type, status, verlopen, schrijver, nakijkers, vertrouwensniveau, bronnen |
| `POST /bonzaiwork/brains/:workspaceId/verify` | client | `{ path }`: "Klopt" vastleggen in de notitie |
| `GET` / `PUT /bonzaiwork/brains/settings` | client / host | naam en e-mail voor de geschiedenis (`{ author, suggested }`) |
| `GET /bonzaiwork/brains/proposals` | client | voorkeuren die de AI voorstelde |
| `POST /bonzaiwork/brains/proposals/:id` | client | `{ decision: "accept" \| "reject", text? }` |
| `* /bonzaiwork/brains/mcp` | lokaal token | de breinen-MCP, alleen voor de engine |

Schermen: statuspil in de projectkop, kaarten boven de composer (conflict, vertrouwen, voorkeur), één
regel onder de beurt, "Uit een gedeeld brein" in Nieuw project, onboardingstap "Je persoonlijke brein",
Projectinstellingen → Brein, Instellingen → Breinen, en de OKF-gegevens boven een kennisnotitie.
Schermafbeeldingen: `screenshots/brein-*.png`. Beheer van een gedeeld brein:
[`brein-beheer.md`](./brein-beheer.md).

---

### 7.5 Feedback

Gebouwd (#9, [`feedback.md`](./feedback.md)) in `packages/bonzaiwork-feedback`. Niets verlaat de machine via deze
routes: de gebruiker maakt het issue zelf aan op GitHub.

| Route | Doel |
|---|---|
| `POST /bonzaiwork/feedback/collect` | `{ notes }` → `{ id, system, logs, screenshot }`: venster vastleggen, logs lezen en opschonen |
| `POST /bonzaiwork/feedback/:id/save` | `{ screenshot }` → `{ folder, files }`: `screenshot.png` en `logs.txt` in een nieuwe map in Downloads |

## 8. Open beslissingen

| # | Vraag | Gevolg voor het ontwerp |
|---|---|---|
| O1 | Key per **gebruiker** of per **project**? (uit `referentie.md`) | "Keys per project" uit deze opdracht wijst naar `keyMode=workspace`. Dan: geen key-stap in onboarding, wel in "Nieuw project", en een key-sectie per project. |
| P1 | Is een project altijd precies één map? | Dit contract gaat uit van ja. Meerdere mappen per project kan deels via "extra mappen" (authorized folders), maar chats horen bij één map. |
| P2 | Waar komen nieuwe projecten standaard (bijv. `~/BonzaiWork/<naam>`), en mag de gebruiker een bestaande map kiezen? | Wel of geen mapkiezer in "Nieuw project". |
| P3 | Verwijderen van een project: alleen loskoppelen (zoals nu) of ook de map weggooien? | Tekst en bevestiging van de verwijderactie. |
| R1 | Gemiste routines (app was dicht): bij openen alsnog draaien, of alleen tonen als gemist? | Staat en melding in de runhistorie. |
| R2 | Mag een routine zonder toestemming acties uitvoeren, of wacht hij op de gebruiker? | Een routine die op een toestemming wacht, moet zichtbaar "wacht op jou" zijn. |

---

## 9. Ontwerpregels

Alle UI volgt [`DESIGN.md`](../../DESIGN.md). De regels die voor deze schermen het meest tellen:

- **S1** plat, geen kaart-in-kaart; **S2** instellingen en lijsten als compacte rijen; **S5** niets opent of
  springt vanzelf omdat een tool iets doet.
- **C1** werkwoord eerst in knoppen; **C3** benoem wat de gebruiker bedient (een "project", geen "workspace");
  **C5** geblokkeerd is geen fout; **C6** fouten en lege staten zeggen wat de volgende stap is.
- **T1–T5** voor de chat: toolactiviteit als één rail, fouten inline met de oplossing, toestemmingskaart als focus,
  composer met één ronde verstuur/stop-knop.
- **V1–V7** visueel systeem: systeemfont 13px, Radix-kleurschalen, lucide-iconen 16px, geen gradients of glas.

De gebruikers zijn niet-technisch: toon nooit paden, model-id's of foutcodes als hoofdinformatie. Paden en
technische details mogen in de sidecar of achter een "Details"-uitklapper.
