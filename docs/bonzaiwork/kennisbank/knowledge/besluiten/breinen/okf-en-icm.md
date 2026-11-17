---
type: Decision
title: "Kennis in OKF, acties in ICM"
description: "Een brein gebruikt twee open standaarden: OKF v0.2 in knowledge/ voor wat het team weet, ICM in workflows/ voor hoe het team werkt."
tags: [breinen, okf, icm, kennis]
decision_id: kennisbank/okf-en-icm
decision_status: genomen
sources:
  - id: breinen
    resource: ../../references/project-breinen-plan.md
    title: "Project-breinen: implementatieplan"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Kennis in OKF, acties in ICM

## Context

Een brein moet leesbaar en aanpasbaar zijn voor het team zelf, zonder code, en een agent moet weten wat hij
moet lezen en wat niet.[^breinen]

## Besluit

| | Standaard | Waar |
|---|---|---|
| Weten | Open Knowledge Format (OKF) v0.2 van Google Cloud: concepten met type, herkomst, vertrouwen en houdbaarheid | `knowledge/` |
| Doen | Interpretable Context Methodology (ICM): werkwijzen als genummerde stappen met een contract | `workflows/`, routering in `AGENTS.md` |

Verwijzingen gaan één kant op: werkwijzen verwijzen naar kennis, nooit andersom. Links zijn relatief;
geen `[[wikilinks]]`.[^breinen]

## Gevolgen

- BonzaiWork dwingt de vorm af in code vóór elke commit (`okf.ts`, `icm.ts`): een `type` per concept,
  `generated` (AI en mens apart), `index.md` per map, `log.md`, onveranderlijke `references/`.[^breinen]
- De knop "Klopt" in de UI voegt `verified` toe en zet een `draft` op `stable`.[^breinen]
- Ook deze kennisbank volgt OKF, met dezelfde code als controle.

[^breinen]: Breinenplan §6, §6.1, §6.2 en §6.5.
