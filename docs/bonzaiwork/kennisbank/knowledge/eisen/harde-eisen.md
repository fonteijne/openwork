---
type: Policy
title: "Harde eisen E1–E7"
description: "Zelfstandige app, eigen UI, mergebare upstream, alleen LiteLLM, keys via virtual keys in de keychain, geen OpenWork-cloud, geen code uit /ee."
tags: [eisen, architectuur]
sources:
  - id: referentie
    resource: ../references/referentie.md
    title: "Referentie: de opdracht"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Harde eisen E1–E7

| # | Eis | Gevolg |
|---|---|---|
| E1 | Zelfstandige app: geen extra apps nodig bij de gebruiker | Alles wat nodig is (git, keyopslag, later de recorder) zit in de app-bundel |
| E2 | Volledig eigen UI | Een nieuwe app in `apps/bonzaiwork`, niet `apps/app` aanpassen |
| E3 | Upstream blijft mergebaar | Upstream-bestanden zo min mogelijk aanraken; elke wijziging in `PATCHES.md` |
| E4 | LiteLLM is de standaard **en enige** provider | Afgedwongen in de engine-config, de server-gate en de UI |
| E5 | Keys per project of gebruiker via LiteLLM virtual keys | Nooit in configbestanden; opslag in de OS-keychain; de proxy injecteert de key |
| E6 | Geen verkeer naar de OpenWork-cloud (`*.openworklabs.com`) | Endpoints, telemetrie en updater omleiden of uitzetten |
| E7 | Geen code uit `/ee` in productie | Commerciële licentie: niet importeren, niet aanpassen; Den gebruiken we niet |

Naar de tabel in de referentie.[^referentie]

## Uitgewerkt in

- [LiteLLM is de enige provider](../besluiten/platform/litellm-enige-provider.md) (E4)
- [Keys in de OS-keychain, injectie in de proxy](../besluiten/platform/keys-keychain-proxy.md) (E5)
- [Geen modelcatalogus van de OpenWork-cloud](../besluiten/platform/geen-modelcatalogus.md) (E6)
- [Een eigen UI zonder imports uit apps/app](../besluiten/platform/eigen-ui.md) (E2)
- [Git gaat mee in de app](../besluiten/breinen/git-meegeleverd.md) (E1)
- [Importeren, niet aanpassen](gouden-regel.md) (E3)

[^referentie]: Referentie §2.
