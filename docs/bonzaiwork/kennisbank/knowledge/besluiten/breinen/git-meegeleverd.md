---
type: Decision
title: "Git gaat mee in de app"
description: "dugite (de git van GitHub Desktop) gaat uitgedund mee in de build en draait altijd geïsoleerd van de git-omgeving van de gebruiker."
tags: [breinen, git, build]
decision_id: project-breinen/B1
decision_status: genomen
sources:
  - id: breinen
    resource: ../../references/project-breinen-plan.md
    title: "Project-breinen: implementatieplan"
  - id: fase0
    resource: ../../references/project-breinen-fase0.md
    title: "Project-breinen: fase 0"
  - id: windows
    resource: ../../references/windows.md
    title: "Windows: wat nog niet getest is"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Git gaat mee in de app

## Context

BonzaiWork moet zelfstandig werken, zonder extra installaties bij de gebruiker (eis E1). Een breinsync
heeft git nodig op macOS, Windows en Linux, zonder de Xcode-popup op macOS.[^breinen]

## Besluit

`dugite` gaat mee als `extraResources` per platform. Uitgedund (zonder Git Credential Manager, LFS en
dergelijke): macOS 16 MB, Linux 19 MB, Windows 57 MB. Altijd geïsoleerd: geen `GIT_*` van de gebruiker,
`GIT_TERMINAL_PROMPT=0`, `GIT_CONFIG_NOSYSTEM=1`, een eigen `GIT_CONFIG_GLOBAL` en een timeout per
commando.[^breinen][^fase0]

## Gevolgen

- `GIT_CONFIG_NOSYSTEM=1` is nodig omdat dugite's systeemconfig op Windows `autocrlf=true` en een verplicht
  LFS-filter zet.[^breinen]
- De MSYS-ssh van dugite gaat uit de bundel; git gebruikt de SSH van het systeem (zie
  [Alleen SSH](alleen-ssh.md)).
- `scripts/bonzaiwork/fetch-git.mjs` haalt en dunt de git uit; op Windows is het pad anders
  (`windows.md`).[^windows]
- De server roept voor `git check-ignore` de git van het `PATH` aan, niet dugite.[^breinen]

Zie [Breinen](../../architectuur/breinen.md).

[^breinen]: Breinenplan §3.1.
[^fase0]: Fase 0 §1.
[^windows]: Windows §2 en §5.
