# Overdracht: project-breinen (na fonteijne/openwork#5)

Voor een nieuwe sessie die de rest van het werk oppakt. Stand van 1 november 2026, na de merge van #5.
Het plan blijft leidend: [`project-breinen-plan.md`](./project-breinen-plan.md). §10 heeft de fasering en
"Stand fase N". Lees ook `AGENTS.md` (in de root), [`README.md`](./README.md) en [`../../PATCHES.md`](../../PATCHES.md).

## 1. Wat er staat

| Fase | Stand |
|---|---|
| 0 uitzoeken | Klaar ([`project-breinen-fase0.md`](./project-breinen-fase0.md)). De handmatige tests (§8) staan nog open. |
| 1 MVP | Gebouwd: clone via SSH, delen per beurt, conflict zonder verlies, trust, geheimenscan, persoonlijk brein, UI. |
| 2 teamwerk | Grotendeels gebouwd. Zie §2.1 voor wat nog open is. |
| 3 | Alleen **via voorstel** (GitLab push options, GitHub via de `gh` van de gebruiker). De rest staat in §2.2. |

Waar het zit:

- `packages/bonzaiwork-brains`: alles van de breinen.
  - `sync.ts`: git, delen, conflicten, trust.
  - `server-hooks.ts`: routes, Stop-hook, policies.
  - `mcp.ts`: de breinen-MCP.
  - `answers.ts`: lezen zonder klik.
  - `proposals.ts`, `workflows.ts`, `okf.ts`, `trust.ts`, `remote.ts`, `ssh.ts`, `git.ts`.
- `packages/bonzaiwork-routines`: de routineplanner in het serverproces. Runs gaan als chat via de proxy
  `/workspace/:id/opencode2`.
- `packages/bonzaiwork-server-hooks`: combineert de hooks van litellm, brains, routines en feedback. Dit is
  wat de app bundelt.
- `apps/server/src/downstream-hooks.ts`: het enige aanhaakpunt in upstream (nieuw bestand). Daar zitten
  sessie-activiteit (SSE), `followSessions`, `runningSessions`, `engineRequest`, `reloadEngineFolders` en de MCP-entry.
- `apps/bonzaiwork/src/features/brain/`: de UI (statuspil, kaarten, instellingen, werkwijzen, toestemming).
- Docs:
  - [`frontend-contract.md`](./frontend-contract.md) §7.4: routes en types, leidend voor de UI;
  - [`brein-beheer.md`](./brein-beheer.md): voor de beheerder van een gedeeld brein;
  - [`windows.md`](./windows.md): niet getest op Windows, met regels voor verder werk.

## 2. Wat er nog moet gebeuren (voorstel voor de volgorde)

### 2.1 Fase 2 afmaken

1. **Werkwijze starten vanuit de composer** en **runs als chatgroep** (plan §6.5, §8.2). Werkwijzen staan
   nu op de projectpagina (`features/brain/workflows.tsx`), zonder groep per run.
2. **Een werkwijze als routine** (plan §10, fase 2): een controle door een persoon zet de routine op
   "wacht op jou". De planner zit in `packages/bonzaiwork-routines`; de stappen en controles in
   `packages/bonzaiwork-brains/src/workflows.ts`.
3. **Een OKF-bundel importeren** (plan §6, fase 2).
4. **UI uit plan §8.2 die nog ontbreekt**:
   - in de onboarding de keuze "Haal je brein op uit een repo" en de stap mappen uitsluiten (kan nu wel
     achteraf in "Mijn brein");
   - het aantal concepten in de regel onder de beurt;
   - een clone in de smoketest (`apps/bonzaiwork/scripts/smoke-packaged.mjs`; `brain-url-input`,
     `brain-clone`).

### 2.2 Fase 3 afmaken

5. **Hybride zoeken voor grote breinen** (plan §6.8): embeddings via LiteLLM en een lokale index.
   `brein_zoeken` en `persoonlijk_brein_zoeken` vallen nu terug op tekstzoeken. Een nieuw model of een
   nieuwe provider gaat altijd via LiteLLM (de policy "alleen litellm").
6. **Werkwijzen met een script als controle of stap**, alleen in een vertrouwd brein en met toestemming
   (plan §6.9, §7.1). Nu bestaan alleen de controle door een persoon en door een klein model.

### 2.3 Wat alleen met echte apparaten kan

- De handmatige tests uit fase 0 §8: signing van de meegeleverde git op macOS, de sleutelhanger, de
  Windows-ssh-agent, de file-watcher en cloudmappen.
- "Twee apps op één repo" met twee laptops.
- Alles in [`windows.md`](./windows.md) (W1–W23). De eigenaar kan niet op Windows testen. Volg daar de
  regels voor nieuw werk.

## 3. Wat je moet weten voordat je iets verandert

- **Elke route die iets verandert is `host-token`**, en geeft in `readOnly` `403 read_only` (`writable()`).
  Alleen de lees-routes en `/routines/preview` zijn `client`. In de UI gaat `...host` mee op die calls.
- **Een fout heeft een Nederlandse zin.** Routes sturen `{ code, message }`, en `apps/bonzaiwork/src/backend/live/http.ts`
  vertaalt de code. Een zin die al voor de gebruiker is, gaat als `userMessage` mee.
