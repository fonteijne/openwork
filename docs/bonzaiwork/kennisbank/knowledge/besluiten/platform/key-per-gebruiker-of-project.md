---
type: Decision
title: "Key per gebruiker of per project"
description: "Nog open (O1). Beide KeyResolvers zijn gebouwd; de build kiest met BONZAIWORK_KEY_MODE=user|workspace, standaard user."
tags: [keys, litellm]
decision_id: referentie/O1
decision_status: open
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
# Key per gebruiker of per project

## Context

Open beslissing O1: één LiteLLM-key per gebruiker of per project? Dat bepaalt welke `KeyResolver` de
standaard wordt. De referentie vroeg beide achter één interface te bouwen.[^referentie]

## Besluit

Nog niet genomen. Huidige stand: beide resolvers zijn gebouwd; de build kiest met
`BONZAIWORK_KEY_MODE=user|workspace`, en de standaard is `user`.[^readme]

## Gevolgen

- In `workspace`-modus is de modellenlijst de vereniging over alle workspace-keys.[^readme]
- De demo-backend kan beide tonen (`?sleutel=gebruiker`).
- Staat als eerste punt bij "Volgende stappen" in de README.[^readme]

[^referentie]: Referentie §8 (O1).
[^readme]: README, "Genomen beslissingen" (O1), "Hoe het in elkaar zit" en "Volgende stappen".
