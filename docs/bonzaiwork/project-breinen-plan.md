# Project-breinen: implementatieplan

Status: **voorstel, beslissingen B1–B6 genomen** (§9). Nog niets gebouwd.

## 1. Het idee in één alinea

Een nieuw project kan, behalve een lege map in `~/BonzaiWork/<naam>` of een bestaande map, ook een
**git-repo zijn die BonzaiWork via SSH clonet** in `~/BonzaiWork/<naam>`. Zo'n repo is een
**project-brein**: gedeelde kennis (`AGENTS.md`, `kennis/*.md`) en workflows (skills en commando's in
`.opencode/`) van een team. BonzaiWork werkt in die map zoals in elk ander project, maar **haalt vóór het
werk de nieuwste versie op** en **legt na elke beurt de wijzigingen vast en verstuurt ze**.

Daarnaast heeft elke gebruiker één **persoonlijk brein**: eigen voorkeuren, kennis en workflows die in
**elk** project meetellen. En in een chat kun je vragen om informatie uit **een ander brein** dat al op je
laptop staat ("kijk eens hoe het Sales-brein dit doet"); dat is alleen lezen.

```
~/BonzaiWork/
  Persoonlijk/          persoonlijk brein (één per gebruiker; eigen privérepo, aanbevolen)
  Klantenservice/       project-brein (gedeelde teamrepo)
  Sales/                project-brein (gedeelde teamrepo)
  Losse notities/       gewoon project (lokale map, geen brein)
```

## 2. Kernkeuze: synchronisatie is code, geen instructie

**De AI doet geen git. BonzaiWork doet het zelf, op vaste momenten, net als hooks in Claude Code.**
Instructies aan een model worden soms vergeten of half uitgevoerd (wel committen, niet pushen; pushen
midden in een beurt; een conflict "oplossen" door bestanden weg te gooien). Een vaste stap in de app
gebeurt altijd, is te testen en geeft één duidelijke status.

| Claude Code-hook | BonzaiWork-moment | Wat er gebeurt |
|---|---|---|
| `SessionStart` | Project openen, en elke 5 min zolang de app open en het project rustig is | `fetch`; staat er iets nieuws en is de map schoon, dan bijwerken |
| `UserPromptSubmit` | Vlak vóór elke beurt (chat én routine) | Projectbrein en persoonlijk brein bijwerken; de beurt wacht max. ~5 s, daarna gaat hij door met een melding |
| `Stop` | Als **alle** chats in het project weer stil zijn (met 15 s rust) | Vastleggen (`commit`) en versturen (`push`), voor het projectbrein én het persoonlijke brein als dat veranderde |
| `PreToolUse` | Engine-toestemmingen | De AI mag zelf geen `git *` uitvoeren (`deny`) |

De instructie aan de AI blijft daardoor kort en inhoudelijk (§6). Hooks die een brein zélf meebrengt
(scripts in de repo die bij elke beurt draaien) bouwen we bewust **niet**: dat is code uitvoeren uit een
gedeelde repo op ieders laptop. Het gedrag is vast; per brein kies je alleen een modus (§4.4).

## 3. Waar het in de code komt

Uitgangspunt van de fork blijft: zo min mogelijk upstream-patches (`PATCHES.md`). Dit plan voegt er
**geen** toe. Alleen ons eigen bestand `apps/server/src/downstream-hooks.ts` (staat al in PATCHES als nieuw
bestand) krijgt twee host-methodes: sessie-activiteit (§3.3) en een MCP-verbinding in de globale
engine-config (§5).

