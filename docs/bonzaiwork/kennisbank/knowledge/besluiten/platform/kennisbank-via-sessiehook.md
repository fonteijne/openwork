---
type: Decision
title: "Kennisbank als OKF-bundel, bijgehouden door een sessiehook"
description: "Architectuur en besluiten staan als OKF-bundel in docs/bonzaiwork/kennisbank; een Claude Code-hook houdt hem bij vanuit ontwikkelsessies, zonder upstream-bestanden te wijzigen."
tags: [kennisbank, okf, documentatie, claude-code]
decision_id: kennisbank/kennisbank-via-sessiehook
decision_status: genomen
sources:
  - id: kennisbank
    resource: ../../../AGENTS.md
    title: "Kennisbank BonzaiWork (AGENTS.md)"
  - id: hook
    resource: ../../../../../../scripts/bonzaiwork/kennisbank-hook.ts
    title: kennisbank-hook.ts
  - id: patches
    resource: ../../references/patches.md
    title: PATCHES.md
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:55.777Z}
status: draft
---
# Kennisbank als OKF-bundel, bijgehouden door een sessiehook

## Context

De architectuur en de besluiten van BonzaiWork stonden verspreid over plannen, onderzoeken en de README,
met nummers die per document botsen (A1, B1). Kennis die alleen in een gesprek met een agent besloten
wordt, kwam vaak helemaal niet op papier. Bijhouden met de hand vergeet je; een instructie aan een agent
ook (zie [Synchronisatie is code](../breinen/sync-is-code.md)).

## Besluit

- De kennisbank is een OKF-bundel in `docs/bonzaiwork/kennisbank/`, in dezelfde vorm als de kennis in
  een brein, en wordt gecontroleerd met dezelfde code (`okf.ts`) via `scripts/bonzaiwork/kennisbank.ts`.[^kennisbank]
- Een Claude Code-hook (`SessionStart` en `Stop` in `.claude/settings.json`) houdt hem bij. Bij het
  stoppen zet de hook `generated`, `log.md` en `index.md`, controleert de bundel en vraagt de agent één
  keer per stand van de wijzigingen om besluiten en architectuur vast te leggen als BonzaiWork-code of
  een plan veranderde.[^hook]
- `.claude/settings.json` is met `git add -f` getrackt; de upstream-`.gitignore` (die `.claude/*` negeert)
  blijft ongewijzigd. Het bestand staat als nieuw bestand in `PATCHES.md`.[^patches]

## Gevolgen

- Besluiten komen in dezelfde PR als de code; de hook commit niets.[^hook]
- Alleen Claude Code-sessies hebben de hook. Codex en OpenCode draaien de controle zelf.[^kennisbank]
- Elke sessie met een BonzaiWork-wijziging kost één extra beurt voor de review, ook als er niets vast te
  leggen is.
- Een docs-only-PR krijgt geen CI (`ci-scope.mjs`); de controle draait dus lokaal via de hook.

## Niet gekozen

- **De `.gitignore` aanpassen**: dat is een patch op een upstream-bestand, terwijl één nieuw bestand
  genoeg is.
- **Alleen een lokale hook in `~/.claude/settings.json`**: dan hebben collega's en nieuwe worktrees hem
  niet.
- **Een aparte headless sessie na afloop** (`SessionEnd` met `claude -p`): die mist wat er in het gesprek
  besloten is, en de gebruiker ziet de wijziging niet in de sessie zelf.

Zie [Releasestroom](../../architectuur/release-stroom.md) en [Upstream-laag](../../architectuur/upstream-laag.md).

[^kennisbank]: Kennisbank `AGENTS.md`, "Automatisch bijhouden" en "Controle".
[^hook]: Commentaar bovenaan `kennisbank-hook.ts`.
[^patches]: PATCHES.md, rij `.claude/settings.json`.
