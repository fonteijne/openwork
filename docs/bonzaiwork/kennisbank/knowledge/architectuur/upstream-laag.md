---
type: System
title: "Upstream-laag"
description: "Hoe BonzaiWork op OpenWork staat: eigen paden, minimale hooks in upstream-bestanden, PATCHES.md en de Electron-entry die upstream ongewijzigd laadt."
tags: [upstream, fork, patches]
resource: ../../../../../PATCHES.md
sources:
  - id: referentie
    resource: ../references/referentie.md
    title: "Referentie: de opdracht"
  - id: patches
    resource: ../references/patches.md
    title: PATCHES.md
  - id: readme
    resource: ../references/readme.md
    title: BonzaiWork README
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Upstream-laag

BonzaiWork is een fork van `different-ai/openwork`. Nieuwe functionaliteit komt in eigen mappen; een
upstream-bestand verandert alleen via een zo klein mogelijk aanhaakpunt, en elke zo'n wijziging staat in
`PATCHES.md`.[^referentie]

## Wat er gepatcht is

Vier upstream-bestanden in de server krijgen een hook van een paar regels (`server.ts`,
`organization-provider-gate.ts`, `managed-opencode-v2.ts`, `engine-v2-preview.ts`), plus één nieuw
bestand in een upstream-map: `apps/server/src/downstream-hooks.ts`, het aanhaakpunt zelf, zonder
BonzaiWork-logica. Daarnaast twee issue-formulieren en één regel in `AGENTS.md`.[^patches]
`scripts/bonzaiwork/check-patches.mjs` laat CI falen als een wijziging ontbreekt in `PATCHES.md`, of als
een rij niet meer van upstream verschilt; het vergelijkt met de commit in `bonzaiwork.upstream.json`.
Boven ±10 gepatchte bestanden herzien we de aanpak.[^patches]

## De Electron-entry

`apps/bonzaiwork/desktop-main/main.ts` zet de omgeving (`BONZAIWORK_*`, `OPENWORK_SERVER_HOOKS`, de
uitschakelaars voor gratis en gehoste modellen), registreert de keychain-store en de
aanwezigheidsbron, en laadt daarna de **ongewijzigde** upstream `main.mjs`. De builder-config
(`apps/desktop/electron-builder.bonzaiwork.mjs`) leest de YAML van upstream in en vervangt alleen UI,
entry, identiteit en `publish`.[^readme]

## Merge-test

Gemeten bij de merge van `v0.18.58` naar `v0.18.63` (450 upstream-commits): 3 conflicten, alle in de
aanhaakpunten of de lockfile, 0 in de eigen paden en 0 typecheckfouten in eigen code.[^readme]

## Besluiten

- [Importeren, niet aanpassen](../eisen/gouden-regel.md)
- [Een eigen aanhaakpunt voor server-uitbreidingen](../besluiten/platform/server-hooks-aanhaakpunt.md)
- [Builder-config als .mjs](../besluiten/platform/builder-config-mjs.md)
- [Upstream-releases mergen, niet dev](../besluiten/platform/releases-mergen.md)

[^referentie]: Referentie §4, "Gouden regel".
[^patches]: PATCHES.md, beide tabellen en de inleiding.
[^readme]: README, "Wat er staat", "Afwijkingen" punt 6 en "Merge-test".
