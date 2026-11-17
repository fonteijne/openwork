---
type: Decision
title: "Per beurt vastleggen en versturen"
description: "Na elke beurt (alle chats stil plus 15 s) legt BonzaiWork vast en pusht; alleen Markdown gaat vanzelf mee, AI- en gebruikerswijzigingen in aparte commits."
tags: [breinen, git]
decision_id: project-breinen/B3
decision_status: genomen
sources:
  - id: breinen
    resource: ../../references/project-breinen-plan.md
    title: "Project-breinen: implementatieplan"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Per beurt vastleggen en versturen

## Context

Een gedeeld brein moet voor het hele team actueel blijven, en conflicten moeten klein blijven.[^breinen]

## Besluit

- Vastleggen pas als **alle** chats in het project stil zijn, plus 15 s rust; één wachtrij en mutex per
  brein.[^breinen]
- Wat meegaat (N5): nieuwe en gewijzigde `.md`-bestanden, plus wijzigingen en verwijderingen van bestanden
  die al gedeeld waren. Een nieuw bestand dat geen Markdown is gaat niet vanzelf mee ("Toch delen").[^breinen]
- Wijzigingen van de AI en van de gebruiker zelf gaan in aparte commits; alleen de AI-commit krijgt
  "Via BonzaiWork" en de trailer `BonzaiWork-Chat: <id>`.[^breinen]
- Push geweigerd: `fetch` + `rebase` + opnieuw, max. 3 keer. Offline: lokaal bewaren en later
  opnieuw.[^breinen]

## Gevolgen

- Conflicten zijn klein en zeldzaam; `index.md` en `log.md` geven nooit een conflict voor de gebruiker,
  omdat de sync ze opnieuw maakt of per datum samenvoegt.[^breinen]
- Vóór elke commit een geheimenscan; bestanden boven 10 MB gaan niet mee.[^breinen]

Zie [Modi per brein](modi-per-brein.md) en [Breinen](../../architectuur/breinen.md).

[^breinen]: Breinenplan §4.3, §4.5 en §7.2.
