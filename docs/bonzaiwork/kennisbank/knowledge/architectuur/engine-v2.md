---
type: System
title: "Engine v2"
description: "De UI praat alleen met OpenCode v2 via /workspace/:id/opencode2; v1 draait mee maar handhaaft LiteLLM-only niet. v2 krijgt een eigen geschiedenisdatabase."
tags: [engine, opencode, geschiedenis]
sources:
  - id: readme
    resource: ../references/readme.md
    title: BonzaiWork README
  - id: contract
    resource: ../references/frontend-contract.md
    title: Frontend-contract
  - id: patches
    resource: ../references/patches.md
    title: PATCHES.md
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Engine v2

De agent-engine is OpenCode. Per project (workspace) bereikt de UI hem op
`<baseUrl>/workspace/<id>/opencode2`: chats, berichten, prompts en de live eventstream (SSE). Het pad
`/opencode` gaat naar de v1-engine, die LiteLLM-only niet afdwingt; de UI gebruikt het nooit.[^contract]

## v1 draait mee

Upstream heeft v1 teruggezet: de server start bij het opstarten weer een v1-engine. De afdwinging van
LiteLLM zit in de gate en de v2-policies, dus de BonzaiWork-UI blijft bij `/opencode2`. Niet nagelopen
is of v1 via `/opencode` andere providers kan gebruiken; elk proces met het owner-token kan daar
komen.[^readme]

## Model per gesprek

v2 kent geen `model` in de runtime-config. De UI kiest het model per gesprek, met
`/bonzaiwork/status.defaultModel` als standaard (ingebakken `BONZAIWORK_DEFAULT_MODEL`, anders het
eerste model).[^readme]

## Eigen geschiedenis

De server-hook `engineHistoryDatabase` geeft v2 `userData/bonzaiwork/opencode/opencode.db` zolang de
eigen v2-database van de server nog geen chats heeft. Zo toont BonzaiWork geen chats uit een losse
OpenCode-installatie en zet het die gedeelde database niet om. Een expliciete `OPENCODE_DB` gaat voor. De
patch is één regel in `engine-v2-preview.ts`.[^readme][^patches]

## Besluiten

- [Alleen de v2-engine](../besluiten/platform/alleen-engine-v2.md)
- [Eigen database voor de v2-geschiedenis](../besluiten/platform/eigen-v2-geschiedenis.md)

[^contract]: Frontend-contract §3.
[^readme]: README, "Afwijkingen" punten 4 en 5, "Bevindingen", "Eigen chatgeschiedenis".
[^patches]: PATCHES.md, rij `engine-v2-preview.ts`.
