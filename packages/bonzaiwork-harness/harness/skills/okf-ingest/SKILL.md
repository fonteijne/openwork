---
name: okf-ingest
description: Een bron verwerken in de kennis van dit brein (OKF). Gebruik als de gebruiker een bestand, tekst of notitie aanlevert om te bewaren, of /verwerk vraagt.
---

# Een bron verwerken

1. Lees `_meta/schema.md` voor de typen en schrijfafspraken, en `knowledge/index.md` voor wat er al is.
2. Zet de bron als Markdown in `knowledge/references/<jjjj-mm-dd>-<onderwerp>.md`, met frontmatter
   `type: Reference`, `title` en `resource` (waar het origineel staat, als dat er is). Alleen `.md`.
   Een bestaande bron wijzig je nooit; een nieuwe versie is een nieuw bestand.
3. Bespreek in een paar zinnen de belangrijkste punten met de gebruiker.
4. Zoek via de indexen welke concepten de bron raakt. Werk ze bij of maak nieuwe, één concept per
   bestand, met de bron in `sources` en een voetnoot `[^id]` bij elke bewering eruit. Nieuw:
   `status: draft`.
5. Spreekt de bron een concept tegen, zet dat in het concept met beide bronnen; kies niet stilzwijgend.
6. Noem tot slot welke concepten je maakte of bijwerkte, met links.

Schrijf nooit `index.md`, `log.md`, `generated` of `verified`; dat doet BonzaiWork na de beurt.
