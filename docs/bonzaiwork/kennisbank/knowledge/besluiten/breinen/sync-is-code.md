---
type: Decision
title: "Synchronisatie is code, geen instructie"
description: "De AI doet geen git: BonzaiWork werkt een brein bij en legt het vast op vaste momenten, zoals hooks in Claude Code. De AI mag zelf geen git uitvoeren."
tags: [breinen, git, ai]
decision_id: kennisbank/sync-is-code
decision_status: genomen
sources:
  - id: breinen
    resource: ../../references/project-breinen-plan.md
    title: "Project-breinen: implementatieplan"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Synchronisatie is code, geen instructie

## Context

Instructies aan een model worden soms vergeten of half uitgevoerd: wel committen, niet pushen; pushen
midden in een beurt; een conflict "oplossen" door bestanden weg te gooien.[^breinen]

## Besluit

BonzaiWork doet git zelf, op vaste momenten die overeenkomen met de hooks van Claude Code: `fetch` bij
openen en periodiek (`SessionStart`), bijwerken vlak vóór elke beurt (`UserPromptSubmit`), vastleggen en
versturen als alle chats stil zijn (`Stop`). Globale engine-policies verbieden de AI zelf git uit te
voeren of in `.git/**` te schrijven (`PreToolUse`).[^breinen]

## Gevolgen

- Een vaste stap gebeurt altijd, is te testen en geeft één duidelijke status.[^breinen]
- De instructie aan de AI blijft kort en inhoudelijk.
- De git-deny is best effort; een brein kan hem niet opheffen.[^breinen]
- Ook `index.md`, `log.md` en `generated` in de OKF-bundel schrijft BonzaiWork zelf (`okf.ts`), niet de AI.

## Niet gekozen

- **Hooks die een brein zelf meebrengt** (scripts in de repo die bij elke beurt draaien): dat is code uit
  een gedeelde repo op ieders laptop. Per brein kies je alleen een [modus](modi-per-brein.md).[^breinen]

Zie [Breinen](../../architectuur/breinen.md).

[^breinen]: Breinenplan §2.