```
packages/bonzaiwork-brains/          NIEUW
  src/git.ts                         git (dugite) + systeem-ssh aanroepen, zonder prompt, met timeouts
  src/remote.ts                      repo-links herkennen en naar SSH-vorm omzetten; host-sleutels
  src/sync.ts                        per brein: wachtrij, mutex, status, pull/commit/push, conflicten
  src/registry.ts                    welke mappen een brein zijn (userData/bonzaiwork/brains.json)
  src/routes.ts                      /bonzaiwork/brains/*
  src/mcp.ts                         lokale MCP-server "breinen": persoonlijk brein + andere breinen (§5)
  src/secrets.ts                     scan op sleutels/.env vóór een commit
  test/                              lokale bare repo's: twee "gebruikers", conflicten, offline
packages/bonzaiwork-litellm/src/server-hooks.ts
                                     stelt de routes van beide pakketten samen (of verhuist naar een
                                     klein pakket bonzaiwork-server-hooks dat litellm + brains combineert)
apps/desktop/electron-builder.bonzaiwork.mjs   dugite meeleveren (eigen bestand, geen patch)
apps/bonzaiwork/src/
  backend/types.ts                   Brain-types, Capabilities.brains, Backend.brains
  backend/live/brains.ts             client voor /bonzaiwork/brains/*
  backend/demo/                      nep-breinen voor ontwerpreview (alle staten)
  features/projects/new-project-dialog.tsx   derde optie "Uit een gedeeld brein"
  features/onboarding/onboarding.tsx         stap "Je persoonlijke brein"
  features/brain/                    statuspil, conflictkaart, geschiedenis, instellingen-sectie
  copy.ts                            alle nieuwe teksten (Nederlands, DESIGN.md C1–C7)
docs/bonzaiwork/frontend-contract.md §7.5 Breinen (nieuw)
```

### 3.1 Git: meegeleverd (B1)

`dugite` (de ingebouwde git van GitHub Desktop) gaat mee in de build: werkt op macOS, Windows en Linux
zonder installatie en zonder de Xcode-popup op macOS. Kost ~30–40 MB. Altijd met
`GIT_TERMINAL_PROMPT=0`, een timeout per commando en `core.autocrlf=false`. De server leest al
`git check-ignore` (`apps/server/src/opencode-v2-instructions.ts`); dat werkt dan ook in breinen.

### 3.2 Toegang: altijd SSH, met de sleutels die er al zijn (B2)

GitHub en GitLab (ook een eigen GitLab-server). Iedereen heeft al een SSH-sleutel ingesteld, dus de app
**beheert zelf geen sleutels of tokens**:

- Git krijgt `GIT_SSH_COMMAND` naar de **SSH van het systeem** (macOS `/usr/bin/ssh`, Windows
  `%WINDIR%\System32\OpenSSH\ssh.exe`, Linux `ssh`), zodat precies dezelfde sleutels, `~/.ssh/config` en
  ssh-agent (inclusief de macOS-sleutelhanger) gebruikt worden als in de terminal. Altijd met
  `-o BatchMode=yes`: nooit een vraag waar niemand op kan antwoorden.
- **Links**: de gebruiker mag de link uit de browser plakken (`https://gitlab.com/team/brein`); de app
  maakt daar `git@gitlab.com:team/brein.git` van. Ook `git@…` en `ssh://…` werken. HTTPS-clones doen we
  niet.
- **Host-sleutels**: de gepubliceerde sleutels van `github.com` en `gitlab.com` gaan mee in de app (eigen
  `known_hosts`, naast die van de gebruiker). Een onbekende host (eigen GitLab) toont bij het toevoegen de
  vingerafdruk en vraagt één keer bevestiging; daarna staat hij in de `known_hosts` van BonzaiWork.
  Verandert een sleutel later, dan stopt de sync met een duidelijke melding (geen stilzwijgend accepteren).
