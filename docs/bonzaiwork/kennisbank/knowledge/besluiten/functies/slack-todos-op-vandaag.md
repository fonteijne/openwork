---
type: Decision
title: "Slack-to-do's als eigen lijst op Vandaag"
description: "Je eigen Slack-to-do's staan in een eigen lijst op Vandaag en worden daar in Slack zelf afgevinkt; ze worden geen taak in een brein en de agent komt er niet aan."
tags: [vandaag, slack, taken]
decision_id: persoonlijke-agent/T12
decision_status: genomen
sources:
  - id: agent
    resource: ../../references/persoonlijke-agent-plan.md
    title: "Persoonlijke agent op Vandaag"
generated: {by: claude-opus-5-5, at: 2026-11-17T15:35:30.277Z}
status: draft
---
# Slack-to-do's als eigen lijst op Vandaag

## Context

Slack heeft sinds oktober 2026 een eigen to-do-lijst (Later heet nu To-dos). De gebruiker wil die op
Vandaag zien en daar afvinken. Slack heeft er geen openbare API voor; alleen de interne `saved.*`-methodes
van de webclient, die met de sessie van het Slack-script werken.[^agent]

## Besluit

- Een **eigen lijst** "To-do's in Slack" naast "Komt eraan", geen kopie als taak in een brein. Slack blijft
  de bron; afvinken op Vandaag vinkt in Slack af (`todo_done`), met "Ongedaan maken".[^agent]
- Het Slack-script krijgt `todos` en `todo_done`; BonzaiWork praat niet zelf met Slack.[^agent]
- De agent krijgt **geen tool** voor deze lijst. Afvinken gebeurt alleen na de klik van de gebruiker.[^agent]
- Een eigen schakelaar (`slackTodos`, standaard uit), alleen zichtbaar met Slack aan (T10).[^agent]

## Gevolgen

- Slack kan de interne methodes zonder aankondiging veranderen; dan zegt de sectie waarom ze niet te
  lezen is en blijft de rest van Vandaag werken.
- Een Slack-to-do telt niet mee in "Start hier" of "Komt eraan", wel in "afgerond vandaag".

## Niet gekozen

- Slack-to-do's als regel in `taken.md`: twee bronnen die uit elkaar lopen, en een vinkje in Slack zou
  BonzaiWork niet zien.
- Opnemen in "Komt eraan": de meeste Slack-to-do's hebben geen datum en zouden daar wegvallen.
- De agent ze laten kiezen voor "Start hier": groter, en eerst zien of de lijst zelf bevalt.

[^agent]: Plan persoonlijke agent §1 (T12) en §3.1.
