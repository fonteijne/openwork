# @bonzaiwork/brains

Project-breinen: git-repo's die BonzaiWork vóór een beurt bijwerkt en erna deelt. Ontwerp in
[`docs/bonzaiwork/project-breinen-plan.md`](../../docs/bonzaiwork/project-breinen-plan.md), metingen in
[`project-breinen-fase0.md`](../../docs/bonzaiwork/project-breinen-fase0.md).

| Bestand | Wat |
|---|---|
| `src/git.ts` | Elke git-aanroep: opgebouwde omgeving, geen config van de gebruiker, `-c`-opties vóór de repo-config (geen hooks, fsmonitor, signing, LFS), alleen SSH (`file://` alleen in tests). Gebruikt de meegeleverde dugite-native-git als `gitDirectory` is gezet, anders git van het `PATH` |
| `src/remote.ts` | Browserlinks en `git@`/`ssh://` naar de SSH-vorm |
| `src/ssh.ts` | Systeem-ssh met `BatchMode`, meegeleverde host-sleutels van GitHub en GitLab, vingerafdruk van een onbekende host, foutherkenning, "Verbinding testen" (herkent een vergrendelde sleutel) |
| `src/messages.ts` | Nederlandse meldingen voor `BrainStatus.error` |
| `src/secrets.ts` | Geheimenscan vóór elke commit |
| `src/trust.ts` | Wat code kan draaien (plugins, agents, `opencode.json`, commando's met shell, `_tools/`) en de sparse-checkout-regels die het buiten de map houden |
| `src/okf.ts` | OKF v0.2 vóór elke commit: conformiteit, `generated` (AI en mens apart), `index.md` per map, `log.md`, `references/` onveranderlijk; "Klopt" (`verified`) en de vertrouwenstrede voor de UI |
| `src/icm.ts` | Structuurcontrole van stapcontracten in `workflows/`; waarschuwingen voor een lange `AGENTS.md` en kennis die naar werkwijzen linkt |
| `src/template.ts`, `templates/` | De projectboilerplate (`templates/project/`, zie hieronder), het breinsjabloon (team en persoonlijk), skills `okf-ingest`, `okf-query`, `okf-lint` en het meegeleverde `icm-architect` (MIT), commando's `/verwerk`, `/vastleggen`, `/onderhoud`, `/werkwijze`. `src/template-files.js` (gegenereerd) bundelt ze als tekst |
| `src/personal.ts`, `src/mcp.ts` | Het persoonlijke brein: cloudmappen, de globale instructies (app-regels + `AGENTS.md` + `_meta/voorkeuren.md`, max. 32 KiB), veilige paden, en de lokale MCP-server `breinen` met `persoonlijk_brein_lezen/zoeken/schrijven/bewerken` en `voorkeur_voorstellen` |
| `src/registry.ts`, `src/server-hooks.ts` | `brains.json`, de routes `/bonzaiwork/brains/*`, de `Stop`-hook en de engine-policies |
| `src/sync.ts` | `BrainSync`: clone, bijwerken, vastleggen per beurt, delen met retry, offline, alleen-lezen, conflict met "Bewaar mijn versie apart", controles van plan §7.4 |

Tests (`bun test`, en `pnpm e2e` tegen de echte server en engine) draaien echte git tegen een bare repo als server, met twee gebruikers. De SSH-tests
tegen een echte `sshd` worden overgeslagen als `sshd` hier niet kan starten.

## Projectboilerplate

`templates/project/` is de startset van elk nieuw project. Wat erin staat, komt zo in de map van het project;
bun bundelt het in `server-hooks.js`, dus elke release van BonzaiWork heeft de versie van zijn commit.

| Wanneer | Wat er komt |
|---|---|
| **Nieuw project** in een nieuwe, lege map (`POST /bonzaiwork/boilerplate/:workspaceId`) | De boilerplate. De instructies van een starter-chip komen onder `## Projectinstructies` in `AGENTS.md`. Een map met eigen inhoud (alles behalve `.opencode/` en OS-rommel) krijgt niets; dan schrijft de app alleen de instructies, zoals vroeger. |
| **Projectbrein**: delen als nieuw brein, of een lege repo ophalen | De boilerplate plus de breinbasis (`common/`, `vendor/`: `knowledge/`, `_meta/`, `_templates/`, `workflows/`, skills en commando's). De route van `team/AGENTS.md` (`## Waar alles staat`) komt onder de `AGENTS.md` van de boilerplate. |
| **Persoonlijk brein** | Geen boilerplate: `common/`, `personal/`, `vendor/`. |

Een bestaand bestand wordt nooit vervangen. In Markdown worden `{{name}}` en `{{description}}` ingevuld (een lege
beschrijving neemt zijn regel mee); andere bestanden (`.obsidian/`, thema's, plugins) komen er byte voor byte in.
Houd `# {{name}}` als eerste kop van `AGENTS.md`: breinen lezen hun naam en beschrijving daaruit.

**Onderhoud:** pas bestanden aan in `templates/project/`. Voeg je een bestand toe, of hernoem of verwijder je er een,
draai dan `pnpm --filter @bonzaiwork/brains templates` (de test faalt anders). Alleen tekstbestanden. Merge naar
`main`, en de volgende release zet de nieuwe versie neer. Projecten die al bestaan, veranderen niet.

**Uitzetten zonder release:** start BonzaiWork met `BONZAIWORK_PROJECT_BOILERPLATE=uit` (ook `off`, `nee`, `no`,
`false`, `0`). Nieuwe projecten beginnen dan weer leeg en breinen krijgen het oude sjabloon.

## Windows

Niets hiervan is op Windows getest. Wat daar anders loopt, de handmatige test en de regels voor code met
een `win32`-tak of paden staan in [`docs/bonzaiwork/windows.md`](../../docs/bonzaiwork/windows.md).
