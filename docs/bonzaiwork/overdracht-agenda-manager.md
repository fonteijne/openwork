# Overdracht: agenda-manager bouwen (MVP, fase 1 en 2)

Voor een nieuwe sessie die de agenda-manager bouwt. Stand van 2 november 2026: fase 1 (backend, §11) en
fase 2 (paneel, §13) zijn gebouwd; daarmee staat de MVP. Wat er is en hoe je het test:
[`agenda.md`](./agenda.md). Het plan is leidend: [`agenda-manager-plan.md`](./agenda-manager-plan.md). De
onderbouwing staat in [`agenda-manager-onderzoek.md`](./agenda-manager-onderzoek.md). Lees ook
`AGENTS.md` (in de root), [`README.md`](./README.md) (vooral "Branches" en "CI"), `DESIGN.md` en
[`../../PATCHES.md`](../../PATCHES.md).

## 1. Wat we bouwen

Een agenda die over alle projecten heen per kwartier bijhoudt waar je in BonzaiWork aan werkt, op de
achtergrond, zonder je uit je flow te halen. Aan het eind van de dag of week maakt hij een
**boekdocument**: Markdown met een JSON-blok, dat je in een gewone chat plakt. Die chat boekt de uren
met de Bridge CLI, na jouw goedkeuring.

De MVP is **fase 1 en 2** van het plan (§8). Wat erna komt (model, agenda-key, agenda-chat, dag
afsluiten, boeken in Bridge) staat in §12 en valt buiten deze opdracht.

## 2. Vaste beslissingen

Niet opnieuw ter discussie stellen. Zie plan §0.

| # | Beslissing |
|---|---|
| A1 | Eenheid is het kwartier (:00, :15, :30, :45, lokale tijd). Eén toewijzing per kwartier |
| A2 | Een kwartier zonder activiteit heet letterlijk **"Away from BonzaiWork"** (kan een meeting zijn) en wordt niet geboekt, tenzij de gebruiker het omzet |
| A4 | Bridge-post (entity-ID + optioneel label) per project en per handmatig kwartier, op de server opgeslagen |
| A7 | Geen breinen, skills, MCP of engine in de agenda |
| A8 | De MVP heeft geen model en geen LiteLLM-key |
| A9 | Het resultaat is het boekdocument uit plan §6, met de vaste instructietekst uit §6.2 |

## 3. Werkwijze

- **Branches** met duidelijke namen, één per fase: `claude/agenda-fase1-meting` en
  `claude/agenda-fase2-paneel`. Geen willekeurige achtervoegsels.
- **PR's naar `nightly`** (integratie en default branch), nooit naar `main`. Fase 2 bouwt voort op
  fase 1: wacht op de merge, of maak de branch van fase 2 vanaf die van fase 1 en zet dat in de PR.
