---
type: Decision
title: "Een eigen UI zonder imports uit apps/app"
description: "De BonzaiWork-UI is een nieuwe app in apps/bonzaiwork met eigen clients voor server, engine en desktop-bridge; hij importeert niets uit de upstream-UI."
tags: [ui, upstream]
decision_id: readme/afwijking-2
decision_status: genomen
sources:
  - id: referentie
    resource: ../../references/referentie.md
    title: "Referentie: de opdracht"
  - id: readme
    resource: ../../references/readme.md
    title: "BonzaiWork README"
  - id: app
    resource: ../../references/app-readme.md
    title: "README van de BonzaiWork-app"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Een eigen UI zonder imports uit apps/app

## Context

Eis E2 vraagt een volledig eigen UI in een nieuwe app, zonder `apps/app` aan te passen; importeren mocht
volgens de referentie wel.[^referentie] Hun UI verandert erg vaak: `apps/app/src` had ±1.350
bestandswijzigingen in 30 dagen, `domains/session` het meest.[^referentie]

## Besluit

De UI staat in `apps/bonzaiwork` en importeert **niets** uit `apps/app`, ook niet `domains/session`. De
server-, engine- en desktop-bridgeclient zijn eigen code in `apps/bonzaiwork/src/backend/live/`.[^readme][^app]

## Gevolgen

- Upstream-wijzigingen in hun UI-clients geven geen compileer- of mergefouten in onze app.[^readme]
- Wij onderhouden zelf de clients voor de server-API en de v2-engine.
- Geen Den-, cloud-, analytics- of telemetriecode in de bundel (E6).[^readme]

## Niet gekozen

- **`domains/session` importeren** (referentie §6.A3): gemeten sleept `session-page.tsx` 499
  bronbestanden mee, waaronder 19 Den-modules, 26 uit `domains/cloud`, analytics en telemetrie.[^readme]
- **Alleen hun framework-vrije clients importeren**: zo begon de eerste spike; losgelaten omdat die
  bestanden vaak veranderen.[^readme]

Zie [De BonzaiWork-app](../../architectuur/ui-app.md).

[^referentie]: Referentie §2 (E2) en §3.
[^readme]: README, "Afwijkingen" punt 2 en "Merge-test".
[^app]: App-README, "Wat de live backend doet" (laatste alinea).
