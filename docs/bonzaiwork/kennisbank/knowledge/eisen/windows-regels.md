---
type: Policy
title: "Ontwikkelen zonder Windows-machine"
description: "Platform meegeven en op Linux testen, paden met node:path, geen POSIX-gereedschap in productiecode, externe programma's met een volledig pad, regeleinden met \\r?\\n."
tags: [windows, regels, platform]
sources:
  - id: windows
    resource: ../references/windows.md
    title: "Windows: wat nog niet getest is"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Ontwikkelen zonder Windows-machine

1. Geef `platform` mee aan elke functie die op Windows anders werkt en test die met Windows-invoer op
   Linux; lees `process.platform` alleen aan de rand.
2. Bouw paden met `node:path`, vergelijk mappen met `samePath`; een pad dat naar git gaat mag `/`.
3. Geen POSIX-gereedschap (`sh`, `du`, `chmod`, `find`) in productiecode.
4. Externe programma's (`git`, `ssh`, `gh`) altijd met een volledig pad of een uitdrukkelijke zoeklijst,
   nooit met `shell: true`, en met `windowsHide: true`.
5. Lees Markdown met `/\r?\n/`; schrijf wat de app maakt met `\n`.
6. `mode: 0o600` doet op Windows niets; vertrouw er niet op voor geheimen.
7. Verwacht `EPERM`/`EBUSY` bij `rename` op Windows.
8. Elke nieuwe Windows-afwijking krijgt een rij in `windows.md` §2.

Ingekort uit `windows.md`.[^windows]

[^windows]: Windows §4.
