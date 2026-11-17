---
type: Decision
title: "Builder-config als .mjs"
description: "De electron-builder-config is apps/desktop/electron-builder.bonzaiwork.mjs: hij leest upstream's YAML en vervangt alleen UI, entry, identiteit en publish."
tags: [build, electron, upstream]
decision_id: readme/afwijking-6
decision_status: genomen
sources:
  - id: readme
    resource: ../../references/readme.md
    title: "BonzaiWork README"
  - id: referentie
    resource: ../../references/referentie.md
    title: "Referentie: de opdracht"
  - id: breinen
    resource: ../../references/project-breinen-plan.md
    title: "Project-breinen: implementatieplan"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Builder-config als .mjs

## Context

De referentie ging uit van een YAML-overlay op upstream's electron-builder-config (§6.A5).[^referentie]
electron-builder voegt arrays samen bij `extends`: een YAML-overlay zou hun UI naast de onze in
`app-dist` zetten en hun GitHub-publish-doel houden.[^readme]

## Besluit

Een eigen `apps/desktop/electron-builder.bonzaiwork.mjs` die hun YAML inleest en alleen UI, entry,
identiteit en `publish` vervangt.[^readme]

## Gevolgen

- Upstream-wijzigingen in de builder-config komen vanzelf mee.
- Het is een nieuw bestand in een eigen pad; het staat niet in `PATCHES.md`.
- Het meeleveren van git (dugite) voor de breinen gaat via dit bestand, zonder patch.[^breinen]

[^referentie]: Referentie §6, werkstroom A.
[^readme]: README, "Afwijkingen" punt 6.
[^breinen]: Breinenplan §3 (bestandenlijst).
