---
type: Decision
title: "Claude Code-integratie niet met een eigen route weigeren"
description: "De ingebouwde claude-agent-provider blijft dicht via de engine-policy en OPENCODE_CLAUDE_PATH; geen nieuwe hook om /opencode2/api/integration/* te weigeren."
tags: [engine, provider, beveiliging]
decision_id: kennisbank/claude-agent-niet-weigeren
decision_status: genomen
sources:
  - id: readme
    resource: ../../references/readme.md
    title: "BonzaiWork README"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Claude Code-integratie niet met een eigen route weigeren

## Context

Sinds `v0.18.66` heeft de v2-engine een ingebouwde provider die Claude Code als model gebruikt. De
serverproxy laat `POST /opencode2/api/integration/claude-agent/connect/external` door. De engine start
`claude` al voor zijn logincontrole bij het laden van een map; een echte Claude Code praat dan buiten
LiteLLM om met Anthropic.[^readme]

## Besluit

We weigeren `/opencode2/api/integration/*` **niet** met een eigen route. Wel:

- de engine-policy houdt `claude-agent` buiten de providerlijst en weigert een chatbeurt ermee, ook na een
  geslaagde connect;
- `SERVER_ENVIRONMENT_DEFAULTS` zet `OPENCODE_CLAUDE_PATH` op een pad dat niet bestaat, zodat de engine
  Claude Code niet start.[^readme]

## Gevolgen

- Beide maatregelen worden in CI getest (de engine-E2E met een nep-`claude`).[^readme]
- Een connect slaat hoogstens een nutteloze verwijzing op in de engine.[^readme]
- Een ontwikkelaar die zelf `OPENCODE_CLAUDE_PATH` zet, overschrijft de standaard; dan blijft alleen de
  policy over.[^readme]
- Opnieuw bekijken als upstream meer `/integration`-routes doorlaat of de engine-policy anders gaat werken.

## Niet gekozen

- **Een eigen weigerroute**: kan niet zonder nieuwe patch, want `server.ts` stuurt `/opencode2/*` door
  vóór de routetabel; er zou een nieuwe hook in `server.ts` en `downstream-hooks.ts` nodig zijn.[^readme]

[^readme]: README, "Bevindingen", "Claude Code (claude-agent)" en het besluit daaronder.
