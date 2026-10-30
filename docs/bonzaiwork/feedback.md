# BonzaiWork: feedback sturen (issue #9)

> **Status.** Implementatieplan, nog geen code. Eerst de open beslissingen ([§6](#6-open-beslissingen)), dan bouwen.
> **Issue.** [#9 "Stuur feedback"](https://github.com/fonteijne/openwork/issues/9).

## 1. Doel

Susan (niet-technisch) loopt tegen een fout aan of heeft een idee. Ze drukt op één knop, typt een paar zinnen en
drukt op **Versturen**. De app verzamelt zelf wat een ontwikkelaar nodig heeft (screenshot, versies, recente logs)
en er staat een GitHub-issue met de juiste categorie klaar. Susan heeft geen GitHub-account nodig en ziet nooit een
logbestand, tenzij ze dat wil.

**Klaar als:**

1. In de verpakte app levert knop → tekst → Versturen binnen enkele seconden een issue op met label `bug` of
   `feature`, de tekst van de gebruiker, een screenshot en een diagnoseblok (versies, OS, log-uittreksel).
2. In dat issue staat geen LiteLLM-key, server-token, e-mailadres of volledig thuispad (grep-test op de verstuurde
   payload, net als de bestaande "geen key in logs"-test).
3. Zonder netwerk of bij een fout van de relay krijgt de gebruiker een melding met een volgende stap (C6) en gaat
   de tekst niet verloren.

## 2. Gebruikersflow

```
[Feedback-knop]  (zijbalk, onderaan bij Instellingen; ook in het commandopalet, S6)
   │  1. app maakt direct een screenshot van het venster (vóór de dialoog opent)
   ▼
┌ Dialoog "Feedback sturen" ──────────────────────────────┐
│  (●) Er gaat iets mis    ( ) Ik heb een idee            │  ← categorie, standaard "Er gaat iets mis"
│  [ Wat gebeurde er? / Wat zou je willen?            ]   │  ← enige verplichte veld
│  [x] Screenshot meesturen      [miniatuur]              │
│  [x] Technische gegevens meesturen                      │
│  ▸ Bekijk wat er wordt meegestuurd                      │  ← P3: details achter een uitklapper
│  "Je feedback komt in een openbare lijst" (zie B1)      │  ← P9: actie, data en risico
│                          [Annuleren]  [Feedback versturen] │
└─────────────────────────────────────────────────────────┘
   │  2. UI → POST /bonzaiwork/feedback (lokale server)
   │  3. server-hook verzamelt logs + versies, schoont op, stuurt naar de relay
   ▼
Toast "Feedback verstuurd" + link "Bekijk op GitHub" (C2: de actie houdt zijn naam)
```

Ontwerpregels: P3, P7 (de tekstvak is het focuspunt), P9 (consent noemt data en risico), S6, C1, C2, C6, C7.

## 3. Architectuur

```
BonzaiWork UI (apps/bonzaiwork)
  │  POST /bonzaiwork/feedback/screenshot   → PNG (base64) van het hoofdvenster
  │  GET  /bonzaiwork/feedback/preview      → diagnoseblok zoals het verstuurd wordt
  │  POST /bonzaiwork/feedback              → { category, message, includeScreenshot, includeDiagnostics, screenshot? }
  ▼
Lokale OpenWork-server (in-process in Electron) → server-hook-routes (packages/bonzaiwork-feedback)
  ├─ DiagnosticsSource (geregistreerd door desktop-main, zoals de KeyStore):
  │     capture()  = BrowserWindow.webContents.capturePage()
  │     logFiles() = <userData>/logs/openwork-server.log, desktop-startup.log (staart, max ±200 KB)
  ├─ versies: app, engine, server, OS, keyMode, LiteLLM-host (geen key)
  ├─ redactie (zie §4)
  └─ HTTPS → Feedback-relay (BONZAIWORK_FEEDBACK_URL, ingebakken in de build)
                ├─ authenticatie: de LiteLLM-key van de gebruiker, gecontroleerd via LiteLLM /key/info
                ├─ rate limit per key
                ├─ bijlagen (screenshot, logs) → opslag die alleen maintainers zien (zie B1)
                └─ GitHub App-installatietoken → POST /repos/{owner}/{repo}/issues
```

**Waarom een relay en geen token in de app.** Een GitHub-token in de app-bundel is uit te pakken (`asar`) en dan kan
iedereen issues aanmaken of erger. Een geprefilde `github.com/.../issues/new`-link vraagt een GitHub-account en kan
geen screenshot of logs meenemen. De relay houdt de GitHub-credential buiten de app, en de LiteLLM-key bewijst dat de
afzender een echte BonzaiWork-gebruiker is.

**Waarom via de server-hook en niet direct uit de UI.** De server draait in het Electron-hoofdproces, kan dus bij
de logbestanden en het venster, en heeft de LiteLLM-key al. De key komt zo nooit in de renderer (E5).

**Geen upstream-patches.** Alles komt in eigen mappen: `packages/bonzaiwork-feedback`, `apps/bonzaiwork` en
`apps/bonzaiwork/desktop-main`. Upstream heeft geen IPC-commando voor een screenshot of logs; dat lossen we op met
een geregistreerde `DiagnosticsSource` in onze eigen Electron-entry (hetzelfde patroon als `registerKeyStore`).
`PATCHES.md` blijft ongewijzigd.

## 4. Privacy en redactie

Wat er **wel** meegaat (diagnoseblok, Markdown in een `<details>` in het issue):

- BonzaiWork-versie, buildcommit, OpenWork-server- en engineversie, OS en versie, `keyMode`.
- Hostnaam van de LiteLLM-server (geen pad, geen key).
- Huidige route in de app (bijv. `project/chat`, zonder ids of namen).
- De laatste ±200 regels van `openwork-server.log` en `desktop-startup.log`, plus de laatste fouten uit de UI
  (een kleine ringbuffer van `console.error` en mislukte API-aanroepen).

Wat er **niet** meegaat, of eruit wordt gefilterd vóór verzending:

| Patroon | Vervangen door |
|---|---|
| LiteLLM-/API-keys (`sk-…`, `Bearer …`, `x-api-key`) | `[key]` |
| Server-tokens (client-, owner-, host-token, `X-OpenWork-Host-Token`) | `[token]` |
| E-mailadressen | `[email]` |
| Thuismap (`/Users/<naam>`, `C:\Users\<naam>`, `/home/<naam>`) | `~` |
| Project- en chatnamen, berichtinhoud | niet verzameld |

De redactie draait in de server-hook (één plek), heeft eigen unit-tests, en de UI toont onder "Bekijk wat er wordt
meegestuurd" exact de opgeschoonde tekst. De screenshot wordt niet opgeschoond: de gebruiker ziet een miniatuur en
kan hem uitzetten.

## 5. Stappen

| # | Stap | Waar | Test |
|---|---|---|---|
| 1 | **Pakket `@bonzaiwork/feedback`**: types, `DiagnosticsSource`-interface + `registerDiagnosticsSource`, redactie, issue-opmaak (titel, body, labels), relay-client | `packages/bonzaiwork-feedback/` | `bun test`: redactie (keys, tokens, mails, paden), opmaak, payloadgrens |
| 2 | **Server-routes** `POST /bonzaiwork/feedback/screenshot`, `GET /bonzaiwork/feedback/preview`, `POST /bonzaiwork/feedback` (auth `client`) en samenvoegen met de bestaande hooks in de gebundelde `server-hooks.js` | `packages/bonzaiwork-feedback`, `packages/bonzaiwork-litellm/src/server-hooks.ts` (compositie) | route-tests met een nep-`DiagnosticsSource` en een nep-relay |
| 3 | **Electron**: `DiagnosticsSource` registreren (`capturePage` van het hoofdvenster, logpaden uit `app.getPath("userData")`); `BONZAIWORK_FEEDBACK_URL` in `build-config.json` | `apps/bonzaiwork/desktop-main/`, `apps/bonzaiwork/scripts/package.mjs` | smoketest: route geeft een PNG en een niet-leeg logblok |
| 4 | **UI**: knop in de zijbalk + commandopalet, dialoog, miniatuur, uitklapper met preview, toast met link; foutpad houdt de tekst vast. Copy in `copy.ts` | `apps/bonzaiwork/src/features/feedback/`, `sidebar.tsx`, `command-palette.tsx`, `copy.ts` | headless Chrome (demo-backend + live), screenshots in `docs/bonzaiwork/screenshots/` (P10) |
| 5 | **Demo-backend**: feedback "verstuurd" zonder netwerk, zodat de browserdemo werkt | `apps/bonzaiwork/src/backend/demo/` | bestaande demo-tests |
| 6 | **Relay** (los deploybaar): GitHub App-token, LiteLLM-keycheck, rate limit, bijlagen-opslag | afhankelijk van B2 | contracttest tegen een nep-GitHub; één echte testissue met label `test` |
| 7 | **CI**: grep-test dat de verstuurde payload geen key/token bevat, in de bestaande e2e | `packages/bonzaiwork-litellm/e2e` of `packages/bonzaiwork-feedback/e2e`, `.github/workflows/bonzaiwork.yml` | groen in CI |
| 8 | **Docs**: `frontend-contract.md` (§5.7 + §7 nieuwe routes), `README.md` (wat er staat) | `docs/bonzaiwork/` | – |

Stap 1–5 en 7–8 kunnen zonder de relay: de server-hook stuurt naar een nep-relay in tests, en zonder
`BONZAIWORK_FEEDBACK_URL` toont de UI de knop uitgegrijsd met uitleg (P4, C5).

**Geen feature-flag.** Dit is additieve UI (AGENTS.md: "never flag additive UI"). Zonder ingebakken relay-URL staat
de knop vanzelf uit.

## 6. Open beslissingen

| # | Vraag | Opties | Advies |
|---|---|---|---|
| B1 | **Waar komen de issues?** Deze repo is openbaar. Logs en screenshots kunnen namen, bestandsnamen of klantinformatie tonen, en AGENTS.md verbiedt dat in deze repo. | a) issue in deze repo, bijlagen in een privé-repo/opslag, alleen een link; b) alles in een **privé-repo** (bijv. `fonteijne/bonzaiwork-feedback`); c) alles in deze repo | **b**: één privé-repo voor feedback. Maintainers zetten een issue met de hand door naar deze repo als het een echt werkpunt is. |
| B2 | **Waar draait de relay?** | a) Cloudflare Worker / Vercel-functie; b) naast LiteLLM op dezelfde server; c) als route in LiteLLM zelf (custom callback) | **a** of **b**, wat het makkelijkst te beheren is. Bepaalt stap 6. |
| B3 | **Hoe bepaalt de app de categorie?** | a) gebruiker kiest (2 opties); b) het LLM via LiteLLM stelt categorie en titel voor, gebruiker kan wijzigen; c) alleen LLM | **a** in de eerste versie, **b** als vervolg (gebruikt de eigen LiteLLM, geen extra dienst). |
| B4 | **Welke labels?** | `bug` / `feature` (zoals de issue-templates) + `feedback` + platform (`macos`/`windows`/`linux`) | Zoals voorgesteld. |
| B5 | **Mag de gebruiker zijn naam/e-mail meesturen** om teruggebeld te worden? | ja (optioneel veld) / nee | Nee in de eerste versie; de LiteLLM-key-alias in de relay is genoeg om een gebruiker te herleiden. |

## 7. Risico's

- **Spam/misbruik**: relay accepteert alleen geldige LiteLLM-keys, met rate limit per key en maximale payload.
- **Gevoelige data in de screenshot**: standaard aan maar zichtbaar als miniatuur, met één klik uit te zetten.
- **Upstream verandert logpaden** (`runtime.mjs`, `startup-log.mjs`): de `DiagnosticsSource` zoekt de bestanden
  op en meldt "geen logs gevonden" in plaats van te falen; de smoketest vangt het op.
- **Screenshot in headless/browser-demo**: daar is geen Electron-venster; de UI laat de screenshot-optie dan weg.
