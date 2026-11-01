# Schema - typen en schrijfafspraken voor kennis

De kennis staat in `knowledge/`, in het Open Knowledge Format (OKF) v0.2. Dit bestand is de enige plek
voor deze afspraken; pas ze hier aan.

## Typen

Kies het `type` van een concept uit deze lijst. Past er geen, voeg dan hier een type toe.

| Type | Voor |
|---|---|
| Process | een bedrijfsproces: wie doet wat, wanneer en waarom |
| Decision | een besluit, met de reden en de datum |
| Policy | een regel of beleid dat geldt |
| Product | een product of dienst |
| System | een systeem, tool of dashboard |
| Team | een team of rol |
| Glossary Term | een begrip en wat we ermee bedoelen |
| Analysis | een uitgezocht antwoord dat blijvend waardevol is |
| Meeting Summary | de afspraken uit een overleg |
| Reference | een bron in `knowledge/references/` |

## Schrijven

- Eén concept per bestand, ingedeeld naar onderwerp. Werk een bestaand concept bij in plaats van een
  tweede over hetzelfde te maken.
- Frontmatter: `type` (verplicht), `title`, `description` (één zin), `tags`.
- Kennis uit een bron: de bron in `sources` (`id`, `resource`, `title`) en een voetnoot `[^id]` bij de
  bewering.
- Links zijn relatief (`[kortingsbeleid](kortingsbeleid.md)`), geen `[[wikilinks]]`. Een link naar een
  concept dat nog niet bestaat, mag.
- Nieuw concept: `status: draft`. Tijdgevoelige kennis (prijzen, contactpersonen, planning): `stale_after`.
- Vervangen: `status: deprecated` en een link naar de opvolger; niet verwijderen.
- Spreekt een nieuwe bron een concept tegen, zet dat dan in het concept, met beide bronnen. Kies niet
  stilzwijgend.
- `knowledge/references/` wijzig of verwijder je nooit; een nieuwe versie is een nieuw bestand.
- `index.md`, `log.md`, `generated` en `verified` schrijf je nooit zelf; dat doet BonzaiWork.
- Kennis verwijst nooit naar `workflows/`; werkwijzen verwijzen naar kennis.
- Geen wachtwoorden, sleutels of privégegevens van personen.
