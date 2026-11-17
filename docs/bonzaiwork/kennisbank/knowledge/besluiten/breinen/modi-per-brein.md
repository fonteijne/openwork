---
type: Decision
title: "Modi per brein"
description: "Per brein kies je automatisch (standaard), handmatig of alleen lezen; via voorstel (branch plus merge request) volgt in fase 3."
tags: [breinen, git]
decision_id: project-breinen/B4
decision_status: genomen
sources:
  - id: breinen
    resource: ../../references/project-breinen-plan.md
    title: "Project-breinen: implementatieplan"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Modi per brein

## Context

Niet elk team wil dat elke beurt meteen op de standaardbranch komt, en niet iedereen heeft
schrijfrechten.[^breinen]

## Besluit

| Modus | Bijwerken | Vastleggen en versturen | Fase |
|---|---|---|---|
| Automatisch (standaard) | automatisch | rechtstreeks naar de standaardbranch, na elke beurt | 1 |
| Handmatig | automatisch | knop "Wijzigingen delen" | 1 |
| Alleen lezen | automatisch | nooit | 1 |
| Via voorstel | automatisch | naar `bonzaiwork/<gebruiker>/<onderwerp>` + MR/PR | 3 |

Naar §4.4 van het plan.[^breinen]

## Gevolgen

- Het gedrag is vast; een brein kiest alleen een modus, geen eigen hooks (zie
  [Synchronisatie is code](sync-is-code.md)).
- Zonder schrijfrechten wordt de status "Alleen lezen" tot de gebruiker opnieuw probeert.[^breinen]

Zie [Breinen](../../architectuur/breinen.md).

[^breinen]: Breinenplan §4.3 en §4.4.
