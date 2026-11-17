---
type: Decision
title: "Alleen SSH met de sleutels die er al zijn"
description: "Clone, fetch en push gaan altijd via de SSH van het systeem met BatchMode; geen HTTPS, tokens of wachtwoorden, en de app leest geen sleutels."
tags: [breinen, git, beveiliging]
decision_id: project-breinen/B2
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
# Alleen SSH met de sleutels die er al zijn

## Context

Breinen staan op GitHub of GitLab (ook een eigen GitLab-server). Iedereen heeft al een SSH-sleutel
ingesteld.[^breinen]

## Besluit

- Git krijgt `GIT_SSH_COMMAND` naar de SSH van het systeem, altijd met `-o BatchMode=yes`: dezelfde
  sleutels, `~/.ssh/config` en ssh-agent als in de terminal, en nooit een vraag waar niemand op kan
  antwoorden.[^breinen]
- Alleen SSH, in alle fases. Een geplakte HTTPS-link wordt alleen omgezet naar de SSH-vorm.[^breinen]
- De gepubliceerde host-sleutels van `github.com` en `gitlab.com` gaan mee; een onbekende host vraagt één
  keer bevestiging, een veranderde sleutel stopt de sync.[^breinen]

## Gevolgen

- De app beheert, leest, kopieert of bewaart geen SSH-sleutels, tokens of wachtwoorden.[^breinen]
- Een vergrendelde sleutel geeft dezelfde fout als "geen toegang"; alleen "Verbinding testen" (`ssh -v`)
  laat het verschil zien.[^breinen][^fase0]
- Wie geen SSH-sleutel heeft, kan geen gedeeld brein toevoegen.

## Niet gekozen

- **HTTPS met tokens of inloggen via de browser**: dan moet de app geheimen beheren.[^breinen]

Zie [Breinen](../../architectuur/breinen.md).

[^breinen]: Breinenplan §3.2 en §7.2.
[^fase0]: Fase 0 §2.1.
