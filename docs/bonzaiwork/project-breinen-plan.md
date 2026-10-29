# Project-breinen: implementatieplan

Status: **voorstel**. Nog niets gebouwd. Open beslissingen staan in §9.

## 1. Het idee in één alinea

Een nieuw project kan, behalve een lege map in `~/BonzaiWork/<naam>` of een bestaande map, ook een
**git-repo zijn die BonzaiWork clonet** in `~/BonzaiWork/<naam>`. Zo'n repo is een **project-brein**:
gedeelde kennis (`AGENTS.md`, `kennis/*.md`) en workflows (skills en commando's in `.opencode/`) waar een
heel team mee werkt. BonzaiWork werkt binnen die map zoals in elk ander project. Het verschil: BonzaiWork
**haalt vóór het werk de nieuwste versie op** en **legt na het werk de wijzigingen vast en verstuurt ze**,
zodat iedereen altijd met hetzelfde brein werkt.

## 2. Kernkeuze: synchronisatie is code, geen instructie

De vraag was of instructies ("pull steeds, commit en push steeds") het beste werken, of iets als hooks.

**Advies: laat de AI géén git doen. BonzaiWork doet het zelf, op vaste momenten, net als hooks in Claude
Code.** Instructies aan een model worden soms vergeten of half uitgevoerd (wel committen, niet pushen;
pushen midden in een beurt; een merge-conflict "oplossen" door bestanden weg te gooien). Een vaste stap in
de app gebeurt altijd, is te testen en geeft eindgebruikers één duidelijke status.

| Claude Code-hook | BonzaiWork-moment | Wat er gebeurt |
|---|---|---|
| `SessionStart` | Project openen, en elke 5 min zolang de app open en het project rustig is | `fetch`; staat er iets nieuws en is de map schoon, dan bijwerken |
| `UserPromptSubmit` | Vlak vóór elke beurt (chat én routine) | Bijwerken; de beurt wacht max. ~5 s, daarna gaat hij door met een melding "Werkt met de versie van 14:02" |
| `Stop` | Als **alle** chats in het project weer stil zijn (met 15 s rust) | Alles vastleggen (`commit`) en versturen (`push`) |
| `PreToolUse` | Engine-toestemmingen | De AI mag zelf geen `git commit/push/pull/reset` uitvoeren (`deny`) |

De instructie aan de AI wordt daardoor kort en inhoudelijk ("waar leg je kennis vast, hoe werk je een
skill bij, git hoef je niet te doen"), zie §6.

Hooks die het brein zélf meebrengt (scripts in de repo die bij elke beurt draaien) bouwen we bewust **niet**:
dat is code uitvoeren uit een gedeelde repo op ieders laptop. Het gedrag is vast; per brein kies je alleen
een modus (§4.4).

## 3. Waar het in de code komt

Uitgangspunt van de fork blijft: zo min mogelijk upstream-patches (`PATCHES.md`). Dit plan voegt er
**geen** toe; alleen het eigen bestand `apps/server/src/downstream-hooks.ts` krijgt mogelijk één
host-methode erbij (§3.3).

```
packages/bonzaiwork-brains/          NIEUW: git-runner, sync-machine, routes, tests
  src/git.ts                         git aanroepen (zonder prompt, met timeouts, credentials via askpass)
  src/sync.ts                        per project: wachtrij, mutex, status, pull/commit/push, conflicten
  src/registry.ts                    welke workspaces een brein zijn (userData/bonzaiwork/brains.json)
  src/routes.ts                      /bonzaiwork/brains/*
  src/secrets.ts                     scan op sleutels/.env vóór een commit
  test/                              met lokale bare repo's: twee "gebruikers", conflicten, offline
packages/bonzaiwork-litellm/src/server-hooks.ts
                                     stelt de routes van beide pakketten samen (of verhuist naar een
                                     klein pakket bonzaiwork-server-hooks dat litellm + brains combineert)
apps/bonzaiwork/src/
  backend/types.ts                   Brain-types, Capabilities.brains, Backend.brains
  backend/live/brains.ts             client voor /bonzaiwork/brains/*
  backend/demo/                      nep-brein voor ontwerpreview (synced, achter, conflict, alleen-lezen)
  features/projects/new-project-dialog.tsx   derde optie "Uit een gedeeld brein (Git)"
  features/brain/                    statuspil, conflictkaart, geschiedenis, instellingen-sectie
  copy.ts                            alle nieuwe teksten (Nederlands, DESIGN.md C1–C7)
docs/bonzaiwork/frontend-contract.md §7.5 Breinen (nieuw)
```

### 3.1 Git zelf

Twee opties (beslissing **B1**, §9):

- **Meegeleverde git** via `dugite` (de ingebouwde git van GitHub Desktop): werkt op macOS, Windows en
  Linux zonder dat de gebruiker iets installeert, en zonder de Xcode-popup op macOS. Kost ~30–40 MB in de
  build. **Advies**, gezien de doelgroep (niet-technisch).
- **Systeem-git** (`execFile("git")`): niets extra's in de build, wel afhankelijk van wat er op de laptop
  staat. Prima als terugval en voor ontwikkelaars.

Hoe dan ook: altijd `GIT_TERMINAL_PROMPT=0`, een vaste timeout per commando, `core.autocrlf=false` en een
eigen `GIT_ASKPASS`-helper (§3.2). De server leest al `git check-ignore`
(`apps/server/src/opencode-v2-instructions.ts`); die werkt dan ook in breinen.

### 3.2 Inloggen bij de git-server

- **Fase 1: toegangstoken over HTTPS** (GitHub fine-grained token, GitLab project/personal token, Azure
  DevOps PAT). Het token komt in de bestaande `KeyStore` (Electron `safeStorage`, zoals de LiteLLM-keys) en
  gaat alleen via de askpass-helper naar git. **Nooit** in de remote-URL, `.git/config`, logs of
  foutmeldingen (hergebruik `redactSecrets`).
- **Fase 3: inloggen met de browser** (OAuth device flow voor GitHub/GitLab), zodat niemand een token hoeft
  te maken. SSH alleen met systeem-git, voor wie het al heeft.
- Een openbare repo kan zonder token; dan is het brein alleen-lezen tot er een token is.

### 3.3 Weten wanneer een beurt klaar is (de `Stop`-hook)

De server-hooks zien vandaag geen engine-events. Twee manieren, in volgorde van voorkeur:

1. **Server-side** (robuust, dekt ook routines en een gesloten venster): `DownstreamServerHost` krijgt
   `onSessionActivity(listener)` of `sessionActivity(workspaceId)`, gevoed door wat de server al weet
   (`apps/server/src/opencode-plugins/session-activity.ts`, de v2-status). Dat is een uitbreiding van ons
   eigen nieuwe bestand `downstream-hooks.ts` (staat al in PATCHES; geen nieuwe rij) en past bij de
   upstream-kandidaat.
2. **UI-side** als eerste stap of terugval: de live backend weet al wanneer een run stopt (hij haalt dan de
   historie opnieuw op) en roept `POST /bonzaiwork/brains/:id/sync` aan. Routines roepen de sync-service
   rechtstreeks aan, want hun planner draait in het serverproces (contract §7.4).

De `UserPromptSubmit`-stap (bijwerken vóór de beurt) gaat in beide gevallen via de UI: `chats.send` wacht
op `POST /bonzaiwork/brains/:id/pull` (max. ~5 s) voordat de prompt naar de engine gaat. Alternatief dat we
**niet** kiezen: een OpenCode v2-plugin met `context.session.hook("prompt", …)`. Dat zou het mooiste
`UserPromptSubmit`-equivalent zijn, maar vraagt eigen engine-plugins en dus een patch in
`managed-opencode-v2.ts`.

## 4. Gedrag in detail

### 4.1 Een brein toevoegen (clone)

1. Gebruiker kiest **Nieuw project → Uit een gedeeld brein**, plakt een repo-URL, en (indien nodig) een
   token. Naam en map vult de app voor (`~/BonzaiWork/<reponaam>`, via de bestaande `defaultFolder()`).
2. `POST /bonzaiwork/brains/clone` clonet (ondiep: `--depth 50`, standaardbranch) en meldt voortgang.
   Mislukt het (verkeerde URL, geen toegang, map bestaat al en is niet leeg), dan blijft er niets halfs
   achter.
3. **Vertrouwensstap** (§5): de app laat zien wat het brein meebrengt en vraagt bevestiging.
4. De UI registreert de map als workspace via de bestaande `POST /workspaces/local`
   (`ensureWorkspaceFiles` schrijft niets in de map) en daarna `PUT /bonzaiwork/brains/:workspaceId`.
5. Lokale uitsluitingen gaan in `.git/info/exclude` (niet gedeeld, verandert de repo niet):
   `.opencode/openwork/inbox/` (bijlagen uit chats, kunnen privé zijn), `.DS_Store`, `Thumbs.db`.
6. Gebruikersnaam en e-mail voor de geschiedenis vraagt de app één keer (app-instellingen), voorgevuld uit
   de git-config als die er is.

Ook: een **bestaand project dat al een git-repo met remote is**, krijgt in de projectinstellingen de knop
"Synchronisatie aanzetten".

### 4.2 Bijwerken (pull)

- `git fetch`, dan: map schoon → fast-forward. Lokale wijzigingen die nog niet vastgelegd zijn (de vorige
  beurt is net klaar, of iemand bewerkte een bestand buiten de app) → eerst vastleggen (§4.3), dan
  `rebase` op de remote.
- Nooit bijwerken terwijl een chat in dit project loopt: de AI zou bestanden onder zich zien veranderen.
  De periodieke fetch haalt dan alleen op en wacht.
- Veranderde er iets in `.opencode/` of `opencode.json`, dan daarna `POST /workspace/:id/engine/reload`
  (bestaat al), zodat nieuwe skills en commando's meteen werken. Raakte de wijziging verbindingen of
  plugins, dan eerst opnieuw de vertrouwensstap (§5).

### 4.3 Vastleggen en versturen (commit + push)

- Eén wachtrij en mutex per project; nooit twee git-acties tegelijk in dezelfde map.
- Pas als **alle** chats in het project stil zijn, plus 15 s rust (bundelt snelle vervolgvragen).
- `git add -A` (respecteert `.gitignore` en `.git/info/exclude`), eerst de geheimenscan (§5), dan commit:
  - auteur: de gebruiker uit de instellingen;
  - bericht: `<chattitel>` + regel "Via BonzaiWork" + trailer `BonzaiWork-Chat: <id>`. Later eventueel een
    samenvatting door het model.
- `push`. Geweigerd omdat iemand anders eerder was → `fetch` + `rebase` + opnieuw `push`, max. 3 keer.
- Offline of server onbereikbaar → commits blijven lokaal, status "3 wijzigingen nog niet verstuurd",
  opnieuw proberen met oplopende wachttijd en bij elk volgend moment uit §2.
- Geen schrijfrechten (403) → status "Alleen-lezen" en geen nieuwe pogingen tot het token verandert.
- Bestanden > 10 MB: niet vastleggen, melding (git is geen opslag voor grote bestanden).

### 4.4 Modi per brein

| Modus | Bijwerken | Vastleggen en versturen | Voor wie |
|---|---|---|---|
| **Automatisch** (standaard) | automatisch | automatisch na elke beurt | het normale geval |
| **Handmatig** | automatisch | knop "Wijzigingen delen" | wie eerst wil kijken wat er gedeeld wordt |
| **Alleen lezen** | automatisch | nooit | breinen zonder schrijfrechten, of "volgen" |

Fase 3: **via voorstel** — wijzigingen naar een eigen branch en een pull request, voor breinen waar `main`
beschermd is.

### 4.5 Conflicten

Omdat we per beurt vastleggen, zijn conflicten klein en zeldzaam, maar ze komen voor (twee mensen werken
dezelfde alinea bij).

- Fase 1: `rebase --abort`; niets gaat verloren (de lokale commit blijft). Status **"Actie nodig"** met een
  kaart: welke bestanden, wie de andere wijziging deed, en twee knoppen:
  - **"Laat de AI het samenvoegen"**: start een chat in het project met een vaste opdracht (welke
    bestanden, beide versies, "voeg samen, verlies geen informatie") en zet de rebase klaar. Na die beurt
    rondt de sync de rebase af.
  - **"Bewaar mijn versie apart"**: push naar `bonzaiwork/<gebruiker>/<datum>` en zet de map terug op de
    gedeelde versie.
- Tot het conflict is opgelost, pauzeert het automatisch bijwerken van dit project; chatten blijft kunnen.

## 5. Veiligheid

Een gedeelde repo is **invoer van anderen** die op ieders laptop draait. Drie risico's:

1. **Code uitvoeren via de projectconfig.** Een `opencode.json` of `.opencode/` in de repo kan lokale
   MCP-servers (een commando), plugins, agents met ruime rechten of commando's meebrengen. Providers zijn al
   dicht (alleen LiteLLM, via `experimental.policies`), maar de rest niet. Daarom:
   - **Vertrouwensstap** bij het clonen: lijst van lokale verbindingen, plugins en agents in gewone taal;
     zonder akkoord laden die niet (de server zet ze uit voor dit project).
   - Komt er later via een pull zo'n onderdeel bij of verandert het, dan opnieuw vragen vóór het laadt
     (diff op `opencode.json`, `.opencode/plugins/`, `.opencode/agents/`, `mcp`-sectie).
2. **Geheimen die meegaan naar de remote.** Vóór elke commit een scan (`.env`-bestanden, bekende
   sleutelpatronen, waaronder de LiteLLM-keyvorm). Treffer → niet vastleggen, melding met het bestand.
   Bijlagen uit de chat-inbox gaan nooit mee (§4.1 stap 5).
3. **Tokens.** Alleen in de keychain-store; askpass geeft ze per commando door; nooit in config, logs,
   foutmeldingen of de DOM (dezelfde regels als de LiteLLM-keys, zie `docs/bonzaiwork/README.md`).

## 6. Wat er in een brein staat (sjabloon)

Een leeg brein maken kan vanuit de app ("Nieuw gedeeld brein" in fase 2; maakt de bestanden en de eerste
commit, de repo zelf maakt de gebruiker op GitHub/GitLab). Bestaande repo's werken zonder sjabloon.

```
AGENTS.md                      wat dit brein is, voor wie, en "Hoe je met dit brein werkt" (hieronder)
kennis/                        gedeelde kennis, één onderwerp per Markdown-bestand
.opencode/skills/<naam>/SKILL.md   workflows (de app bewaart skills al op deze plek)
.opencode/commands/            vaste /commando's
opencode.json                  alleen: permission.bash "git *" → deny; verder leeg
.gitignore
```

Het vaste stuk in `AGENTS.md` (kort, want de app doet de git-kant):

> Dit project is een gedeeld brein dat meerdere mensen gebruiken. BonzaiWork haalt vóór je beurt de
> nieuwste versie op en deelt je wijzigingen na je beurt. Voer zelf geen git-commando's uit.
> Leg nieuwe of verbeterde kennis vast in `kennis/` (één onderwerp per bestand, bestaande bestanden
> bijwerken in plaats van dubbel maken). Een werkwijze die vaker terugkomt, wordt een skill in
> `.opencode/skills/`. Zet nooit wachtwoorden, sleutels of persoonsgegevens in het brein.

De `deny` op `git *` is de `PreToolUse`-kant uit §2: ook als een model het toch probeert, gebeurt het niet.

## 7. API (wordt contract §7.5)

| Route | Auth | Doel |
|---|---|---|
| `POST /bonzaiwork/brains/clone` | host | `{ url, folderPath, token? }` → job; voortgang via `GET /bonzaiwork/brains/jobs/:id` |
| `GET /bonzaiwork/brains/inspect?path=` | host | wat een gecloned brein meebrengt (voor de vertrouwensstap) |
| `PUT /bonzaiwork/brains/:workspaceId` | host | workspace als brein registreren: modus, branch, vertrouwde onderdelen |
| `DELETE /bonzaiwork/brains/:workspaceId` | host | synchronisatie uitzetten (map blijft) |
| `GET /bonzaiwork/brains/:workspaceId/status` | client | zie `BrainStatus` hieronder |
| `POST /bonzaiwork/brains/:workspaceId/pull` | client | bijwerken vóór een beurt (`UserPromptSubmit`) |
| `POST /bonzaiwork/brains/:workspaceId/sync` | client | vastleggen + versturen (`Stop`, of de knop) |
| `GET /bonzaiwork/brains/:workspaceId/history` | client | laatste commits: wie, wat, wanneer, welke chat |
| `POST /bonzaiwork/brains/:workspaceId/resolve` | client | `{ strategy: "ai" \| "keep-mine-apart" }` |
| `PUT/DELETE /bonzaiwork/brains/:workspaceId/token` | host | token koppelen/ontkoppelen |

```ts
type BrainState = "synced" | "syncing" | "behind" | "ahead" | "offline" | "conflict" | "read_only" | "error";
type BrainStatus = {
  state: BrainState;
  mode: "auto" | "manual" | "read_only";
  remote: string;            // zonder credentials
  branch: string;
  ahead: number;             // vastgelegd, nog niet verstuurd
  behind: number;
  lastSyncAt: number | null;
  conflictFiles: string[];
  error: string | null;      // Nederlands; Engelse git-tekst alleen in de log
};
```

`Capabilities.brains` gaat aan als `/bonzaiwork/brains` antwoordt (zelfde probe-patroon als de routines);
zonder staat de optie in "Nieuw project" zichtbaar maar vergrendeld met de reden (DESIGN.md P4).

## 8. UI

Volgens `DESIGN.md`; regels per scherm citeren in de PR, met screenshots (headless, demo-backend).

- **Nieuw project**: derde keuze naast "Nieuwe map" en "Bestaande map": **"Uit een gedeeld brein"**.
  Velden: link naar de repo, toegangscode (alleen als de repo erom vraagt; uitleg met link naar "zo maak je
  er een"), naam, map. Daarna voortgang en de vertrouwensstap. Woorden: "brein", "ophalen", "delen",
  "geschiedenis" — niet "pull", "push", "commit" (DESIGN.md C3, geen techniek in beeld).
- **Projectkop/zijbalk**: statuspil "Bijgewerkt · 2 min geleden" / "Bezig met delen…" / "3 wijzigingen nog
  niet gedeeld" / "Actie nodig" / "Alleen lezen". Klik → paneel met "Nu bijwerken", "Wijzigingen delen" en
  de laatste geschiedenis.
- **Chat**: onder een afgeronde beurt een stille regel "Gedeeld met het brein · 3 bestanden" (of "Wordt
  gedeeld zodra je weer online bent").
- **Conflictkaart** boven de composer, in dezelfde stijl als de toestemmingskaarten.
- **Projectinstellingen → Brein**: link, branch, modus, toegangscode vervangen, synchronisatie uitzetten,
  geschiedenis.
- **App-instellingen**: naam en e-mail voor de geschiedenis.
- **Demo-backend**: een voorbeeldbrein in elke staat, zodat ontwerpreview zonder server kan.
- **Smoketest** (`scripts/smoke-packaged.mjs`): nieuwe `data-testid`'s (`brain-url-input`, `brain-clone`,
  `brain-status`) en een clone van een lokale bare repo via `file://`.

## 9. Open beslissingen

| # | Vraag | Advies |
|---|---|---|
| B1 | Meegeleverde git (`dugite`) of systeem-git? | Meegeleverd, systeem-git als terugval |
| B2 | Welke git-hosts eerst (GitHub, GitLab, Azure DevOps, eigen Gitea)? | Bepaalt alleen de uitleg bij tokens en later OAuth; HTTPS + token werkt overal |
| B3 | Vastleggen per beurt, of bundelen (bijv. per kwartier / bij sluiten)? | Per beurt (met 15 s rust): kleinste conflicten, duidelijkste geschiedenis |
| B4 | Rechtstreeks naar `main`, of altijd via een branch/PR? | Rechtstreeks in fase 1; "via voorstel" als modus in fase 3 |
| B5 | Vertrouwensstap: per gebruiker, of bepaalt een beheerder welke breinen vertrouwd zijn? | Per gebruiker nu; centraal beleid past later bij het Den/policy-pakket |
| B6 | Is een brein altijd een eigen project, of ook een **extra map** in andere projecten? | Eigen project eerst. Daarna interessant: één teambrein als "extra map" in meerdere projecten (P1 kent extra mappen al); dan gaat de sync per map in plaats van per workspace |

## 10. Fasering

**Fase 0 — uitzoeken (1–2 dagen)**
- `dugite` in de electron-builder-config (`apps/desktop/electron-builder.bonzaiwork.mjs`) op macOS en
  Windows; grootte en signing.
- Kan `DownstreamServerHost` sessie-activiteit leveren zonder nieuwe upstream-patch? (§3.3)
- Laadt de v2-engine nieuwe skills na een pull vanzelf, of altijd `engine/reload`?
- Hoe zetten we lokale MCP's/plugins uit een niet-vertrouwd project uit zonder upstream-patch?

**Fase 1 — MVP**
- `packages/bonzaiwork-brains`: git-runner, sync-machine (mutex, pull, commit, push met retry, offline,
  alleen-lezen), registry, routes, geheimenscan.
- Clone met HTTPS-token, vertrouwensstap, `.git/info/exclude`.
- UI: optie in "Nieuw project", statuspil, regel onder de chat, conflictkaart met "Bewaar mijn versie
  apart", instellingen-sectie. Demo-backend.
- Sjabloon-`AGENTS.md` en `git *`-deny.
- Klaar als: twee apps (twee gebruikers) op één bare repo zien elkaars kennis binnen één beurt; offline
  werken en later delen werkt; een conflict verliest niets; geen token in logs, config of DOM.

**Fase 2 — teamwerk**
- "Laat de AI het samenvoegen", geschiedenis met chat-links, periodieke fetch, routines bij het brein
  (bijwerken vóór, delen na), "Synchronisatie aanzetten" voor bestaande repo's, "Nieuw gedeeld brein".
- Een dagelijkse "Wat is er nieuw in het brein"-samenvatting als voorbeeldroutine.

**Fase 3 — gemak en beheer**
- Inloggen met de browser (OAuth), modus "via voorstel" (branch + PR), centraal beleid voor vertrouwde
  breinen, brein als extra map in meerdere projecten (B6).

## 11. Testen

- **Unit** (`packages/bonzaiwork-brains/test`): echte git op tijdelijke mappen — een bare repo als
  "server", twee clones als twee gebruikers. Scenario's: snel-vooruit, rebase, push geweigerd → opnieuw,
  conflict → abort zonder verlies, offline (remote weg) → later delen, 403 → alleen-lezen, geheim in een
  bestand → geen commit, inbox nooit mee, token nooit in `.git/config` of uitvoer.
- **Server-e2e**: uitbreiding van `packages/bonzaiwork-litellm/e2e` — clone via de route, registratie als
  workspace, chatbeurt met de stand-in LiteLLM die een bestand schrijft, daarna staat de commit op de bare
  repo.
- **UI**: headless (`seed.appWeb` / `pnpm world up dev-app-web`), demo-backend per brein-staat,
  screenshots voor de PR.
- **Verpakt**: smoketest met een `file://`-repo.
