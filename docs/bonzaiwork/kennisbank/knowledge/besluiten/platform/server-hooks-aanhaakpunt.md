---
type: Decision
title: "Een eigen aanhaakpunt voor server-uitbreidingen"
description: "BonzaiWork-routes en -beleid komen via OPENWORK_SERVER_HOOKS en downstream-hooks.ts, niet via apps/server/src/extensions."
tags: [server, hooks, upstream]
decision_id: readme/afwijking-3
decision_status: genomen
sources:
  - id: readme
    resource: ../../references/readme.md
    title: "BonzaiWork README"
  - id: referentie
    resource: ../../references/referentie.md
    title: "Referentie: de opdracht"
  - id: patches
    resource: ../../references/patches.md
    title: "PATCHES.md"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Een eigen aanhaakpunt voor server-uitbreidingen

## Context

BonzaiWork heeft eigen serverroutes nodig, waaronder een streaming-proxy naar LiteLLM. Upstream-bestanden
mogen alleen via een zo klein mogelijk aanhaakpunt veranderen.[^referentie]

## Besluit

Eén generiek aanhaakpunt: de server laadt de module uit `OPENWORK_SERVER_HOOKS`.
`apps/server/src/downstream-hooks.ts` definieert wat een hook kan (routes, provider-allowlist,
engine-policies, host-methodes) en bevat geen BonzaiWork-logica. Alle logica staat in
`packages/bonzaiwork-*`.[^readme][^patches]

## Gevolgen

- Vier upstream-bestanden hebben een hook van een paar regels; elke nieuwe server-functie (breinen,
  routines, agenda, today, feedback) kwam er zonder nieuwe patch bij.[^patches]
- Het aanhaakpunt is generiek genoeg om upstream aan te bieden; dan kunnen de patches vervallen.[^readme]
- Een race (routes antwoordden vóór `start()` klaar was) is gevonden en getest.[^readme]

## Niet gekozen

- **`apps/server/src/extensions/`**: actie-gebaseerd (JSON in, JSON uit), kan geen streaming-proxy
  dragen.[^readme]

Zie [Server-hooks](../../architectuur/server-hooks.md).

[^referentie]: Referentie §4, punt 3.
[^readme]: README, "Afwijkingen" punt 3, "Merge-test" en "Volgende stappen".
[^patches]: PATCHES.md, beide tabellen.
