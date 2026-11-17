---
type: System
title: "Server-hooks"
description: "Alle BonzaiWork-serverlogica draait als één hookbundel (OPENWORK_SERVER_HOOKS) in het OpenWork-serverproces; downstream-hooks.ts is de enige brug."
tags: [server, hooks]
resource: ../../../../../packages/bonzaiwork-server-hooks
sources:
  - id: readme
    resource: ../references/readme.md
    title: BonzaiWork README
  - id: patches
    resource: ../references/patches.md
    title: PATCHES.md
  - id: feedback
    resource: ../references/feedback.md
    title: Feedback sturen
  - id: breinen
    resource: ../references/project-breinen-plan.md
    title: "Project-breinen: implementatieplan"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Server-hooks

De server laadt bij het starten het bestand uit `OPENWORK_SERVER_HOOKS`. De build bundelt
`packages/bonzaiwork-server-hooks` daarvoor als `server-hooks.js`; `createCombinedHooks` voegt de hooks
van litellm, breinen, routines, agenda, today en feedback samen.[^readme][^feedback]

## Wat een hook kan

`apps/server/src/downstream-hooks.ts` definieert wat de server aanbiedt, en verder niets:[^patches]

- **routes** onder `/bonzaiwork/*`, gestart nadat de server zijn poort heeft gebonden;
- een **provider-allowlist** die vóór het Den-beleid gaat, en **engine-policies** en
  -toestemmingsregels die in de engine-config komen;
- **host-methodes**: sessie-activiteit volgen, MCP-entries en de globale instructies en skills van de
  engine zetten, een chat starten of een vraag beantwoorden via de eigen `/opencode2`-proxy, engine-mappen
  herladen, en de database van de v2-geschiedenis kiezen (`engineHistoryDatabase`).

Het breinenplan had als doel 0 nieuwe patches voor alle breinenfuncties; dat lukte met deze
host-methodes plus één regel in een bestaande hook.[^breinen]

## Rechten

Routes die iets veranderen vragen het host-token; een alleen-lezen-installatie krijgt `403 read_only`.
Feedback vraagt ook voor het verzamelen het host-token, omdat het een screenshot en logs van de host
leest.[^feedback]

## Pakketten

| Pakket | Hooks |
|---|---|
| `@bonzaiwork/litellm` | proxy, keys, status, provider-gate ([LiteLLM-laag](litellm-laag.md)) |
| `@bonzaiwork/brains` | `/bonzaiwork/brains/*`, sync, MCP "breinen" ([Breinen](breinen.md)) |
| `@bonzaiwork/routines` | planner en `/bonzaiwork/routines` ([Routines](routines.md)) |
| `@bonzaiwork/agenda` | meting en `/bonzaiwork/agenda/*` ([Agenda](agenda.md)) |
| `@bonzaiwork/today` | taakindex, kaarten, rondes ([Persoonlijke agent](persoonlijke-agent.md)) |
| `@bonzaiwork/feedback` | `/bonzaiwork/feedback/*` ([Feedback](feedback.md)) |

## Besluiten

- [Een eigen aanhaakpunt voor server-uitbreidingen](../besluiten/platform/server-hooks-aanhaakpunt.md)

[^readme]: README, "Wat er staat" en "Hoe het in elkaar zit".
[^patches]: PATCHES.md, rij `apps/server/src/downstream-hooks.ts`.
[^feedback]: Feedback §4, "Compositie" en "Rechten".
[^breinen]: Breinenplan §3.
