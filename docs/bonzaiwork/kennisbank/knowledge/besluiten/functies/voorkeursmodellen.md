---
type: Decision
title: "Voorkeursmodellen in de build"
description: "Een lijst LiteLLM-model-id's zit in de build (PREFERRED_MODEL_IDS, te overschrijven met BONZAIWORK_PREFERRED_MODELS); nieuwe projecten starten met alleen die modellen."
tags: [modellen, litellm, projecten]
decision_id: readme/M1
decision_status: genomen
sources:
  - id: readme
    resource: ../../references/readme.md
    title: "BonzaiWork README"
  - id: voorkeur
    resource: ../../references/plan-voorkeursmodellen.md
    title: "Plan: voorkeursmodellen"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Voorkeursmodellen in de build

## Context

Een LiteLLM-key geeft vaak toegang tot veel meer modellen dan een team wil gebruiken. De LiteLLM-config
ligt buiten onze invloed.[^voorkeur]

## Besluit

- De voorkeurslijst bestaat uit **LiteLLM-model-id's**, niet uit weergavenamen (B1).[^voorkeur]
- Standaard in `@bonzaiwork/policy` (`PREFERRED_MODEL_IDS`); een build overschrijft hem met
  `BONZAIWORK_PREFERRED_MODELS` (komma-gescheiden). Geen beheer-UI (B2).[^voorkeur][^readme]
- Nieuwe projecten, ook uit een gedeeld brein en het persoonlijke brein, krijgen
  `allowedModels = preferredModels` (B6).[^voorkeur]
- Bestaande projecten blijven zoals ze zijn; geen migratie (B7).[^voorkeur]

## Gevolgen

- `allowedModels: []` betekent "nog niets gekozen", `null` "alle modellen van de key" (B4).[^voorkeur]
- Een project zonder bruikbaar model is **geblokkeerd, geen fout**: composer en routine-editor tonen
  "Geen modellen gekozen" met de actie "Modellen kiezen" (B5).[^voorkeur]
- Het filteren tegen de key gebeurt bij het lezen, dus het werkt ook als de key pas later komt.[^voorkeur]

## Niet gekozen

- **Een vlag in LiteLLM**: de config daar ligt buiten onze invloed.[^voorkeur]
- **Bestaande projecten omzetten**: stilletjes modellen weghalen breekt lopende chats en routines.[^voorkeur]

[^readme]: README, "Genomen beslissingen" (M1).
[^voorkeur]: Plan voorkeursmodellen, "Beslissingen in dit plan" B1–B7.
