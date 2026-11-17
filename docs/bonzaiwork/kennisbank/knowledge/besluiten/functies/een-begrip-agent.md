---
type: Decision
title: "Eén begrip Agent"
description: "In de app heet het Agent (pagina), Mijn agent (project) en Agent op Vandaag; Brein blijft de naam voor een gedeeld projectbrein. Code en routes zijn niet hernoemd."
tags: [ui, copy, begrippen]
decision_id: readme/A1
decision_status: genomen
sources:
  - id: readme
    resource: ../../references/readme.md
    title: "BonzaiWork README"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Eén begrip Agent

## Context

De app had twee namen voor hetzelfde: "Jouw brein" en "Persoonlijke agent".[^readme]

## Besluit

Eén begrip **Agent**: "Agent" (de pagina), "Mijn agent" (het project) en "Agent op Vandaag" (taken, mail,
Slack, rondes). "Brein" blijft de naam voor een gedeeld projectbrein. Besloten door de gebruiker.[^readme]

## Gevolgen

- In code, routes en tools is niets hernoemd: `persoonlijk_brein_*`, `kind: "personal"` blijven.[^readme]
- Bestaande projecten houden hun naam.[^readme]
- Docs en code gebruiken dus nog "persoonlijk brein" waar de UI "Mijn agent" zegt; zie
  [Brein](../../begrippen/brein.md).

[^readme]: README, "Genomen beslissingen" (A1).
