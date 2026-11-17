---
type: Decision
title: "Alleen de gebruiker verstuurt"
description: "De agent leest zonder klik voor zijn eigen rondes, maar heeft geen tool die iets verstuurt; de server verstuurt pas na een klik op de kaart."
tags: [agent, beveiliging, mail, slack]
decision_id: persoonlijke-agent/T7
decision_status: genomen
sources:
  - id: agent
    resource: ../../references/persoonlijke-agent-plan.md
    title: "Persoonlijke agent op Vandaag"
  - id: referentie
    resource: ../../references/referentie.md
    title: "Referentie: de opdracht"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Alleen de gebruiker verstuurt

## Context

De persoonlijke agent leest mail en Slack en bereidt antwoorden voor. Een fout bericht naar buiten is
niet terug te draaien.[^agent]

## Besluit

- Lezen mag zonder klik voor de eigen rondes; **versturen doet alleen de gebruiker** (T7). De agent heeft
  geen tool die iets verstuurt; de server verstuurt na de klik op de kaart.[^agent]
- Outlook, agenda en Slack lopen via lokale koppelingen, niet via de OpenWork-cloud (T8, eis E6).[^agent][^referentie]
- Alles staat uit tot je het per onderdeel aanzet (T10).[^agent]

## Gevolgen

- Prompt-injectie via een binnenkomende mail kan hooguit een voorstel opleveren, geen verzonden bericht.
- De koppelingen zijn alleen tegen nagebouwde tegenhangers getest.[^agent]

Zie [Persoonlijke agent](../../architectuur/persoonlijke-agent.md).

[^agent]: Plan persoonlijke agent §1 (T7, T8, T10) en status.
[^referentie]: Referentie §2 (E6).
