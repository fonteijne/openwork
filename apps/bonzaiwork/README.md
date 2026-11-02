# @bonzaiwork/app: de BonzaiWork-UI

De werkapp van BonzaiWork: projecten, chats met AI, routines en instellingen in één app, project first.
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
- **Toestemmingen en vragen** als kaart boven de composer (⏎ toestaan, esc weigeren).
- **Projectinstellingen**: key en modellen, instructies, skills, commando's, connecties (MCP), extra mappen,
  bestanden en activiteit. Globale skills en commando's zijn alleen-lezen.
- **Serverfouten** worden Nederlands (`http.ts`); de Engelse zin van de server blijft op `detail`.
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
  main.tsx, app.tsx      opstart, hash-router, lazy pagina's
  copy.ts                alle teksten (Nederlands, DESIGN.md C1–C7)
  styles.css             tokens, thema's, prose, reduced motion
  backend/               types, queries, demo/, live/
  components/ui/         Button, Field, Dialog/Sheet, Menu, Select, Tooltip, Toast, …
  features/              onboarding, projects, project + chat, settings, routines, shell
  lib/                   opmaak (nl-NL), planning (DST), tools in woorden, markdown, idle, lazy modules
```

Routes (hash, zodat de build ook vanaf `file://` werkt): `#/`, `#/p/:id`, `#/p/:id/c/:chat`,
`#/p/:id/routines[/:rid]`, `#/p/:id/instellingen[/:sectie]`, `#/routines[/:rid]`, `#/instellingen`.

## Kwaliteit

- **Snel**: alleen de projectlijst zit in de eerste chunk; andere pagina's, het commandopalet en dialogen
  laden per route of bij eerste gebruik. Base UI-popups (menu's, tooltips, dialogen, toasts) laden in
  rusttijd of bij eerste gebruik. Een statisch skelet in `index.html` geeft de eerste paint zonder JS.
- **Toegankelijk**: landmarks, iconknoppen met een naam, focus-trap en esc in dialogen, focus terug naar de
  trigger, toetsenbord in lijsten en menu's, contrast AA, `prefers-reduced-motion`.
- **Mobiel**: geen horizontale scroll; de zijbalk wordt een lade, de sidecar een sheet.
- **Smoketest**: `scripts/smoke-packaged.mjs` stuurt de verpakte app aan via `data-testid`'s
  (`litellm-key-input`, `litellm-key-submit`, `litellm-server`, `new-workspace`, `workspace-item`,
  `composer-input`, `composer-send`, `chat-messages`) en `data-role="assistant"`. Houd die stabiel.

## Open beslissingen (contract §8)

| | Zo opgelost |
| --- | --- |
| O1 key per gebruiker of project | Beide; de server bepaalt (`keyMode`). |
| P1 project = één map | Ja, met "Extra mappen" in de projectinstellingen. |
| P2 waar nieuwe projecten komen | Standaardmap (instelbaar, anders de gedeelde BonzaiWork-map of `~/BonzaiWork`); in de desktop-app kan ook een bestaande map. |
| P3 project verwijderen | Alleen loskoppelen; de map blijft staan. |
| R1 gemiste routines | Tonen als "Gemist: de app was gesloten", met "Nu uitvoeren". |
| R2 routine zonder toestemming | Wacht op de gebruiker; routine en chat staan dan op "wacht op jou". |
