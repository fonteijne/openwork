---
type: Decision
title: "Skills komen uit de app"
description: "De OKF- en ICM-skills en de commando's levert de app via de config-map van de engine; een brein krijgt geen kopie en het persoonlijke brein begint schoon."
tags: [breinen, skills]
decision_id: readme/S1
decision_status: genomen
sources:
  - id: readme
    resource: ../../references/readme.md
    title: "BonzaiWork README"
  - id: herzien
    resource: ../../references/persoonlijk-brein-herzien-onderzoek.md
    title: "Onderzoek: het persoonlijke brein herzien"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Skills komen uit de app

## Context

Skills waren kopieën in elk brein die nooit meer bijwerkten: een verbeterde `okf-ingest` in een nieuwe
build bereikte geen bestaand brein. De globale skills waren wat er toevallig in de map van het persoonlijke
brein stond, en een bestaande notitiemap paste niet in OKF.[^herzien]

## Besluit

- Skills en commando's komen uit de app, niet uit een brein; een persoonlijk brein begint schoon (geen
  bestaande notitiemap meer).[^readme]
- De app schrijft ze bij elke start opnieuw naar een eigen map, zodat de versie altijd die van de build
  is.[^herzien]
- `BONZAIWORK_MANAGED_SKILLS=0` zet de oude opzet terug.[^readme]

## Gevolgen

- Bestaande kopieën in teamrepo's blijven staan: BonzaiWork verwijdert niets uit een gedeelde repo.[^herzien]
- Eigen skills van de gebruiker vallen buiten de altijd-geladen laag; dat is een versmalling.[^herzien]
- Een bestaand persoonlijk brein wordt een gewoon project.[^herzien]

Zie [Breinen](../../architectuur/breinen.md).

[^readme]: README, "Genomen beslissingen" (S1).
[^herzien]: Onderzoek persoonlijk brein §3 en §4.1–§4.3; draait de besluiten N1 en N4 van het breinenplan om (§1).
