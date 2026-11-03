# Agenda: wat er is en hoe je het test

De agenda houdt per kwartier bij in welk project je werkt, over alle projecten heen, zonder model en zonder chat
in je project. Aan het eind van de dag of week maakt hij een **boekdocument** dat je in een gewone chat plakt; die
chat boekt de uren met de Bridge CLI, na jouw goedkeuring. Plan: [`agenda-manager-plan.md`](./agenda-manager-plan.md),
contract: [`frontend-contract.md`](./frontend-contract.md) §7.6, stand en afwijkingen:
[`overdracht-agenda-manager.md`](./overdracht-agenda-manager.md) §11 en §13.

## Wat er gebouwd is (MVP, fase 1 en 2)

| Deel | Waar |
|---|---|
| Meting, opslag, routes, boekdocument | `packages/bonzaiwork-agenda` (fase 1) |
| Pure helpers voor UI en demo (types, klok, `dayView`, `bookingDocument`) | `@bonzaiwork/agenda/model` |
| `Backend.agenda` live en demo | `apps/bonzaiwork/src/backend/live/agenda.ts`, `backend/demo/agenda.ts` |
| Statusrij in de zijbalkvoet (elke pagina) | `features/agenda/agenda-status-row.tsx`, in `features/shell/sidebar.tsx` |
| Paneel: overlay, vastgezette kolom, sheet op telefoons | `features/agenda/agenda-panel.tsx`, `Panel` in `components/ui/overlay.tsx` |
| Dagkaart (totalen per post, "Kies post", "Niet geboekt") | `features/agenda/day-card.tsx`, `day-model.ts`, `post-picker.tsx` |
| Weekstrook | `features/agenda/week-strip.tsx` |
| Tijdlijn, toevoegen, wijzigen, ongedaan maken | `features/agenda/timeline.tsx`, `quarter-editor.tsx` |
| Boeken (in een chat, kopiëren, opslaan) | `features/agenda/booking-export.tsx` |
| Bridge-post per project, "Werkdag bijhouden" | `features/agenda/agenda-settings.tsx` (in projectinstellingen → Project en app-instellingen) |
| Open project melden | `features/agenda/presence.ts` (in `AppShell`) |
| Nederlandse labels van het paneel | `features/agenda/copy.ts` (tot de samenvoeging in `src/copy.ts`) |

**Bediening**

- **Statusrij** onderin de zijbalk (ui-ux-overhaul §4, beslissing A2): "Offertes 2026 · sinds 10:15" als je in een
  project werkt, "Niet in BonzaiWork" als je dat niet doet (de data houden "Away from BonzaiWork"), of "Agenda" zonder
  data. Gedempt als "Werkdag bijhouden" uit staat; met een slot als de lokale server nog geen agenda heeft. De tooltip
  noemt ⌘J. Dezelfde `agenda-pill`-testid als de oude pil in de bovenbalk.
- **⌘J / Ctrl+J** of een klik op de statusrij opent en sluit het paneel. Het paneel is niet-modaal: je blijft typen in
  de composer. Esc in het paneel sluit het; de focus gaat terug naar waar hij was. Esc in de composer laat het open.
- **Het paneel opent met de Dagkaart**: per Bridge-post de uren van de dag, rijen "Zonder post" met **Kies post** ter
  plekke (recente posten, of "Andere post" met een entity-id), en "Niet geboekt" voor de tijd buiten BonzaiWork.
  Kies post op een projectrij zet de Bridge-post van dat project (voor elke dag); op een eigen omschrijving corrigeert
  hij die kwartieren, met "Ongedaan maken". Daaronder de **weekstrook** (ma–zo, uren per dag, een amberkleurige stip
  waar een post ontbreekt; klik is die dag; "Vandaag" staat naast de datum) en de **tijdlijn**: blokken met een balk in
  de projectkleur, "Niet in BonzaiWork" als hairline-grijs, amber alleen bij "Zonder post".
- **Vastzetten** (vanaf 1280px): het paneel wordt een eigen kolom en blijft na een herstart staan. Zet je daarna de
  sidecar aan, dan klapt de agenda in (en andersom).
