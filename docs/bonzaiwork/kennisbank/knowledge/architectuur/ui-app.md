---
type: System
title: "De BonzaiWork-app"
description: "React-app in apps/bonzaiwork met één Backend-interface en twee implementaties (live en demo); importeert niets uit de upstream-UI."
tags: [ui, frontend, react]
resource: ../../../../../apps/bonzaiwork
sources:
  - id: app
    resource: ../references/app-readme.md
    title: README van de BonzaiWork-app
  - id: overhaul
    resource: ../references/ui-ux-overhaul.md
    title: "UI/UX-overhaul: Vandaag"
  - id: readme
    resource: ../references/readme.md
    title: BonzaiWork README
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# De BonzaiWork-app

De werkapp: chats met AI, projecten, routines, breinen en de agenda. De app opent op **Vandaag** (wat
wacht op jou, wat loopt, wat gebeurde terwijl je weg was); projecten zijn containers met
tabbladen.[^app][^overhaul]

## Twee backends, één interface

Alle schermen praten met `Backend` (`src/backend/types.ts`); `src/backend/select.ts` kiest er één.[^app]

| Backend | Wanneer | Wat |
|---|---|---|
| Live (`src/backend/live/`) | in de desktopshell, of in dev met `?server=…&token=…` | de lokale OpenWork-server, de v2-engine per project en de `/bonzaiwork/*`-routes |
| Demo (`src/backend/demo/`) | overal anders | draait in de browser met voorbeeldprojecten en alle staten, in `localStorage` |

Ontbreekt een BonzaiWork-route op de server (een 404), dan toont de UI de vergrendelde staat in plaats
van een fout, of bewaart ze metadata per apparaat.[^app]

## Los van de upstream-UI

De UI importeert niets uit `apps/app`; de server- en engineclient zijn eigen code. Upstream-wijzigingen
in hun UI raken deze app dus niet.[^app][^readme]

## Stack

Vite, React 19, TypeScript strict zonder `any` of `as`, Tailwind CSS v4, Base UI, TanStack Query,
zustand. Alle teksten in `copy.ts`, in het Nederlands; serverfouten worden Nederlandse zinnen per `code`
(`http.ts`). Vormgeving volgt `DESIGN.md`.[^app]

## Besluiten

- [Een eigen UI zonder imports uit apps/app](../besluiten/platform/eigen-ui.md)
- [Project is een workspace](../besluiten/platform/project-is-workspace.md)
- [De app opent op Vandaag](../besluiten/functies/vandaag-als-start.md)
- [Eén begrip Agent](../besluiten/functies/een-begrip-agent.md)

[^app]: App-README, inleiding, "Twee backends", "Wat de live backend doet" en "Stack".
[^overhaul]: UI/UX-overhaul §2.
[^readme]: README, "Merge-test" (laatste alinea) en "Afwijkingen" punt 2.
