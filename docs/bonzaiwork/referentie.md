# Referentie: eigen desktop-app op basis van OpenWork

> De opdracht zoals aangeleverd (27-10-2026). `<app>` = `bonzaiwork` (O4). Wat gebouwd is, de
> genomen beslissingen en de afwijkingen staan in [`README.md`](./README.md).

> **Voor de code-agent.** Dit document beschrijft wat we bouwen, de harde eisen, hoe de upstream-repo in elkaar zit en in welke volgorde het werk gebeurt.
> Overal waar `<app>` staat, vul je de definitieve app-naam in (kebab-case voor mappen en pakketten).
> Alles wat gemarkeerd is met **[VERIFIEER]** is onderzocht op de upstream-stand van 27-10-2026 (tag `v0.18.63`). Controleer het tegen de actuele code voordat je erop bouwt.

---

## 1. Doel

We bouwen een eigen, zelfstandige desktop-app (macOS, Windows, Linux) op basis van [different-ai/openwork](https://github.com/different-ai/openwork):

- met een **volledig eigen UI**;
- met **LiteLLM als enige modelprovider**;
- met **meeting-opname en transcriptie met sprekerherkenning** in de app zelf;
- terwijl we **upstream-releases van OpenWork blijvend kunnen terugmergen**.

## 2. Harde eisen

| # | Eis | Gevolg voor de implementatie |
|---|---|---|
| E1 | Zelfstandige app: geen extra apps nodig bij de gebruiker | Recorder, transcriptie-aansturing en keyopslag zitten in de app-bundel. Geen losse installers. |
| E2 | Volledig eigen UI | Een nieuwe frontend-app in `apps/<app>`, niet de bestaande `apps/app` aanpassen. |
| E3 | Upstream blijft mergebaar | Upstream-bestanden zo min mogelijk aanraken. Elke wijziging staat in `PATCHES.md` (zie §5.3). |
| E4 | LiteLLM is de standaard **en enige** provider | Afgedwongen in de engine-config, in de server-gate en in de UI (§6.B). |
| E5 | Keys per project of gebruiker via LiteLLM virtual keys | Nooit keys in configbestanden. Opslag in de OS-keychain. Een lokale proxyroute injecteert de key (§6.B). |
| E6 | Geen verkeer naar OpenWork-cloud (`*.openworklabs.com`) | Endpoints, telemetrie en updater omleiden of uitzetten (§6.C). |
| E7 | Geen code uit `/ee` in productie | `/ee` valt onder een commerciële licentie. Niet importeren, niet aanpassen. Den (hun control plane) gebruiken we niet. |

## 3. Upstream in het kort

- **Repo:** `https://github.com/different-ai/openwork`. Standaardbranch `dev`. Releases als tags `v0.18.x`, ongeveer elke 2 à 4 dagen.
- **Tempo:** ±790 commits per 30 dagen. `apps/app/src` (hun UI) had ±1.350 bestandswijzigingen in 30 dagen; `domains/session` (chat) is de drukste map. **Dit is precies waarom we hun UI niet aanpassen.**
- **Stack:** pnpm-monorepo (Turbo), Electron 43, React 19 + Vite, TanStack Query, Zustand, Zod, Tailwind, shadcn/ui (Base UI). De agent-engine is OpenCode; v2 is de standaard. Versies staan vastgepind in `constants.json`.
- **Lees eerst:** `AGENTS.md` (coderegels) en `apps/app/src/react-app/ARCHITECTURE.md` (lagen en afhankelijkheidsregels).

### Mappen

| Pad | Wat | Onze houding |
|---|---|---|
| `apps/desktop` | Electron-shell (`electron/main.mjs`), electron-builder-configs | Minimale patches + een eigen builder-config |
| `apps/server` | Lokale OpenWork-server: engine-beheer, config, extensies, proxies | Ongewijzigd gebruiken, minimale patches |
| `apps/app` | Hun React-UI | **Niet aanpassen.** Wel importeren mag. |
| `apps/app/src/app/` | Framework-onafhankelijke clients (opencode, openwork-server, desktop-IPC). Bevat afgedwongen geen React. | Hergebruiken als bibliotheek |
| `packages/*` | `types`, `sdk`, `ui`, `features`, `opencode-plugin`, … | Ongewijzigd gebruiken |
| `ee/*` | Den, gateway, Workbot: commerciële licentie | **Niet gebruiken** (E7) |

### Coderegels uit `AGENTS.md` die ook voor ons gelden

- Alleen pnpm, nooit npm of yarn.
- TypeScript zonder `any`, typecasts of `as`, tenzij echt onvermijdelijk.
- Gegenereerde bestanden (`packages/sdk/src/gen/**`, OpenAPI) nooit committen of met de hand aanpassen.
- Nieuwe features eerst als flag declareren (zie §6).

## 4. Gouden regel: importeren, niet aanpassen

> Een **import** van upstream-code levert bij een merge nooit een conflict op. Een **wijziging** in een upstream-bestand wel.

1. Nieuwe functionaliteit komt in **nieuwe mappen** die van ons zijn: `apps/<app>` en `packages/<app>-*`.
2. Hun componenten en clients **importeren en eromheen bouwen** (wrappen), niet kopiëren en niet aanpassen. Een breaking change upstream verschijnt dan als compileerfout, niet als merge-conflict.
3. Heb je echt een wijziging in een upstream-bestand nodig? Kies dan in deze volgorde:
   a. een bestaand configuratiepunt (env var, builder-config, flag);
   b. een **zo klein mogelijk aanhaakpunt (hook)** in het upstream-bestand, met de eigenlijke logica in onze eigen code;
   c. een PR naar upstream voor dat aanhaakpunt, zodat de patch daarna kan vervallen.
4. Elke wijziging aan een upstream-bestand komt in `PATCHES.md`.

## 5. Git-werkwijze

### 5.1 Remotes en branches

```bash
git remote add upstream https://github.com/different-ai/openwork.git
git fetch upstream --tags
```

| Branch | Doel |
|---|---|
| `main` | Onze productiebranch |
| `upstream-sync/<tag>` | Tijdelijke branch om één upstream-release in te mergen |

### 5.2 Upstream mergen

- **Merge alleen release-tags** (`v0.18.x`), nooit `upstream/dev`.
- **Merge, niet rebasen.** De geschiedenis moet terug te volgen blijven en het werkt met meerdere ontwikkelaars.
- Frequentie: elke 1 à 2 weken.

```bash
git switch -c upstream-sync/v0.18.64 main
git merge v0.18.64
pnpm install
# CI moet hier groen worden: typecheck, eigen tests, smoketest van de app
```

- Na elke merge: loop `PATCHES.md` na. Is een patch overbodig geworden? Verwijder hem dan.

### 5.3 `PATCHES.md` (in de repo-root)

Eén regel per aangepast upstream-bestand:

| Bestand | Reden | Soort | Upstream-PR | Sinds |
|---|---|---|---|---|
| `apps/server/src/organization-provider-gate.ts` | LiteLLM-only gate | hook | – | v0.18.63 |

Doel: deze tabel blijft kort. Komen er meer dan ±10 regels bij, stop dan en herzie de aanpak.

### 5.4 CI

- Na elke merge: `pnpm` typecheck over de hele workspace, de tests van `apps/<app>` en `packages/<app>-*`, en een gebouwde app die opstart en één chatbeurt via LiteLLM doet.
- Upstream heeft veel eigen CI-workflows. Zet die alleen aan als ze iets testen wat wij ook gebruiken, anders branden ze onnodig minuten.

---

## 6. Werkstromen

Volgorde: **A → B → C**, daarna **D**. A en B samen vormen de eerste spike.
Nieuwe features komen achter een flag, volgens de upstream-conventie (`packages/features/src/registry.ts`, `.opencode/skills/add-a-feature`). Een eigen flag-registry in onze eigen package mag ook, als dat de patch op `registry.ts` voorkomt.

### A. Fork-skelet en eigen UI-app

**Doel:** de Electron-shell laadt onze UI in plaats van die van hen, en die UI kan een chatsessie voeren via de bestaande server.

1. Maak `apps/<app>` aan: React 19 + Vite + Tailwind, dezelfde versies als `apps/app` (zie de `catalog` in `pnpm-workspace.yaml`). `apps/*` valt al onder de workspace-globs.
2. Hergebruik clients en state uit `apps/app/src/app/` en waar nuttig uit `react-app/kernel`, `react-app/infra` en `domains/*`. Volg dezelfde provider-stack als in `ARCHITECTURE.md` (Server → global-sdk → global-sync → local).
   - **[VERIFIEER]** `@openwork/app` is geen bibliotheekpakket met `exports`. Kies daarom een TS-padalias of Vite-alias naar `../app/src` en houd die op één plek, zodat een herstructurering upstream maar één aanpassing kost.
3. **Startfase:** importeer hun chatweergave (`domains/session`) en zet die in onze eigen shell. **Daarna** vervangen we domein voor domein door eigen componenten. Begin dus niet met alles herbouwen.
4. **Electron laadt onze UI.** `apps/desktop/electron/main.mjs` (±r. 2860) laadt `OPENWORK_ELECTRON_START_URL`, of anders `resources/app-dist/index.html` (verpakte app) of `../../app/dist/index.html` (development).
   - In development: zet `OPENWORK_ELECTRON_START_URL` naar onze Vite-devserver. Geen patch nodig.
   - Voor de verpakte app: laat onze build-output in `app-dist` belanden via onze eigen builder-config. Gaat dat niet zonder patch, maak dan een minimale patch op het pad.
5. **Eigen builder-config:** `apps/desktop/electron-builder.<app>.yml` met `extends: electron-builder.yml`, plus eigen `appId`, `productName`, iconen en eigen `publish`. Upstream doet hetzelfde al met `electron-builder.demo-a.yml`. Dit is een nieuw bestand, dus geen conflict.

**Klaar als:** de verpakte app start met onze UI, maakt een workspace aan en voert een chatbeurt uit. `PATCHES.md` bevat hooguit 1 à 2 regels.

### B. LiteLLM als enige provider

**Uitgangspunt:** OpenCode kent `enabled_providers` en `disabled_providers`. OpenWork dwingt "alleen eigen providers" af via `organizationProviderGate()` in `apps/server/src/organization-provider-gate.ts`. Die wordt gebruikt door `engine-v2-preview.ts` (v2) en `openwork-runtime-config.ts` (v1).
Die gate krijgt zijn beleid nu uit Den (`managed-desktop-policy.ts`). Dat beleid wordt gewist zodra er geen Den-sessie is (`clearSession`). **Gebruik dat mechanisme dus niet.** We maken een eigen lokale variant.

**B1. Engine-config (eigen code).** Bij opstarten en bij het aanmaken van een workspace zet de app deze config in de globale runtime-config. Gebruik daarvoor de bestaande store `apps/server/src/runtime-opencode-config-store.ts` (`writeGlobalRuntimeOpencodeConfig`) **[VERIFIEER]**.

```jsonc
{
  "enabled_providers": ["litellm"],
  "disabled_providers": ["openwork", "opencode"],
  "model": "litellm/<standaardmodel>",
  "provider": {
    "litellm": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "LiteLLM",
      "options": {
        "baseURL": "http://127.0.0.1:<server-poort>/<app>/litellm/v1",
        "apiKey": "<lokaal-sessietoken, géén LiteLLM-key>"
      }
    }
  }
}
```

**B2. Harde afdwinging (een minimale patch, met de logica in onze eigen code).**
- Patch `organizationProviderGate()` zodat hij eerst onze eigen gate raadpleegt (bijvoorbeeld `packages/<app>-policy`), die alleen `litellm` toestaat. Dit geldt ook zonder Den.
- Gevolg: providers uit een projectmap-`opencode.json`, uit OpenCode's `auth.json` of uit env vars (`ANTHROPIC_API_KEY` en dergelijke) bereiken de engine niet meer. Dat werkt voor beide engines.
- Zet in de omgeving van de server: `OPENWORK_DISABLE_FREE_INFERENCE=1`, `OPENWORK_DISABLE_HOSTED_MODELS=1` en `VITE_DISABLE_OPENWORK_MODELS=1` (zie `apps/server/src/free-auto/settings.ts`).

**B3. Lokale LiteLLM-proxyroute (eigen code).**
- Volgt het bestaande patroon in `apps/server/src/free-auto/provider-config.ts`: een provider wijst naar `127.0.0.1` met een lokaal token.
- De route:
  1. controleert het lokale token;
  2. bepaalt bij welke workspace het verzoek hoort;
  3. haalt de bijbehorende LiteLLM virtual key op via een `KeyResolver`;
  4. stuurt het verzoek door naar `<LITELLM_BASE_URL>/v1/*`, inclusief streaming (SSE) en zonder buffering;
  5. geeft foutmeldingen van LiteLLM door **zonder** de key erin. Keys mogen nooit in logs, fouten of telemetrie terechtkomen.
- **[VERIFIEER]** Hoe de route ziet bij welke workspace een verzoek hoort. Opties: een header die de engine meestuurt, of een `baseURL` per workspace in de projectconfig (bijvoorbeeld `/litellm/ws/<workspaceId>/v1`). Kies de variant die zonder extra upstream-patch werkt.
- Server-routes registreren: hergebruik het mechanisme voor server-routes van extensies (`apps/server/src/extensions/`). Kan dat niet, maak dan een minimale hook in de route-registratie.

**B4. Keyopslag.**
- Keys staan in de OS-keychain via Electron `safeStorage` (main process). De server krijgt ze via de bestaande desktop-IPC of credential-channel. Nooit in JSON-, env- of configbestanden.
- De `KeyResolver`-interface ondersteunt beide modellen, want de keuze ligt nog open (§8):

```ts
interface KeyResolver {
  resolve(input: { workspaceId: string; userId: string }): Promise<string | null>;
}
// Implementaties: PerUserKeyResolver, PerWorkspaceKeyResolver
```

**B5. Modellen.**
- De modellijst komt uit LiteLLM `GET /v1/models`, met de key die bij de workspace hoort. Toegang per model regelen we in LiteLLM, niet in de app.
- Bekijk upstream `openwork-provider-filters-v2.ts` (`model.transform`) als je modellen moet filteren of injecteren in de v2-engine.

**B6. UI.**
- De eigen UI bevat **geen** schermen om providers toe te voegen of te wisselen.
- Onboarding vraagt alleen de LiteLLM-URL (eventueel vooraf ingevuld via de build-config) en de key.
- Workspace-instellingen tonen welke key aan het project gekoppeld is en bieden "Vervangen". Gebruik daarvoor het bestaande `secret-input`-patroon (`packages/ui/src/react/secret-input.ts`).

**Klaar als:**
- In een schone omgeving met `ANTHROPIC_API_KEY` gezet en een project-`opencode.json` die een andere provider toevoegt, verschijnt in de modelkiezer en de engine alleen `litellm`.
- Twee workspaces met verschillende keys geven in LiteLLM aparte kosten per key.
- Geen key is terug te vinden in configbestanden of logs (grep-test in CI).

### C. Loskoppelen van de OpenWork-cloud

Hardgecodeerde verwijzingen die we hebben gevonden **[VERIFIEER, lijst kan onvolledig zijn: grep op `openworklabs.com`]**:

| Plek | Wat |
|---|---|
| `apps/desktop/electron/main.mjs` | `DEFAULT_DEN_BASE_URL`, `DOCS_PAGE_URL`, updater-manifest |
| `apps/desktop/electron/workspace-store.mjs` | `HOSTED_DESKTOP_WEB_URL`, `HOSTED_DESKTOP_API_URL` |
| `apps/desktop/electron/desktop-free-eligibility.mjs` | Toegestane origins |
| `apps/app/src/app/constants.ts` | MCP-gateway-URL |
| `apps/app/src/app/lib/analytics.ts`, `den-telemetry.ts`, `error-monitoring.ts`, `models-task-analytics.ts` | Telemetrie en foutmonitoring |

- Zet waar mogelijk een env var of de builder-config in. Anders: een minimale hook die naar onze eigen config wijst.
- **Updater:** een eigen `publish`-doel in `electron-builder.<app>.yml`. Controleer dat de updater niet terugvalt op hun manifest.
- **Telemetrie:** onze UI importeert hun analytics niet. Voor code die we wel importeren: uitzetten via config of hook.
- Sign-in bij Den, en cloud- of marketplace-schermen, bestaan niet in onze UI.

**Klaar als:** een netwerkcapture (bijvoorbeeld via de CDP-poort uit de dev-banner) tijdens een volledige sessie nul verzoeken naar `*.openworklabs.com` laat zien.

### D. Meeting-opname en transcriptie met diarization

**Context:** upstream heeft niets bruikbaars. Hun dicteerfunctie (`docs/native-dictation.md`) gebruikt spraakherkenning van het OS of de browser en slaat geen audio op. Alles hier is dus eigen code in `packages/<app>-meetings`, achter een eigen feature-flag.

**Architectuur:**

```
[Electron main] capture (mic + systeemaudio, aparte sporen)
      │  IPC
[packages/<app>-meetings] opslag → transcriptie-adapter → markdown-writer
      │
[lokale MCP-server, in de app] tools voor de agent: meetings.list / meetings.read / meetings.search
      │
[workspace] /meetings/<datum>-<titel>.md  (+ audio, optioneel)
```

**D1. Capture.**
- Microfoon en systeemaudio als **aparte sporen** opnemen. Dat geeft zonder diarization al een "ik versus de anderen"-splitsing.
- Systeemaudio per platform: macOS via ScreenCaptureKit of Core Audio-taps, Windows via WASAPI-loopback, Linux via PipeWire. Dit vraagt een native helper per platform, plus permissies en een uitlegscherm daarvoor.
- Kijk naar upstream `packages/computer-use/native` en `apps/desktop/electron/native-dictation.mjs` voor hoe zij native helpers bouwen, ondertekenen en starten. **[VERIFIEER]**

**D2. Transcriptie en diarization via een adapter-interface:**

```ts
interface TranscriptionAdapter {
  transcribe(input: { tracks: AudioTrack[]; language?: "nl" | "en" | "auto" }): Promise<Transcript>;
}
type Transcript = { segments: { start: number; end: number; speaker: string; text: string }[] };
```

- Eerste implementatie: een cloud-API met ingebouwde diarization (bijvoorbeeld AssemblyAI of Deepgram), **of** via LiteLLM als dat moet volgens E4 (zie open beslissing O2).
- Latere optie: lokaal met een meegeleverd whisper.cpp-binary plus diarization. Dat is zwaarder (modelgrootte en een GPU is wenselijk), dus achter een flag.
- Nederlands moet goed werken.

**D3. Uitvoer:** markdown in de workspace met frontmatter (datum, duur, deelnemers en sprekerlabels) en segmenten per spreker met tijdcodes. Sprekerlabels zijn achteraf te hernoemen.

**D4. Agent-integratie:** een lokale MCP-server die de app zelf start, zodat de agent meetings kan vinden, lezen en samenvatten. Daarnaast een skill in `.opencode/skills`-formaat voor samenvatting en actiepunten.

**D5. Privacy en AVG:**
- Een zichtbare opname-indicator.
- Een expliciete toestemmingsstap vóór de eerste opname.
- Audio blijft lokaal, tenzij de transcriptie via de cloud loopt; dat moet in de UI te zien zijn.
- Een bewaartermijn instellen voor audiobestanden.

**Fasering:**
1. **MVP:** alleen microfoon en het uploaden van een bestaand audiobestand → transcriptie met diarization → markdown in de workspace.
2. Systeemaudio op macOS.
3. Systeemaudio op Windows.
4. Systeemaudio op Linux en lokale transcriptie.

**Klaar (MVP) als:** een testopname van 10 minuten met 3 sprekers (in het Nederlands) een markdown-bestand oplevert met gescheiden sprekers, en de agent via MCP "vat de laatste meeting samen" correct uitvoert.

---

## 7. Niet doen

- Geen bestanden in `apps/app/**` aanpassen. Alleen importeren.
- Niets uit `ee/**` importeren of aanpassen.
- Niet rebasen op upstream. Niet mergen vanaf `upstream/dev`.
- Geen API-keys in configbestanden, env-bestanden, logs, foutmeldingen of telemetrie.
- Geen gegenereerde SDK- of OpenAPI-bestanden met de hand aanpassen of committen.
- Geen npm of yarn.
- Geen tweede provider of "fallback"-provider toevoegen, ook niet tijdelijk voor development. Gebruik een lokale LiteLLM-instantie.

## 8. Open beslissingen (eerst vragen, niet aannemen)

| # | Vraag | Gevolg |
|---|---|---|
| O1 | Eén LiteLLM-key per **gebruiker** of per **project**? | Welke `KeyResolver` de standaard wordt (§6.B4). Bouw beide achter de interface. |
| O2 | Moet transcriptie ook via LiteLLM lopen (E4 strikt), of mag een aparte transcriptie-API? | Bepaalt de eerste adapter in §6.D2. |
| O3 | Waar draait LiteLLM: centraal of per klant? Wordt de URL ingebakken in de build of ingesteld door de gebruiker? | Onboarding-flow en builder-config. |
| O4 | Definitieve app-naam, `appId`, signing-certificaten, updater-host | Werkstroom A en C |
| O5 | Juridische check op de licentie van de niet-`ee`-code en op het gebruik van naam en logo van OpenWork | Branding en distributie |

## 9. Eerste spike (aanbevolen startopdracht)

1. Fork opzetten met de `upstream`-remote, `PATCHES.md` en een CI-skelet.
2. Werkstroom A tot en met "de verpakte app start met onze UI en voert een chatbeurt uit".
3. Werkstroom B1 + B2 + B3 met één vaste key (`PerUserKeyResolver`).
4. **Merge-test:** start vanaf een oudere tag (bijvoorbeeld `v0.18.58`), bouw de spike, merge daarna `v0.18.63`. Rapporteer:
   - het aantal conflicten en in welke bestanden;
   - de typecheck-fouten in onze code door upstream-wijzigingen;
   - de lengte van `PATCHES.md`.

Deze uitkomst bepaalt of de aanpak houdbaar is voordat we verder bouwen.

## 10. Bestandsreferenties (upstream, `v0.18.63`)

| Onderwerp | Pad |
|---|---|
| Coderegels | `AGENTS.md`, `DESIGN.md` |
| UI-architectuur | `apps/app/src/react-app/ARCHITECTURE.md` |
| Extensiemanifest | `apps/app/src/app/extensions.ts`, `docs/extensions-manifest-foundation.md` |
| UI laden in Electron | `apps/desktop/electron/main.mjs` (±r. 2860) |
| Builder-varianten | `apps/desktop/electron-builder*.yml` |
| Provider-gate | `apps/server/src/organization-provider-gate.ts` |
| Runtime-config | `apps/server/src/runtime-opencode-config-store.ts` |
| Beleid via Den (niet gebruiken) | `apps/server/src/managed-desktop-policy.ts` |
| v2-providermirror | `apps/server/src/engine-v2-preview.ts` (±r. 900) |
| Lokale providerkeys (OpenCode) | `apps/server/src/opencode-v2-local-auth.ts` |
| Patroon voor een lokale proxyprovider | `apps/server/src/free-auto/provider-config.ts`, `free-auto/settings.ts` |
| Modelfilter-plugin (v2) | `apps/server/src/opencode-plugins/openwork-provider-filters-v2.ts` |
| Server-extensies | `apps/server/src/extensions/` |
| Veld voor geheimen | `packages/ui/src/react/secret-input.ts`, `docs/secure-secret-fields.md` |
| Feature-flags | `packages/features/src/registry.ts` |
| Dicteren (ter referentie) | `docs/native-dictation.md`, `apps/desktop/electron/native-dictation.mjs` |
| Engine-pool en reloads | `apps/server/src/engine-pool.ts` |
