# Kennisbank BonzaiWork

Hoe BonzaiWork in elkaar zit en waarom: de architectuur en de besluiten die we nemen, als
**OKF-bundel** (Open Knowledge Format v0.2), in dezelfde vorm als de kennis in een brein
([`project-breinen-plan.md` §6](../project-breinen-plan.md#6-wat-er-in-een-brein-staat-kennis-in-okf-acties-in-icm)).
De plannen en onderzoeken in `docs/bonzaiwork/` blijven de uitgebreide bron; deze bundel is de
korte, doorzoekbare laag erboven.

## Waar alles staat

| Pad | Wat |
|---|---|
| `knowledge/` | de OKF-bundel; begin bij [`knowledge/index.md`](knowledge/index.md) |
| `knowledge/architectuur/` | onderdelen (`System`) en de releasestroom (`Process`) |
| `knowledge/besluiten/` | besluiten (`Decision`), per gebied: `platform/`, `breinen/`, `functies/` |
| `knowledge/eisen/` | harde eisen en regels (`Policy`) |
| `knowledge/begrippen/` | begrippen (`Glossary Term`) |
| `knowledge/references/` | de brondocumenten (`Reference`); onveranderlijk |
| `_meta/schema.md` | de typen, velden en schrijfafspraken van deze bundel |
| `_templates/` | `besluit.md` en `concept.md`: nieuw werk is een kopie |

## Waar je heen gaat

- **Een vraag over hoe iets werkt**: `knowledge/index.md` → de `index.md` van de map → het concept.
  Volg de links en de bronnen (`sources`) voor de details.
- **Een besluit opzoeken**: `knowledge/besluiten/`. Oude nummers uit de plannen (O3, B2, T7 …) staan
  in `decision_id`; zoek daarop.
- **Een besluit vastleggen**: kopieer `_templates/besluit.md` naar de juiste map onder
  `knowledge/besluiten/`, vul hem in volgens `_meta/schema.md`, en draai de controle hieronder.
  Vervangt het een eerder besluit, zet dat dan op `status: deprecated` met een link naar de opvolger.
- **Architectuur verandert**: werk het `System`-concept bij in dezelfde PR als de code.

## Automatisch bijhouden

In Claude Code-sessies in deze repo doet een hook (`.claude/settings.json` →
`scripts/bonzaiwork/kennisbank-hook.ts`) het bijhouden, net zoals BonzaiWork dat bij een brein doet:

- **Bij de start** onthoudt hij waar de sessie begon.
- **Als de agent wil stoppen**: concepten die in de sessie veranderden krijgen `generated` en een regel
  in `log.md`, elke `index.md` wordt opnieuw gemaakt, en de bundel wordt gecontroleerd. Een probleem
  houdt het stoppen tegen (max. 3 keer per sessie).
- **Veranderde er BonzaiWork-code of een plan**, dan vraagt hij de agent één keer per stand van de
  wijzigingen om besluiten en architectuurwijzigingen vast te leggen, ook wat in het gesprek besloten is.
  Is er niets vast te leggen, dan zegt de agent dat en rondt af.

De hook commit niets en zet niets klaar; de wijzigingen komen in dezelfde PR als de code. Andere agents
(Codex, OpenCode) hebben deze hook niet: draai dan zelf de controle hieronder en leg besluiten vast.

## Controle

```bash
# vanuit de root van de repo
pnpm install --filter @bonzaiwork/brains...  # eenmalig: yaml voor okf.ts
bun scripts/bonzaiwork/kennisbank.ts         # conformiteit, links, bronnen, index.md
bun scripts/bonzaiwork/kennisbank.ts --write # index.md opnieuw maken
```

De controle gebruikt dezelfde OKF-code als de app (`packages/bonzaiwork-brains/src/okf.ts`).
`index.md` schrijft alleen het script. `log.md` en `generated` schrijft de hook; werk je zonder hook,
voeg dan zelf een regel toe in `log.md` (nieuwste bovenaan).
