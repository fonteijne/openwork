---
type: Decision
title: "Upstream-workflows staan uit"
description: "Alleen BonzaiWork-CI, CodeQL, de feature-registry-check en upstream-sync draaien; fork-workflows.mjs zet de rest bij elke sync uit. Documentatie slaat de CI over."
tags: [ci, github, upstream]
decision_id: kennisbank/upstream-workflows-uit
decision_status: genomen
sources:
  - id: readme
    resource: ../../references/readme.md
    title: "BonzaiWork README"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Upstream-workflows staan uit

## Context

Upstream heeft ±50 eigen workflows. Veel draaien op `push` naar `dev`, publiceren naar hun releases,
hebben hun secrets nodig of wachten eindeloos op hun Blacksmith-runners.[^readme]

## Besluit

- Workflows staan uit in GitHub → Actions (geen bestandswijziging, dus geen merge-conflict), behalve de
  lijst `ENABLED` in `scripts/bonzaiwork/fork-workflows.mjs`: BonzaiWork, CodeQL, de feature-registry-check
  en upstream-sync.[^readme]
- `fork-workflows.mjs` draait bij elke upstream-sync en na elke push naar `nightly`, ook voor workflows
  die upstream nieuw toevoegt; runs die zo'n push startte worden geannuleerd.[^readme]
- De BonzaiWork-CI draait één keer per wijziging (PR klaar voor review, push naar `nightly`), niet op
  drafts of `main`, en slaat de jobs over als alleen documentatie verandert (`ci-scope.mjs`).[^readme]

## Gevolgen

- Een workflow weer aanzetten: eerst aan `ENABLED` toevoegen, anders zet de volgende sync hem uit.[^readme]
- Een wijziging die alleen `docs/` raakt, zoals deze kennisbank, krijgt geen CI-controle.

Zie [Releasestroom](../../architectuur/release-stroom.md).

[^readme]: README, "CI".
