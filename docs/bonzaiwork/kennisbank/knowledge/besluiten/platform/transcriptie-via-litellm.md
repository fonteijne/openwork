---
type: Decision
title: "Transcriptie via Whisper in LiteLLM"
description: "Meeting-transcriptie loopt via een Whisper-model achter LiteLLM; de splitsing ik/anderen komt uit aparte audiosporen, niet uit diarization."
tags: [meetings, transcriptie, litellm]
decision_id: referentie/O2
decision_status: genomen
sources:
  - id: referentie
    resource: ../../references/referentie.md
    title: "Referentie: de opdracht"
  - id: readme
    resource: ../../references/readme.md
    title: "BonzaiWork README"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Transcriptie via Whisper in LiteLLM

## Context

Open beslissing O2: moet transcriptie ook via LiteLLM lopen (E4 strikt), of mag een aparte
transcriptie-API?[^referentie]

## Besluit

Transcriptie loopt via een Whisper-model in LiteLLM (`/v1/audio/transcriptions`). Besloten door de
gebruiker.[^readme]

## Gevolgen

- Whisper doet geen diarization. De splitsing "ik versus de anderen" komt uit de aparte sporen (mic en
  systeemaudio). Echte sprekerherkenning vraagt een model met diarization achter LiteLLM of een aparte
  stap.[^readme]
- De proxyroute stuurt `audio/transcriptions` al door.[^readme]
- Werkstroom D (meetings) is nog niet gebouwd en komt achter een eigen feature-flag.[^readme]

[^referentie]: Referentie §8 (O2).
[^readme]: README, "Genomen beslissingen" (O2) en "Volgende stappen".
