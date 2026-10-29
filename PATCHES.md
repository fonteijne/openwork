# PATCHES.md

Every upstream OpenWork file this fork changes or adds, one row each.
`scripts/bonzaiwork/check-patches.mjs` (CI) fails when a change is missing
here or a row no longer differs from upstream (`bonzaiwork.upstream.json`).
Goal: keep this short. Past ±10 patched files, stop and revisit the approach.

Files under our own paths (`apps/bonzaiwork`, `packages/bonzaiwork-*`,
`docs/bonzaiwork`, `scripts/bonzaiwork`, `.github/workflows/bonzaiwork.yml`,
`.github/workflows/upstream-sync.yml`,
`apps/desktop/electron-builder.bonzaiwork.mjs`) are not listed; `pnpm-lock.yaml`
is regenerated with `pnpm install`, never merged by hand.

## Patched upstream files

| Bestand | Reden | Soort | Upstream-PR | Sinds |
|---|---|---|---|---|
| `apps/server/src/server.ts` | Laadt `OPENWORK_SERVER_HOOKS`, registreert hun routes, start ze na het binden van de poort (3 regels + import) | hook | – (kandidaat) | 20ddd4b (dev na v0.18.63) |
| `apps/server/src/organization-provider-gate.ts` | Provider-allowlist van de hooks gaat vóór het Den-beleid, ook zonder Den-sessie (2 regels + import) | hook | – (kandidaat) | 20ddd4b |
| `apps/server/src/managed-opencode-v2.ts` | Zet de allowlist als `experimental.policies` (`provider.use`) in de engine-config, zodat ook providers uit een project-`opencode.json` geblokkeerd zijn (1 regel + import) | hook | – (kandidaat; dicht ook een gat in hun eigen "Only models you provide") | 20ddd4b |

## New files in upstream folders

| Bestand | Reden | Soort | Upstream-PR | Sinds |
|---|---|---|---|---|
| `apps/server/src/downstream-hooks.ts` | Het aanhaakpunt zelf: types, loader, routes, gate en engine-policies. Bevat geen BonzaiWork-logica | nieuw | – (kandidaat, samen met de drie hooks hierboven) | 20ddd4b |
| `apps/server/test/downstream-hooks.test.ts` | Tests van het aanhaakpunt | nieuw | – | 20ddd4b |