- **Foutmeldingen in gewone taal**: geen toegang tot de repo ("Je account heeft geen toegang tot dit
  brein"), sleutel met wachtwoord maar niet in de agent ("Je SSH-sleutel is vergrendeld; ontgrendel hem
  in je sleutelhanger of ssh-agent"), geen sleutel gevonden, host onbereikbaar.
- Knop **"Verbinding testen"** in "Nieuw project" (`git ls-remote`), zodat problemen vóór het clonen
  zichtbaar zijn.

### 3.3 Weten wanneer een beurt klaar is (de `Stop`-hook)

1. **Server-side** (robuust, dekt ook routines en een gesloten venster): `DownstreamServerHost` krijgt
   `onSessionActivity(listener)`, gevoed door wat de server al weet
   (`apps/server/src/opencode-plugins/session-activity.ts`, de v2-status).
2. **UI-side** als eerste stap of terugval: de live backend weet al wanneer een run stopt en roept
   `POST /bonzaiwork/brains/:id/sync` aan. Routines roepen de sync-service rechtstreeks aan (hun planner
   draait in het serverproces, contract §7.4).

Bijwerken vóór de beurt gaat via de UI: `chats.send` wacht op `POST /bonzaiwork/brains/:id/pull` (max.
~5 s) voordat de prompt naar de engine gaat. Niet gekozen: een eigen OpenCode v2-plugin met
`context.session.hook("prompt", …)`; dat vraagt een patch in `managed-opencode-v2.ts`.

## 4. Gedrag in detail

### 4.1 Een project-brein toevoegen (clone)

1. **Nieuw project → Uit een gedeeld brein**: link plakken, eventueel "Verbinding testen". Naam en map
   vult de app voor (`~/BonzaiWork/<reponaam>`, via de bestaande `defaultFolder()`).
2. `POST /bonzaiwork/brains/clone` clonet (ondiep, `--depth 50`, standaardbranch) en meldt voortgang.
   Mislukt het, dan blijft er niets halfs achter.
3. **Vertrouwensstap** (§7.1): de app laat zien wat het brein meebrengt en vraagt bevestiging.
4. De UI registreert de map als workspace via de bestaande `POST /workspaces/local`
   (`ensureWorkspaceFiles` schrijft niets in de map) en daarna `PUT /bonzaiwork/brains/:workspaceId`.
5. Lokale uitsluitingen in `.git/info/exclude` (niet gedeeld): `.opencode/openwork/inbox/` (bijlagen uit
   chats, kunnen privé zijn), `.DS_Store`, `Thumbs.db`.
6. Naam en e-mail voor de geschiedenis vraagt de app één keer (app-instellingen), voorgevuld uit de
   git-config van de gebruiker.

Een **bestaand project dat al een git-repo met SSH-remote is**, krijgt in de projectinstellingen de knop
"Als brein synchroniseren".

### 4.2 Bijwerken (pull)

- `git fetch`, dan: map schoon → fast-forward. Nog niet vastgelegde wijzigingen → eerst vastleggen
  (§4.3), dan `rebase` op de remote.
- Nooit bijwerken terwijl een chat in dit project loopt. De periodieke fetch haalt dan alleen op.
- Veranderde er iets in `.opencode/` of `opencode.json`, dan daarna `POST /workspace/:id/engine/reload`
  (bestaat al), zodat nieuwe skills en commando's meteen werken. Raakte de wijziging verbindingen, plugins
  of agents, dan eerst opnieuw de vertrouwensstap.

### 4.3 Vastleggen en versturen, per beurt (B3)

- Eén wachtrij en mutex per brein; nooit twee git-acties tegelijk in dezelfde map.
- Pas als **alle** chats in het project stil zijn, plus 15 s rust (bundelt snelle vervolgvragen).
- `git add -A` (respecteert `.gitignore` en `.git/info/exclude`), geheimenscan (§7.2), dan commit:
  auteur = de gebruiker; bericht = `<chattitel>` + "Via BonzaiWork" + trailer `BonzaiWork-Chat: <id>`.
- `push`. Geweigerd omdat iemand anders eerder was → `fetch` + `rebase` + opnieuw, max. 3 keer.
- Offline of host onbereikbaar → commits blijven lokaal, status "3 wijzigingen nog niet gedeeld", opnieuw
  proberen met oplopende wachttijd en bij elk volgend moment uit §2.
- Geen schrijfrechten (`Permission denied`, `You are not allowed to push`, beschermde branch) → status
  "Alleen lezen" tot de gebruiker opnieuw probeert. In fase 3 biedt de app dan "via voorstel" aan.
- Bestanden > 10 MB: niet vastleggen, melding (git is geen opslag voor grote bestanden).

### 4.4 Modi per brein (B4)

| Modus | Bijwerken | Vastleggen en versturen | Fase |
|---|---|---|---|
| **Automatisch** (standaard) | automatisch | rechtstreeks naar de standaardbranch, na elke beurt | 1 |
| **Handmatig** | automatisch | knop "Wijzigingen delen" | 1 |
| **Alleen lezen** | automatisch | nooit | 1 |
| **Via voorstel** | automatisch | naar `bonzaiwork/<gebruiker>/<onderwerp>` + merge request (GitLab) of pull request (GitHub) | 3 |

### 4.5 Conflicten

Omdat we per beurt vastleggen, zijn conflicten klein en zeldzaam. Toch:

- `rebase --abort`; niets gaat verloren (de lokale commit blijft). Status **"Actie nodig"** met een kaart:
  welke bestanden, wie de andere wijziging deed, en:
  - **"Laat de AI het samenvoegen"** (fase 2): start een chat met een vaste opdracht (beide versies,
    "voeg samen, verlies geen informatie"); na die beurt rondt de sync de rebase af.
  - **"Bewaar mijn versie apart"** (fase 1): push naar `bonzaiwork/<gebruiker>/<datum>` en zet de map
    terug op de gedeelde versie.
- Tot het conflict is opgelost, pauzeert het bijwerken van dit brein; chatten blijft kunnen.

## 5. Persoonlijk brein en andere breinen (B6)

### 5.1 Het persoonlijke brein

- **Eén per gebruiker**, in `~/BonzaiWork/Persoonlijk`. Gemaakt in de onboarding: "Begin met een leeg
  persoonlijk brein" of "Haal je persoonlijke brein op" (clone van je eigen privérepo via SSH, voor een
  tweede laptop of na een herinstallatie).
