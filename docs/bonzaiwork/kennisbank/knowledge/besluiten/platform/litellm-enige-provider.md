---
type: Decision
title: "LiteLLM is de enige provider"
description: "Alleen provider litellm, afgedwongen in de provider-gate én in de engine-policies; geen tweede of fallback-provider, ook niet voor development."
tags: [litellm, provider, beveiliging]
decision_id: referentie/E4
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
# LiteLLM is de enige provider

## Context

Alle modelverkeer moet via LiteLLM lopen, zodat keys, kosten en modelkeuze centraal te beheren zijn.
Eis E4: LiteLLM is de standaard **en enige** provider, afgedwongen in de engine-config, de server-gate en
de UI.[^referentie]

## Besluit

- Server-gate: `allowedProviderIds = ["litellm"]`; de mirror duwt alleen litellm naar de engine.
- Engine-config: `experimental.policies` met `provider.use * deny` en `litellm allow`.
- De UI praat alleen met `/opencode2` (zie [Alleen de v2-engine](alleen-engine-v2.md)).
- Geen tweede provider, ook niet tijdelijk; voor development een lokale LiteLLM.[^referentie][^readme]

## Gevolgen

- Een provider uit een project-`opencode.json` (ook als die zichzelf via policies probeert toe te staan)
  of een lokale `auth.json` werkt niet; de E2E test dat.[^readme]
- De ingebouwde Claude Code-provider van de engine valt ook onder de policy (zie
  [Claude Code-integratie niet met een eigen route weigeren](claude-agent-niet-weigeren.md)).
- De `managed-opencode-v2.ts`-hook dicht ook een gat in upstream's eigen "Only models you provide" en is
  een kandidaat voor een upstream-PR.[^readme]

## Niet gekozen

- **Alleen de mirror-gate**: in een handmatig experiment las de v2-engine een project-`opencode.json`
  zelf in, en een chat via die provider slaagde.[^readme]

Zie [LiteLLM-laag](../../architectuur/litellm-laag.md).

[^referentie]: Referentie §2 (E4) en §7.
[^readme]: README, "Hoe het in elkaar zit", "Verificatie" en de alinea erna.
