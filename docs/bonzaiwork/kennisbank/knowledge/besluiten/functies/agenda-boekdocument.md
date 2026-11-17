---
type: Decision
title: "Een boekdocument in plaats van zelf boeken"
description: "BonzaiWork boekt niets in Bridge; het maakt per dag of week een Markdown-boekdocument dat een gewone chat na jouw goedkeuring omzet. Geen model in de MVP."
tags: [agenda, bridge]
decision_id: agenda-manager/A9
decision_status: genomen
sources:
  - id: agenda
    resource: ../../references/agenda-manager-plan.md
    title: "Agenda-manager: implementatieplan"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Een boekdocument in plaats van zelf boeken

## Context

Uren moeten in Bridge komen, maar de agenda-MVP moest klein en zonder model blijven.[^agenda]

## Besluit

- Het resultaat is een **boekdocument dat een gewone chat kan inlezen**: Markdown met een boekvoorstel,
  de tijdlijn, aandachtspunten, instructies voor de assistent en een JSON-blok. Een chat met toegang tot
  de Bridge CLI zet het na jouw goedkeuring om in boekingen (A9).
- **Geen brein- of skillkoppeling**: de agenda gebruikt geen engine, MCP, breinen of skills (A7).
- **De MVP eindigt na fase 2**: geen model, geen agenda-key, geen agenda-chat (A8).[^agenda]

## Gevolgen

- BonzaiWork boekt zelf niets in Bridge.[^agenda]
- De MVP gebruikt geen LiteLLM-key en verandert geen upstream-bestand.[^agenda]
- Kwartiersamenvatting door een model, "Dag afsluiten" en rechtstreeks boeken staan voor na de MVP.[^agenda]

Zie [Agenda](../../architectuur/agenda.md).

[^agenda]: Agendaplan §0 (A7–A9), §1 en §3.
