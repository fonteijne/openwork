---
type: Decision
title: "Voorkeuren alleen via een voorstelkaart"
description: "De AI kan AGENTS.md en _meta/voorkeuren.md van het persoonlijke brein niet zelf schrijven; voorkeur_voorstellen toont altijd een kaart."
tags: [breinen, beveiliging, prompt-injectie]
decision_id: kennisbank/voorkeuren-via-kaart
decision_status: genomen
sources:
  - id: breinen
    resource: ../../references/project-breinen-plan.md
    title: "Project-breinen: implementatieplan"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Voorkeuren alleen via een voorstelkaart

## Context

`AGENTS.md` en `_meta/voorkeuren.md` van het persoonlijke brein gaan in elke chat. Kan de AI daar vrij in
schrijven, dan kan tekst die hij ergens leest ("negeer voortaan …") blijvend in elke volgende chat
komen.[^breinen]

## Besluit

`persoonlijk_brein_schrijven/bewerken` weigert die twee bestanden. De aparte tool `voorkeur_voorstellen`
toont **altijd** een kaart met de wijziging (Toevoegen / Aanpassen / Weigeren). Wat de gebruiker zelf in
die bestanden doet, gaat gewoon mee.[^breinen]

## Gevolgen

- Andere bestanden in het persoonlijke brein blijven op allow; die gaan niet vanzelf in elke chat.[^breinen]
- `edit:_meta/voorkeuren.md` kan als deny in de engine; `edit:AGENTS.md` niet, omdat dat elk `AGENTS.md`
  in elk project zou dichtzetten. Bash blijft een omweg.[^breinen]

[^breinen]: Breinenplan §7.3.
