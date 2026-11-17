---
type: Decision
title: "Project is een workspace"
description: "Een BonzaiWork-project is een lokale OpenWork-workspace (één map); projectmetadata en overzichtsdata komen als dunne BonzaiWork-laag eromheen."
tags: [begrippen, projecten]
decision_id: kennisbank/project-is-workspace
decision_status: genomen
sources:
  - id: contract
    resource: ../../references/frontend-contract.md
    title: "Frontend-contract"
  - id: app
    resource: ../../references/app-readme.md
    title: "README van de BonzaiWork-app"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Project is een workspace

## Context

Een workspace heeft in OpenWork al alles wat een project nodig heeft: een eigen map, eigen chats, skills
en connecties, een standaardmodel en (in BonzaiWork) een eigen key. Wat ontbreekt is projectmetadata
(beschrijving, kleur, gepinde en gearchiveerde chats) en overzichtsdata (aantallen, verbruik).[^contract]

## Besluit

Project = workspace (`workspaceType: "local"`). Metadata en overzicht bouwen we als een dunne
BonzaiWork-laag eromheen, zonder upstream-bestanden aan te passen. "Project first": elke chat start binnen
een project; losse chats bestaan niet.[^contract]

## Gevolgen

- De server maakt de map zelf aan, dus een project kan zonder mapkiezer (standaard
  `~/BonzaiWork/<projectnaam>`).[^contract]
- Zolang `/bonzaiwork/projects` een 404 geeft, bewaart de app metadata per apparaat
  (`capabilities.projectMeta`).[^app]
- Een brein is ook gewoon een project, met een git-repo als map.

Zie [Project](../../begrippen/project.md).

[^contract]: Frontend-contract §2, "Waarom project = workspace".
[^app]: App-README, "Wat de live backend doet".
