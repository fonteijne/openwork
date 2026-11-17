---
type: System
title: "Breinen"
description: "Git-repo's met gedeelde kennis (OKF) en werkwijzen (ICM); BonzaiWork werkt ze bij vóór een beurt en legt ze vast na een beurt, in code."
tags: [breinen, git, okf, icm]
resource: ../../../../../packages/bonzaiwork-brains
sources:
  - id: plan
    resource: ../references/project-breinen-plan.md
    title: "Project-breinen: implementatieplan"
  - id: herzien
    resource: ../references/persoonlijk-brein-herzien-onderzoek.md
    title: "Onderzoek: het persoonlijke brein herzien"
  - id: readme
    resource: ../references/readme.md
    title: BonzaiWork README
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Breinen

Een **project-brein** is een git-repo die BonzaiWork via SSH clonet in `~/BonzaiWork/<naam>`: de
gedeelde kennis en werkwijzen van een team. Wat het team weet staat als OKF-bundel in `knowledge/`, wat
het doet als ICM-werkwijzen in `workflows/`, met `AGENTS.md` als ingang. Elke gebruiker heeft daarnaast
één **persoonlijk brein** dat in elk project meetelt, en kan in een chat lezen uit een ander brein op de
laptop.[^plan]

## Momenten

| Moment | Wat BonzaiWork doet |
|---|---|
| Project openen, en elke 5 min als het rustig is | `fetch`; bijwerken als de map schoon is |
| Vlak vóór elke beurt | project- en persoonlijk brein bijwerken (max. ~5 s wachten) |
| Alle chats in het project stil, plus 15 s | vastleggen en versturen |
| Altijd | de AI mag geen git uitvoeren en niet in `.git/**` schrijven (engine-policy) |

Naar §2 van het plan.[^plan] Het einde van een beurt komt uit de eventstream van de engine
(`session.execution.*`), server-side, zodat ook routines en een gesloten venster meetellen.[^plan]

## Code

`packages/bonzaiwork-brains`: `git.ts` (meegeleverde git, systeem-ssh), `sync.ts` (wachtrij, mutex,
pull/commit/push, conflicten), `okf.ts` en `icm.ts` (wat BonzaiWork vóór een commit en bij een run zelf
afdwingt), `routes.ts`, `mcp.ts` (MCP "breinen") en `secrets.ts`. De UI staat in
`apps/bonzaiwork/src/features/brain/`.[^plan][^readme]

## Skills uit de app

De skills `okf-*` en `icm-architect` en de commando's `/verwerk`, `/vastleggen`, `/onderhoud` en
`/werkwijze` levert de app zelf, via de config-map van de engine in elk project. Een brein krijgt er geen
kopie meer van.[^herzien][^readme]

## Besluiten

- [Synchronisatie is code, geen instructie](../besluiten/breinen/sync-is-code.md)
- [Git gaat mee in de app](../besluiten/breinen/git-meegeleverd.md)
- [Alleen SSH met de sleutels die er al zijn](../besluiten/breinen/alleen-ssh.md)
- [Per beurt vastleggen en versturen](../besluiten/breinen/per-beurt-vastleggen.md)
- [Modi per brein](../besluiten/breinen/modi-per-brein.md)
- [Vertrouwen per gebruiker](../besluiten/breinen/vertrouwen-per-gebruiker.md)
- [Kennis in OKF, acties in ICM](../besluiten/breinen/okf-en-icm.md)
- [Voorkeuren alleen via een voorstelkaart](../besluiten/breinen/voorkeuren-via-kaart.md)
- [Skills komen uit de app](../besluiten/breinen/skills-uit-de-app.md)

[^plan]: Breinenplan §1, §2, §3 en §3.3.
[^herzien]: Onderzoek persoonlijk brein §4.2.
[^readme]: README, beslissing S1 en "Wat er staat".
