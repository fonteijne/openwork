---
type: Policy
title: "Niet doen"
description: "Geen apps/app aanpassen, niets uit ee/, niet rebasen op upstream, geen keys in config of logs, geen gegenereerde SDK committen, geen npm/yarn, geen tweede provider."
tags: [regels]
sources:
  - id: referentie
    resource: ../references/referentie.md
    title: "Referentie: de opdracht"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Niet doen

- Geen bestanden in `apps/app/**` aanpassen.
- Niets uit `ee/**` importeren of aanpassen.
- Niet rebasen op upstream. Niet mergen vanaf `upstream/dev`.
- Geen API-keys in configbestanden, env-bestanden, logs, foutmeldingen of telemetrie.
- Geen gegenereerde SDK- of OpenAPI-bestanden met de hand aanpassen of committen.
- Geen npm of yarn; alleen pnpm.
- Geen tweede provider of "fallback"-provider, ook niet tijdelijk voor development. Gebruik een lokale
  LiteLLM-instantie.

Uit de referentie.[^referentie]

[^referentie]: Referentie §7.
