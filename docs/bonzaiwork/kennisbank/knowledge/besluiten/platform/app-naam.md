---
type: Decision
title: "App-naam BonzaiWork"
description: "App-naam BonzaiWork, prefix bonzaiwork; appId voorlopig nl.bonzaiwork.desktop. Signing en updater-host staan nog open."
tags: [naam, build, distributie]
decision_id: referentie/O4
decision_status: voorlopig
sources:
  - id: referentie
    resource: ../../references/referentie.md
    title: "Referentie: de opdracht"
  - id: readme
    resource: ../../references/readme.md
    title: "BonzaiWork README"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# App-naam BonzaiWork

## Context

Open beslissing O4: definitieve app-naam, `appId`, signing-certificaten en updater-host.[^referentie]

## Besluit

- App-naam **BonzaiWork**, map- en pakketprefix `bonzaiwork` (zoals `openwork`).
- `appId` voorlopig `nl.bonzaiwork.desktop`.[^readme]

## Gevolgen

- Signing en de updater-host zijn nog niet besloten. Tot er een updater-hook is, kan de upstream-updater
  zich naar OpenWork "updaten"; onze UI start nooit een updatecheck en `publish` staat uit.[^readme]
- Iconen, de eerste workspace "OpenWork Chat" en de juridische check op naam en logo (O5) staan open.[^readme]

[^referentie]: Referentie §8 (O4, O5).
[^readme]: README, "Genomen beslissingen" (O4) en "Bevindingen" (Updater, Branding).
