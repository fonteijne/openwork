# Overdracht: agenda-manager bouwen (MVP, fase 1 en 2)

Voor een nieuwe sessie die de agenda-manager bouwt. Stand van 2 november 2026: onderzocht en gepland,
nog niets gebouwd. Het plan is leidend: [`agenda-manager-plan.md`](./agenda-manager-plan.md). De
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
- De plan- en onderzoeksdocumenten staan op `claude/agenda-manager-plan`. Zijn die nog niet in
  `nightly`, neem die commits dan mee in de PR van fase 1.
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
5. Of `merge-base` van `nightly` en `claude/agenda-manager-plan` klopt, voordat je die commits meeneemt.

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

## 10. Startprompt voor de nieuwe sessie

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
