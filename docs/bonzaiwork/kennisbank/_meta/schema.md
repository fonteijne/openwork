# Schema van de kennisbank

Elk `.md`-bestand in `knowledge/` (behalve `index.md` en `log.md`) is een OKF-concept: YAML-frontmatter
met een niet-lege `type`, daarna Markdown. Onbekende sleutels zijn toegestaan en blijven staan.

## Typen

| Type | Waarvoor | Map |
|---|---|---|
| `System` | een onderdeel van BonzaiWork: wat het doet, waar de code staat, hoe het samenhangt | `architectuur/` |
| `Process` | hoe het team iets doet (branches, sync, promoveren, CI) | `architectuur/` |
| `Decision` | één besluit: context, besluit, gevolgen, alternatieven | `besluiten/<gebied>/` |
| `Policy` | een harde eis of regel die altijd geldt | `eisen/` |
| `Glossary Term` | één begrip en wat het in UI en code betekent | `begrippen/` |
| `Reference` | een brondocument; `resource` wijst naar het echte bestand | `references/` |

## Velden

| Veld | Verplicht | Afspraak |
|---|---|---|
| `type` | ja | één van de typen hierboven |
| `title` | ja | korte naam; bij een besluit de uitkomst ("LiteLLM is de enige provider") |
| `description` | ja | één regel; dit is wat de index toont |
| `tags` | nee | kleine letters, bijv. `[litellm, beveiliging]` |
| `sources` | ja, behalve bij `Reference` | lijst `{ id, resource, title }`; `resource` is een relatief pad naar `../references/…` (of dieper) |
| `generated` | ja | `{by, at}`: wie het concept het laatst schreef. Een mens: `human:<github-naam>`; een AI: de model-id. In een Claude Code-sessie zet de hook dit zelf |
| `verified` | nee | lijst `{by: human:<naam>, at}`; zet je als je het concept tegen de bron en de code hebt nagekeken |
| `status` | ja | `draft` (nog niet nagekeken), `stable` (nagekeken), `deprecated` (vervangen; link naar de opvolger) |
| `resource` | nee | bij `System`: de map met de code |
| `stale_after` | nee | datum waarna het concept opnieuw bekeken moet worden (bijv. bij een tijdelijke keuze) |

Alleen bij `Decision`:

| Veld | Verplicht | Afspraak |
|---|---|---|
| `decision_id` | ja | `<bron>/<nummer>` zoals in het brondocument, bijv. `referentie/O3`, `project-breinen/B2`; zonder nummer `kennisbank/<slug>` |
| `decision_status` | ja | `genomen`, `voorlopig` (geldt, maar staat nog open voor herziening) of `open` (nog niet beslist; de huidige stand staat erbij) |

`status` gaat over het concept (is de tekst nagekeken?), `decision_status` over het besluit zelf.

## Schrijfafspraken

- Nederlands, korte zinnen, zoals de rest van `docs/bonzaiwork/`.
- Een besluit heeft de koppen `## Context`, `## Besluit`, `## Gevolgen` en, als ze er waren,
  `## Niet gekozen`.
- Beweringen uit een bron krijgen een voetnoot `[^id]`; `id` is een `sources[].id`.
- Links zijn relatief en moeten bestaan; geen `[[wikilinks]]`, geen absolute paden.
- Kennis is kort. Staat de uitleg al in een plan, link ernaar in plaats van hem te kopiëren.
- `references/` verander je niet; een nieuwe bron is een nieuw bestand.
