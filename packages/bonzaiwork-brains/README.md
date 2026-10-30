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
| `src/sync.ts` | `BrainSync`: clone, bijwerken, vastleggen per beurt, delen met retry, offline, alleen-lezen, conflict met "Bewaar mijn versie apart", controles van plan §7.4 |

Tests (`bun test`) draaien echte git tegen een bare repo als server, met twee gebruikers. De SSH-tests
tegen een echte `sshd` worden overgeslagen als `sshd` hier niet kan starten.