- De plan- en onderzoeksdocumenten staan op `claude/agenda-manager-plan` (daar is `nightly` met
  fonteijne/openwork#8 en #16 al in gemerged). Zijn ze nog niet in `nightly`, neem die commits dan mee in
  de PR van fase 1, of laat de gebruiker eerst een docs-PR van die branch mergen.
- **CI draait niet bij een push naar een feature-branch**, alleen bij een PR die klaar is voor review en
  bij pushes naar `nightly` (README, "CI"; sinds fonteijne/openwork#16). Een draft-PR wacht ook. Draai
  daarom zelf de typecheck- en teststappen uit `.github/workflows/bonzaiwork.yml` voordat je meldt dat
  een fase groen is.
- **Geen upstream-bestanden wijzigen.** Alles past in `packages/bonzaiwork-*`, `apps/bonzaiwork` en
  `docs/bonzaiwork`. `node scripts/bonzaiwork/check-patches.mjs` moet groen blijven zonder nieuwe rij in
  `PATCHES.md`.
- Docs en UI-teksten in het **Nederlands** (DESIGN.md C1–C7), behalve het label "Away from BonzaiWork".
- TypeScript strikt: geen `any`, geen `as`, zoals de bestaande pakketten (`record()`/`text()`-helpers
  in `routines.ts`).
- **Vertrouwelijkheid** (AGENTS.md, de repo is publiek): fixtures, demo en voorbeelden alleen met
  placeholders (`<ENTITY_ID_A>`, "Project A"), nooit echte klanten, posten of personen.
- Commitberichten eindigen met de attributieregels uit de sessie; geen modelnaam in commits of PR's.
- PR-beschrijving volgens `.github/pull_request_template.md`; bij UI de DESIGN.md-regel-id's noemen en
  screenshots toevoegen.

## 4. Wat er al is (geverifieerd in de code)

| Nodig | Waar | Opmerking |
|---|---|---|
| Begin en einde van elke beurt, alle projecten | `host.onSessionActivity` in `apps/server/src/downstream-hooks.ts` (`DownstreamSessionActivity`: `workspaceId`, `sessionId`, `state`, `outcome`) | Komt uit `session.execution.*`-events; geen tijdstip in het event, zet zelf `now()` |
| Titel en parent van een chat | `host.sessionInfo(sessionId)` → `{ id, title, parentId }` | `parentId` ≠ null betekent subtaak: niet tellen |
| Lopende chats per project | `host.runningSessions(workspaceId)` | Voor het opruimen van gemiste einde-events |
| Projecten | `host.workspaces()` → `{ id, path }` | Geen naam: de UI stuurt de naam mee in het presence-signaal |
| Voorbeeld van een hooks-pakket | `packages/bonzaiwork-routines/src/routines.ts` | Kopieer de opzet: `createXHooks(options)`, `routes`, `start(host)`, timer met `unref`, opslag atomisch met mode `0600`, `writable()`-wrapper met `read_only`, structureel host-type |
| Hooks combineren | `packages/bonzaiwork-server-hooks/src/server-hooks.ts` | Agenda erbij met eigen `.catch` in `start`; de check op dubbele routes blijft |
| Routine-chats herkennen | `routines.ts`: `live` (map op sessionId) en `runs[].chatId` | Voeg `isRoutineChat(sessionId)` toe en geef die aan de agenda in `server-hooks.ts` |
| Globale registratie vanuit Electron | `registerKeyStore` in `packages/bonzaiwork-litellm/src/keys.ts`, aangeroepen in `apps/bonzaiwork/desktop-main/main.ts` | Zelfde patroon voor `registerPresenceSource`; de server draait in hetzelfde Electron-proces |
| Downloads-map | `registeredDiagnosticsSource()?.saveDirectory()` in `packages/bonzaiwork-feedback/src/diagnostics.ts`, met `headlessDiagnosticsSource` als terugval | Voor "Opslaan in Downloads" |
| Statemap | `BONZAIWORK_STATE_DIR`, gezet in `main.ts` op `<userData>/bonzaiwork` | Agenda in `agenda/` daaronder |
| Schema- en klokhulp | `@openwork/types/automation-schedule` | Niet nodig voor kwartieren, maar laat zien hoe DST elders getest wordt |
| UI-shell | `apps/bonzaiwork/src/features/shell/app-shell.tsx`, `ui-store.ts` (zustand, `readLocal`/`writeLocal`) | Sidecar-voorkeur `bonzaiwork.sidecar` is het voorbeeld voor `bonzaiwork.agenda` |
| Bovenbalk | `apps/bonzaiwork/src/components/top-bar.tsx` | Elke pagina gebruikt `TopBar`; daar komt de pil |
| Overlay | `apps/bonzaiwork/src/components/ui/overlay.tsx` | `Sheet` is een **modale** Base UI-dialoog: niet geschikt voor het paneel op desktop |
| Breakpoints | `apps/bonzaiwork/src/lib/use-media.ts`: `WIDE` = 1280px | Vastzetten vanaf `WIDE` |
| Projectmetadata | `apps/bonzaiwork/src/backend/live/meta.ts` | Staat per apparaat in `localStorage` (`/bonzaiwork/projects` bestaat niet). Daarom staat de Bridge-post in het agenda-pakket op de server |
| Backends | `apps/bonzaiwork/src/backend/types.ts`, `live/index.ts` (capability-probes rond regel 176), `demo/` | Agenda in beide, plus een probe op `/bonzaiwork/agenda/settings` |
| Instellingen | `features/settings/project-settings.tsx` (secties uit `SETTINGS_SECTIONS` in `lib/router.ts`), `app-settings.tsx` | Bridge-post in "general", nieuwe sectie "Agenda" in de app-instellingen |
| Idle-werk in de UI | `apps/bonzaiwork/src/lib/idle.ts` | Voor `reportPresence` |
| CI | `.github/workflows/bonzaiwork.yml`: typecheck- en test-stappen per pakket | `@bonzaiwork/agenda` aan beide toevoegen |

## 5. Eerst controleren (niet geverifieerd)

1. `pnpm install` draaien: in de vorige sessie waren de dependencies niet geïnstalleerd.
2. **Base UI `Dialog.Root modal={false}`** in de geïnstalleerde versie van `@base-ui/react` (`^1.4.1`):
   ondersteunt die niet-modaal zonder focus-trap? Zo niet, bouw het paneel als gewone `aside`/`div` met
   eigen focusbeheer. Niet de modale `Sheet` gebruiken.
3. **`powerMonitor.getSystemIdleTime()`** en `BrowserWindow.getFocusedWindow()` vanuit
   `desktop-main`: werken die op Linux headless (xvfb) en geven ze zinnige waarden? Anders valt
   presence terug op het UI-signaal (plan §5.3).
4. Of `session.execution`-events ook voor subtaken komen, en met welk `sessionId`. Test met een chat
   die een subagent start; de regel blijft: subtaken tellen niet apart.
5. Of `apps/bonzaiwork/src/features/settings/project-settings.tsx` na de voorkeursmodellen
   (fonteijne/openwork#8) nog dezelfde secties heeft; het Bridge-post-veld komt in "general".

## 6. Volgorde fase 1 (één PR)

1. `packages/bonzaiwork-agenda` opzetten (package.json, tsconfig, lege `createAgendaHooks`), inhaken in
   `server-hooks` en CI. Groen krijgen.
2. `clock.ts` met tests (kwartieren, middernacht, zomer- en wintertijd met `TZ=Europe/Amsterdam`, week).
3. `quarters.ts` (puur): score, winnaar, away, gedeeld, dagvenster, correctie gaat voor. Tests.
4. `store.ts`: dagbestanden en instellingen, atomisch, `0600`, corrupt bestand → lege dag.
5. `tracker.ts` en `isRoutineChat` in routines. Tests met een nep-host.
6. `presence.ts` en `apps/bonzaiwork/desktop-main/presence-source.ts`.
7. `bridge.ts`, `overview.ts` (blokken, boekvoorstel per datum × post × referentie, aandachtspunten).
8. `booking-doc.ts` met de instructietekst uit plan §6.2 **letterlijk**, en een snapshottest voor een dag
   en een week. Het JSON-blok moet geldige JSON zijn en gelijk aan de tabellen.
9. `routes.ts` (plan §5.2), met tests op auth, `read_only` en invoervalidatie.
10. `frontend-contract.md` §7.6 en `README.md` bijwerken.

Klaar als: de acceptatiecriteria van plan §8 fase 1 gehaald zijn, en
`pnpm --filter @bonzaiwork/agenda test`, `typecheck`, `pnpm --filter @bonzaiwork/server-hooks test`,
`pnpm --filter @bonzaiwork/routines test` en `node scripts/bonzaiwork/check-patches.mjs` groen zijn.

## 7. Volgorde fase 2 (één PR)

1. `Backend.agenda` in `types.ts`, live en demo (demo: een week met away, een gedeeld kwartier, een
   meeting en een project zonder post).
2. `Panel` (niet-modaal), `ui-store` (`agendaOpen`, `agendaPinned`), sneltoets `⌘J`/`Ctrl+J` in
   `AppShell`, pil in `TopBar`.
3. Tijdlijn, toevoegen, bewerken, ongedaan maken (toast alleen in het paneel).
4. Bridge-post-veld in projectinstellingen; sectie "Agenda" in app-instellingen.
5. Exportdialoog: periode, samenvatting, "Kopieer voor chat", "Opslaan in Downloads" met "Toon in map".
6. Presence-melding bij navigatie (`requestIdleCallback`).
7. Headless controleren (AGENTS.md "Verify changes headless": `seed.appWeb`, of
   `pnpm --filter @bonzaiwork/app dev` met de demo-backend en Playwright). Vooral: met het paneel open
   blijft de composer focus en invoer houden.
8. `docs/bonzaiwork/agenda.md` met de testinstructies uit plan §8 "Eerste test na de MVP".

## 8. Bekende beperkingen van de omgeving

- Branches verwijderen op GitHub werd in de vorige sessie door de beveiliging geblokkeerd; laat dat aan
  de gebruiker.
- GitHub alleen via de MCP-tools (`mcp__github__*`); `gh` alleen voor zoeken.
- Geen PR openen zonder dat de gebruiker erom vraagt.

## 9. Open punten (blokkeren niets; standaard uit plan §11)

- Formaat entity-ID onbekend: vrije tekst, 1–64 tekens, zonder spaties.
- Optie van `bridge add_worklog` voor de referentie onbekend: de assistent kijkt het na met `--help`.
- Geen automatische opruiming van daglogs.

## 10. Startprompt voor de nieuwe sessie (fase 1)

```text
Bouw fase 1 van de agenda-manager in BonzaiWork.

Lees eerst, in deze volgorde:
docs/bonzaiwork/overdracht-agenda-manager.md, docs/bonzaiwork/agenda-manager-plan.md,
AGENTS.md, docs/bonzaiwork/README.md (Branches en CI), PATCHES.md en
packages/bonzaiwork-routines/src/routines.ts als voorbeeld van een hooks-pakket.
De plandocumenten staan op branch claude/agenda-manager-plan; staan ze nog niet op nightly,
haal ze daar vandaan.

Werk op een nieuwe branch claude/agenda-fase1-meting vanaf origin/nightly en neem de
plancommits mee. De beslissingen in plan §0 liggen vast. Begin met de punten in
overdracht §5 die fase 1 raken, en volg dan de volgorde uit overdracht §6.
Commit per stap, push regelmatig, en meld na elke stap kort wat er staat.
Open nog geen PR; vraag dat aan mij als fase 1 groen is.
```

## 11. Stand na fase 1

Gebouwd in `packages/bonzaiwork-agenda` (contract: [`frontend-contract.md`](./frontend-contract.md) §7.6), met
`isRoutineChat` in routines, `ElectronPresenceSource` in desktop-main, inhaken in `server-hooks` en CI.

**Uit §5 gecontroleerd**

| # | Uitkomst |
|---|---|
| 1 | `pnpm install --frozen-lockfile` werkt. In een verse container ontbreekt de Electron-binary: `node node_modules/.pnpm/electron@*/node_modules/electron/install.js` haalt hem op (nodig voor xvfb-controles) |
| 3 | Onder xvfb geven `powerMonitor.getSystemIdleTime()` en `BrowserWindow.getFocusedWindow()` zinnige waarden (idle liep 0 → 5 s; focus false → true na `win.focus()`, false na verbergen). `ElectronPresenceSource` geeft vóór `ready` "niet aanwezig" |
| 4 | Niet live te testen zonder model en subagent. De tracker sluit subtaken altijd uit via `sessionInfo().parentId` (gecachet), dus komt er een event met het `sessionId` van een subtaak, dan telt het niet; komt er geen, dan ook niet. Nog nalopen met een echte subagent |
| 2, 5 | Horen bij fase 2 (paneel, projectinstellingen); nog open |

Rooktest tegen de echte openwork-server met de gebundelde server-hooks: alle routes antwoorden, een
wijziging met een client-token geeft 401, met het host-token 200, en de bestanden komen in
`bonzaiwork/agenda/`.

**Bewuste keuzes en afwijkingen van het plan**

- Kwartiersleutel: in het herhaalde uur bij wintertijd krijgen de tweede kwartieren hun offset erbij
  (`"2026-10-25T02:15+01:00"`), zodat elke sleutel in een dag uniek is (100 kwartieren).
- `PUT /quarters`: `from` en `to` zijn kwartiersleutels van die dag; `to` is het laatste kwartier (inclusief),
  zodat 23:45 geen sleutel van de volgende dag nodig heeft.
- `Block` heeft ook `source` en `appClosed`; blokken splitsen daarop. "Nu bezig" (`DayView.now.since`) rekent wel
  terug over de hele reeks met hetzelfde label.
- Boekdocument: de tijdlijn heeft een extra kolom "Referentie"; het JSON-blok heeft naast de velden uit §6.3 ook
  `materiaal.labels` (labels van `other`-kwartieren), `gedeeld`, `minuten` bij away en `soort`/`label` bij
  `zonder_post`. Een test vergelijkt de instructietekst letterlijk met plan §6.2.
- Een corrupt dag- of instellingenbestand wordt opzij gezet (`*.corrupt-<ms>`) en als leeg gelezen, zodat de
  volgende schrijfactie het niet vernietigt.
- `isRoutineChat` geldt voor de hele chat van een routine, ook als je er later zelf in verder typt (zoals het
  plan zegt); dan telt het via aanwezigheid.
- "Opslaan in Downloads" overschrijft nooit: een tweede export van dezelfde periode wordt `…-2.md`.
- De placeholder-titel van de engine ("New session - …") telt niet als chattitel; bij het afsluiten van een
  kwartier worden de titels opnieuw opgehaald, omdat een nieuwe chat zijn titel pas tijdens de eerste beurt krijgt.

## 12. Startprompt voor fase 2

Fase 2 bouwt op fase 1 (fonteijne/openwork#17). Is die gemerged, begin dan vanaf `origin/nightly`; anders vanaf
`claude/agenda-manager-plan`, en zet dat in de PR.

```text
Bouw fase 2 van de agenda-manager in BonzaiWork: het paneel, de Bridge-posten en de export (frontend).
Fase 1 (backend, packages/bonzaiwork-agenda) staat al.

Lees eerst, in deze volgorde:
docs/bonzaiwork/overdracht-agenda-manager.md (vooral §3, §5, §7, §11),
docs/bonzaiwork/agenda-manager-plan.md (§0, §7 en §8 "Fase 2"),
docs/bonzaiwork/frontend-contract.md §7.6 (types en routes die de UI gebruikt),
AGENTS.md (vooral "Verify changes headless"), DESIGN.md, docs/bonzaiwork/README.md (Branches en CI),
PATCHES.md en apps/bonzaiwork/README.md.

Werk op een nieuwe branch claude/agenda-fase2-paneel vanaf origin/nightly als fonteijne/openwork#17
gemerged is, anders vanaf claude/agenda-manager-plan (zeg dat dan in de PR). Schrijft de sessie een
andere branch voor, gebruik die. De beslissingen in plan §0 liggen vast; de backend uit fase 1
verandert alleen als de UI iets echt mist (meld dat dan apart).

Begin met de punten in overdracht §5 die nog open zijn voor fase 2: §5.2 (Base UI Dialog
modal={false} zonder focus-trap in de geïnstalleerde @base-ui/react, anders een eigen aside) en §5.5
(secties van project-settings.tsx). Volg dan de volgorde uit overdracht §7.

Regels: geen upstream-bestanden wijzigen (check-patches.mjs blijft groen zonder nieuwe rij); alle
teksten in copy.ts in het Nederlands volgens DESIGN.md C1–C7, behalve het label "Away from BonzaiWork";
geen toast of melding buiten het paneel (plan §7.6); demo en screenshots alleen met placeholders
("Project A", "<ENTITY_ID_A>"). Controleer headless (seed.appWeb of de demo-backend met Playwright),
vooral dat de composer focus en invoer houdt met het paneel open. Zet screenshots en de
DESIGN.md-regel-id's in de PR.

Commit per stap, push regelmatig, en meld na elke stap kort wat er staat. Draai voor je "groen" meldt
zelf de typecheck- en teststappen uit .github/workflows/bonzaiwork.yml (de CI draait pas als de PR
ready for review is). Maak de PR naar nightly 'ready for review' wanneer fase 2 groen is en laat mij
weten wanneer je klaar bent.
```

## 13. Stand na fase 2

Gebouwd in `apps/bonzaiwork` (overzicht en testinstructies: [`agenda.md`](./agenda.md)). De backend uit fase 1 is
niet veranderd; `@bonzaiwork/agenda` kreeg alleen een extra export `./model` met de pure delen (types, klok,
`dayQuarters`, `dayView`, `proposal`, `bookingDocument`), zodat de demo en de UI met dezelfde functies rekenen als
de server.

**Uit §5 gecontroleerd**

| # | Uitkomst |
|---|---|
| 2 | `@base-ui/react` 1.4.1: `Dialog.Root modal={false}` zet de focus-trap (`FloatingFocusManager modal={false}`) en de scroll-lock uit. Wel sluit hij standaard bij focus buiten de popup en bij Esc waar dan ook. `Panel` zet daarom `disablePointerDismissal` (ook geen sluiten bij focus-out) en laat Esc van buiten het paneel door (`details.cancel()` + `allowPropagation()`), zodat Esc in de composer en de toestemmingskaart blijft werken. Enter binnen het paneel gaat niet door naar de sneltoetsen van de pagina |
| 5 | `project-settings.tsx` heeft na de voorkeursmodellen dezelfde secties (`SETTINGS_SECTIONS`); "general" is `GeneralSection`. Het veld "Bridge-post" staat daar onder "Map" |

**Headless gecontroleerd** (Playwright, demo en live dev-server met de gebundelde server-hooks en een nep-LiteLLM):
de pil staat op elke pagina; ⌘J/Ctrl+J opent en sluit het paneel, en de composer houdt focus en invoer (typen met
het paneel open, Esc in de composer laat het open, sluiten zet de focus terug in de composer); een kwartier
toevoegen, wijzigen en ongedaan maken werkt; "Kopieer voor chat" en "Opslaan in Downloads" leveren het document uit
fase 1; de Bridge-post uit de projectinstellingen staat op de server; de vastgezette kolom blijft na herladen en
klapt de sidecar in; op telefoonbreedte opent de sheet. Screenshots: `screenshots/agenda-*.png`.

**Bewuste keuzes en afwijkingen van het plan**

- De pil toont "Project A" en "sinds 10:15" als twee delen zonder middenpunt (C7: geen middle-dot als decoratie).
- De editor staat in het paneel zelf (geen dialoog); de tijdlijn wijkt zolang. Een gemeten away-blok opent als
  "Anders", omdat dat bijna altijd een meeting is (A2).
- Bevestigingen staan in het paneel (wijzigen, ongedaan maken) of in de exportdialoog ("Gekopieerd", "Opgeslagen in
  Downloads" met "Toon in map"); de instellingen tonen de nieuwe stand in de rij. Nergens een toast (plan §7.6).
- `⌘J` sluit een vastgezette kolom ook; hij blijft vastgezet voor de volgende keer. Wordt het venster smal terwijl
  de kolom open is, dan sluit hij in plaats van een overlay te worden (S5: niets opent vanzelf).
- Een overlay blijft open bij navigeren (net als de kolom); alleen Esc in het paneel, ⌘J of de sluitknop sluiten.
- De samenvatting in de exportdialoog rekent met `proposal()` uit het pakket over de dagen van de periode, dus
  dezelfde cijfers als het document.
- Presence: bij elke navigatie, en in een gewone browser (dev, demo) elke minuut met focus en laatste invoer; in de
  desktop-app geen timer in de UI.
- De lege dag toont alleen een titel (P2); "Toevoegen" staat er direct boven.
- Elke modale dialoog dimt wat erachter ligt, ook als hij genest opent (de exportdialoog vanuit het paneel of de
  sheet): Base UI slaat de backdrop van een geneste dialoog over, tenzij `forceRender`; dat staat nu op de backdrop
  van `Dialog`, `ConfirmDialog` en `Sheet`.

