# BonzaiWork: feedback sturen (issue #9)

> **Issue.** [#9 "Stuur feedback"](https://github.com/fonteijne/openwork/issues/9).
> **Variant.** Redirect: de gebruiker maakt het issue zelf aan op GitHub; de app vult het formulier voor en zet
> screenshot en logs klaar. Besloten op 30-10-2026, samen met B1 en B3 hieronder.

## 1. Doel

Susan (niet-technisch) loopt tegen een fout aan of heeft een idee. Ze drukt op **Feedback sturen**, kiest "Er gaat
iets mis" of "Ik heb een idee" en typt een paar zinnen. De app opent het juiste GitHub-formulier, al ingevuld met
haar tekst en de versies. Bij een fout zet de app ook een screenshot en opgeschoonde logs in een map, die ze in het
formulier sleept.

**Klaar als:**

1. Knop → categorie → tekst → **Verder op GitHub** opent `github.com/<repo>/issues/new` met het BonzaiWork-formulier
   van die categorie (label `bug` of `feature`), haar tekst en een omgevingsblok (versies, OS) al ingevuld.
2. Bij "Er gaat iets mis" staan `screenshot.png` en `logs.txt` in `Downloads/BonzaiWork-feedback-<datum-tijd>/` en
   opent die map vanzelf.
3. In `logs.txt` en in de URL staat geen LiteLLM-key, token, e-mailadres of volledig thuispad (unit-test op de
   opschoning).
4. Werkt ook in de browserdemo (zonder screenshot en zonder map; de knop opent dan alleen GitHub).

## 2. Waarom redirect (en niet zelf het issue aanmaken)

Zelf een issue aanmaken vraagt een GitHub-sleutel. Die kan niet in de app (alles in een app is eruit te halen), dus
dan is een relay nodig: een eigen dienst die de sleutel bewaart. Met een redirect logt de gebruiker zelf in op GitHub
en is er geen sleutel, relay of server nodig.

**Voorwaarde:** iedere gebruiker heeft een GitHub-account en is collaborator op de (privé-)repo. Dat klopt voor de
huidige gebruikers. Komen er gebruikers zonder GitHub bij, dan kan de knop "Verder op GitHub" later "Versturen"
worden via een relay; de dialoog en de verzamelde gegevens blijven hetzelfde.

## 3. Gebruikersflow

```
[Feedback sturen]  (zijbalk onderaan; ook in het commandopalet, S6)
   │  1. app maakt een screenshot van het venster en leest de logs (vóór de dialoog opent)
   ▼
┌ Feedback sturen ─────────────────────────────────────────┐
│ [ Er gaat iets mis ] [ Ik heb een idee ]                  │  ← categorie, standaard "Er gaat iets mis"
│ Wat gebeurde er?                                          │
│ [                                                      ]  │  ← focuspunt (P7)
│                                                           │
│ Alleen bij "Er gaat iets mis":                            │
│  [miniatuur]  [x] Screenshot meesturen                    │
│  ▸ Bekijk logs                                            │  ← P3: details achter een uitklapper
│  "We zetten screenshot.png en logs.txt in een map in      │
│   Downloads. Sleep ze in het formulier op GitHub."        │  ← P9: actie, data en risico
│                                                           │
│                       [Annuleren]  [Verder op GitHub]     │
└───────────────────────────────────────────────────────────┘
   │  2. (fout) bestanden opslaan → map openen
   │  3. browser opent het vooringevulde formulier
   ▼
Dialoog blijft open: "Sleep de bestanden in het formulier" + [Map openen] [Klaar]
```

Ontwerpregels: P3, P7, P9, S6, C1 (werkwoord eerst), C2 (de actie houdt zijn naam), C6, C7.

## 4. Architectuur

```
BonzaiWork UI (apps/bonzaiwork)
  │  POST /bonzaiwork/feedback/collect        → { id, logs, screenshot: data-URL | null }
  │  POST /bonzaiwork/feedback/:id/save       → { folder }   body: { screenshot, notes }
  │  desktop-bridge: shell.openExternal(url), __revealItemInDir(folder)
  ▼
Lokale OpenWork-server (in-process in Electron) → server-hook-routes (packages/bonzaiwork-feedback)
  └─ DiagnosticsSource (geregistreerd door desktop-main, zoals de KeyStore):
        captureWindow() = BrowserWindow.webContents.capturePage()
        logFiles()      = <userData>/logs/openwork-server.log, desktop-startup.log
        saveDirectory() = Downloads
```

- **Waarom via de server-hook.** De server draait in het Electron-hoofdproces en kan dus bij het venster, de
  logbestanden en de Downloads-map. De upstream-preload heeft geen commando voor een screenshot of logs.
- **Compositie.** `apps/bonzaiwork/desktop-main/server-hooks.ts` voegt de feedbackroutes toe aan de bestaande
  LiteLLM-hooks; de build bundelt dat bestand als `server-hooks.js`.
- **Formulieren.** Twee eigen issue-formulieren in `.github/ISSUE_TEMPLATE/`: `bonzaiwork-bug.yml` (labels `bug`,
  `feedback`) en `bonzaiwork-idee.yml` (labels `feature`, `feedback`), in het Nederlands en met velden die Susan
  begrijpt. GitHub vult velden voor via de URL (`?template=…&title=…&<veld-id>=…`). Het zijn nieuwe bestanden in een
  upstream-map, dus ze staan in `PATCHES.md`.
- **Doelrepo.** `VITE_BONZAIWORK_FEEDBACK_REPO` bij het bouwen, standaard `fonteijne/openwork`.

## 5. Privacy en opschoning

`logs.txt` bevat: het omgevingsblok, de laatste fouten in de UI (een kleine ringbuffer) en de laatste ±300 regels
van `openwork-server.log` en `desktop-startup.log`. De URL bevat alleen de tekst van de gebruiker en het
omgevingsblok, nooit logs.

| Patroon | Vervangen door |
|---|---|
| Keys (`sk-…`, `bwk_local_…`), `Bearer …`, `Basic …` | `[redacted]` |
| Waarden van omgevingsvariabelen met `TOKEN`, `KEY`, `SECRET` of `PASSWORD` in de naam | `[redacted]` |
| Lange willekeurige reeksen (≥ 40 tekens) | `[redacted]` |
| E-mailadressen | `[email]` |
| Thuismap (`/Users/<naam>`, `C:\Users\<naam>`, `/home/<naam>`) | `~` |

De opschoning draait in de server-hook (één plek, met unit-tests). De UI toont onder "Bekijk logs" exact de
opgeschoonde tekst. De screenshot wordt niet opgeschoond: de gebruiker ziet een miniatuur en kan hem uitzetten.

## 6. Stappen

| # | Stap | Waar |
|---|---|---|
| 1 | Pakket `@bonzaiwork/feedback`: `DiagnosticsSource`, opschoning, routes `collect` en `save`, tests | `packages/bonzaiwork-feedback/` |
| 2 | Electron: `DiagnosticsSource` registreren; hooks samenvoegen; build bundelt de samengevoegde hooks | `apps/bonzaiwork/desktop-main/`, `scripts/build-electron-entry.mjs` |
| 3 | Backend-interface `feedback` (live + demo), ringbuffer voor UI-fouten | `apps/bonzaiwork/src/backend/`, `src/lib/` |
| 4 | UI: knop in de zijbalk en het commandopalet, dialoog, GitHub-URL; copy in `copy.ts` | `apps/bonzaiwork/src/features/feedback/` |
| 5 | Issue-formulieren + `PATCHES.md` | `.github/ISSUE_TEMPLATE/` |
| 6 | Verificatie: unit-tests, typecheck, headless Chrome (demo), screenshots | `docs/bonzaiwork/screenshots/` |

**Geen feature-flag.** Additieve UI (AGENTS.md: "never flag additive UI").

## 7. Verificatie (30-10-2026, in deze container)

| Wat | Hoe | Uitkomst |
|---|---|---|
| Opschoning en routes | `pnpm --filter @bonzaiwork/feedback test` | 6 groen: keys, tokens, mails, thuispaden weg; gewone logregels en paden blijven; opslaan overschrijft nooit |
| GitHub-URL | `pnpm --filter @bonzaiwork/app test` (`issue-url.test.ts`) | juiste template, titel uit de eerste regel, URL blijft kort |
| Gebundelde hooks in de echte server | `openwork-server` (bun) met de gebundelde `desktop-main/server-hooks.ts` + Vite-UI in headless Chrome | dialoog → `logs.txt` in `~/Downloads/BonzaiWork-feedback-…/`, GitHub opent `issues/new?template=bonzaiwork-bug.yml&…`; in de logs staan `Bearer [redacted]`, `~/Documents` en `[email]` |
| UI | headless Chrome, 1280×800 en 390×844, live en demo | screenshots `screenshots/feedback-*.png`; geen horizontale scroll |

Niet getest: de screenshot via Electron (`capturePage`) en het openen van de map in Finder/Verkenner, want daarvoor
is de verpakte app nodig. In `feedback-1-fout.png` is de miniatuur daarom met de hand ingevoegd. De smoketest van de
verpakte build in CI bouwt wel de nieuwe hooks- en Electron-entry.

## 8. Besluiten

| # | Vraag | Besluit |
|---|---|---|
| B1 | Waar komen de issues? | In deze repo, die privé wordt. |
| B2 | Waar draait de relay? | Vervallen: redirect-variant. |
| B3 | Wie kiest de categorie? | De gebruiker (2 opties). Een voorstel van het LLM kan later. |
| B4 | Labels | `bug` / `feature` + `feedback`. Het label `feedback` moet in de repo bestaan, anders laat GitHub het weg. |
| B5 | Naam/e-mail meesturen? | Niet nodig: het GitHub-account is de afzender. |

## 9. Risico's

- **Repo privé maken**: `fonteijne/openwork` is een GitHub-fork van een openbare repo, en GitHub laat zo'n fork
  niet privé zetten. Eerst loskoppelen (GitHub Support, "detach fork") of een nieuwe privé-repo maken en
  `git push --mirror`. De upstream-sync heeft de fork-relatie niet nodig. Let daarna op de Actions-minuten en op
  CodeQL (vraagt in een privé-repo GitHub Advanced Security).
- **URL-lengte**: GitHub kapt lange URL's af. De tekst gaat mee tot 2.000 tekens; logs gaan nooit via de URL.
- **Upstream verandert logpaden**: ontbrekende logbestanden worden overgeslagen ("geen logs gevonden"), niet fataal.
- **Gevoelige data in de screenshot**: zichtbaar als miniatuur, met één klik uit te zetten.
