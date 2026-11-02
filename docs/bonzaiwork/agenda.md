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
| Pil in de bovenbalk (elke pagina) | `features/agenda/agenda-pill.tsx`, in `components/top-bar.tsx` |
| Paneel: overlay, vastgezette kolom, sheet op telefoons | `features/agenda/agenda-panel.tsx`, `Panel` in `components/ui/overlay.tsx` |
| Tijdlijn, toevoegen, wijzigen, ongedaan maken | `features/agenda/timeline.tsx`, `quarter-editor.tsx` |
| Exporteer voor Bridge | `features/agenda/booking-export.tsx` |
| Bridge-post per project, "Werkdag bijhouden" | `features/agenda/agenda-settings.tsx` (in projectinstellingen → Algemeen en app-instellingen) |
| Open project melden | `features/agenda/presence.ts` (in `AppShell`) |

**Bediening**

- **Pil** rechts in de bovenbalk: "Project A sinds 10:15", "Away from BonzaiWork", of "Agenda" zonder data. Gedempt
  als "Werkdag bijhouden" uit staat; met een slot als de lokale server nog geen agenda heeft.
- **⌘J / Ctrl+J** of een klik op de pil opent en sluit het paneel. Het paneel is niet-modaal: je blijft typen in de
  composer. Esc in het paneel sluit het; de focus gaat terug naar waar hij was. Esc in de composer laat het open.
- **Vastzetten** (vanaf 1280px): het paneel wordt een eigen kolom en blijft na een herstart staan. Zet je daarna de
  sidecar aan, dan klapt de agenda in (en andersom).
- **Wijzigen**: klik op een blok of een los kwartier. Een gemeten away-blok opent als "Anders", zodat een meeting
  snel een omschrijving en Bridge-post krijgt. "Terug naar meting" haalt je correctie weg. Na opslaan staat
  "Gewijzigd · Ongedaan maken" onderin het paneel, nergens anders.
- **Exporteer voor Bridge**: periode (vandaag, gisteren, deze week, vorige week of zelf kiezen, max 31 dagen), een
  samenvatting, "Kopieer voor chat" en "Opslaan in Downloads" (met "Toon in map" in de desktop-app).

## Zelf bekijken

**Demo** (zonder server): `pnpm --filter @bonzaiwork/app dev` en open `http://localhost:5183`. De demo heeft
anderhalve week werkdagen met away-kwartieren, een meeting, een gedeeld kwartier en een project zonder Bridge-post;
navigeren naar een project telt als aanwezigheid in het huidige kwartier. "Opslaan in Downloads" downloadt het
document in de browser.

**Live in dev**: start de server met de gebundelde server-hooks zoals in [`README.md`](./README.md) ("Ontwikkelen"),
met `OPENWORK_SERVER_HOOKS` naar `packages/bonzaiwork-server-hooks/dist/server-hooks.js`
(`pnpm --filter @bonzaiwork/server-hooks build`), en open de app met `?server=…&token=…&hostToken=…`.

**Headless** (AGENTS.md "Verify changes headless"): Playwright tegen de demo of de live dev-server. Stabiele
selectors: `agenda-pill`, `agenda-panel` (met `data-variant` `overlay`, `column` of `sheet`), `agenda-timeline`,
`agenda-block`, `agenda-add`, `agenda-editor`, `agenda-editor-label`, `agenda-editor-save`, `agenda-notice`,
`agenda-export-open`, `agenda-export`, `agenda-export-copy`, `agenda-export-save`, `bridge-post-entity`,
`project-bridge-post`, `project-bridge-post-edit`, `bridge-post-save`, `agenda-close`.

## Eerste test na de MVP

Uit plan §8, "Eerste test na de MVP":

1. Werk een dag gewoon in twee of drie projecten, met een meeting tussendoor.
2. Eind van de dag:
   - vul in **Projectinstellingen → Algemeen → Bridge-post** de posten in die ontbreken (in het paneel staat bij
     zo'n blok "Geen Bridge-post");
   - open de agenda (⌘J), klik op het away-blok van de meeting, kies "Anders", schrijf "Meeting …" en kies of typ de
     Bridge-post, en sla op;
   - klik **Exporteer voor Bridge** → **Vandaag** → **Kopieer voor chat**.
3. Plak het document in een gewone chat die de Bridge CLI kan gebruiken, en kijk of die de stappen uit plan §6.2
   volgt: toegang, bestaande boekingen, posten controleren, voorstel, dry-run, goedkeuring, boeken, nalezen.
4. Noteer wat niet klopte: toewijzing (plan §2.2–2.3), dagvenster, groepering, de instructietekst. Die punten gaan
   naar fase 3 of naar een bijgestelde regel.

## Tests

| Wat | Commando |
|---|---|
| Pakket (meting, routes, boekdocument) | `pnpm --filter @bonzaiwork/agenda test` en `typecheck` |
| UI-helpers, live-readers, demo-agenda | `pnpm --filter @bonzaiwork/app test` (`features/agenda/format.test.ts`, `backend/live/agenda.test.ts`, `backend/demo/agenda.test.ts`) |
| Screenshots | `docs/bonzaiwork/screenshots/agenda-*.png` |
