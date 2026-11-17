---
type: Decision
title: "De app opent op Vandaag"
description: "De startpagina is Vandaag: wat op je wacht, wat loopt, wat gebeurde terwijl je weg was en je werkdag; projecten zijn containers met tabbladen."
tags: [ui, vandaag, navigatie]
decision_id: kennisbank/vandaag-als-start
decision_status: genomen
sources:
  - id: overhaul
    resource: ../../references/ui-ux-overhaul.md
    title: "UI/UX-overhaul: Vandaag"
  - id: app
    resource: ../../references/app-readme.md
    title: "README van de BonzaiWork-app"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# De app opent op Vandaag

## Context

Een kenniswerker denkt niet in projecten maar in *wat wacht op mij, wat loopt, wat gebeurde terwijl ik
weg was, wat deed ik vandaag*.[^overhaul]

## Besluit

- De app opent op **Vandaag** (`#/`): één composer die werk start in elk project, daaronder **Voor jou**
  (elke open beslissing, ter plekke te beantwoorden), **Bezig**, **Terwijl je weg was** en de werkdag.
- Projecten zijn containers met tabbladen; de zijbalk heeft op elk scherm dezelfde vorm.
- Focusregel: het eerste wat jou nodig heeft is het focale element; is er niets, dan de
  composer.[^overhaul]

## Gevolgen

- De projectenlijst verhuisde naar `#/projecten`.[^overhaul]
- "Voor jou" komt uit één poll (`attention.list()`, elke 10 s) in plaats van vijf klokken.[^app]
- De [persoonlijke agent](../../architectuur/persoonlijke-agent.md) voegt later ook wat van de wereld op je wacht aan
  Vandaag toe.

Zie [De BonzaiWork-app](../../architectuur/ui-app.md).

[^overhaul]: UI/UX-overhaul §2 en §3.
[^app]: App-README, "Wat de live backend doet".
