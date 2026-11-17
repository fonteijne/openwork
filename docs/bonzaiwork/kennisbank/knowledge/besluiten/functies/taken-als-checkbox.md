---
type: Decision
title: "Taken als Markdown-checkbox in de breinen"
description: "Taken staan als Markdown-checkbox in het persoonlijke brein en in project-breinen, met een eigenaar; zonder eigenaar is het team-backlog."
tags: [taken, vandaag, breinen]
decision_id: persoonlijke-agent/T1
decision_status: genomen
sources:
  - id: agent
    resource: ../../references/persoonlijke-agent-plan.md
    title: "Persoonlijke agent op Vandaag"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Taken als Markdown-checkbox in de breinen

## Context

De persoonlijke agent moet taken vinden zonder een eigen database of model, en taken van een team moeten
gedeeld zijn.[^agent]

## Besluit

- Taken staan als **Markdown-checkbox** in het persoonlijke brein en in project-breinen; één notatie (T1).
- Taken in een project-brein zijn gedeeld en kunnen een teamgenoot als eigenaar hebben (T2).
- Taken zonder eigenaar in een project-brein zijn team-backlog; ze staan niet in "Start hier" tot iemand
  ze oppakt (T3).[^agent]

## Gevolgen

- De server indexeert taken zonder model.[^agent]
- Privétaken blijven in het persoonlijke brein.[^agent]
- Verspreide taken in proza krijgen een eenmalige opruiming per brein, pas na jouw ja (T9).[^agent]

Zie [Persoonlijke agent](../../architectuur/persoonlijke-agent.md).

[^agent]: Plan persoonlijke agent §1 (T1–T3, T9) en §2.
