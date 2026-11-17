---
type: Decision
title: "De agenda telt in kwartieren"
description: "Elk kwartier op de klok krijgt precies één toewijzing; een kwartier zonder activiteit is Away from BonzaiWork en kan een meeting worden. Eigen invoer gaat voor."
tags: [agenda, uren]
decision_id: agenda-manager/A1
decision_status: genomen
sources:
  - id: agenda
    resource: ../../references/agenda-manager-plan.md
    title: "Agenda-manager: implementatieplan"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# De agenda telt in kwartieren

## Context

De agenda moet uren voor Bridge kunnen voorstellen zonder dat je er tijdens het werk mee bezig bent.[^agenda]

## Besluit

- De eenheid is een **kwartier** op de klok (:00, :15, :30, :45); elk kwartier krijgt precies één
  toewijzing, en zelf invoeren gaat ook in kwartieren (A1).
- Een kwartier zonder activiteit is **"Away from BonzaiWork"**, zonder idle-drempel in minuten; je kunt
  het omzetten naar bijvoorbeeld "Meeting" met een Bridge-post (A2).
- Elk project krijgt een Bridge-boekingspost, op de server opgeslagen (A4).[^agenda]

## Gevolgen

- De meting draait op de achtergrond en haalt je niet uit je flow.[^agenda]
- Jouw eigen invoer gaat altijd voor de meting.[^agenda]

Zie [Agenda](../../architectuur/agenda.md).

[^agenda]: Agendaplan §0 (A1, A2, A4) en §2.