- **Nooit git op de map terwijl een chat daar schrijft** (plan §4.2). Gebruik daarvoor `chatsWriteIn()`
  en de optie `busy` van `BrainSync`. De lijst met lopende chats wordt gesnoeid tegen de engine
  (`pruneRunning`, bij elk idle-event en elke `reconcile`).
- **Niets gaat verloren.** Nooit `--autostash` en nooit `reset --hard` over een vuile map. Gebruik `commitOwn()`
  en `keepCopies()` naar `_bewaard/`. Bij een conflict of lokale wijzigingen hoort een melding met de
  bestandsnamen, nooit "synced".
- **Trust**:
  - symlinks (mode 120000) zijn altijd een trust-item;
  - paden worden hoofdletterongevoelig vergeleken;
  - een naam met een regeleinde of witruimte aan het eind stopt het bijwerken.
  - Wat code kan draaien (`opencode.json`, plugins, agents, commando's met shell) staat buiten de map
    (sparse-checkout) tot de gebruiker het vertrouwt.
- **Andere breinen zijn dicht** voor de gewone tools: `closedFolders()` zet absolute `read:`/`edit:`-denies,
  dus alleen de breinen-MCP komt erbij.
  - Verandert die set, dan herbouwt `reloadEngineFolders()` de engine-mappen. Dat gooit de
    MCP-registraties per map weg; `syncWorkspaceMcp` zet ze terug.
  - De pull vóór een beurt wacht daarop.
- **Lezen in een ander brein vraagt eerst** (`ask` op `breinen_brein_lezen`/`breinen_brein_zoeken`). Er zijn
  drie uitzonderingen zonder kaart:
  - de gebruiker noemde het brein zelf (hele woorden, minstens 3 tekens);
  - het project heeft het brein aangevinkt (`reads`);
  - de routine heeft het brein aangevinkt.
- **Engine-events**: de Stop-hook leunt op `session.execution.*` van de gepinde OpenCode v2. De e2e
  bewijst dat. Controleer het opnieuw na een upgrade van de engine.
- **Upstream blijft ongemoeid**: alleen wat in `PATCHES.md` staat, en `node scripts/bonzaiwork/check-patches.mjs`
  moet groen blijven. Een nieuw upstream-bestand of een nieuwe patch komt in `PATCHES.md`.
- `AGENTS.md`:
  - alleen pnpm;
  - geen `any` of casts;
  - UI volgens `DESIGN.md` (regel-ids in de PR, screenshots via de demo-backend);
  - geen klant- of partnernamen in branches, commits of fixtures (de repo is publiek).

## 4. Controleren

```bash
pnpm install --frozen-lockfile && pnpm --filter @openwork/types build
```

```bash
for p in policy litellm brains routines server-hooks feedback app; do pnpm --filter @bonzaiwork/$p typecheck && pnpm --filter @bonzaiwork/$p test; done
```

```bash
pnpm --filter openwork-server typecheck && (cd apps/server && bun test test/downstream-hooks.test.ts)
```

```bash
pnpm --filter @bonzaiwork/litellm e2e && pnpm --filter @bonzaiwork/brains e2e
```

```bash
node scripts/bonzaiwork/fetch-git.mjs && BONZAIWORK_GIT_DIRECTORY="$PWD/apps/bonzaiwork/resources/git" pnpm --filter @bonzaiwork/brains e2e
```

```bash
node scripts/bonzaiwork/check-patches.mjs
```

Wat er nog moet gebeuren voor CI en de verpakte app:

- De e2e start de echte engine en kost een paar minuten. Draai hem twee keer na wijzigingen aan de
  Stop-hook of de mappen.
- De smoketest van de verpakte app (`node apps/bonzaiwork/scripts/package.mjs --dir --linux` en daarna
  `xvfb-run -a node apps/bonzaiwork/scripts/smoke-packaged.mjs`) draait in CI. Hij is voor #5 nooit
  gedraaid, omdat GitHub Actions sinds 30 oktober geen runs meer start in deze repo (Actions-instellingen
  of een bestedingslimiet). Dit is als eerste aan de beurt zodra CI weer loopt.
- In unit-tests geeft de fake host `runningSessions` uit `host.running`. Houd die gelijk met de
  `running`/`idle`-events die je stuurt, anders snoeit `pruneRunning` je chats weg.

## 5. Open buiten deze PR

- [fonteijne/openwork#12](https://github.com/fonteijne/openwork/pull/12): de feedback-routes vragen het
  host-token. `main` met #5 zit erin. Na de merge daarvan staan alle BonzaiWork-routes die iets veranderen of
  van de host lezen op het host-token.
- Beslissingen die vastliggen:
  - GitHub-voorstellen via de `gh` van de gebruiker; BonzaiWork bewaart geen token (B2);
  - routines lezen zonder klik in de breinen die bij de routine zijn aangevinkt;
  - de map van de clone kiest de gebruiker zelf. Er is geen verplichte `~/BonzaiWork/<naam>`; de map moet
    leeg zijn of nieuw.
