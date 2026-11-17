---
type: System
title: "Persoonlijke agent"
description: "Taken, mail, Slack, beloftes en afspraken op Vandaag, elk met de eerste stap al gedaan; de agent leest en stelt voor, de gebruiker verstuurt."
tags: [vandaag, agent, taken]
resource: ../../../../../packages/bonzaiwork-today
sources:
  - id: plan
    resource: ../references/persoonlijke-agent-plan.md
    title: Persoonlijke agent op Vandaag
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Persoonlijke agent

Vandaag toonde eerst alleen wat op je wacht van agents. De persoonlijke agent voegt toe wat op je wacht
van de wereld: taken, mail, Slack, afspraken en beloftes. Het doel is **uitvoeren omzetten in
beoordelen**: elk item komt binnen met de eerste stap al gedaan.[^plan]

## Opbouw

- `packages/bonzaiwork-today` (server): een taakindex over de breinen, "Start hier", kaarten voor mail,
  Slack, beloftes en afspraken, en de tools en rondes van de agent. `./model` deelt de logica met de UI.
- Taken zijn Markdown-checkboxen in het persoonlijke brein en in project-breinen; de server indexeert ze
  zonder model.
- Outlook, agenda en Slack lopen via lokale koppelingen, niet via de OpenWork-cloud.
- Alles staat uit tot de gebruiker het per onderdeel aanzet; `BONZAIWORK_TODAY=0` zet het voor een
  installatie uit.[^plan]

De koppelingen met Microsoft 365 en Slack zijn alleen tegen nagebouwde tegenhangers getest.[^plan]

## Besluiten

- [Taken als Markdown-checkbox in de breinen](../besluiten/functies/taken-als-checkbox.md)
- [De agent kiest één taak](../besluiten/functies/agent-kiest-taak.md)
- [Alleen de gebruiker verstuurt](../besluiten/functies/alleen-gebruiker-verstuurt.md)

[^plan]: Plan persoonlijke agent, status, §0, §1 en §7.
