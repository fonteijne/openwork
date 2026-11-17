---
type: Decision
title: "Alleen de v2-engine"
description: "De UI praat uitsluitend met /workspace/:id/opencode2; het model wordt per gesprek gekozen, met defaultModel uit /bonzaiwork/status."
tags: [engine, opencode]
decision_id: readme/afwijking-4
decision_status: genomen
sources:
  - id: readme
    resource: ../../references/readme.md
    title: "BonzaiWork README"
  - id: contract
    resource: ../../references/frontend-contract.md
    title: "Frontend-contract"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Alleen de v2-engine

## Context

Upstream heeft OpenCode v1 teruggezet: de server start weer een v1-engine, en `/workspace/:id/opencode/*`
gaat naar v1; v2 zit op `/opencode2/*`. De afdwinging van LiteLLM-only zit in de gate en in de
v2-policies.[^readme]

## Besluit

De BonzaiWork-UI praat uitsluitend met `/opencode2` (`apps/bonzaiwork/src/backend/live/engine.ts`). Omdat
v2 geen `model` in de runtime-config kent, kiest de UI het model per gesprek, met
`/bonzaiwork/status.defaultModel` als standaard.[^readme][^contract]

## Gevolgen

- De v1-engine draait mee. Niet nagelopen is of v1 via `/opencode` nog andere providers kan gebruiken;
  onze UI komt er niet, maar elk proces met het owner-token wel. Een hook die de v1-start overslaat ligt
  voor de hand.[^readme]
- [Eigen database voor de v2-geschiedenis](eigen-v2-geschiedenis.md) geldt bewust alleen voor v2.

Zie [Engine v2](../../architectuur/engine-v2.md).

[^readme]: README, "Afwijkingen" punten 4 en 5 en "Bevindingen" (v1-engine draait mee).
[^contract]: Frontend-contract §3.
