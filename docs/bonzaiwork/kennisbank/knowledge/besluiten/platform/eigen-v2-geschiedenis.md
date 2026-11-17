---
type: Decision
title: "Eigen database voor de v2-geschiedenis"
description: "v2 krijgt userData/bonzaiwork/opencode/opencode.db in plaats van de database die elke OpenCode-installatie deelt; v1 houdt het gedrag van upstream."
tags: [engine, geschiedenis, privacy]
decision_id: kennisbank/eigen-v2-geschiedenis
decision_status: genomen
sources:
  - id: readme
    resource: ../../references/readme.md
    title: "BonzaiWork README"
  - id: patches
    resource: ../../references/patches.md
    title: "PATCHES.md"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Eigen database voor de v2-geschiedenis

## Context

Sinds `v0.18.65` kopieert upstream oude geschiedenis niet meer naar de eigen v2-database van de server.
Zolang die geen chats heeft, krijgt de engine de database die elke OpenCode-installatie deelt
(`$XDG_DATA_HOME/opencode/opencode.db`) en zet upstream die ter plekke om naar v2. BonzaiWork zou dan chats
uit een losse OpenCode-CLI tonen en die database omzetten.[^readme]

## Besluit

De server-hook `engineHistoryDatabase` geeft v2 `userData/bonzaiwork/opencode/opencode.db`. Een expliciete
`OPENCODE_DB` (dev, tests) gaat voor. De patch is één regel in `engine-v2-preview.ts`.[^readme][^patches]

## Gevolgen

- Bestaande BonzaiWork-chats blijven waar ze zijn: de server houdt zijn eigen v2-database aan zodra die
  chats heeft.[^readme]
- Chats die alleen in de gedeelde database staan, toont BonzaiWork niet meer; ze blijven onaangeroerd.[^readme]
- Getest in `downstream-hooks.test.ts`, in `@bonzaiwork/server-hooks` en in de smoketest.[^readme]

## Niet gekozen

- **Een procesbrede `OPENCODE_DB`**: die bereikt ook v1, die het door v2 aangemaakte bestand niet kan
  openen; de verpakte smoketest startte daardoor niet.[^readme]

Zie [Engine v2](../../architectuur/engine-v2.md).

[^readme]: README, "Bevindingen", "Eigen chatgeschiedenis".
[^patches]: PATCHES.md, rij `engine-v2-preview.ts`.
