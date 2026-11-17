---
type: Decision
title: "Feedback via een redirect naar GitHub"
description: "Feedback sturen opent een vooraf ingevuld GitHub-issueformulier; de gebruiker logt zelf in. Geen sleutel in de app, geen relay."
tags: [feedback, github, beveiliging]
decision_id: feedback/B2
decision_status: genomen
sources:
  - id: feedback
    resource: ../../references/feedback.md
    title: "Feedback sturen"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Feedback via een redirect naar GitHub

## Context

Zelf een issue aanmaken vraagt een GitHub-sleutel. Die kan niet in de app (alles in een app is eruit te
halen), dus dan is een relay nodig: een eigen dienst die de sleutel bewaart.[^feedback]

## Besluit

Een **redirect**: de app opent een vooraf ingevuld issueformulier op GitHub, de gebruiker logt zelf in.
Screenshot en opgeschoonde logs gaan naar Downloads en voegt de gebruiker zelf toe. De relay vervalt
(B2). Issues komen in deze repo (B1); de gebruiker kiest de categorie (B3).[^feedback]

## Gevolgen

- Voorwaarde: iedere gebruiker heeft een GitHub-account en is collaborator op de repo. Komen er gebruikers
  zonder GitHub, dan kan de knop later "Versturen" worden via een relay; dialoog en gegevens blijven
  gelijk.[^feedback]
- Naam of e-mail meesturen is niet nodig: het GitHub-account is de afzender (B5).[^feedback]
- Logs gaan nooit via de URL; GitHub kapt lange URL's af.[^feedback]

Zie [Feedback](../../architectuur/feedback.md).

[^feedback]: Feedback §2, §8 en §9.
