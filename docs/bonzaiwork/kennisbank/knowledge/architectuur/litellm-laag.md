---
type: System
title: "LiteLLM-laag"
description: "LiteLLM is de enige provider: een loopback-proxy injecteert de key per workspace, en de gate en de engine-policies laten geen andere provider toe."
tags: [litellm, provider, keys, beveiliging]
resource: ../../../../../packages/bonzaiwork-litellm
sources:
  - id: readme
    resource: ../references/readme.md
    title: BonzaiWork README
  - id: referentie
    resource: ../references/referentie.md
    title: "Referentie: de opdracht"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# LiteLLM-laag

De engine kent één provider, `litellm`, met als `baseURL` een loopback-route van de server
(`/bonzaiwork/litellm/v1`) en als `apiKey` een lokaal token. De route controleert dat token, zoekt bij
welke workspace de sessie hoort, voegt de echte LiteLLM-key toe en geeft het antwoord door, ook als
SSE-stream.[^readme]

## Afdwinging

Eis E4 vraagt afdwinging in de engine-config, de server-gate en de UI.[^referentie] De server doet het
op twee plekken, omdat één niet genoeg bleek:[^readme]

1. **Provider-gate**: `allowedProviderIds = ["litellm"]`; de mirror zet alleen litellm in de engine.
2. **Engine-policy**: `experimental.policies` met `provider.use * deny` en `litellm allow`. Zonder deze
   policy las de v2-engine een provider uit een project-`opencode.json` zelf in, en een chat via die
   provider slaagde ondanks de gate.

Daarnaast: geen modelcatalogus van `models.openworklabs.com` (`OPENCODE_DISABLE_MODELS_FETCH=1` en
`OPENCODE_MODELS_URL` op een loopback-adres), en `OPENCODE_CLAUDE_PATH` op een pad dat niet bestaat, zodat
de engine geen Claude Code start.[^readme]

## Welke workspace?

De v2-engine stuurt bij elk modelverzoek `x-opencode-session` mee. De route zoekt die sessie op en
vergelijkt de home-map met de workspace-paden, dezelfde controle als de eigen proxy van de server. De
koppeling wordt per sessie gecachet; een `baseURL` per workspace is niet nodig.[^readme]

## Keys

- Versleuteld met Electron `safeStorage` in `userData/bonzaiwork/litellm-keys.json`; de sleutel blijft in
  de OS-keychain. Zonder echte keychain blijven keys alleen in het geheugen, en de instellingen tonen
  dat.[^readme]
- De store staat in hetzelfde proces als de server; keys gaan niet via IPC, en nooit naar config, env,
  logs of foutmeldingen. LiteLLM-fouten worden vóór doorgifte opgeschoond.[^readme]
- Twee `KeyResolver`s: per gebruiker en per workspace; de build kiest met `BONZAIWORK_KEY_MODE`.[^readme]
- Modellen komen uit `GET /v1/models` met de gekoppelde key.[^readme]

## Besluiten

- [LiteLLM is de enige provider](../besluiten/platform/litellm-enige-provider.md)
- [LiteLLM-URL in de build](../besluiten/platform/litellm-url-ingebakken.md)
- [Keys in de OS-keychain, injectie in de proxy](../besluiten/platform/keys-keychain-proxy.md)
- [Key per gebruiker of per project](../besluiten/platform/key-per-gebruiker-of-project.md)
- [Claude Code-integratie niet met een eigen route weigeren](../besluiten/platform/claude-agent-niet-weigeren.md)
- [Voorkeursmodellen in de build](../besluiten/functies/voorkeursmodellen.md)

[^readme]: README, "Hoe het in elkaar zit", "Verificatie" en "Bevindingen voor werkstroom C".
[^referentie]: Referentie §2 (E4, E5).
