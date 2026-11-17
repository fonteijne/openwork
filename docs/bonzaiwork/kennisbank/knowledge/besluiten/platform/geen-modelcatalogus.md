---
type: Decision
title: "Geen modelcatalogus van de OpenWork-cloud"
description: "De engines halen models.openworklabs.com niet op; ze houden hun meegeleverde catalogus en de LiteLLM-modellen komen uit de provider-entry."
tags: [engine, cloud, privacy]
decision_id: kennisbank/geen-modelcatalogus
decision_status: genomen
sources:
  - id: readme
    resource: ../../references/readme.md
    title: "BonzaiWork README"
  - id: referentie
    resource: ../../references/referentie.md
    title: "Referentie: de opdracht"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Geen modelcatalogus van de OpenWork-cloud

## Context

Eis E6: geen verkeer naar `*.openworklabs.com`.[^referentie] Upstream laat beide engines
`models.openworklabs.com` ophalen. De v1-engine erft de hele procesomgeving; de v2-engine leest alleen
`OPENCODE_MODELS_URL`.[^readme]

## Besluit

`SERVER_ENVIRONMENT_DEFAULTS` zet `OPENCODE_DISABLE_MODELS_FETCH=1` en `OPENCODE_MODELS_URL` op een
loopback-adres dat nergens heen gaat.[^readme]

## Gevolgen

- De engines houden hun meegeleverde catalogus; de LiteLLM-modellen komen uit de provider-entry.[^readme]
- De smoketest zag 0 verzoeken naar `*.openworklabs.com`. De v2-engine krijgt geen proxyvariabelen, dus
  wat die zelf ophaalt ziet de smoketest niet.[^readme]

[^referentie]: Referentie §2 (E6).
[^readme]: README, "Verificatie" (C) en "Bevindingen" (Modelcatalogus, Smoketest).