- **Aanbevolen: een privérepo** (back-up en meerdere apparaten), met dezelfde sync als een projectbrein.
  Zonder repo blijft het lokaal (open punt N1, §9).
- Het is ook een **gewoon project** ("Mijn brein", altijd bovenaan, niet te archiveren): daar chat je om
  je eigen kennis en workflows te ordenen.
- **Telt mee in elk project**, op twee manieren:
  1. **Instructies en skills**: het `AGENTS.md` van het persoonlijke brein komt als extra instructie in
     elke chat, en zijn skills staan in elk project in de composer. Fase 0 bepaalt hoe: de engine draait
     met een eigen `OPENCODE_CONFIG_DIR` (`managed-opencode-v2.ts`), dus `~/.config/opencode` werkt niet;
     opties zijn de globale skills- en instructiepaden van die config-map vanuit de hooks laten wijzen
     naar `~/BonzaiWork/Persoonlijk`, of de MCP-route hieronder.
  2. **Schrijven vanuit elk project**: leert de AI in project X iets persoonlijks ("ik wil samenvattingen
     altijd in drie punten"), dan legt hij dat vast met het MCP-hulpmiddel `persoonlijk_brein_schrijven`.
     Dat schrijft alleen Markdown binnen `~/BonzaiWork/Persoonlijk`; de `Stop`-hook deelt het daarna.
- **Wat waar hoort**: teamkennis in het projectbrein, persoonlijke voorkeuren en eigen werkwijzen in het
  persoonlijke brein. Bij twijfel vraagt de AI het (staat in de vaste instructie, §6). Het persoonlijke
  brein schrijft nooit naar een projectbrein en omgekeerd.

### 5.2 Informatie uit andere breinen (alleen lezen)

In een chat: "haal de offerte-workflow uit het Sales-brein". Alleen breinen die al op deze laptop staan.

- De server-hooks bieden een **lokale MCP-server "breinen"** (loopback-route met een lokaal token, zoals de
  LiteLLM-proxy) en zetten die in de globale engine-config (`mcp`-sectie van de runtime-config; nieuwe
  host-methode in `downstream-hooks.ts`). Zo is hij in elk project beschikbaar zonder per-project-instelling.
- Hulpmiddelen:

  | Tool | Wat |
  |---|---|
  | `breinen_lijst` | naam, beschrijving (eerste alinea van `AGENTS.md`), laatst bijgewerkt |
  | `brein_zoeken(brein, vraag)` | zoekt in Markdown en skills van dat brein, geeft fragmenten met pad |
  | `brein_lezen(brein, pad)` | leest één bestand (alleen tekst, binnen dat brein, niet uit `.git` of de inbox) |
  | `persoonlijk_brein_lezen/zoeken/schrijven` | idem voor het persoonlijke brein, plus schrijven (§5.1) |

- Vóór lezen werkt de tool dat brein bij als het rustig is (snelle fetch, max. ~3 s), zodat je de versie
  van het team ziet.
- **Alleen lezen**: wil je iets uit brein A in brein B gebruiken, dan schrijft de AI het in het huidige
  project (met bronvermelding "uit het Sales-brein, `kennis/offertes.md`"). Het andere brein verandert
  nooit vanuit een andere chat; dat voorkomt verrassingen voor dat team.
- In de chat ziet de gebruiker de stap in woorden: "Las *Offertes* in het Sales-brein".

## 6. Wat er in een brein staat (sjabloon)

"Nieuw gedeeld brein" (fase 2) maakt de bestanden en de eerste commit in een lege repo die de gebruiker op
GitHub of GitLab aanmaakte. Bestaande repo's werken zonder sjabloon.

```
AGENTS.md                      wat dit brein is, voor wie, en "Hoe je met dit brein werkt"
kennis/                        gedeelde kennis, één onderwerp per Markdown-bestand
.opencode/skills/<naam>/SKILL.md   workflows (de app bewaart skills al op deze plek)
.opencode/commands/            vaste /commando's
opencode.json                  alleen: permission.bash "git *" → deny
.gitignore
```

De vaste instructie (in het sjabloon-`AGENTS.md` van een projectbrein):

> Dit project is een gedeeld brein van een team. BonzaiWork haalt vóór je beurt de nieuwste versie op en
> deelt je wijzigingen na je beurt; voer zelf geen git-commando's uit. Leg nieuwe of verbeterde teamkennis
> vast in `kennis/` (één onderwerp per bestand; werk bestaande bestanden bij in plaats van dubbel te maken).
> Een werkwijze die vaker terugkomt, wordt een skill in `.opencode/skills/`. Persoonlijke voorkeuren van de
> gebruiker horen in het persoonlijke brein, niet hier; vraag het bij twijfel. Andere breinen kun je
> raadplegen maar niet wijzigen. Zet nooit wachtwoorden, sleutels of persoonsgegevens in het brein.

Het persoonlijke brein krijgt een eigen variant ("dit is het persoonlijke brein van de gebruiker; alleen
voor eigen voorkeuren, kennis en werkwijzen"). De `deny` op `git *` is de `PreToolUse`-kant uit §2.

## 7. Veiligheid

### 7.1 Vertrouwen per gebruiker (B5)

Een gedeelde repo is invoer van anderen die op ieders laptop draait. Een `opencode.json` of `.opencode/`
kan lokale MCP-servers (een commando), plugins, agents met ruime rechten of commando's meebrengen.
Providers zijn al dicht (alleen LiteLLM, via `experimental.policies`), de rest niet. Daarom:

- **Vertrouwensstap** bij het toevoegen: lijst van lokale verbindingen, plugins en agents in gewone taal;
  elke gebruiker beslist zelf. Zonder akkoord laden die onderdelen niet.
- Komt er via een pull zo'n onderdeel bij of verandert het, dan opnieuw vragen vóór het laadt (diff op
  `opencode.json`, `.opencode/plugins/`, `.opencode/agents/`, `mcp`-sectie).
- De keuzes staan per gebruiker in `brains.json` (niet in de repo).

### 7.2 Geheimen

- Vóór elke commit een scan (`.env`-bestanden, bekende sleutelpatronen, waaronder de LiteLLM-keyvorm en
  private SSH-sleutels). Treffer → niet vastleggen, melding met het bestand.
- Bijlagen uit de chat-inbox gaan nooit mee.
- De app leest, kopieert of bewaart **geen** SSH-sleutels; dat blijft bij het systeem en de ssh-agent.

### 7.3 Grenzen van de breinen-MCP

Alleen tekstbestanden binnen geregistreerde breinmappen (geen symlinks naar buiten, geen `.git`, geen
inbox); schrijven alleen in het persoonlijke brein; token alleen op loopback, net als de LiteLLM-proxy.

## 8. API (wordt contract §7.5)

| Route | Auth | Doel |
|---|---|---|
| `POST /bonzaiwork/brains/check-remote` | host | `{ url }` → SSH-vorm, bereikbaar?, toegang?, onbekende host-vingerafdruk |
| `POST /bonzaiwork/brains/trust-host` | host | onbekende host-sleutel na bevestiging opslaan |
| `POST /bonzaiwork/brains/clone` | host | `{ url, folderPath }` → job; voortgang via `GET /bonzaiwork/brains/jobs/:id` |
| `GET /bonzaiwork/brains/inspect?path=` | host | wat een brein meebrengt (voor de vertrouwensstap) |
| `PUT /bonzaiwork/brains/:workspaceId` | host | registreren: soort (`project`/`personal`), modus, vertrouwde onderdelen |
| `DELETE /bonzaiwork/brains/:workspaceId` | host | synchronisatie uitzetten (map blijft) |
| `GET /bonzaiwork/brains` | client | alle breinen met status (voor de lijst en `breinen_lijst`) |
| `GET /bonzaiwork/brains/:workspaceId/status` | client | `BrainStatus` |
| `POST /bonzaiwork/brains/:workspaceId/pull` | client | bijwerken vóór een beurt |
| `POST /bonzaiwork/brains/:workspaceId/sync` | client | vastleggen + versturen |
| `GET /bonzaiwork/brains/:workspaceId/history` | client | laatste commits: wie, wat, wanneer, welke chat |
| `POST /bonzaiwork/brains/:workspaceId/resolve` | client | `{ strategy: "ai" \| "keep-mine-apart" }` |
| `* /bonzaiwork/brains/mcp` | lokaal token | de breinen-MCP (§5.2), alleen voor de engine |

```ts
type BrainKind = "project" | "personal";
type BrainState = "synced" | "syncing" | "behind" | "ahead" | "offline" | "conflict" | "read_only" | "local_only" | "error";
type BrainStatus = {
  kind: BrainKind;
  state: BrainState;            // local_only: persoonlijk brein zonder repo
  mode: "auto" | "manual" | "read_only";
  remote: string | null;        // SSH-vorm, bijv. git@gitlab.com:team/brein.git
  branch: string;
  ahead: number;
  behind: number;
  lastSyncAt: number | null;
  conflictFiles: string[];
  error: string | null;         // Nederlands; Engelse git/ssh-tekst alleen in de log
};
```

`Capabilities.brains` gaat aan als `/bonzaiwork/brains` antwoordt (zelfde probe-patroon als de routines);
zonder staat de optie zichtbaar maar vergrendeld met de reden (DESIGN.md P4).

## 9. Beslissingen

| # | Vraag | Besluit |
|---|---|---|
| B1 | Meegeleverde git of systeem-git? | **Meegeleverd** (`dugite`); SSH van het systeem |
| B2 | Welke hosts, hoe inloggen? | **GitLab en GitHub, altijd SSH** met de sleutels die collega's al hebben; geen HTTPS, geen tokens |
| B3 | Vastleggen per beurt of gebundeld? | **Per beurt** |
| B4 | Rechtstreeks of via branch/PR? | **Rechtstreeks in fase 1**, "via voorstel" als modus in fase 3 |
| B5 | Vertrouwen per gebruiker of centraal? | **Per gebruiker** |
| B6 | Brein als project of extra map? | **Een brein is altijd een eigen project, gedeeld met teamleden.** Plus één **persoonlijk brein** per gebruiker dat in elk project meetelt. Andere al-geclonede breinen zijn in een chat te raadplegen (alleen lezen) |

Nieuwe open punten:

| # | Vraag | Voorstel |
|---|---|---|
| N1 | Persoonlijk brein verplicht als privérepo, of mag het lokaal blijven? | Lokaal mag; de app raadt een privérepo aan en toont "Niet geback-upt" zolang die er niet is |
| N2 | Mag de AI uit eigen beweging in andere breinen kijken, of alleen als de gebruiker erom vraagt? | Alleen als de gebruiker erom vraagt of het brein noemt; `breinen_lijst` mag hij altijd gebruiken |
| N3 | Persoonlijke instructies: altijd volledig in elke chat, of alleen op aanvraag via de MCP? | Volledig, met een maximum (zoals de 192 KiB-grens voor projectinstructies); de rest via zoeken |

## 10. Fasering

**Fase 0: uitzoeken (2–3 dagen)**
- `dugite` in `electron-builder.bonzaiwork.mjs` op macOS en Windows; grootte en signing.
- SSH via het systeem op Windows (OpenSSH-client en ssh-agent-service) en macOS (sleutelhanger); wat
  gebeurt er bij een sleutel met wachtwoord die niet in de agent zit.
- `DownstreamServerHost`: sessie-activiteit en een MCP-entry in de globale engine-config.
- Hoe komen persoonlijke instructies en skills in elke chat (§5.1, punt 1).
- Laadt de v2-engine nieuwe skills na een pull vanzelf, of altijd `engine/reload`?
- Lokale MCP's/plugins uit een niet-vertrouwd brein uitzetten zonder upstream-patch.

**Fase 1: MVP**
- `packages/bonzaiwork-brains`: git/ssh, links omzetten, host-sleutels, sync-machine (mutex, pull, commit
  per beurt, push met retry, offline, alleen-lezen), registry, routes, geheimenscan.
- Project-brein toevoegen (verbinding testen, clone, vertrouwensstap), statuspil, regel onder de chat,
  conflictkaart met "Bewaar mijn versie apart", instellingen-sectie, demo-backend.
- Persoonlijk brein: onboardingstap, project "Mijn brein", sync, instructies/skills in elk project,
  `persoonlijk_brein_*`-tools.
- Sjabloon-`AGENTS.md` en `git *`-deny.
- Klaar als: twee apps (twee gebruikers) op één repo zien elkaars kennis na één beurt; een voorkeur die
  in project X wordt geleerd, staat in het persoonlijke brein en werkt in project Y; offline werken en
  later delen werkt; een conflict verliest niets; de app leest of bewaart geen SSH-sleutels.

**Fase 2: teamwerk**
- Andere breinen raadplegen (`breinen_lijst`, `brein_zoeken`, `brein_lezen`).
- "Laat de AI het samenvoegen", geschiedenis met chat-links, periodieke fetch, routines bij het brein,
  "Als brein synchroniseren" voor bestaande repo's, "Nieuw gedeeld brein".
- Voorbeeldroutine: dagelijks "Wat is er nieuw in mijn breinen".

**Fase 3: via voorstel**
- Modus "via voorstel": branch + merge request (GitLab) / pull request (GitHub). Ook aangeboden als een
  push op een beschermde branch faalt.

## 11. Testen

- **Unit** (`packages/bonzaiwork-brains/test`): echte git op tijdelijke mappen, een bare repo als
  "server", twee clones als twee gebruikers (via `file://`; SSH zit niet in de sync-logica). Scenario's:
  fast-forward, rebase, push geweigerd → opnieuw, conflict → niets kwijt, offline → later delen,
  `Permission denied` → alleen-lezen, geheim → geen commit, inbox nooit mee, persoonlijk brein schrijft
  nooit buiten zijn map, breinen-MCP leest niet uit `.git` of via symlinks naar buiten.
- **Links en SSH**: unit-tests voor het omzetten van links; een test tegen een lokale `sshd` (in CI een
  container) met een testsleutel in een agent: onbekende host → vingerafdruk, gewijzigde host-sleutel →
  stop, vergrendelde sleutel → juiste melding.
- **Server-e2e**: uitbreiding van `packages/bonzaiwork-litellm/e2e`: clone, registratie als workspace,
  chatbeurt met de stand-in LiteLLM die een bestand schrijft, daarna staat de commit op de bare repo; een
  tweede workspace leest dat bestand via `brein_lezen`.
- **UI**: headless (`seed.appWeb` / `pnpm world up dev-app-web`), demo-backend per brein-staat,
  screenshots voor de PR.
- **Verpakt**: smoketest met een `file://`-repo.
