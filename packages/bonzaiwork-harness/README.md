# @bonzaiwork/harness

Het harnas van BonzaiWork: de skills, commando's en de agent Brein die met de app meekomen en in elk project
gelden (ontwerp in [`docs/bonzaiwork/brein-harnas-plan.md`](../../docs/bonzaiwork/brein-harnas-plan.md)).

| Map of bestand | Wat |
|---|---|
| `harness/skills/<naam>/` | skills (`okf-ingest`, `okf-query`, `okf-lint`, `icm-architect` (MIT, zie `VENDOR.md`), `brein-mensen`) |
| `harness/commands/<naam>.md` | commando's `/verwerk`, `/vastleggen`, `/onderhoud`, `/werkwijze`, `/onthoud` |
| `harness/agents/brein.md` | de agent Brein, standaard op Jouw brein en kiesbaar in elk project |
| `harness.json` | versie en per onderdeel de vingerafdruk van elke ooit meegeleverde versie |
| `src/files.ts` | gegenereerd: elk bestand als tekst (`pnpm --filter @bonzaiwork/harness manifest`) |
| `src/index.ts` | `HARNESS_VERSION`, `harnessItems()`, `itemFingerprint()`, `stampHarness()` |

Een onderdeel wijzigen: pas het bestand aan, verhoog `version` in `harness.json` en draai `pnpm --filter
@bonzaiwork/harness manifest`. De test bewaakt dat `src/files.ts` en de vingerafdruk van de huidige versie
kloppen. Oude vingerafdrukken blijven staan: zo herkent de sync een ongewijzigde kopie van een eerdere versie
in een projectbrein (plan H3).
