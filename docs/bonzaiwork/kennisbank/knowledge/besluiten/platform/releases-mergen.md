---
type: Decision
title: "Upstream-releases mergen, niet dev"
description: "In nightly mergen we gepubliceerde upstream-releases via upstream-sync/<tag>-PR's; dev is alleen een spiegel ter referentie. Nooit rebasen op upstream."
tags: [git, upstream, release]
decision_id: kennisbank/releases-mergen
decision_status: genomen
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
# Upstream-releases mergen, niet dev

## Context

Upstream `dev` krijgt tientallen commits per dag; een release komt ongeveer om de twee à drie dagen en is
door upstream gebouwd en uitgebracht.[^readme] De referentie zegt: alleen tags mergen, niet rebasen op
upstream, niet mergen vanaf `upstream/dev`.[^referentie]

## Besluit

- `dev` is een pure spiegel van upstream `dev`, alleen fast-forward, ter referentie.
- Upstream komt binnen als één release per `upstream-sync/<tag>`-PR naar `nightly`. Alleen een
  GitHub-release telt, geen kale tag: upstream tagt vóór de releasebuild geslaagd is.
- Mergen doet altijd een mens.[^readme]

## Gevolgen

- `bonzaiwork.upstream.json` legt per sync tag en commit vast; `check-patches.mjs` vergelijkt daarmee.[^readme]
- De fork begon bewust afwijkend op `dev` (`v0.18.63` + 22 commits); de eerste release na `2aa4481` werd de
  eerste sync-PR.[^readme]

Zie [Releasestroom](../../architectuur/release-stroom.md).

[^referentie]: Referentie §5.2 en §7.
[^readme]: README, "Afwijkingen" punt 1, "Branches" en "Upstream automatisch syncen".
