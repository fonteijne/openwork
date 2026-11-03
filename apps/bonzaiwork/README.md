# @bonzaiwork/app: de BonzaiWork-UI

De werkapp van BonzaiWork: één werkplek voor chats met AI, projecten, routines, breinen en de agenda. De app
opent op **Vandaag** (wat wacht op jou, wat loopt, wat gebeurde terwijl je weg was); projecten zijn containers
met tabbladen. Ontwerp: [`docs/bonzaiwork/ui-ux-overhaul.md`](../../docs/bonzaiwork/ui-ux-overhaul.md), stand van
zaken: [`docs/bonzaiwork/ui-ux-overhaul-stand.md`](../../docs/bonzaiwork/ui-ux-overhaul-stand.md).
Gebouwd volgens het frontend-contract (`docs/bonzaiwork/frontend-contract.md`) en de ontwerpregels uit
`DESIGN.md`. De Electron-entry en het verpakken staan in `desktop-main/` en `scripts/`; zie
`docs/bonzaiwork/README.md` voor het geheel.

```bash
pnpm --filter @bonzaiwork/app dev          # http://localhost:5183 (demo, zonder server)
pnpm --filter @bonzaiwork/app typecheck
pnpm --filter @bonzaiwork/app test         # vitest: planning, markdown, v2-engine, prompt-codering, serverfouten
pnpm --filter @bonzaiwork/app build        # dist/, relatieve paden voor file:// in Electron
```

## Twee backends, één interface

Alle schermen praten met `Backend` (`src/backend/types.ts`). `src/backend/select.ts` kiest er één; beide
zijn een eigen chunk.

| Backend | Wanneer | Wat |
| --- | --- | --- |
| **Live** (`src/backend/live/`) | In de desktopshell (`window.__OPENWORK_ELECTRON__`), of in dev met `?server=…&token=…` | De lokale OpenWork-server, de native OpenCode v2-engine per project (`/workspace/:id/opencode2/api/…`, SSE-events) en de BonzaiWork-routes (`/bonzaiwork/keys/…`). |
| **Demo** (`src/backend/demo/`) | Overal anders, zoals `pnpm dev` zonder server | Draait in de browser: voorbeeldprojecten, streamende antwoorden met stappen, toestemmingen, vragen, foutstaten, routines met gemiste runs. Staat in `localStorage`. |

Demo-schakelaars in de URL (vóór de `#`): `?demo=leeg` begint zonder projecten, `?sleutel=gebruiker`
zet keys per gebruiker (O1), `?voorkeur=geen` geeft een key zonder voorkeursmodellen. Typ in een chat "budget op" of `#fout` voor de foutstaten.

Live in dev: start de server zoals in `docs/bonzaiwork/README.md` ("Ontwikkelen") en open
`http://localhost:5183/?server=http://127.0.0.1:8787&token=dev&hostToken=dev-host`. Zonder `hostToken` is
de app alleen-lezen. Zonder `OPENWORK_APPROVAL_MODE=auto` (de desktopshell zet dat) wachten schrijfacties
30 s op goedkeuring en geeft de server `write_denied`.

### Wat de live backend doet

- **Projecten** zijn workspaces. Kleur, icoon, beschrijving, vastzetten en archiveren horen bij de
  metadata-routes uit contract §7; zolang `/bonzaiwork/projects` een 404 geeft, bewaart de app ze per
  apparaat (`meta.ts`, `capabilities.projectMeta`).
- **Chats** via de v2-engine: sessies, berichtpagina's, prompt (met `steer` tijdens een run), stoppen,
  terugdraaien en herstellen, afsplitsen, model en agent per chat. Events zijn hints; na een run haalt de
  app de historie opnieuw op.
- **Bijlagen** gaan naar de inbox van het project, in OpenWorks eigen promptformaat.
- **Toestemmingen en vragen** als kaart boven de composer en op Vandaag; ⏎/esc/1–9 werken alleen op de
  gefocuste kaart, nooit window-breed.
- **Voor jou** komt uit één poll (`attention.list()`, 10 s) in plaats van vijf klokken; `chats.recent(n)`
  voedt het palet en "Terwijl je weg was".
