---
type: System
title: "Agenda"
description: "Meet per kwartier waaraan je in BonzaiWork werkte, zonder model, en maakt een boekdocument dat een gewone chat in Bridge kan omzetten."
tags: [agenda, uren, bridge]
resource: ../../../../../packages/bonzaiwork-agenda
sources:
  - id: plan
    resource: ../references/agenda-manager-plan.md
    title: "Agenda-manager: implementatieplan"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Agenda

De agenda houdt op de achtergrond per kwartier bij aan welk project je werkte, over alle projecten
heen, en haalt je niet uit je flow. Elk kwartier krijgt precies één toewijzing; jouw eigen invoer gaat
altijd voor. Het resultaat is een boekdocument per dag of week.[^plan]

## Opbouw

```
desktop-main: PresenceSource (systeemidle, vensterfocus)
packages/bonzaiwork-agenda (serverproces):
  presence.ts   meting per minuut          tracker.ts   beurten via host.onSessionActivity
  quarters.ts   meting → kwartier          overview.ts  blokken en totalen per Bridge-post
  booking-doc.ts het boekdocument          store.ts     <userData>/bonzaiwork/agenda/*.json
  routes.ts     /bonzaiwork/agenda/*
apps/bonzaiwork: pil, paneel (⌘J), tijdlijn, Bridge-post per project, export
```

Naar §3 van het plan. De UI rekent met `@bonzaiwork/agenda/model`, net als de server. Er verandert geen
upstream-bestand.[^plan]

## Besluiten

- [De agenda telt in kwartieren](../besluiten/functies/agenda-kwartier.md)
- [Een boekdocument in plaats van zelf boeken](../besluiten/functies/agenda-boekdocument.md)

[^plan]: Agendaplan §0, §1 en §3.
