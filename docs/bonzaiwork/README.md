# BonzaiWork: eerste spike

Eigen desktop-app op basis van OpenWork, met een eigen UI en LiteLLM als enige provider.
De opdracht staat in [`referentie.md`](./referentie.md). Dit document beschrijft wat er gebouwd is,
hoe het geverifieerd is, waar we van de referentie afwijken en wat er nog openstaat.

Stand: upstream `dev` op `2aa4481` (`v0.18.63` + upstream `dev` t/m #6620), gemerged in `main` via PR #1. Getest op Linux (CI, stand-in LiteLLM) en macOS arm64 (echte LiteLLM).

## Genomen beslissingen

| # | Beslissing | Bron |
|---|---|---|
| O4 | App-naam **BonzaiWork**, mapnaam/prefix `bonzaiwork` (zoals `openwork`). `appId` voorlopig `nl.bonzaiwork.desktop`; signing en updater-host staan nog open. | gebruiker / voorlopig |
| O3 | De LiteLLM-URL wordt **in de build ingebakken** (`BONZAIWORK_LITELLM_BASE_URL` bij het bouwen). Onboarding vraagt alleen de key. | gebruiker |
| O2 | Transcriptie loopt **via een Whisper-model in LiteLLM** (`/v1/audio/transcriptions`). Whisper doet geen diarization: de splitsing "ik versus de anderen" komt uit de aparte sporen (mic en systeemaudio). Echte sprekerherkenning vraagt een model met diarization achter LiteLLM of een aparte stap. De proxyroute stuurt `audio/transcriptions` al door. | gebruiker |
| O1 | Nog open. Beide `KeyResolver`s zijn gebouwd. De build kiest met `BONZAIWORK_KEY_MODE=user\|workspace`; de standaard is `user`. | – |

## Wat er staat

```
apps/bonzaiwork/                 eigen UI (React 19 + Vite + Tailwind) en Electron-entry
  src/                           projecten, chats, routines, instellingen (zie apps/bonzaiwork/README.md)
  desktop-main/main.ts           zet env + keychain-store, laadt daarna de ONGEWIJZIGDE upstream main.mjs
  scripts/package.mjs            verpakken; smoke-packaged.mjs: smoketest van de verpakte app
packages/bonzaiwork-policy/      "alleen litellm": ids, engine-providerconfig, ingebakken settings
packages/bonzaiwork-litellm/     KeyStore/KeyResolver, loopback-proxy, server-hooks, e2e/
apps/server/src/downstream-hooks.ts   het aanhaakpunt in de server (nieuw bestand)
apps/desktop/electron-builder.bonzaiwork.mjs   builder-config (nieuw bestand)
PATCHES.md, bonzaiwork.upstream.json, scripts/bonzaiwork/check-patches.mjs
.github/workflows/bonzaiwork.yml
```

### Hoe het in elkaar zit

```
Electron main (BonzaiWork-entry)
  ├─ env: BONZAIWORK_* (ingebakken), OPENWORK_DISABLE_FREE_INFERENCE/HOSTED_MODELS=1,
  │       OPENWORK_SERVER_HOOKS=<bundel>/server-hooks.js
  ├─ registerKeyStore(SafeStorageKeyStore)      ← OS-keychain, in hetzelfde proces als de server
  └─ import upstream electron/main.mjs          ← start in-process openwork-server
        └─ openwork-server laadt OPENWORK_SERVER_HOOKS
             ├─ allowedProviderIds = ["litellm"]
             │    ├─ organizationProviderGate()  → mirror duwt alleen litellm naar de engine
             │    └─ engine-config experimental.policies: provider.use * deny, litellm allow
             ├─ provider "litellm" in de globale runtime-config:
             │    baseURL http://127.0.0.1:<poort>/bonzaiwork/litellm/v1, apiKey = lokaal token
             └─ routes
                  /bonzaiwork/litellm/v1/*   (engine → LiteLLM, token check, key-injectie, SSE-passthrough)
                  /bonzaiwork/status, /bonzaiwork/keys/user|workspace/:id  (UI)
```

- **Welke workspace?** (§6.B3 [VERIFIEER]) De v2-engine stuurt bij elk modelverzoek `x-opencode-session`
  mee. De route zoekt de sessie op in de engine en vergelijkt de home-map met de workspace-paden. Dat is
  dezelfde controle die de eigen proxy van de server gebruikt. Er is geen `baseURL` per workspace en geen
  extra engine-patch nodig. De koppeling wordt per sessie gecachet.
- **Keys** staan versleuteld met Electron `safeStorage` in `userData/bonzaiwork/litellm-keys.json`. Dat
  bestand bevat alleen ciphertext; de sleutel blijft in de OS-keychain. Zonder echte keychain
  (Linux zonder secret service, `basic_text`) blijven keys alleen in het geheugen, en de instellingen tonen
  dat. De server ontvangt keys niet via IPC: de store staat in hetzelfde proces (de server draait
  in-process). Keys gaan nooit naar config, env, logs of foutmeldingen. LiteLLM-fouten worden vóór
  doorgifte opgeschoond.
- **Modellen** komen uit `GET /v1/models` met de gekoppelde key (in `workspace`-modus de vereniging over
  alle workspace-keys).

## Verificatie (alles in deze container uitgevoerd)

| Wat | Hoe | Uitkomst |
|---|---|---|
| Unit-tests | `bun test` in beide pakketten + `apps/server/test/downstream-hooks.test.ts` | 4 + 9 + 4 groen |
| Bestaande upstream-tests rond de gepatchte bestanden | 17 testbestanden (`engine-v2-*`, `live-provider-*`, `provider-config-templates`, …) | 88 groen, 11 overgeslagen, 0 fout |
| Typecheck | `openwork-server`, `@openwork/app`, `@bonzaiwork/*` | 0 fouten |
| **B "klaar als"** | `pnpm --filter @bonzaiwork/litellm e2e`: echte server + v2-engine + stand-in LiteLLM, met `ANTHROPIC_API_KEY` gezet, een project-`opencode.json` met een eigen provider (die zichzelf via `experimental.policies` probeert toe te staan) en een lokale `auth.json` | engine toont alleen `litellm`; chat via de projectprovider faalt; chat via LiteLLM slaagt; twee workspaces bereiken LiteLLM met hun eigen key; geen key in logs, engine-config, `runtime.sqlite` of workspaces |
| UI (headless Chrome) | Vite-dev + headless server; onboarding → afgewezen key → geldige key → chat → instellingen | zie `screenshots/`; key niet in de DOM |
| **A "klaar als"** | `package.mjs --dir --linux` + `xvfb-run node smoke-packaged.mjs` | verpakte app toont BonzaiWork-onboarding met de ingebakken URL, koppelt een key, beantwoordt een chatbeurt via LiteLLM |
| **C (deel)** | dezelfde smoketest; al het uitgaande verkeer via een registrerende proxy die niets doorstuurt | 0 verzoeken naar `*.openworklabs.com`; enige uitgaande bestemming: `redirector.gvt1.com` (Chromium component updater) |

Een eerder handmatig experiment liet zien waarom de engine-policy nodig is: zonder die policy leest de
v2-engine een project-`opencode.json` zelf in, en een chat via die provider **slaagde** ondanks de
mirror-gate. Upstream heeft hetzelfde gat in zijn eigen "Only models you provide"-beleid. De
`managed-opencode-v2.ts`-hook is dus ook een goede kandidaat voor een upstream-PR.

## Merge-test (§9.4)

Spike opgebouwd op `v0.18.58` (de drie commits geport zoals een ontwikkelaar dat daar had gedaan), daarna
`git merge v0.18.63` (450 upstream-commits, 3.258 gewijzigde bestanden).

| Meting | Uitkomst |
|---|---|
| Conflicten | **3**: `apps/server/src/managed-opencode-v2.ts` (aangrenzende importregels, triviaal), `apps/server/src/openwork-runtime-config.ts` (upstream had hier net `organizationProviderGate()` ingevoerd; onze hook verhuisde naar dat nieuwe bestand, plus één regel in de oude plek), `pnpm-lock.yaml` (geregenereerd met `pnpm install`). Geen conflicten in `apps/bonzaiwork` of `packages/bonzaiwork-*`. |
| Typecheck-fouten in onze code door upstream | **0** (`openwork-server`, `@openwork/app`, `@bonzaiwork/policy`, `@bonzaiwork/litellm`, `@bonzaiwork/app`) |
| `PATCHES.md` na de merge | **4** gepatchte upstream-bestanden + 2 nieuwe bestanden in upstream-mappen. `check-patches.mjs` signaleerde de verhuisde hook zelf. |
| Na de merge | unit-tests groen, engine-E2E groen (v2 is daar standaard; op `v0.18.58` alleen met `OPENWORK_ENGINE_V2_PREVIEW=1`) |
| Extra: `v0.18.63` → upstream `dev` `20ddd4b` (verwijdert v1) | 0 conflicten |
| Gevonden tijdens de test | een race in onze hooks (routes antwoordden vóór `start()` klaar was; vroege key-`PUT` gaf 404). Opgelost in de hoofdbranch, met test. |

**Conclusie:** de aanpak is houdbaar. Conflicten blijven beperkt tot de aanhaakpunten zelf, en de
interessantste (upstream verplaatst de gate) is precies het soort wijziging dat een upstream-PR voor
`downstream-hooks.ts` zou wegnemen.

Wat de test niet meet: upstream-wijzigingen in hun UI-clients (`apps/app/src/app/lib/*`). Bij deze merge
leverde dat 0 fouten op, maar die bestanden veranderen vaak. De huidige UI importeert daarom niets meer uit
`apps/app`: de server- en engineclient zijn eigen code (`apps/bonzaiwork/src/backend/live/`).

## Afwijkingen van de referentie (bewust)

1. **Fork staat op `dev`, niet op een release-tag.** `main`/de fork komt van upstream `dev` (`v0.18.63` + 22
   commits, inclusief het verwijderen van OpenCode v1). §5.2 zegt alleen tags te mergen. Advies: zet de
   productiebranch bij de eerstvolgende sync op een tag (`v0.18.64`+); `bonzaiwork.upstream.json` legt de
   basiscommit vast, zodat de PATCHES-check ook nu klopt.
2. **Geen import van `domains/session` (§6.A3).** Gemeten: hun `session-page.tsx` sleept 499 bronbestanden
   mee, waaronder 19 Den-modules, 26 uit `domains/cloud`, analytics en telemetrie, plus hun complete
   provider-stack. Dat botst met E6 (geen verkeer naar de OpenWork-cloud, geen telemetrie). De eerste spike
   gebruikte daarom alleen hun framework-vrije clients en `@/components`-primitives; de huidige UI heeft
   een eigen client voor de server, de v2-engine en de desktop-bridge, en importeert niets uit `apps/app`.
3. **Server-routes via een nieuw aanhaakpunt, niet via `apps/server/src/extensions/` (§6.B3).** Dat
   mechanisme is actie-gebaseerd (JSON in, JSON uit) en kan geen streaming-proxy dragen.
   `OPENWORK_SERVER_HOOKS` is generiek genoeg om upstream aan te bieden.
4. **Alleen v2 dwingt LiteLLM-only af.** Upstream heeft OpenCode v1 teruggezet (revert #6559): de server
   start bij het opstarten weer een v1-engine en `/workspace/:id/opencode/*` gaat naar v1; v2 zit op
   `/opencode2/*`. Afdwinging zit in de mirror-gate en in de engine-policies (v2), dus de UI praat
   uitsluitend met `/opencode2` (`apps/bonzaiwork/src/backend/live/engine.ts`).
5. **`model` in de runtime-config (§6.B1)** bestaat niet in v2. De UI kiest het model per gesprek uit
   `/bonzaiwork/status.defaultModel` (ingebakken `BONZAIWORK_DEFAULT_MODEL`, anders het eerste model).
6. **Builder-config is `.mjs`, geen `.yml` (§6.A5).** electron-builder voegt arrays samen bij `extends`;
   een YAML-overlay zou hun UI naast de onze in `app-dist` zetten en hun GitHub-publish-doel houden. De
   `.mjs` leest hun YAML in (upstream-wijzigingen komen mee) en vervangt alleen UI, entry, identiteit en
   `publish`.

## Bevindingen voor werkstroom C (en risico's)

- **Updater**: `apps/desktop/electron/updater.mjs` heeft de feed hardcoded op
  `github.com/different-ai/openwork`. Onze UI start nooit een updatecheck, en `publish` staat uit. Maar
  een echte BonzaiWork-updater vraagt een hook in `updater.mjs` (één patch), anders "updatet" de app zich
  naar OpenWork.
- **CDP standaard aan in verpakte builds**: upstream `main.mjs` opent de DevTools-poort (9223–9227) op
  loopback, ook in productie. Elk lokaal proces kan de app dan besturen en tokens lezen. Overweeg
  `OPENWORK_ELECTRON_REMOTE_DEBUG_PORT` dicht te zetten of hiervoor een hook te maken.
- **Branding**: upstream maakt bij de eerste start een workspace "OpenWork Chat" aan, en iconen en
  `NS*UsageDescription`-teksten komen van upstream (die laatste vervangt de builder-config). Dit hangt
  samen met O5 (juridische check op naam en logo).
- **Modelcatalogus**: upstream laat beide engines `models.openworklabs.com` ophalen
  (`apps/server/src/opencode-models-url.ts`). De v1-engine erft de volledige procesomgeving, inclusief
  proxy; de v2-engine leest alleen `OPENCODE_MODELS_URL`. `SERVER_ENVIRONMENT_DEFAULTS` zet daarom
  `OPENCODE_DISABLE_MODELS_FETCH=1` en `OPENCODE_MODELS_URL` op een loopback-adres dat nergens heen gaat;
  de engines houden hun meegeleverde catalogus, en de LiteLLM-modellen komen uit de provider-entry.
- **v1-engine draait mee**: zie afwijking 4. Niet nagelopen is of v1 via `/opencode` nog andere providers
  kan gebruiken. Onze UI komt er niet, maar elk proces met het owner-token wel. Een hook die de v1-start
  overslaat, of een v1-providerfilter, ligt voor de hand.
- **Smoketest ziet engineverkeer niet**: de v2-engine krijgt geen proxyvariabelen, dus wat die zelf
  ophaalt gaat buiten de opnemende proxy om. De smoketest bewijst E6 voor Electron, de server en v1.
  Chromium haalt verder `redirector.gvt1.com` op (component updater van Google, geen OpenWork).
- Nog niet gecontroleerd: `DEFAULT_DEN_BASE_URL`/`DOCS_PAGE_URL` in `main.mjs` en
  `workspace-store.mjs` worden in de smoketest niet aangeroepen, maar zijn niet omgeleid.

## CI

`.github/workflows/bonzaiwork.yml`: typecheck, unit-tests, engine-E2E, PATCHES-check en een verpakte
Linux-build met smoketest. Upstream heeft ±50 eigen workflows. Veel daarvan draaien op `push` naar
`dev`, publiceren naar hun releases of hebben hun secrets nodig. Zet ze uit in GitHub → Actions per
workflow (dat raakt geen bestanden en geeft dus geen merge-conflicten), behalve wat wij ook gebruiken.

Status in `fonteijne/openwork` (27-10-2026):

| Workflow | Bestand | Stand | Reden |
|---|---|---|---|
| BonzaiWork | `bonzaiwork.yml` | aan | onze CI |
| CodeQL | `codeql.yml` | aan | vond al een echt probleem (ReDoS) |
| Warden quick review, Feature registry check | `warden-quick.yml`, `features-check.yml` | aan | slagen zonder secrets |
| Warden | `warden.yml` | **uit** | heeft `WARDEN_OPENAI_API_KEY` nodig |
| Build and core checks | `ci-tests.yml` | **uit** | draait op Blacksmith-runners van upstream |
| PR change proof | `pr-proof.yml` | **uit** | draait op Blacksmith-runners van upstream |

Alle andere upstream-workflows draaien op `push` naar `dev`, een schema of releases, en publiceren, hebben
hun secrets nodig of wachten eindeloos op hun Blacksmith-runners. `scripts/bonzaiwork/fork-workflows.mjs`
zet ze bij elke upstream-sync uit, ook workflows die upstream nieuw toevoegt. Alleen de lijst `ENABLED` in
dat script blijft aan (de tabel hierboven plus `upstream-sync.yml`). Een workflow weer aanzetten: voeg hem
eerst aan `ENABLED` toe, anders zet de volgende sync hem weer uit.

## Branches

| Branch | Rol |
|---|---|
| `main` | BonzaiWork-productiebranch en default branch. Alleen via PR's, met de BonzaiWork-CI groen. |
| `dev` | Pure spiegel van upstream `different-ai/openwork` `dev`. Nooit zelf committen; de workflow **Upstream sync** spoelt hem dagelijks door (alleen fast-forward). |
| `upstream-sync/dev-<datum>-<sha>` | Tijdelijk, door **Upstream sync**: upstream `dev` gemerged in `main`, met een PR naar `main`. |
| `upstream-sync/<tag>` | Tijdelijk, met de hand: één upstream-release in `main` mergen (procedure hieronder). |
| feature-branches | Werk, met een PR naar `main`. |

Referentie §5.2 zegt alleen release-tags te mergen. De automatische sync merget upstream `dev`, net als de
huidige stand van `main` (afwijking 1). Wie liever op een tag blijft, sluit de sync-PR en volgt de procedure
met de hand. Tags komen niet mee naar `dev`: haal ze met `git fetch upstream --tags`.

## Upstream automatisch syncen

`.github/workflows/upstream-sync.yml` draait dagelijks (04:37 UTC) en met de hand via **Run workflow**:

1. **`dev` doorspoelen.** Alleen pull: `dev` gaat met een fast-forward naar upstream `dev`. Staat er op
   `dev` iets wat upstream niet heeft, dan stopt de run met een fout; er wordt nooit geforceerd.
2. **Upstream-workflows uit.** `fork-workflows.mjs` (zie "CI") vóór de push, en daarna nog eens voor
   workflows die met de push binnenkwamen; runs die de push startte worden geannuleerd.
3. **Sync-PR.** Een branch `upstream-sync/dev-<datum>-<sha>` vanaf `main`, met upstream `dev` erin gemerged,
   `bonzaiwork.upstream.json` bijgewerkt en `pnpm-lock.yaml` geregenereerd. Een conflict alleen in de
   lockfile lost de run zelf op. Bij andere conflicten wijst de branch naar upstream `dev` zelf en is de PR
   een draft, zodat GitHub de conflicten toont. Oplossen: branch uitchecken, `git merge origin/main`.
4. **Beoordeling.** De PR-beschrijving (`upstream-sync-report.mjs`) zet op een rij wat er moet gebeuren:
   gepatchte bestanden die upstream wijzigde, raakvlakken uit de watchlist in dat script (updater,
   `main.mjs`, builder-config, modelcatalogus, engineversie), gewijzigde manifests en workflows en de
   uitkomst van de PATCHES-check. De BonzaiWork-CI draait op de PR. Met het secret `ANTHROPIC_API_KEY`
   legt Claude daarnaast de upstream-diffs naast onze laag en zet een oordeel als PR-comment.

Er staat steeds hooguit één sync-PR open. Zolang die open is, spoelt de run alleen `dev` door en houdt hij in
één comment op die PR bij hoeveel upstream-commits er wachten. Na merge of sluiten maakt de volgende run een
nieuwe PR vanaf de nieuwste `dev`.

Eenmalig instellen (Settings → Secrets and variables → Actions):

| Secret | Nodig | Waarvoor |
|---|---|---|
| `UPSTREAM_SYNC_TOKEN` | ja | Fine-grained PAT op alleen `fonteijne/openwork`, met Contents, Pull requests en Workflows op read/write. `GITHUB_TOKEN` mag geen workflowbestanden pushen (upstream wijzigt die bijna elke dag), en PR's die met `GITHUB_TOKEN` zijn gemaakt starten de BonzaiWork-CI niet. |
| `ANTHROPIC_API_KEY` | nee | De beoordeling door Claude. Zonder dit secret is de PR-beschrijving de beoordeling. |

Daarnaast moet onder Settings → Actions → General "Allow GitHub Actions to create and approve pull requests"
aan staan als je zonder PAT test.

## Upstream mergen (procedure)

```bash
git remote add upstream https://github.com/different-ai/openwork.git   # eenmalig
git fetch upstream --tags
git switch -c upstream-sync/v0.18.64 main
git merge v0.18.64
git checkout --theirs pnpm-lock.yaml && pnpm install                    # bij een lockfile-conflict
# bonzaiwork.upstream.json → commit van v0.18.64
node scripts/bonzaiwork/check-patches.mjs                              # werkt PATCHES.md bij
pnpm --filter @bonzaiwork/litellm e2e
# workflows die upstream sinds de vorige sync toevoegde: de volgende Upstream sync-run zet ze uit (zie "CI")
BONZAIWORK_LITELLM_BASE_URL=http://127.0.0.1:4010 node apps/bonzaiwork/scripts/package.mjs --dir --linux
xvfb-run -a node apps/bonzaiwork/scripts/smoke-packaged.mjs
```

## Ontwikkelen

```bash
pnpm install
# headless: server + engine met onze hooks
BONZAIWORK_LITELLM_BASE_URL=http://127.0.0.1:4000 \
OPENWORK_SERVER_HOOKS=$PWD/packages/bonzaiwork-litellm/dist/server-hooks.js \
OPENWORK_TOKEN=dev OPENWORK_HOST_TOKEN=dev-host OPENWORK_DEV_MODE=1 OPENWORK_DISABLE_FREE_INFERENCE=1 \
  sh -c 'cd apps/server && bun --conditions=development src/cli.ts --workspace ~/werk --port 8787 --cors http://127.0.0.1:5183'
pnpm --filter @bonzaiwork/litellm build        # bundelt server-hooks.js
pnpm --filter @bonzaiwork/app dev              # http://127.0.0.1:5183/?server=http://127.0.0.1:8787&token=dev&hostToken=dev-host
```

Gebruik voor development een lokale LiteLLM (§7: geen tweede provider, ook niet tijdelijk).

## Volgende stappen

1. O1 beslissen (keys per gebruiker of per project) en O4 afronden (appId, signing, updater-host).
2. Werkstroom C afmaken: updater-hook, CDP-poort, Den-/docs-URL's, branding (O5).
3. Upstream-PR's voorstellen: `downstream-hooks.ts` + de drie hooks, en los daarvan de
   `experimental.policies`-afdwinging voor hun eigen "Only models you provide" (zelfde gat).
4. De §7-routes uit het frontend-contract in de server (projectmetadata, overzicht en zoeken, verbruik,
   routines). De UI detecteert ze zelf (`/bonzaiwork/projects`, `/bonzaiwork/routines`) en zet routines,
   verbruik en metadata op de server dan aan.
5. Werkstroom D (meetings), achter een eigen feature-flag (eigen registry, zodat `registry.ts` niet
   gepatcht hoeft te worden).
