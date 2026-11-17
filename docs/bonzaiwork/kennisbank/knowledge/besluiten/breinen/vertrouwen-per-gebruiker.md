---
type: Decision
title: "Vertrouwen per gebruiker"
description: "Wat een gedeeld brein kan uitvoeren (MCP's, plugins, agents, commando's met shell, scripts) laadt pas na akkoord van elke gebruiker zelf."
tags: [breinen, beveiliging]
decision_id: project-breinen/B5
decision_status: genomen
sources:
  - id: breinen
    resource: ../../references/project-breinen-plan.md
    title: "Project-breinen: implementatieplan"
  - id: fase0
    resource: ../../references/project-breinen-fase0.md
    title: "Project-breinen: fase 0"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Vertrouwen per gebruiker

## Context

Een gedeelde repo is invoer van anderen die op ieders laptop draait. Fase 0 mat: een plugin in
`.opencode/plugins/` draait al bij het openen van de map, een MCP uit `opencode.json` start meteen, en
`` !` `` in een commando-sjabloon draait shell zonder toestemming.[^breinen][^fase0]

## Besluit

- Een **vertrouwensstap** bij het toevoegen: in gewone taal wat het brein meebrengt; elke gebruiker beslist
  zelf.[^breinen]
- Zonder akkoord staan die onderdelen op de **sparse-checkout-lijst** (wel in de repo, niet in de map), en
  krijgen MCP-namen een `integration.use`-deny in de globale policies.[^breinen]
- Verandert zo'n onderdeel via een pull, dan opnieuw vragen vóór het laadt.[^breinen]
- De keuzes staan per gebruiker in `brains.json`, niet in de repo.[^breinen]

## Gevolgen

- Werkt zonder upstream-patch.[^breinen]
- Scripts in werkwijzen draaien alleen in een vertrouwd brein en altijd met toestemming van de
  engine.[^breinen]

Zie [Breinen](../../architectuur/breinen.md).

[^breinen]: Breinenplan §7.1.
[^fase0]: Fase 0 §6.
