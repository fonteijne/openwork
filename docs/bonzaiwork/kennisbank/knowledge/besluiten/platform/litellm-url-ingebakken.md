---
type: Decision
title: "LiteLLM-URL in de build"
description: "De LiteLLM-URL wordt bij het bouwen ingebakken (BONZAIWORK_LITELLM_BASE_URL); de onboarding vraagt alleen de key."
tags: [litellm, build, onboarding]
decision_id: referentie/O3
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
# LiteLLM-URL in de build

## Context

Open beslissing O3: draait LiteLLM centraal of per klant, en wordt de URL ingebakken of door de gebruiker
ingesteld?[^referentie]

## Besluit

De URL wordt **in de build ingebakken** via `BONZAIWORK_LITELLM_BASE_URL`. De onboarding vraagt alleen de
key. Besloten door de gebruiker.[^readme]

## Gevolgen

- Eén build hoort bij één LiteLLM-installatie; een andere installatie vraagt een andere build.
- Instellingen die bij de installatie horen volgen hetzelfde patroon: `BONZAIWORK_DEFAULT_MODEL`,
  `BONZAIWORK_PREFERRED_MODELS`, `BONZAIWORK_KEY_MODE`.[^readme]
- De smoketest controleert dat de verpakte app de onboarding met de ingebakken URL toont.[^readme]

[^referentie]: Referentie §8 (O3).
[^readme]: README, "Genomen beslissingen" (O3, M1, O1) en "Verificatie".