- **Projectinstellingen** in vier groepen (Project · Agent · Toegang · Technisch) met eerst een Overzicht:
  key en modellen, instructies, werkwijzen (skills en commando's), connecties, extra mappen en activiteit.
  Bestanden en het brein zijn eigen tabbladen. Globale skills en commando's zijn alleen-lezen.
- **Serverfouten** worden Nederlands (`http.ts`); de Engelse zin van de server blijft op `detail`.
- **Agenda** (contract §7.6, [`docs/bonzaiwork/agenda.md`](../../docs/bonzaiwork/agenda.md)): statusrij in de
  zijbalkvoet, niet-modaal paneel (⌘J) met Dagkaart, weekstrook, tijdlijn, wijzigen en ongedaan maken,
  "Boek in een chat" en de Bridge-post per project. Rekent met `@bonzaiwork/agenda/model`, net als de server; zonder agenda op de server staat de pil op slot.
- **Routines, verbruik en zoeken in inhoud** hebben de §7-routes nodig en tonen tot dan hun vergrendelde
  staat (DESIGN.md P4).

De UI importeert niets uit `apps/app`: de server- en engineclient zijn eigen code. Upstream-wijzigingen in
hun UI raken deze app dus niet.

## Stack en vormgeving

Vite 6, React 19, TypeScript (strict, geen `any` of `as`), Tailwind CSS v4, Base UI, TanStack Query,
zustand, marked + DOMPurify, lucide-react.

- **Lettertype**: Manrope (variabel, `@fontsource-variable/manrope`, alleen de Latijnse subset laadt). Tekst
  op 500, koppen op 600.
- **Kleuren** (`src/styles.css`): ink-neutralen (#232323 tot wit), zand (#F2E9E4) voor de zijbalk en warme
  vlakken, en één elektrisch blauw (#0000D2) voor de primaire actie, focus en "bezig". In donker: #232323
  met zandkleurige tekst en een lichter blauw. Alle tekstkleuren halen WCAG AA op wit én op zand.
- **Vormen**: knoppen, velden en navigatie als pil, kaarten en dialogen met 24px hoeken, menu's 16px,
  nauwelijks schaduw. De actieve plek in de zijbalk is een witte pil op zand.

## Structuur

```
src/
  main.tsx, app.tsx      opstart, hash-router, eerste-start-poort, lazy pagina's
  copy.ts                alle teksten (Nederlands, DESIGN.md C1–C7); zie "Copy" hieronder
  styles.css             tokens, thema's (licht en donker zand), prose, reduced motion
  backend/               types (Backend, AttentionItem), queries, demo/, live/
  components/ui/         primitieven op Base UI: Button, Field, Dialog/Sheet, Menu, Select, Tooltip, Toast,
                         Popover, Tabs, SegmentedControl, RadioCards, Disclosure, Chip/StatusChip, Callout,
                         Progress, Command (palet), Kbd-rij
  features/
    shell/               app-shell, zijbalk, tabbalk (telefoon), ⌘K-palet, sneltoetsenblad, ui-store
    home/                Vandaag: composer met projectpil, Voor jou-kaarten, Bezig, Terwijl je weg was,
                         Je werkdag, Projecten
    project/             projectkop met wisselaar en tabs, Bestanden, Details-kolom, projectruntime
    chat/                chatweergave, composer, kaarten, stappenvouw, chatlijst in de zijbalk, lezer (?bestand=)
    projects/            Alle projecten, dialoog Nieuw project, uiterlijk en starters
    onboarding/          #/welkom, één scherm
    settings/            projectinstellingen (vier groepen + Overzicht) en app-instellingen
    routines/            gegroepeerde lijst, fix op de rij, editor als zin
    agenda/              statusrij, paneel, Dagkaart, weekstrook, editor, boeken
    brain/               Brein-tab, Jouw brein, Actie nodig-kaart, kennis, geschiedenis, koppelen
  lib/                   router, sneltoetsen (één tabel), opmaak (nl-NL), planning (DST), tools in woorden,
                         markdown, idle, lazy modules
```

Routes (hash, zodat de build ook vanaf `file://` werkt):

| Route | Scherm |
| --- | --- |
| `#/` | Vandaag |
| `#/projecten` | Alle projecten (lijst, archief, nieuw) |
| `#/p/:id` | Project · Werk |
| `#/p/:id/c/:chat` | Chat (een geopend bestand als `?bestand=<pad>` in de hash) |
| `#/p/:id/bestanden` | Project · Bestanden |
| `#/p/:id/routines[/:rid]` | Project · Routines |
| `#/p/:id/brein` | Project · Brein |
| `#/p/:id/instellingen[/:groep]` | Project · Instellingen; `project`, `agent`, `toegang`, `technisch`. Oude secties (`general`, `key`, `instructions`, `skills`, `commands`, `connections`, `permissions`, `activity`, `files`, `brain`) blijven als alias. |
| `#/routines[/:rid]` | Routines van alle projecten |
| `#/brein` | Jouw brein (het persoonlijke brein; geen projectrij) |
| `#/instellingen[/:groep]` | App-instellingen; `toegang`, `weergave`, `agenda`, `breinen`, `alle`, `technisch` |
| `#/welkom` | Eerste start; zonder projecten gaan `#/`, `#/routines` en `#/instellingen` hierheen |

Een onbekend id of pad geeft een niet-gevonden-staat in de pagina; de zijbalk blijft gevuld.

### Shell

- **Zijbalk** (zand, overal dezelfde vorm): Vandaag (met teller), Routines, Jouw brein, Instellingen, dan de
  projecten (vastgezet eerst, statuswoord per rij, `Geen key` met slot). Het open project klapt uit naar zijn
  chats met "Nieuwe chat ⌘N", groepen als filterpillen, vastgezette chats en een ingeklapt archief. Onderaan de
  agenda-statusrij (`agenda-pill`) en het hulpmenu.
- **Bovenbalk**: de paginatitel is het focale element; rechts hoogstens twee paginacties en op project en chat
  "Details" (⌘\). Geen agenda- of breinpil meer.
- **Breedtes**: ≥1280 zijbalk + inhoud + Details-kolom; 1024–1279 Details als niet-modale overlay; 640–1023
  zijbalk als lade; <640 lade plus tabbalk (Vandaag · Projecten · Routines · Meer). De composer plakt op de
  telefoon onderaan.
- **Projectruntime**: `ProjectRuntimeProvider` zit in de projectpagina en de uitgeklapte zijbalkrij, niet in
  de shell; de laatste drie runtimes blijven geparkeerd en worden losgelaten als het venster verborgen raakt.
- **Sneltoetsen**: één tabel in `src/lib/shortcuts.ts` (⌘0 Vandaag, ⌘K zoeken, ⌘N nieuwe chat, ⌘⇧N nieuw
  project, ⌘⇧P project wisselen, ⌘1…9 vastgezette projecten, ⌘J agenda, ⌘\ Details, ⌘/ zijbalk, ⌘, instellingen,
  ⌘[ / ⌘] terug/vooruit, ⌘⇧/ sneltoetsen, ⌘⇧U alles gezien). De listener, het palet, tooltips en het
  sneltoetsenblad lezen dezelfde tabel; Windows en Linux tonen Ctrl.

### Copy

Alle teksten staan in `src/copy.ts`, per gebied: `home` (Vandaag), `shell` (zijbalk, tabbalk, sneltoetsen),
`project` (tabs, Werk, Bestanden, Details), `attention` (Voor jou-kaarten per soort), en daarnaast `chat`,
`chatList`, `permission`, `question`, `projects`, `newProject`, `onboarding`, `settings`, `routines`,
`palette`, `brain`, `agenda`, `errors`, `ui`, `common`. Geen feature-lokale copybestanden. Regels: verb-first,
zin-case, nooit "LiteLLM", "workspace", "MCP" of een model-id in een rij; een actie houdt zijn naam door de
flow ("Nu uitvoeren" → "Gestart").

## Kwaliteit

- **Snel**: alleen Vandaag en de shell zitten in de eerste chunk; andere pagina's, het commandopalet en
  dialogen laden per route of bij eerste gebruik. Base UI-popups (menu's, tooltips, dialogen, toasts) laden in
  rusttijd of bij eerste gebruik. Een statisch skelet in `index.html` (zijbalk plus de vorm van Vandaag) geeft de eerste paint zonder JS.
- **Toegankelijk**: landmarks, iconknoppen met een naam, focus-trap en esc in dialogen, focus terug naar de
  trigger, toetsenbord in lijsten en menu's, contrast AA, `prefers-reduced-motion`.
- **Mobiel**: geen horizontale scroll; de zijbalk wordt een lade met een tabbalk eronder, Details een sheet.
- **Smoketest**: `scripts/smoke-packaged.mjs` stuurt de verpakte app aan via `data-testid`'s
  (`litellm-key-input`, `litellm-key-submit`, `litellm-server`, `new-workspace`, `workspace-item`,
  `composer-input`, `composer-send`, `chat-messages`) en `data-role="assistant"`. Houd die stabiel; de agenda heeft
  eigen `agenda-*`-testids (zie `docs/bonzaiwork/agenda.md`). De eerste start is één scherm: vul ook
  `project-name` in; na "Begin" landt de app op Vandaag (`new-workspace`/`workspace-item` staan op `#/projecten`).
- **Bewijs**: headless screenshots van de demo (1280 licht en donker, 390 licht) in
  `docs/bonzaiwork/screenshots/overhaul/`.

## Open beslissingen (contract §8)

| | Zo opgelost |
| --- | --- |
| O1 key per gebruiker of project | Beide; de server bepaalt (`keyMode`). |
| P1 project = één map | Ja, met "Extra mappen" in de projectinstellingen. |
| P2 waar nieuwe projecten komen | Standaardmap (instelbaar, anders de gedeelde BonzaiWork-map of `~/BonzaiWork`); in de desktop-app kan ook een bestaande map. |
| P3 project verwijderen | Alleen loskoppelen; de map blijft staan. |
| R1 gemiste routines | Groep "Gemist" met "De app was dicht om 09:00 · Nu uitvoeren", ook als kaart in Voor jou. |
| R2 routine zonder toestemming | Wacht op de gebruiker; routine en chat staan dan op "wacht op jou". |