- **Wijzigen**: klik op een blok of een los kwartier. De editor is een driekeuze **Project · Meeting of anders · Niet
  boeken** met één tijdbereik; notitie en referentie staan onder "Meer". Een gemeten away-blok opent als "Meeting of
  anders", zodat een meeting snel een omschrijving en Bridge-post krijgt. Esc annuleert; de knoppen Toevoegen en Boeken
  blijven staan. "Terug naar meting" haalt je correctie weg. Na opslaan staat "Gewijzigd · Ongedaan maken" onderin het
  paneel, nergens anders.
- **Boeken**: periode (vandaag, gisteren, deze week, vorige week of zelf kiezen, max 31 dagen), het project waarin de
  chat komt (onthouden per apparaat; projecten zonder key of model staan er vergrendeld bij), een samenvatting, en
  **Boek in een chat**: een nieuwe chat in dat project krijgt het boekdocument als `.md`-bijlage en één openingszin; de
  chat opent en de toast zegt "Geboekt in …". "Kopieer voor chat" en "Opslaan in Downloads" (met "Toon in map" in de
  desktop-app) blijven als tweede weg.

## Zelf bekijken

**Demo** (zonder server): `pnpm --filter @bonzaiwork/app dev` en open `http://localhost:5183`. De demo heeft
anderhalve week werkdagen met away-kwartieren, een meeting, een gedeeld kwartier en een project zonder Bridge-post;
navigeren naar een project telt als aanwezigheid in het huidige kwartier. "Opslaan in Downloads" downloadt het
document in de browser.

**Live in dev**: start de server met de gebundelde server-hooks zoals in [`README.md`](./README.md) ("Ontwikkelen"),
met `OPENWORK_SERVER_HOOKS` naar `packages/bonzaiwork-server-hooks/dist/server-hooks.js`
(`pnpm --filter @bonzaiwork/server-hooks build`), en open de app met `?server=…&token=…&hostToken=…`.

**Headless** (AGENTS.md "Verify changes headless"): Playwright tegen de demo of de live dev-server. Stabiele
selectors: `agenda-pill`, `agenda-panel` (met `data-variant` `overlay`, `column` of `sheet`), `agenda-date`, `agenda-total`,
`agenda-today`, `agenda-day-card`, `agenda-day-row` (met `data-missing` zonder post), `agenda-day-away`,
`agenda-post-pick`, `agenda-post-option`, `agenda-week`, `agenda-timeline`, `agenda-block`, `agenda-add`,
`agenda-editor`, `agenda-editor-label`, `agenda-editor-post`, `agenda-editor-save`, `agenda-notice`,
`agenda-export-open`, `agenda-export`, `agenda-export-book`, `agenda-export-copy`, `agenda-export-save`,
`bridge-post-entity`, `project-bridge-post`, `project-bridge-post-edit`, `bridge-post-save`, `agenda-close`.
De demo meet pas kwartieren tot "nu": verschuif in een headless run de klok (bijvoorbeeld naar 16:40) om een gevulde
dag te zien.

## Eerste test na de MVP

Uit plan §8, "Eerste test na de MVP":

1. Werk een dag gewoon in twee of drie projecten, met een meeting tussendoor.
2. Eind van de dag:
   - open de agenda (⌘J) en kies op de Dagkaart bij elke rij "Zonder post" een post met **Kies post**;
   - klik op het away-blok van de meeting, kies "Meeting of anders", schrijf "Meeting …", kies de Bridge-post en sla op;
   - klik **Boeken** → **Vandaag** → **Boek in een chat**.
3. Kijk of de chat die opent de stappen uit plan §6.2 volgt: toegang, bestaande boekingen, posten controleren,
   voorstel, dry-run, goedkeuring, boeken, nalezen.
4. Noteer wat niet klopte: toewijzing (plan §2.2–2.3), dagvenster, groepering, de instructietekst. Die punten gaan
   naar fase 3 of naar een bijgestelde regel.

## Tests

| Wat | Commando |
|---|---|
| Pakket (meting, routes, boekdocument) | `pnpm --filter @bonzaiwork/agenda test` en `typecheck` |
| UI-helpers, live-readers, demo-agenda | `pnpm --filter @bonzaiwork/app test` (`features/agenda/format.test.ts`, `backend/live/agenda.test.ts`, `backend/demo/agenda.test.ts`) |
| Screenshots | `docs/bonzaiwork/screenshots/agenda-*.png` |
