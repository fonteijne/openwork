---
type: System
title: "Routines"
description: "Een prompt die op een schema in een project draait en een nieuwe chat oplevert; de planner draait in het serverproces, dus alleen als de app open is."
tags: [routines, planner]
resource: ../../../../../packages/bonzaiwork-routines
sources:
  - id: contract
    resource: ../references/frontend-contract.md
    title: Frontend-contract
  - id: readme
    resource: ../references/readme.md
    title: BonzaiWork README
  - id: code
    resource: ../../../../../packages/bonzaiwork-routines/src/routines.ts
    title: routines.ts
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Routines

Een routine is een prompt die op een schema in een project draait en een nieuwe chat oplevert; een
lokale variant van een automation.[^contract] De planner (`packages/bonzaiwork-routines`) draait in
het serverproces: opslag, schema, runs als chat, en breinen per routine.[^readme]

## Gedrag

- Alleen terwijl de app open is. Een run die viel terwijl de app dicht was, telt als **gemist** en wordt
  niet ingehaald (beslissing R1, `skipped` met `app_closed`).[^contract] De UI toont "Nu uitvoeren".
- Een routine kan breinen noemen die hij zonder klik mag lezen; de planner beantwoordt de vraag van de
  engine dan voor die breinen, en alleen voor zijn eigen runs.[^code]
- De routes staan in contract §7.4 (`/bonzaiwork/routines`); zonder die routes toont de UI de
  vergrendelde staat.[^contract]

## Zie ook

- [Server-hooks](server-hooks.md)
- [Persoonlijke agent](persoonlijke-agent.md): de rondes van de agent zijn routines.

[^contract]: Frontend-contract §2 (Routine), §5.6, §7.4 en §8 (R1).
[^readme]: README, "Wat er staat".
[^code]: Commentaar bovenaan `routines.ts`.
