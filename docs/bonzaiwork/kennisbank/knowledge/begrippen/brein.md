---
type: Glossary Term
title: "Brein"
description: "Een project waarvan de map een git-repo is die BonzaiWork synchroniseert: een gedeeld projectbrein, of het persoonlijke brein (in de UI Mijn agent)."
tags: [begrippen, breinen]
sources:
  - id: breinen
    resource: ../references/project-breinen-plan.md
    title: "Project-breinen: implementatieplan"
  - id: readme
    resource: ../references/readme.md
    title: "BonzaiWork README"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Brein

- **Project-brein**: een git-repo die BonzaiWork via SSH clonet en synchroniseert, met de gedeelde kennis
  (`knowledge/`) en werkwijzen (`workflows/`) van een team.[^breinen]
- **Persoonlijk brein**: één per gebruiker, met eigen voorkeuren, kennis en werkwijzen die in elk project
  meetellen.[^breinen] In de UI heet het "Mijn agent"; in code en tools nog `persoonlijk_brein_*` en
  `kind: "personal"`.[^readme]

Zie [Breinen](../architectuur/breinen.md) en [Eén begrip Agent](../besluiten/functies/een-begrip-agent.md).

[^breinen]: Breinenplan §1.
[^readme]: README, "Genomen beslissingen" (A1).
