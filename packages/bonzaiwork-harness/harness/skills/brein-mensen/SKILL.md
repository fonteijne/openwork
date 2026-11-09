---
name: brein-mensen
description: Iemand opzoeken of bijwerken in het persoonlijke brein van de gebruiker. Gebruik als de gebruiker vraagt wie iemand is, wat er met iemand is afgesproken, of iets over een persoon wil onthouden.
---

# Mensen in je brein

Mensen staan in het persoonlijke brein in `knowledge/mensen/`, één concept per persoon.

1. Zoek eerst met `persoonlijk_brein_zoeken` op de naam (ook een voornaam of een deel). Lees het concept met
   `persoonlijk_brein_lezen`.
2. Bestaat de persoon nog niet, maak `knowledge/mensen/<voornaam-achternaam>.md` met `persoonlijk_brein_schrijven`:

   ```markdown
   ---
   type: Person
   title: <Naam>
   description: <rol, organisatie, waar je deze persoon van kent, in één regel>
   tags: [mensen]
   status: draft
   ---
   # <Naam>

   ## Rol en context
   ## Afspraken en wat voor deze persoon telt
   ## Projecten
   ```

3. Bestaat de persoon wel, werk dan per passage bij met `persoonlijk_brein_bewerken` (geef de versie mee die je las).
   Vervang nooit het hele concept.
4. Noem bij elke nieuwe bewering de bron: de chat of het gesprek, met datum.
5. Geen gezondheids-, privé- of gevoelige gegevens, ook niet als de gebruiker ze noemt; zeg dat je die niet vastlegt.
6. Antwoord met wat je vond of veranderde, met een link naar het concept.
