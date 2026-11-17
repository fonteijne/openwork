---
type: Decision
title: "Keys in de OS-keychain, injectie in de proxy"
description: "LiteLLM virtual keys staan versleuteld met safeStorage; de loopback-proxy voegt ze toe. Nooit in config, env, logs of foutmeldingen."
tags: [keys, beveiliging, litellm]
decision_id: referentie/E5
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
# Keys in de OS-keychain, injectie in de proxy

## Context

Eis E5: keys per project of gebruiker via LiteLLM virtual keys, nooit in configbestanden, opslag in de
OS-keychain, een lokale proxyroute injecteert de key.[^referentie]

## Besluit

- Keys staan versleuteld met Electron `safeStorage` in `userData/bonzaiwork/litellm-keys.json`; dat
  bestand bevat alleen ciphertext.[^readme]
- De engine krijgt als `apiKey` een lokaal token. De route `/bonzaiwork/litellm/v1/*` controleert het,
  bepaalt de workspace via `x-opencode-session` en voegt de echte key toe.[^readme]
- De store staat in hetzelfde proces als de server (die in-process draait), dus keys gaan niet via IPC.[^readme]

## Gevolgen

- Zonder echte keychain (Linux zonder secret service) blijven keys alleen in het geheugen; de
  instellingen tonen dat.[^readme]
- LiteLLM-fouten worden vóór doorgifte opgeschoond; de E2E controleert dat er geen key in logs,
  engine-config, `runtime.sqlite` of workspaces staat.[^readme]
- De UI toont nooit een key, alleen een hint ("…a1b2").

Zie [LiteLLM-laag](../../architectuur/litellm-laag.md) en [Key per gebruiker of per project](key-per-gebruiker-of-project.md).

[^referentie]: Referentie §2 (E5).
[^readme]: README, "Hoe het in elkaar zit" en "Verificatie".
