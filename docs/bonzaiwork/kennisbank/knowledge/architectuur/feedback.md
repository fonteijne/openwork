---
type: System
title: "Feedback"
description: "Feedback sturen verzamelt een screenshot en opgeschoonde logs lokaal en opent een vooraf ingevuld GitHub-issueformulier; geen sleutel of relay."
tags: [feedback, github, privacy]
resource: ../../../../../packages/bonzaiwork-feedback
sources:
  - id: feedback
    resource: ../references/feedback.md
    title: Feedback sturen
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Feedback

De knop "Feedback sturen" maakt via de server-hook een screenshot van het venster, verzamelt
opgeschoonde logs en slaat ze op in Downloads. Daarna opent hij een vooraf ingevuld issueformulier op
GitHub (`bonzaiwork-bug.yml` of `bonzaiwork-idee.yml`); de gebruiker voegt de bestanden zelf toe.[^feedback]

## Opbouw

- `POST /bonzaiwork/feedback/collect` en `POST /bonzaiwork/feedback/:id/save`, beide met het host-token.
- `DiagnosticsSource`, geregistreerd door desktop-main zoals de KeyStore: `captureWindow()`,
  `logFiles()`, `saveDirectory()`.
- Doelrepo met `VITE_BONZAIWORK_FEEDBACK_REPO` bij het bouwen. Logs gaan nooit via de URL; de tekst gaat
  mee tot 2.000 tekens.[^feedback]

## Besluiten

- [Feedback via een redirect naar GitHub](../besluiten/functies/feedback-redirect.md)

[^feedback]: Feedback §4, §5 en §9.
