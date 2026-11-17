---
type: System
title: "BonzaiWork in één schema"
description: "Eigen UI en Electron-entry boven een ongewijzigde OpenWork-server, met BonzaiWork-logica in server-hooks en LiteLLM als enige provider."
tags: [architectuur, overzicht]
resource: ../../../../../apps/bonzaiwork
sources:
  - id: readme
    resource: ../references/readme.md
    title: BonzaiWork README
  - id: referentie
    resource: ../references/referentie.md
    title: "Referentie: de opdracht"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# BonzaiWork in één schema

BonzaiWork is een eigen desktop-app op basis van OpenWork: een volledig eigen UI, LiteLLM als enige
modelprovider, en upstream-releases die blijvend terug te mergen zijn.[^referentie]

```
Electron main (apps/bonzaiwork/desktop-main/main.ts)
  ├─ env: BONZAIWORK_* (ingebakken), OPENWORK_SERVER_HOOKS=<bundel>/server-hooks.js
  ├─ registerKeyStore / registerPresenceSource / DiagnosticsSource   (OS-keychain, focus, screenshot)
  └─ import upstream electron/main.mjs (ongewijzigd)
        └─ openwork-server (in-process) laadt OPENWORK_SERVER_HOOKS
             ├─ provider-gate + engine-policies: alleen "litellm"
             ├─ v2-geschiedenis in userData/bonzaiwork/opencode/opencode.db
             └─ routes /bonzaiwork/*: litellm-proxy, keys, status, brains, routines, agenda, today, feedback
BonzaiWork UI (apps/bonzaiwork, React) ──▶ /workspaces, /workspace/:id/opencode2/*, /bonzaiwork/*
```

Naar het schema in de README.[^readme]

## De lagen

| Laag | Wat | Concept |
|---|---|---|
| UI | `apps/bonzaiwork`: React-app met een live en een demo-backend | [De BonzaiWork-app](ui-app.md) |
| Shell | `apps/bonzaiwork/desktop-main`: zet de omgeving en registreert stores, start daarna upstream | [Upstream-laag](upstream-laag.md) |
| Server | de upstream OpenWork-server, uitgebreid via één aanhaakpunt | [Server-hooks](server-hooks.md) |
| Engine | OpenCode v2, per project, alleen via `/opencode2` | [Engine v2](engine-v2.md) |
| Modellen | LiteLLM achter een loopback-proxy met key-injectie | [LiteLLM-laag](litellm-laag.md) |
| Functies | breinen, routines, agenda, persoonlijke agent, feedback | [Breinen](breinen.md), [Routines](routines.md), [Agenda](agenda.md), [Persoonlijke agent](persoonlijke-agent.md), [Feedback](feedback.md) |
| Werkwijze | branches, upstream-sync, CI, promoveren | [Releasestroom](release-stroom.md) |

## Wat altijd geldt

- [Harde eisen E1–E7](../eisen/harde-eisen.md) en de [gouden regel](../eisen/gouden-regel.md):
  importeren, niet aanpassen.
- Alles van BonzaiWork staat in eigen paden: `apps/bonzaiwork`, `packages/bonzaiwork-*`,
  `docs/bonzaiwork`, `scripts/bonzaiwork`. Wat daarbuiten verandert, staat in `PATCHES.md`.

[^readme]: README, "Hoe het in elkaar zit".
[^referentie]: Referentie §1.
