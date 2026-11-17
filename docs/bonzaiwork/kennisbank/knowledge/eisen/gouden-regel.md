---
type: Policy
title: "Importeren, niet aanpassen"
description: "Nieuwe functionaliteit in eigen mappen; een upstream-bestand alleen via configuratie, een minimale hook of een upstream-PR, en altijd in PATCHES.md."
tags: [upstream, patches, regels]
sources:
  - id: referentie
    resource: ../references/referentie.md
    title: "Referentie: de opdracht"
  - id: patches
    resource: ../references/patches.md
    title: "PATCHES.md"
generated: {by: claude-opus-5-5, at: 2026-11-17T10:25:24.816Z}
status: draft
---
# Importeren, niet aanpassen

> Een **import** van upstream-code levert bij een merge nooit een conflict op. Een **wijziging** in een
> upstream-bestand wel.[^referentie]

1. Nieuwe functionaliteit komt in eigen mappen: `apps/bonzaiwork` en `packages/bonzaiwork-*`.
2. Upstream-code importeren en eromheen bouwen, niet kopiëren en niet aanpassen.
3. Is een wijziging in een upstream-bestand echt nodig, kies dan in deze volgorde:
   a. een bestaand configuratiepunt (env var, builder-config, flag);
   b. een zo klein mogelijk aanhaakpunt (hook) met de logica in eigen code;
   c. een upstream-PR voor dat aanhaakpunt, zodat de patch kan vervallen.
4. Elke wijziging aan een upstream-bestand komt in `PATCHES.md`.[^referentie]

`check-patches.mjs` bewaakt punt 4 in CI. Boven ±10 gepatchte bestanden herzien we de aanpak.[^patches]

De UI gaat verder dan de regel: hij importeert ook niets uit `apps/app` (zie
[Een eigen UI](../besluiten/platform/eigen-ui.md)).

[^referentie]: Referentie §4.
[^patches]: PATCHES.md, inleiding.
