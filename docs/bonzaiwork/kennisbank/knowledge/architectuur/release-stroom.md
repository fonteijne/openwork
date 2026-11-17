---
type: Process
title: "Releasestroom"
description: "Upstream-release → upstream-sync/<tag> → nightly → main; werk → nightly → main. CI draait één keer per wijziging en slaat documentatie over."
tags: [git, ci, release, upstream]
sources:
  - id: readme
    resource: ../references/readme.md
    title: BonzaiWork README
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Releasestroom

## Branches

| Branch | Rol |
|---|---|
| `dev` | pure spiegel van upstream `dev`; alleen fast-forward, nooit zelf committen |
| `nightly` | integratie- en standaardbranch; alleen via PR's met groene BonzaiWork-CI |
| `main` | releasebranch; krijgt alleen een geteste commit van `nightly` |
| `upstream-sync/<tag>` | tijdelijk: één upstream-release gemerged, PR naar `nightly` |

Drie regels: niets direct naar `main`; promoveer de commit die je getest hebt, niet de branch; test
vanuit een schone checkout.[^readme]

## Upstream-sync

`upstream-sync.yml` draait dagelijks: `dev` doorspoelen, upstream-workflows uitzetten
(`fork-workflows.mjs`), een sync-PR maken voor de nieuwste GitHub-release (geen kale tag), met
`bonzaiwork.upstream.json` vastgezet en de lockfile geregenereerd. Er staat hooguit één sync-PR open;
mergen doet altijd een mens.[^readme]

## CI

`bonzaiwork.yml`: typecheck, unit-tests, engine-E2E, PATCHES-check en een verpakte Linux-build met
smoketest. Draait op PR's die klaar zijn voor review en op een push naar `nightly`, niet op drafts en
niet op `main`. Raakt een wijziging alleen documentatie, dan slaan de jobs over
(`scripts/bonzaiwork/ci-scope.mjs`).[^readme]

## Promoveren

`git push origin <geteste-sha>:main` (alleen fast-forward). De release notes onder "Volgende release"
in `release-notes.md` gaan mee met de build.[^readme]

## Besluiten

- [Upstream-releases mergen, niet dev](../besluiten/platform/releases-mergen.md)
- [Upstream-workflows staan uit](../besluiten/platform/upstream-workflows-uit.md)

[^readme]: README, "CI", "Branches", "Promoveren naar main" en "Upstream automatisch syncen".
