# Project-breinen: implementatieplan

Status: **voorstel, alle beslissingen genomen** (B1–B6, N1–N6, I1–I3; §9). **Fase 0 gedaan**: bevindingen in
[`project-breinen-fase0.md`](./project-breinen-fase0.md) en hieronder verwerkt. **Fase 1 gebouwd** (§10):
`packages/bonzaiwork-brains`, de UI in `apps/bonzaiwork`, meegeleverde git en
[`brein-beheer.md`](./brein-beheer.md); de handmatige tests op macOS en Windows (fase 0 §8) staan nog open.

## 1. Het idee in één alinea

Een nieuw project kan, behalve een lege map in `~/BonzaiWork/<naam>` of een bestaande map, ook een
**git-repo zijn die BonzaiWork via SSH clonet** in `~/BonzaiWork/<naam>`. Zo'n repo is een
**project-brein**: de gedeelde kennis en werkwijzen van een team (§6). Wat het team **weet**, staat als
bundel in Google's **Open Knowledge Format (OKF)** in `knowledge/`; wat het team **doet**, staat als
werkwijzen volgens de **Interpretable Context Methodology (ICM)** in `workflows/`, met `AGENTS.md` als
ingang die naar allebei routeert. BonzaiWork werkt in die map zoals in elk ander project, maar **haalt vóór het
werk de nieuwste versie op** en **legt na elke beurt de wijzigingen vast en verstuurt ze**.

Daarnaast heeft elke gebruiker één **persoonlijk brein**: eigen voorkeuren, kennis en workflows die in
**elk** project meetellen. En in een chat kun je vragen om informatie uit **een ander brein** dat al op je
laptop staat ("kijk eens hoe het Sales-brein dit doet"); dat is alleen lezen.

```
~/BonzaiWork/
  Persoonlijk/          persoonlijk brein (één per gebruiker; lokaal, privérepo optioneel)
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
| `PreToolUse` | Engine-policies, **globaal** gezet door de hooks (niet in de repo) | De AI mag zelf geen git uitvoeren en niet in `.git/**` schrijven (`tool.use` → deny; een brein kan dat niet opheffen). Best effort: zie §7.4 |

De instructie aan de AI blijft daardoor kort en inhoudelijk (§6). Hooks die een brein zélf meebrengt
(scripts in de repo die bij elke beurt draaien) bouwen we bewust **niet**: dat is code uitvoeren uit een
gedeelde repo op ieders laptop. Het gedrag is vast; per brein kies je alleen een modus (§4.4).

## 3. Waar het in de code komt

Uitgangspunt van de fork blijft: zo min mogelijk upstream-patches (`PATCHES.md`). **Doel: 0 nieuwe
patches; fase 0 heeft beslist** (gemeten op de echte engine, [fase 0](./project-breinen-fase0.md)). Wat in
ons eigen bestand `apps/server/src/downstream-hooks.ts` past (staat al in PATCHES als nieuw bestand):

| Nodig | Zonder patch? | Hoe |
|---|---|---|
| Sessie-activiteit (§3.3) | **ja** | `/api/event` per map via `engine.connection()`: `session.execution.*` met `sessionID` |
| MCP-entry "breinen" in de globale engine-config (§5.2) | **ja** | `mcp` in de globale runtime-config (`writeGlobalRuntimeOpencodeConfig`), zoals `updateEngineProviders`; met `codemode: false` |
| Persoonlijke instructies en app-regels in elke beurt (§5.1, §6.6) | **ja, anders dan gedacht** | `<OPENCODE_CONFIG_DIR>/AGENTS.md`: de engine laadt hem zelf in elke chat, ook in sub-taken. Een eigen instructie-entry werkt ook, maar sub-taken erven hem niet |
| Persoonlijke skills in elk project (§5.1) | **ja** | junction `<OPENCODE_CONFIG_DIR>/skills` → skills van het persoonlijke brein |
| Globale `git`-deny en `.git/**`-deny (§7.4) | **ja** | `experimental.policies` `tool.use` (`shell:git *`, `edit:.git/*`): `downstreamEnginePolicies()` wordt bij elke config-schrijf opnieuw gelezen; het bestaande `reloadEngineProviders()` veroorzaakt die schrijf |
| `allow` per breinen-MCP-tool (§5.2) | **ja** | MCP-tools zonder regel draaien zonder te vragen |
| `ask` per breinen-MCP-tool (§5.2) | **nee** | policies kennen alleen allow/deny. **Eén regel** in de bestaande hook van `managed-opencode-v2.ts` (`...downstreamEnginePermissions()`); geen nieuwe PATCHES-rij |
| `deny` per pad: uitgesloten mappen, `_meta/voorkeuren.md` (§5.1.1, §7.3) | **ja, met grenzen** | `tool.use` `read:<pad>` / `edit:<pad>`. Paden zijn relatief aan de map en de regel geldt in alle projecten; `grep` en `shell` gaan erlangs |
| Niet-vertrouwde onderdelen uit een brein uitzetten (§7.1) | **ja, zonder patch** | MCP's en skills: `integration.use` → deny. Plugins, agents en commando's met shell: geen policy; die houdt `git sparse-checkout` buiten de map tot de gebruiker vertrouwt |

Uitkomst: geen nieuw gepatcht bestand. De hook in `managed-opencode-v2.ts` wordt "2 regels + import"
(PATCHES-rij bijwerken als we hem bouwen). B5 blijft overeind (§7.1).

```
packages/bonzaiwork-brains/          NIEUW
  src/git.ts                         git (dugite) + systeem-ssh aanroepen, zonder prompt, met timeouts
  src/remote.ts                      repo-links herkennen en naar SSH-vorm omzetten; host-sleutels
  src/sync.ts                        per brein: wachtrij, mutex, status, pull/commit/push, conflicten
  src/okf.ts                         OKF vóór elke commit: conformiteit, generated, index.md, log.md, references/ bewaken
  src/icm.ts                         ICM: werkwijzen vinden, contracten lezen, invoer controleren, status van schijf, controles
  templates/                         AGENTS.md, _meta/schema.md, _templates/ (team en persoonlijk), skills en commando's (§6)
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
zonder installatie en zonder de Xcode-popup op macOS. Volledig is hij 107–152 MB; **uitgedund** (zonder Git
Credential Manager, LFS en dergelijke) macOS 16 MB, Linux 19 MB, Windows 57 MB, als `extraResources` per
platform zoals de engine-binaries ([fase 0 §1](./project-breinen-fase0.md#1-git-meeleveren-b1)). Altijd
geïsoleerd: een opgebouwde omgeving (geen `GIT_*` van de gebruiker), `GIT_TERMINAL_PROMPT=0`,
`GIT_CONFIG_NOSYSTEM=1` (dugite's eigen systeemconfig op Windows zet o.a. `autocrlf=true` en een verplicht
LFS-filter), een eigen `GIT_CONFIG_GLOBAL`, de `-c`-opties van §7.4 en een timeout per commando. De server
roept voor `git check-ignore` (`apps/server/src/opencode-v2-instructions.ts`) de git van het `PATH` aan,
niet dugite; zie fase 0 §1.4.

### 3.2 Toegang: altijd SSH, met de sleutels die er al zijn (B2)

GitHub en GitLab (ook een eigen GitLab-server). Iedereen heeft al een SSH-sleutel ingesteld, dus de app
**beheert zelf geen sleutels of tokens**:

- Git krijgt `GIT_SSH_COMMAND` naar de **SSH van het systeem** (macOS `/usr/bin/ssh`, Windows
  `%WINDIR%\System32\OpenSSH\ssh.exe`, Linux `ssh`), zodat precies dezelfde sleutels, `~/.ssh/config` en
  ssh-agent (inclusief de macOS-sleutelhanger) gebruikt worden als in de terminal. Altijd met
  `-o BatchMode=yes`: nooit een vraag waar niemand op kan antwoorden. Op Windows extra belangrijk: dugite
  brengt een eigen MSYS-ssh mee die de agent-service van Windows niet ziet; die gaat uit de bundel.
- **Alleen SSH, in alle fases**: clone, fetch en push gaan altijd via SSH met de sleutels die al op de
  laptop staan. Geen HTTPS, geen toegangstokens, geen inloggen via de browser; de app vraagt en bewaart
  nooit een wachtwoord of token voor git.
- **Links**: de gebruiker mag de link uit de browser plakken (`https://gitlab.com/team/brein`); de app
  zet die alleen om naar `git@gitlab.com:team/brein.git` en maakt nooit een HTTPS-verbinding. Ook `git@…`
  en `ssh://…` werken.
- **Host-sleutels**: de gepubliceerde sleutels van `github.com` en `gitlab.com` gaan mee in de app (eigen
  `known_hosts`, naast die van de gebruiker). Een onbekende host (eigen GitLab) toont bij het toevoegen de
  vingerafdruk en vraagt één keer bevestiging; daarna staat hij in de `known_hosts` van BonzaiWork.
  Verandert een sleutel later, dan stopt de sync met een duidelijke melding (geen stilzwijgend accepteren).
- **Foutmeldingen in gewone taal**: geen toegang tot de repo ("Je account heeft geen toegang tot dit
  brein"), sleutel met wachtwoord maar niet in de agent ("Je SSH-sleutel is vergrendeld; ontgrendel hem
  in je sleutelhanger of ssh-agent"), geen sleutel gevonden, host onbereikbaar. Patronen per geval in
  [fase 0 §2.1](./project-breinen-fase0.md#21-wat-git-en-ssh-melden). Een vergrendelde sleutel geeft
  dezelfde fout als "geen toegang"; alleen `ssh -v` (in "Verbinding testen") laat het verschil zien.
- Knop **"Verbinding testen"** in "Nieuw project" (`git ls-remote`), zodat problemen vóór het clonen
  zichtbaar zijn.

### 3.3 Weten wanneer een beurt klaar is (de `Stop`-hook)

**Server-side** (dekt ook routines, sub-taken en een gesloten venster): `DownstreamServerHost` krijgt
`onSessionActivity(listener)` en `runningSessions(workspaceId)`. De eerste volgt per lokale workspace
`/api/event` van de engine, die per beurt `session.execution.started` en daarna `.succeeded`, `.failed` of
`.interrupted` stuurt, met `sessionID` ([fase 0 §3](./project-breinen-fase0.md#3-weten-wanneer-een-beurt-klaar-is-stop-hook)).
Een UI-terugval is daardoor niet nodig. `POST /bonzaiwork/brains/:id/sync` blijft voor de knop
"Wijzigingen delen" (modus handmatig).

Bijwerken vóór de beurt gaat via de UI: `chats.send` wacht op `POST /bonzaiwork/brains/:id/pull` (max.
~5 s) voordat de prompt naar de engine gaat. Niet gekozen: een eigen OpenCode v2-plugin met
`context.session.hook("prompt", …)`; dat vraagt een patch in `managed-opencode-v2.ts`.

## 4. Gedrag in detail

### 4.1 Een project-brein toevoegen (clone)

1. **Nieuw project → Uit een gedeeld brein**: link plakken, eventueel "Verbinding testen". Naam en map
   vult de app voor (`~/BonzaiWork/<reponaam>`, via de bestaande `defaultFolder()`).
2. `POST /bonzaiwork/brains/clone` clonet de standaardbranch **volledig** (geen `--depth`) en meldt
   voortgang. Een ondiepe clone wint niets bij een repo van Markdown, en geeft problemen bij rebasen, bij
   de voorouder-controle van §7.4 en in de geschiedenis. Is de repo groter dan ~500 MB, dan waarschuwt de
   app vóór het clonen. Mislukt het, dan blijft er niets halfs achter.
3. **Vertrouwensstap** (§7.1): de app laat zien wat het brein meebrengt en vraagt bevestiging. Daarom
   clonet stap 2 met `--no-checkout`; de riskante paden gaan op de sparse-checkout-lijst, en pas dan volgt
   de checkout.
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
- Geen `engine/reload` nodig: de engine pikt nieuwe skills, commando's, `AGENTS.md` en zelfs MCP's uit
  `opencode.json` zelf op (fase 0 §6.1). Daarom kijkt de sync **vóór** het bijwerken (`git diff --name-only
  HEAD FETCH_HEAD`) of verbindingen, plugins, agents of commando's met shell veranderen; zo ja, dan gaan
  die eerst op de sparse-checkout-lijst en vraagt de app opnieuw (§7.1).

### 4.3 Vastleggen en versturen, per beurt (B3)

- Eén wachtrij en mutex per brein; nooit twee git-acties tegelijk in dezelfde map.
- Pas als **alle** chats in het project stil zijn, plus 15 s rust (bundelt snelle vervolgvragen).
- **Wat er meegaat** (N5): nieuwe en gewijzigde `.md`-bestanden (`git add -- '*.md'`), plus wijzigingen
  en verwijderingen van bestanden die al gedeeld waren (`git add -u`, zodat bijv. een script in een skill
  bijgewerkt kan worden). Een **nieuw** bestand dat geen Markdown is (een pptx die de AI maakte, een
  afbeelding) gaat niet vanzelf mee: de statuspil zegt "2 bestanden niet gedeeld (geen Markdown)" met
  "Toch delen". Alles respecteert `.gitignore` en `.git/info/exclude`. Dan de geheimenscan (§7.2).
- **Twee commits als het moet**: wijzigingen van de AI in deze beurt (§6.5, "wie schreef wat") en
  wijzigingen van de gebruiker zelf (bijv. in Obsidian tussen twee beurten) gaan in aparte commits. Auteur
  is beide keren de gebruiker; alleen de AI-commit krijgt het bericht `<chattitel>` + "Via BonzaiWork" +
  trailer `BonzaiWork-Chat: <id>`.
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
    terug op de gedeelde versie. Eerst wordt vastgelegd wat nog open stond; wat dan nog niet vast te
    leggen was (een geblokkeerd bestand, een niet-Markdown-bestand), gaat als kopie naar
    `_bewaard/<datum>/`, dat nooit gedeeld wordt (review #5).
- Tot het conflict is opgelost, pauzeert het bijwerken van dit brein; chatten blijft kunnen.
- De bestanden die iedereen raakt, geven nooit een conflict voor de gebruiker: een `index.md` maakt de
  sync opnieuw, `log.md` voegt hij per datum samen (§6.5).

## 5. Persoonlijk brein en andere breinen (B6)

### 5.1 Het persoonlijke brein

- **Eén per gebruiker.** De onboarding vraagt "Heb je al een eigen notitiemap of second brain?" (N1):
  - **Ja → kies die map.** BonzaiWork gebruikt de map **waar hij staat** (Obsidian-vault, Logseq-graph,
    gewone Markdown-map, ook in iCloud/OneDrive/Dropbox). Niets wordt gekopieerd of verplaatst. Zie
    §5.1.1.
  - **Nee → nieuw.** BonzaiWork maakt `~/BonzaiWork/Persoonlijk` aan als **lokale map**; geen git nodig en
    geen waarschuwing over back-ups.
  - **Haal op uit een repo** (tweede laptop, of een privérepo die al bestaat): clone via SSH.
  - Later wisselen kan in de instellingen van "Mijn brein"; de oude map blijft dan gewoon staan.
- **Altijd geschiedenis, synchroniseren is optioneel**: is het persoonlijke brein nog geen git-repo, dan
  houdt BonzaiWork een git-geschiedenis **zonder origin** bij, met de git-map in de app-gegevens
  (§5.1.1, "Vangnet").
  De status is dan "Alleen op deze laptop". Later koppelen aan een eigen privérepo via SSH is dan alleen
  een origin toevoegen en de bestaande geschiedenis versturen; daarna dezelfde sync als een projectbrein.
- Het is ook een **gewoon project** ("Mijn brein", altijd bovenaan, niet te archiveren): daar chat je om
  je eigen kennis en workflows te ordenen.
- **Telt mee in elk project**, op twee manieren:
  1. **Instructies**: `AGENTS.md` + `_meta/voorkeuren.md` van het persoonlijke brein (§6.7) komen **volledig** als extra instructie in
     elke chat (N3), tot een eigen grens (N6). **Niet via de bestaande route**: `readConfiguredInstructions`
     (`opencode-v2-instructions.ts`) laadt alleen bestanden binnen de workspace (`../` en paden buiten de
     `insideRoot`-check slaat hij over), en zijn 192 KiB is één budget voor álle geconfigureerde
     instructies samen, waarbij een te groot bestand stil wordt overgeslagen. Daarom (fase 0 §5) via de
     **config-map van de engine**: die draait met een eigen `OPENCODE_CONFIG_DIR`
     (`managed-opencode-v2.ts`) en laadt `<OPENCODE_CONFIG_DIR>/AGENTS.md` zelf als globale instructie,
     in elke chat van elk project, **ook in sub-taken**, bij commando's en bij routines. De hooks schrijven
     daar één bestand: de app-regels (§6.6) plus `AGENTS.md` + `_meta/voorkeuren.md` van het persoonlijke
     brein (host-methode `setEngineGlobalContext`).
     - **Wanneer**: bij elke wijziging van die twee bestanden (na een pull, of als de gebruiker ze in
       Obsidian bewerkt), en bij het starten. De `pull`-route die de UI vóór elke `chats.send` afwacht,
       werkt eerst het persoonlijke brein bij (max. ~5 s) en schrijft daarna het bestand, **ook als
       bijwerken mislukte**, met de lokale versie. Veranderde het, dan wacht de route ~0,5 s: de engine
       ziet een nieuw bestand via zijn file-watcher (gemeten: vanaf ~100 ms altijd).
     - **Kopie, geen symlink**: een bestandssymlink vraagt op Windows beheerdersrechten.
     - Een eigen instructie-entry per sessie (`PUT …/instructions/entries/bonzaiwork.personal`) werkt ook,
       bij prompts en commando's, maar **sub-taken erven hem niet** (gemeten); daarom niet gekozen.
     - Boven de grens van N6 laat de app een waarschuwing zien in "Mijn brein" en stuurt hij het bestand
       ingekort mee, nooit stil niets.
     **Skills**: `~/.config/opencode` werkt niet (eigen config-map), maar `<OPENCODE_CONFIG_DIR>/skills/`
     wel, in elk project en live. De hooks zetten daar een **junction** (Windows, zonder rechten) of
     symlink naar de skills-map van het persoonlijke brein.
  2. **Schrijven vanuit elk project**: leert de AI in project X iets persoonlijks ("ik wil samenvattingen
     altijd in drie punten"), dan legt hij dat vast met `persoonlijk_brein_schrijven` (nieuwe notitie) of
     `persoonlijk_brein_bewerken` (bestaande notitie). Dat kan overal in het persoonlijke brein, behalve
     in uitgesloten mappen (N4), en alleen in `.md`-bestanden (N5). Elke wijziging komt in de
     geschiedenis en is terug te draaien (§5.1.1); de `Stop`-hook deelt hem daarna als er een repo aan hangt.
- **Wat waar hoort**: teamkennis in het projectbrein, persoonlijke voorkeuren en eigen werkwijzen in het
  persoonlijke brein. Bij twijfel vraagt de AI het (staat in de app-regels, §6.6). Het persoonlijke
  brein schrijft nooit naar een projectbrein en omgekeerd.

#### 5.1.1 Een bestaand second brain kiezen

Waarom kiezen in plaats van kopiëren: een kopie geeft twee versies die uit elkaar lopen, en verplaatsen
breekt wat de collega al heeft (Obsidian, de sync via iCloud of Obsidian Sync, plugins). Met kiezen blijft
hun eigen werkwijze werken en ziet BonzaiWork altijd de actuele notities. Het doel is dat iedereen naar
BonzaiWork migreert: tijdens de overgang kan Obsidian ernaast blijven draaien, en BonzaiWork wordt
geleidelijk het hoofdgereedschap voor dezelfde map.

- **Breinstructuur erbij**: de app voegt in de gekozen map `AGENTS.md`, `_meta/` (met `voorkeuren.md`; die
  twee gaan volledig in elke chat, N3), `knowledge/` en de skills toe (§6.7). In Obsidian zijn dat gewone
  notities, dus de collega kan ze lezen en bijwerken. Bestond er al een `AGENTS.md`, dan vult de app die
  aan in plaats van hem te vervangen.
- **De AI mag in de hele map schrijven (N4)**: nieuwe notities aanmaken en bestaande bijwerken, vanuit
  elk project, zonder per wijziging toestemming te vragen. Nieuwe kennis komt als concept in `knowledge/`
  (§6); bestaande notities werkt hij bij waar ze staan. Bewerken gaat per passage (oude tekst → nieuwe tekst), nooit door een
  hele notitie te overschrijven.
- **Vangnet: geschiedenis van elke wijziging.** Omdat de AI vrij mag schrijven, moet elke wijziging terug
  te halen zijn. Bij elke `Stop`-hook legt BonzaiWork de `.md`-wijzigingen vast in git, met de chat erbij.
  In "Mijn brein → Geschiedenis": wat is er veranderd, vanuit welke chat, en **"Zet deze notitie terug"**
  of **"Draai deze beurt terug"**. Waar de git-map staat, hangt af van de map:

  | Persoonlijk brein | Git-map |
  |---|---|
  | Al een git-repo die BonzaiWork mag synchroniseren | die repo (de geschiedenis is er al) |
  | **Alle andere gevallen**: een lokale map (ook de nieuwe `~/BonzaiWork/Persoonlijk`), een map in iCloud, OneDrive, Dropbox, Google Drive of een andere sync, of een repo die iets anders synchroniseert (Obsidian Git) | **altijd buiten de map**: `userData/bonzaiwork/history/<id>.git` met de vault als werkmap (`GIT_DIR`/`GIT_WORK_TREE`; er komt geen `.git` in de vault) |

  Waarom altijd buiten de map, en niet `git init` erin: een `.git` die door cloud-sync gaat, raakt
  beschadigd (half gesynchroniseerde objecten, `index.lock`, "conflict"-kopieën), en cloudmappen op hun
  pad herkennen is te broos (eigen Dropbox-locaties, Nextcloud, Synology Drive, netwerkschijven). Eén regel
  zonder herkenning is veiliger. Wat we inleveren: de geschiedenis verhuist niet vanzelf mee met de map.
  Een privérepo koppelen blijft eenvoudig (origin toevoegen aan dezelfde git-map en versturen), en daarna
  staat de geschiedenis ook op de host. De git-map bevat alleen `.md`-bestanden (N5), zodat bijlagen hem
  niet groot maken. Er gaat niets naar buiten zolang er geen origin is.
- **Niet tegelijk met de gebruiker schrijven**: `persoonlijk_brein_bewerken` geeft de versie mee die de AI
  las; is de notitie intussen veranderd (de collega typt in Obsidian, de cloud-sync haalde iets binnen),
  dan weigert de tool en leest de AI opnieuw. Zo overschrijft de AI nooit werk van de gebruiker.
- **Niet verwijderen of hernoemen in fase 1**: hernoemen breekt links (in `knowledge/` is het pad
  bovendien de identiteit van een concept; Obsidian werkt links in notities bij, wij nog niet). Opruimen stelt de AI voor; de gebruiker doet het. Hernoemen met bijwerken van links
  komt in fase 2.
- **Alleen de instructies gaan altijd mee**, niet de hele map. Een vault met duizenden notities komt dus
  niet in elke chat; de AI zoekt erin als dat helpt. Dat houdt N3 werkbaar.
- **Alleen Markdown (N5)**: de AI ziet, zoekt en schrijft alleen `.md`-bestanden. Afbeeldingen, pdf's en
  andere bijlagen in de vault blijven onzichtbaar en onaangeroerd.
- **Mappen uitsluiten**: bij het kiezen (en later in de instellingen) vinkt de gebruiker mappen uit die de
  AI nooit mag lezen of wijzigen, bijvoorbeeld `Dagboek/` of `Gezondheid/`. Altijd uit: `.obsidian/`,
  `.trash/`, `.logseq/`, `.git/`. **Let op**: de breinen-MCP houdt zich hieraan, maar in het project
  "Mijn brein" werkt de AI met de gewone engine-tools (lezen, zoeken, bewerken, bash) en die kennen deze
  lijst niet. Fase 0 (§3): engine-policies `read:<map>/*` en `edit:<map>/*` → deny houden de lees- en
  bewerktools tegen, zonder patch. Twee grenzen: het pad is relatief aan de map en de regel geldt in
  **alle** projecten (een map `Dagboek/` in een ander project is dan ook dicht), en `grep` en bash gaan
  erlangs (gemeten). De app zegt daarom eerlijk: "De AI opent deze mappen niet, maar kan er wel in
  zoeken." Voor echt gevoelige mappen blijft het advies ze buiten de vault te zetten.
- **Bestaande sync blijft van de gebruiker**: staat de map in iCloud, OneDrive, Dropbox of gebruikt hij
  Obsidian Sync, dan synchroniseert BonzaiWork niet via git en raakt die sync niet aan (de geschiedenis
  staat buiten de map, zie "Vangnet"). Is de map al een git-repo (bijv.
  de Obsidian Git-plugin), dan vraagt de app: "Synchroniseert iets anders deze map al?" Ja → BonzaiWork
  blijft van git af (twee programma's die allebei committen geven conflicten). Nee → BonzaiWork mag de
  sync doen zoals bij een projectbrein.
- **Cloudmappen**: bestanden die alleen online staan (iCloud "Optimaliseer opslag", OneDrive "Bestanden op
  aanvraag") slaat zoeken over in plaats van ze te downloaden; `AGENTS.md` en `knowledge/index.md` laat de app lokaal houden
  waar het systeem dat toestaat. Een notitie bewerken die alleen online staat, doet de tool pas als het
  systeem hem heeft opgehaald. Fase 0 test dit op macOS en Windows.
- **Obsidian-gewoonten**: in bestaande notities laat de AI `[[wikilinks]]`, tags en frontmatter heel. In
  `knowledge/` gebruikt hij OKF: relatieve Markdown-links, die Obsidian ook volgt en in de graph toont.
- **Project "Mijn brein"** wijst naar de gekozen map. Bijlagen uit chats komen daar in
  `.opencode/openwork/inbox/`; Obsidian en Logseq tonen mappen met een punt niet.

### 5.2 Informatie uit andere breinen (alleen lezen)

In een chat: "haal de offerte-workflow uit het Sales-brein". Alleen breinen die al op deze laptop staan.

- De server-hooks bieden een **lokale MCP-server "breinen"** (loopback-route met een lokaal token, zoals de
  LiteLLM-proxy) en zetten die in de globale engine-config (`mcp`-sectie van de globale runtime-config, met
  `codemode: false`; host-methode `updateEngineMcp` in `downstream-hooks.ts`). Zo is hij in elk project
  beschikbaar zonder per-project-instelling.
- Hulpmiddelen:

  | Tool | Wat |
  |---|---|
  | `breinen_lijst` | naam, beschrijving (eerste alinea van `AGENTS.md`), laatst bijgewerkt |
  | `brein_zoeken(brein, vraag)` | volgt de `index.md`'s van de OKF-bundel van dat brein (root → map → concept), valt terug op tekstzoeken; geeft fragmenten met pad |
  | `brein_lezen(brein, pad)` | leest één `.md`-bestand binnen dat brein (niet uit `.git` of de inbox) |
  | `persoonlijk_brein_lezen/zoeken` | idem voor het persoonlijke brein, zonder uitgesloten mappen |
  | `persoonlijk_brein_schrijven/bewerken` | nieuwe notitie / passage vervangen, met versiecontrole (§5.1.1) |

  Alle breinen-tools werken alleen met `.md`-bestanden (N5).

- Vóór lezen werkt de tool dat brein bij als het rustig is (snelle fetch, max. ~3 s), zodat je de versie
  van het team ziet.
- **Alleen lezen**: wil je iets uit brein A in brein B gebruiken, dan schrijft de AI het in het huidige
  project (met bronvermelding "uit het Sales-brein, `knowledge/offertes/offerteproces.md`"). Het andere brein verandert
  nooit vanuit een andere chat; dat voorkomt verrassingen voor dat team.
- In de chat ziet de gebruiker de stap in woorden: "Las *Offertes* in het Sales-brein".
- **Alleen op verzoek, of na een voorstel (N2).** De AI kijkt in een ander brein als de gebruiker erom
  vraagt. Denkt de AI dat een ander brein helpt, dan stelt hij dat in één zin voor ("Het Sales-brein heeft
  een offerte-workflow; zal ik daar kijken?") en wacht op antwoord. `breinen_lijst` mag hij altijd
  gebruiken, anders weet hij niet wat hij kan voorstellen. Afgedwongen, niet alleen gevraagd:
  - `brein_zoeken` en `brein_lezen` staan in de engine-toestemmingen op **ask** (acties
    `breinen_brein_zoeken`/`breinen_brein_lezen`; vraagt de ene regel in `managed-opencode-v2.ts`, §3).
    Een eigen voorstel van de AI wordt zo de bekende toestemmingskaart "Mag BonzaiWork in het Sales-brein
    kijken?" (Toestaan / Altijd in dit gesprek / Weigeren). De engine geeft als resource altijd `*`, niet
    het brein: de UI leest het brein uit de tool-call en onthoudt "Altijd in dit gesprek" zelf per brein
    (fase 0 §4.3).
  - Vroeg de gebruiker er zelf om, dan hoeft die niet nog eens te klikken: noemt het laatste bericht van
    de gebruiker dat brein (naam of map), dan keurt de UI de kaart automatisch één keer goed.
  - Het persoonlijke brein valt hierbuiten: dat hoort bij de gebruiker en de `persoonlijk_brein_*`-tools
    staan op **allow**, met één uitzondering: schrijven naar `AGENTS.md` en `_meta/voorkeuren.md` (§7.3).
- **De MCP is de enige route, ook voor de gewone tools.** Zonder regel leest én schrijft de AI met `read`,
  `write` en `edit` in elke map buiten het project, zonder te vragen (fase 0 §6.6). Dan gelden de grenzen
  van de MCP niet, en kan een chat in project X stil iets in het Sales-brein zetten dat de sync van Sales
  daarna deelt. Daarom zetten de hooks voor elke geregistreerde breinmap, het persoonlijke brein en
  `<OPENCODE_CONFIG_DIR>` globale policies `read:<map>/*` en `edit:<map>/*` → deny, met het **absolute**
  pad. Binnen de map van een chat is de resource relatief, dus de chats ín dat brein werken gewoon; vanuit
  elke andere map blokkeert de regel, ook als de AI er relatief heen gaat (gemeten). De hooks werken de
  lijst bij als er een brein bij komt of weggaat (policies gelden live). Vangrail, geen slot: `grep` met
  het pad van een ander brein en `shell` gaan erlangs.
- **Niet via "Extra mappen".** Projectinstellingen → Toestemmingen heeft een lijst "Extra mappen", maar die
  regelt geen breintoegang: de server bewaart hem als `permission.external_directory` in de **globale**
  config (dus voor alle projecten, niet per project), de v2-engine krijgt die sleutel niet, en het is
  alleen "allow" voor lezen, schrijven en shell tegelijk. Op v2 is de lijst vergrendeld met de reden
  (§8.2). Een vaste keuze per brein ("dit brein mag altijd in dit gesprek") onthoudt de UI zelf (fase 0
  §4.3); een vaste keuze per project komt in `brains.json` en staat onder Projectinstellingen → Brein.

## 6. Wat er in een brein staat: kennis in OKF, acties in ICM

Een brein gebruikt twee open standaarden, elk voor één ding:

| | Standaard | Wat het beschrijft | Waar |
|---|---|---|---|
| **Weten** | **Open Knowledge Format (OKF) v0.2** van Google Cloud ([spec](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)) | wat het team weet: concepten met type, herkomst, vertrouwen en houdbaarheid | `knowledge/` |
| **Doen** | **Interpretable Context Methodology (ICM)** van Van Clief & McDermott ([paper](https://arxiv.org/abs/2603.16021), [repo](https://github.com/RinDig/Interpretable-Context-Methodology), [icm-architect](https://github.com/RinDig/icm-architect), MIT) | hoe het team werkt: werkwijzen als genummerde stappen, elk met een contract (wat lezen, wat doen, wat schrijven, hoe controleren) | `workflows/` en de routering in `AGENTS.md` |

Ze passen op elkaar: allebei gewone Markdown met YAML-frontmatter, relatieve links en "het bestand is de
toestand". `icm-architect` levert zelf een OKF-viewer mee, en zijn indexscript slaat OKF's gereserveerde
`index.md` en `log.md` al over. De taakverdeling volgt uit ICM: de kennis in `knowledge/` is de
**fabriek** (ICM-laag 3, stabiel over runs heen), de werkwijzen in `workflows/` zijn de **contracten**
(laag 1–2), en wat een run oplevert is het **product** (laag 4).

Waarom ICM voor de acties: een agent (in een chat of een routine) weet dan bij elke stap precies wat hij
moet lezen en wat niet, wat hij oplevert, en waar hij stopt voor een controle. Dat is afleesbaar en
aanpasbaar door het team zelf, zonder code, en BonzaiWork kan het afdwingen omdat de contracten exacte
paden noemen (§6.5).

### 6.1 Structuur

```
AGENTS.md                 ICM-ingang (laag 0): wat dit brein is en waar alles staat; alleen routering
_meta/
  schema.md               de OKF-typen van dit brein en de schrijfafspraken (één plek)
_templates/               stage-CONTEXT.md, workflow-CONTEXT.md, concept.md: nieuw werk is een kopie
knowledge/                OKF-bundel: wat we weten (de fabriek voor elke werkwijze)
  index.md                root-index; frontmatter alleen okf_version: "0.2"
  log.md                  updategeschiedenis, nieuwste eerst
  references/             bronnen (OKF-conventie); onveranderlijk
  offertes/
    index.md
    offerteproces.md      concept: wie wat doet en wie goedkeurt
    kortingsbeleid.md
workflows/                ICM-werkwijzen: wat we doen
  offerte-maken/
    CONTEXT.md            laag 1: de werkwijze in één scherm (stappen en hun taak)
    01_intake/
      CONTEXT.md          laag 2: stapcontract
      output/             wat deze stap oplevert (per run; niet gedeeld, I1)
    02_opzet/
      CONTEXT.md
      references/         alleen wat specifiek is voor deze stap; algemene kennis staat in knowledge/
      output/
    03_controle/
      CONTEXT.md
      output/
.opencode/skills/         okf-ingest, okf-query, okf-lint, icm-architect, plus bekwaamheden (bijv. pptx)
.opencode/commands/       /verwerk, /vastleggen, /onderhoud, /werkwijze
```

Keuzes waar de standaarden ruimte laten (en §6.9 voor waar we bewust afwijken):

- **De OKF-bundel staat in `knowledge/`.** OKF eist dat élk `.md`-bestand in de bundel een `type` heeft;
  `AGENTS.md`, de `CONTEXT.md`'s en de skills hebben dat niet. Buiten de bundel blijft die conform; de spec
  staat een bundel als submap uitdrukkelijk toe.
- **Links en invoerpaden zijn relatief** en moeten bestaan (ICM-invariant 8; OKF staat relatief toe).
  Absolute paden zouden breken op GitHub/GitLab en in Obsidian. Geen `[[wikilinks]]`.
- **Verwijzingen gaan één kant op** (ICM): werkwijzen verwijzen naar kennis, kennis nooit naar
  werkwijzen. `AGENTS.md` routeert naar allebei.

### 6.2 Kennis: een OKF-concept

```markdown
---
type: Process
title: Offerteproces
description: Wie een offerte opstelt, wie hem goedkeurt en wanneer.
tags: [offertes, sales]
sources:
  - id: kickoff
    resource: ../references/2026-10-30-kickoff-notulen.md
    title: Kickoff-notulen
generated:
  by: bonzaiwork/0.3.0
  at: 2026-10-30T10:12:00+01:00
verified:
  - by: human:j.jansen
    at: 2026-10-30T11:02:00+01:00
status: stable
---
# Offerteproces

Sales stelt de offerte op in het offertesjabloon.[^kickoff] Boven de kortingsgrens keurt de teamleider
goed; zie [kortingsbeleid](kortingsbeleid.md).

[^kickoff]: Afgesproken in de kickoff.
```

| Veld | OKF | Hoe BonzaiWork het gebruikt |
|---|---|---|
| `type` | **verplicht**, vrije tekst | De AI kiest uit de lijst in `_meta/schema.md` (startlijst: `Process`, `Decision`, `Policy`, `Product`, `System`, `Team`, `Glossary Term`, `Analysis`, `Meeting Summary`, `Reference`); het team vult hem aan |
| `title`, `description`, `tags` | aanbevolen | `description` is de ene regel in de index |
| `resource` | aanbevolen | Link naar het echte ding (een systeem, dashboard, map), als die er is |
| `sources` + voetnoten | herkomst | Elke bewering uit een bron krijgt een voetnoot `[^id]` die naar `sources[].id` wijst |
| `generated` | vertrouwen | **Zet BonzaiWork zelf**, en houdt AI en mens uit elkaar (§6.5): een wijziging van de AI krijgt `by: bonzaiwork/<versie>`, een wijziging van de gebruiker zelf `by: human:<gebruiker>` (zoals de spec eist voor handwerk); `at: nu` |
| `verified` | vertrouwen | Knop **"Klopt"** bij een concept in de UI voegt `{ by: human:<gebruiker>, at }` toe. De UI toont de trede uit de spec: niet nagekeken / door een mens nagekeken (en "nagekeken vóór de laatste wijziging" als `generated.at` later is) |
| `status` | levenscyclus | Nieuw door de AI → `draft`; na "Klopt" → `stable`; vervangen → `deprecated` (blijft staan, met link naar de opvolger) |
| `stale_after` | levenscyclus | De AI zet het bij tijdgevoelige kennis (prijzen, contactpersonen, planning); `/onderhoud` pakt verlopen concepten op |

De Attested Computations uit de spec (uitvoerbare, geattesteerde berekeningen) gebruiken we niet.

Het type `Playbook` uit de vorige versie vervalt: hoe het team iets **doet**, staat als ICM-werkwijze in
`workflows/` (ICM: "de structuur is de documentatie"). Een `Process`-concept beschrijft het bedrijfsproces
als kennis (wie, wat, waarom); de werkwijze beschrijft hoe een agent er een run van maakt en verwijst naar
dat concept.

### 6.3 Acties: een ICM-werkwijze

Een werkwijze is een **pipeline** in ICM-termen: genummerde stappen, de `output/` van de ene is de invoer
van de volgende, en elke stap eindigt bij een controle. Het team (of de AI met de skill `icm-architect`,
via `/werkwijze`) maakt ze; ze staan in de repo en zijn dus gedeeld.

De werkwijze in één scherm (`workflows/offerte-maken/CONTEXT.md`, laag 1):

```markdown
# Offerte maken - van aanvraag naar gecontroleerde offerte

| Stap | Taak |
|---|---|
| `01_intake` | aanvraag tot korte brief |
| `02_opzet` | brief tot conceptofferte |
| `03_controle` | offerte tegen beleid toetsen |

Elke stap heeft een eigen CONTEXT.md met invoer, uitvoer en controle.
Fabriek (elke run): `../../knowledge/offertes/`. Product (elke run nieuw): de `output/` van elke stap.
Status is wat er staat: een stap is klaar als zijn `output/` iets bevat en een eventuele `check.md` `pass` zegt.
```

Een stapcontract (`workflows/offerte-maken/02_opzet/CONTEXT.md`, laag 2; vorm uit `icm-architect`):

```markdown
# 02_opzet - brief tot conceptofferte

Eén taak: de conceptofferte schrijven vanuit de brief.

## Inputs
- Working (deze run): `../01_intake/output/brief.md`
- Reference (elke run): `../../../knowledge/offertes/offerteproces.md`
- Reference (elke run): `../../../knowledge/offertes/kortingsbeleid.md`
- Reference (elke run): `references/offertesjabloon.md`

Do NOT load: andere stappen, eerdere runs, de rest van `knowledge/`.

## Process
1. Ontbreekt een invoer of is hij leeg, stop en zeg welke.
2. Vul het sjabloon in vanuit de brief.
3. Korting boven de grens uit het kortingsbeleid: markeer de regel voor goedkeuring, reken niet zelf.

## Outputs
- `conceptofferte.md` -> `output/`

## Check
De gebruiker leest de conceptofferte en keurt hem goed of past hem aan. De volgende stap leest wat hier staat.
```

Wat we van ICM overnemen, zonder er iets aan te veranderen:

- **Eén stap, één taak**; nummering geeft de volgorde (`01_`, `02_`).
- **Elk contract** heeft `Inputs` (exacte paden, gesplitst in working en reference, plus wat níét te
  laden), `Process` (genummerd en kort), `Outputs` en precies één `Check`.
- **Reference = kennis.** Een contract verwijst naar OKF-concepten in `knowledge/` in plaats van regels te
  herhalen: één plek per feit.
- **Elke stap eindigt bij een controle**: een persoon, een script of een klein model. Een controle die
  geen persoon is, schrijft `check.md` naast de output, eerste regel `pass` of `fail: <waarom>`; bij `fail`
  stopt de run daar.
- **Elke output is een bewerkbaar bestand**: de gebruiker kan hem openen en aanpassen; de volgende stap
  leest wat er staat.
- **Klein houden**: één contract plus zijn invoer blijft onder ongeveer 8.000 tokens.
- **De wandeltest**: een agent zonder geheugen moet vanuit de bestanden alleen kunnen zeggen waar hij is,
  wat hij moet doen en wat de status is.

En ICM's eigen grens: het is voor opeenvolgende, gecontroleerde, herhaalbare werkwijzen. Werk met
automatische vertakkingen halverwege of realtime samenwerking tussen agents hoort er niet in.

### 6.4 Werkwijzen voor het brein zelf

Het onderhoud van de kennis zelf blijft bij drie skills die BonzaiWork in elk brein zet (geen
ICM-pipelines: ze draaien op elke vraag, niet als run met een product):

| Werkwijze | Wanneer | Wat de AI doet |
|---|---|---|
| **Verwerken** (`/verwerk`, skill `okf-ingest`) | De gebruiker sleept een bestand in de chat, plakt een tekst, of zet een `.md` in `references/` | Bron als Markdown in `references/` (`type: Reference`, `title`, `resource` naar het origineel; alleen `.md`, N5). Kort de belangrijkste punten bespreken. Concepten aanmaken of bijwerken die de bron raakt, met de bron in `sources` en voetnoten |
| **Vragen** (skill `okf-query`) | Elke gewone vraag | Eerst `AGENTS.md` (route naar kennis of werkwijze), dan de `index.md` van de root en van de relevante map, dan de concepten; antwoord met links. Blijvend waardevol antwoord → "Zal ik dit vastleggen?" → `/vastleggen` maakt een concept (vaak `type: Analysis`) |
| **Onderhoud** (`/onderhoud`, skill `okf-lint`) | Op verzoek of als wekelijkse routine | Kennis: tegenstrijdigheden, verlopen `stale_after`, oude `draft`s, concepten zonder bron, weesconcepten, gebroken links (melden, niet weghalen). Werkwijzen: de ICM-wandeltest, en contracten die naar een verdwenen of `deprecated` concept verwijzen |

In een gedeeld brein slaat de wekelijkse routine over als `log.md` de afgelopen 7 dagen al een
onderhoudsronde toont (van wie dan ook).

**Zelf werkwijzen maken (I2).** `/werkwijze` start `icm-architect` in Build-modus: de AI vraagt door op hoe
het werk nu gaat (waar pauzeer je om te controleren, wat blijft elke keer hetzelfde, wat is "klaar") en zet
de kleinste werkwijze neer die dat draagt, ter goedkeuring. Dat kan in elk project:

- in een **projectbrein**: een gedeelde werkwijze in `workflows/` voor het hele team;
- in het **persoonlijke brein**: een eigen werkwijze, in elk project te starten (§6.7);
- in een **gewoon project** (geen brein): het project wordt een ICM-werkruimte met dezelfde indeling
  (`AGENTS.md` en `workflows/<naam>/`), zonder sync en zonder `knowledge/` tenzij de gebruiker dat wil.
  BonzaiWork vindt en draait hem op dezelfde manier (§6.5).

`icm-architect` waarschuwt zelf tegen te veel structuur ("een werkruimte voor iets wat je twee keer deed,
is steiger, geen architectuur"); die drempel houden we, zodat niet elke vraag een werkwijze wordt.

### 6.5 Wat BonzaiWork zelf doet, niet de AI

Net als bij git (§2), deterministisch in code (`packages/bonzaiwork-brains/src/okf.ts` en `icm.ts`).

**Kennis (vóór elke commit):**

- **Conformiteit volgens OKF**: elk `.md` in `knowledge/` (behalve `index.md`/`log.md`) heeft leesbare
  frontmatter met een niet-lege `type`. Zo niet, dan geen commit en één herstelpoging door de AI; lukt dat
  niet, dan "Actie nodig". Onbekende sleutels blijven staan.
- **`generated` invullen, AI en mens apart.** Welke bestanden de AI veranderde, haalt de sync uit de
  beurt zelf: de bewerk-tools van de engine (`edit`, `write`, `patch`) in de berichten van die chat, plus
  de schrijfacties van de breinen-MCP. Die concepten krijgen `by: bonzaiwork/<versie>`. Andere gewijzigde
  concepten (de gebruiker in Obsidian, of een bash-commando dat de sync niet kan toeschrijven) krijgen
  `by: human:<gebruiker>`. Bij twijfel kiest de sync `human:` niet: een bestand dat een bash-commando van
  de AI veranderde, telt als AI. Dezelfde indeling bepaalt de twee commits van §4.3.
- **`index.md` per map genereren**: zonder frontmatter (behalve `okf_version: "0.2"` in de root), een
  sectie met submappen en een per `type`, elk een lijst links met `description`. Bij een rebase-conflict
  maakt de sync hem opnieuw.
- **`log.md` schrijven**: per beurt één regel onder de datum van vandaag, nieuwste bovenaan:
  `- **Update** [Offerteproces](offertes/offerteproces.md): <chattitel>`. Bij een rebase-conflict voegt
  de sync beide kanten per datum samen.
- **`references/` blijft onveranderlijk**: wijzigen of verwijderen weigert de sync; toevoegen mag.

**Werkwijzen (bij het draaien):**

- **Vinden**: BonzaiWork leest `workflows/*/CONTEXT.md` (eerste kop = naam en taak) en toont de
  werkwijzen in het project en in de composer.
- **Een stap starten**: BonzaiWork leest het contract, controleert dat elke invoer bestaat en niet leeg is
  (ICM-processtap 1, maar dan in code: ontbreekt er iets, dan start de stap niet en zegt de app welke), en
  start de stap als **nieuwe chat** in de groep van die run (chatgroepen bestaan al), met het contract en
  de lijst exacte invoerpaden. Een nieuwe chat per stap houdt de context klein, zoals ICM bedoelt; een
  lopende chat zou de vorige stappen meeslepen.
- **Controle afdwingen**: na de stap kijkt de app of de genoemde outputs er zijn. Dan de controle uit het
  contract: een **persoon** krijgt een kaart ("Klopt de conceptofferte?" → Goedkeuren / Openen en
  aanpassen / Opnieuw); een **klein model** laat BonzaiWork via LiteLLM de controlevraag beantwoorden en
  `check.md` schrijven; een **script** draait alleen in een vertrouwd brein (§7.1), met toestemming. De
  volgende stap kan pas starten na `pass` of goedkeuring.
- **Status van schijf**: de voortgang (stap klaar, wacht op controle, afgekeurd) volgt uit wat er in
  `output/` en `check.md` staat, niet uit een database.
- **Structuurcontrole vóór commit** (voor gewijzigde werkwijzen): elk stapcontract heeft `Inputs`,
  `Process`, `Outputs` en `Check`, en elk reference-pad bestaat. Een fout geeft "Actie nodig" en één
  herstelpoging, net als bij kennis. Een link van `knowledge/` naar `workflows/` (verkeerde richting) en een
  `AGENTS.md` van meer dan ~60 regels geven alleen een waarschuwing.
- **Runs niet delen** (I1): `workflows/**/output/` staat in `.git/info/exclude`. Bij een nieuwe run van
  dezelfde werkwijze verhuist de vorige naar `workflows/<naam>/_runs/<datum>-<onderwerp>/` (ook lokaal).

### 6.6 `AGENTS.md` en `_meta/schema.md`

ICM houdt de ingang klein en zonder inhoud (laag 0, ~300–800 tokens, onder ~60 regels). De regels voor het
schrijven van kennis staan daarom in `_meta/schema.md`, en de regels van de app zelf (synchroniseren, geen
git, andere breinen alleen op verzoek, persoonlijk versus team) staan **niet in de repo**: die zet
BonzaiWork in de globale instructies van de engine, samen met de persoonlijke instructies (§5.1; fase 0
§5). Zo heeft elk feit één plek en kan een team de app-regels niet per ongeluk
weghalen.

```markdown
# <Naam van het brein>

<Eén zin: waar dit brein over gaat en voor wie.>

## Waar alles staat

| Map | Wat erin staat |
|---|---|
| `knowledge/` | wat we weten (OKF); begin bij `knowledge/index.md` |
| `workflows/` | hoe we werken (ICM); elke werkwijze begint bij zijn `CONTEXT.md` |
| `_meta/schema.md` | typen en schrijfafspraken voor kennis |
| `_templates/` | lege startbestanden: nieuw werk is een kopie |

## Waar je heen gaat

| Als | Ga naar | Stop bij |
|---|---|---|
| een vraag over hoe iets zit | `knowledge/index.md`, dan de map-index | het antwoord, met links |
| een taak die als werkwijze bestaat | `workflows/<naam>/CONTEXT.md` | de controle van de stap |
| een nieuwe bron | `/verwerk` | de concepten die hij raakt |
| een werkwijze maken of aanpassen | `/werkwijze` | het voorstel, ter goedkeuring |
```

`_meta/schema.md` bevat de typelijst en de schrijfregels uit §6.2 (één concept per bestand; `type`,
`title`, `description`, `tags`; bronnen in `sources` met voetnoten; relatieve links; `status: draft` voor
nieuw; `stale_after` voor tijdgevoelig; `deprecated` in plaats van verwijderen; `references/` niet wijzigen;
`index.md`, `log.md`, `generated` en `verified` niet zelf schrijven; tegenspraak tussen bronnen benoemen).

### 6.7 Het persoonlijke brein

Dezelfde opbouw (`AGENTS.md`, `_meta/`, `knowledge/`, en `workflows/` voor eigen werkwijzen), met deze
verschillen:

- **Voorkeuren in `_meta/voorkeuren.md`** (rol, schrijfstijl, hoe ik samenvattingen wil), niet in
  `AGENTS.md` (die blijft routering). De persoonlijke instructies (§5.1) bestaan uit `AGENTS.md` +
  `_meta/voorkeuren.md`, volledig (N3), binnen de grens van N6. Een geleerde voorkeur werkt zo meteen overal.
- **Persoonlijke werkwijzen** in `workflows/` zijn in elk project te starten, net als die van het
  projectbrein; hun stappen lezen dan uit het persoonlijke brein én het huidige project.
- **Bestaand second brain (§5.1.1)**: BonzaiWork voegt `AGENTS.md`, `_meta/` en `knowledge/` toe; de
  bestaande notities blijven waar ze staan en buiten de bundel (ze hebben geen `type`). De AI leest ze en
  mag ze bijwerken (N4). **"Inrichten"** (`/inrichten`, fase 2) gebruikt de Restructure-modus van
  `icm-architect`: inventaris, elke notitie indelen, een migratievoorstel ter goedkeuring, en dan per map
  concepten in `knowledge/` maken met de oorspronkelijke notitie als bron. De notities zelf blijven staan.
- **Importeren**: een OKF-bundel uit een ander hulpmiddel (bijv. een Mem-export) kan in één keer in
  `knowledge/` (fase 2); de sync controleert de conformiteit.

### 6.8 Zoeken als een brein groeit

De `index.md` per map is OKF's manier om een agent stap voor stap te laten zoeken, en dat is ook ICM's
gelaagd laden: eerst de ingang, dan wat de taak nodig heeft, nooit alles. `brein_zoeken` en
`persoonlijk_brein_zoeken` volgen dezelfde route (root-index → map-index → concept) en vallen terug op
tekstzoeken in `title`, `description` en `tags`. Fase 3: hybride zoeken voor grote breinen, met
embeddings via LiteLLM en de index lokaal.

### 6.9 Waar we bewust van ICM afwijken

ICM staat afwijken toe, mits je opschrijft waarom. Deze afwijkingen komen ook in `_meta/schema.md`:

- **`output/` wordt niet gedeeld** (I1). In ICM zit de output in de map en gaat hij mee in git. In een
  gedeelde repo zouden twee collega's die dezelfde werkwijze draaien elkaars output overschrijven. Wat
  blijvend is, legt de gebruiker vast als kennis (`/vastleggen`); het eindproduct verlaat de werkwijze
  sowieso.
- **Geen verplichte Python-scripts.** ICM's `_tools/` (`links.py`, `index.py`) doet BonzaiWork in de app
  (§6.5); gebruikers hoeven geen Python te hebben. Een brein mag eigen scripts meebrengen, maar die draaien
  alleen in een vertrouwd brein (§7.1).
- **Geen `CLAUDE.md`-verwijzing nodig**: OpenCode leest `AGENTS.md` zelf.
- **Indexen**: in `knowledge/` OKF's `index.md` (gegenereerd), in `workflows/` is de `CONTEXT.md` de
  catalogus. ICM's `_index.md` gebruiken we niet.

## 7. Veiligheid

### 7.1 Vertrouwen per gebruiker (B5)

Een gedeelde repo is invoer van anderen die op ieders laptop draait. Een `opencode.json` of `.opencode/`
kan lokale MCP-servers (een commando), plugins, agents met ruime rechten of commando's meebrengen.
Providers zijn al dicht (alleen LiteLLM, via `experimental.policies`), de rest niet. Daarom:

- Fase 0 (§6.2) mat wat er gebeurt: een plugin in `.opencode/plugins/` draait al bij het **openen** van de
  map, een MCP uit `opencode.json` start meteen, en `` !` `` in een commando-sjabloon draait shell zonder
  toestemming zodra iemand het commando kiest.
- **Vertrouwensstap** bij het toevoegen: lijst van lokale verbindingen, plugins, agents en commando's die
  opdrachten uitvoeren, in gewone taal; elke gebruiker beslist zelf. Zonder akkoord laden die onderdelen
  niet: ze staan op de **sparse-checkout-lijst** en komen dus niet in de map (wel in de repo en in elke
  commit; getest met commit, rebase en push), en MCP-namen krijgen daarnaast een `integration.use`-deny in
  de globale policies (fase 0 §6.3).
- Komt er via een pull zo'n onderdeel bij of verandert het, dan opnieuw vragen vóór het laadt (diff op
  `opencode.json`, `.opencode/plugins/`, `.opencode/agents/`, `mcp`-sectie).
- **Scripts in werkwijzen** (een stap of controle die een commando noemt, of `_tools/` in het brein) zijn
  ook code uit een gedeelde repo. Ze staan in de vertrouwensstap, draaien alleen als het brein vertrouwd
  is, en altijd met toestemming van de engine.
- De keuzes staan per gebruiker in `brains.json` (niet in de repo).
- Het mechanisme om onderdelen uit te zetten werkt zonder patch (§3, tabel; fase 0 §6.3).

### 7.2 Geheimen

- Vóór elke commit een scan (`.env`-bestanden, bekende sleutelpatronen, waaronder de LiteLLM-keyvorm en
  private SSH-sleutels). Treffer → niet vastleggen, melding met het bestand.
- Bijlagen uit de chat-inbox gaan nooit mee.
- De app leest, kopieert of bewaart **geen** SSH-sleutels; dat blijft bij het systeem en de ssh-agent.

### 7.3 Grenzen van de breinen-MCP en de globale instructies

- Alleen tekstbestanden binnen geregistreerde breinmappen (geen symlinks naar buiten, geen `.git`, geen
  inbox); schrijven alleen in het persoonlijke brein; token alleen op loopback, net als de LiteLLM-proxy.
- **Blijvende injectie via de persoonlijke instructies.** `AGENTS.md` en `_meta/voorkeuren.md` van het
  persoonlijke brein gaan in elke chat (N3). Kan de AI daar vrij in schrijven, dan kan tekst die hij
  ergens leest (een webpagina, een bron in een gedeeld brein) hem laten schrijven "negeer voortaan …", en
  dat staat dan in elke volgende chat. Daarom weigert `persoonlijk_brein_schrijven/bewerken` die twee
  bestanden, en is er een aparte tool `voorkeur_voorstellen` die **altijd** een kaart toont met de
  wijziging ("Toevoegen aan je voorkeuren: …" → Toevoegen / Aanpassen / Weigeren). De andere bestanden in
  het persoonlijke brein blijven op allow (N4); die gaan niet vanzelf in elke chat. Wijzigingen die de
  gebruiker zelf (in Obsidian) in die twee bestanden doet, gaan gewoon mee. Voor de gewone bewerk-tools in
  "Mijn brein" (fase 0): `edit:_meta/voorkeuren.md` → deny kan (de regel geldt in alle projecten, maar
  alleen het persoonlijke brein heeft dat bestand). `edit:AGENTS.md` niet: dat zou elk `AGENTS.md` in elk
  project dichtzetten. Voor `AGENTS.md` (alleen routering) geldt dus dezelfde kanttekening als bij
  uitgesloten mappen (§5.1.1), en bash blijft een omweg.
- **De globale instructies staan buiten elk project.** Omdat ze in de config-map van de engine staan en
  niet als instructie-entry (§5.1), kan een client-token ze niet via `/opencode2` overschrijven (dat kon
  bij entries wel: de server schermt alleen zijn eigen twee sleutels af). De gewone bewerk-tools vragen
  voor die map **geen** toestemming (fase 0 §6.6, gemeten): de AI zou er vanuit elk project in kunnen
  schrijven. Daarom `edit:<OPENCODE_CONFIG_DIR>/*` → deny, met het absolute pad (§5.2).

### 7.4 De AI en git

Een `git`-deny in de `opencode.json` van een gedeelde repo beschermt niets: een teamlid of de AI zelf
(met de gewone bewerk-tools) haalt de regel weg, en een bash-patroon is te omzeilen (`cd x && git …`,
`sh -c "git …"`, `/usr/bin/git`). Daarom in lagen, geen ervan in de repo:

1. **Globale engine-policies via de hooks** (fase 0, §3): `tool.use` `shell:git *` → deny (ook in ketens
   als `ls && git status`) en `edit:.git/*` → deny (ook met een absoluut pad). Een brein kan ze niet
   opheffen met zijn eigen policies (gemeten). Dat vangt het normale geval, geen kwaadwillende omweg: een
   schrijfopdracht via bash in `.git/` gaat er gemeten langs.
2. **De sync controleert zelf**, vóór elke commit en push: is de remote nog die uit `brains.json`, staat
   `HEAD` op de verwachte branch, en is `origin/<branch>` zoals die bij de vorige geslaagde sync was een
   **voorouder van `HEAD`**? Wat al gedeeld is, is dan niet herschreven; het rebasen van eigen, nog niet
   verstuurde commits (§4.2, §4.3) mag gewoon. Zo niet, dan geen push en status "Actie nodig". Deze laag
   beschermt alleen de push van de sync zelf. Een AI die laag 1 omzeilt, pusht buiten de sync om; laag 3
   vangt daarvan alleen de force-push af. Een gewone push van zo'n AI is niet erger dan wat de sync zelf
   ook doet (een commit op de gedeelde branch, terug te draaien via de geschiedenis).
3. **Op de git-host**: de standaardbranch van een gedeeld brein beschermd tegen force-push en verwijderen.
   - **GitHub**: branch protection, "Allow force pushes" uit; pushen door het team toegestaan.
   - **GitLab**: protected branch met **"Allowed to push and merge: Developers + Maintainers"** en "Allowed
     to force push" uit. Met de standaardinstelling (alleen Maintainers) kan de rest van het team niet
     pushen en belandt het in "Alleen lezen".
   - Rechtstreeks pushen blijft zo kunnen (B4); een `git push --force` met de SSH-sleutel van de gebruiker
     niet. Dit is de enige laag die ook een omzeilde deny tegenhoudt.
   - De app kan deze instelling via SSH **niet controleren**; het is een stap voor de beheerder van de repo,
     geen controle in "Verbinding testen". In fase 1 staat hij in de beheerdershandleiding
     (`docs/bonzaiwork/brein-beheer.md`, nieuw); vanaf fase 2 ook in "Nieuw gedeeld brein".
4. **Git van de sync voert geen code uit uit de repo.** Komt de AI toch voorbij laag 1, dan kan hij
   `.git/hooks/pre-commit` neerzetten of `core.fsmonitor` in `.git/config`, en dan voert dugite die code
   uit bij de volgende `commit` of `status` van de sync, met de rechten van de app. Daarom:
   - De sync roept git **altijd** aan met `-c core.hooksPath=<lege map in userData>
     -c core.fsmonitor=false -c commit.gpgsign=false` (command-line `-c` gaat vóór de repo-config). Fase 0:
     met deze opties draaien `pre-commit`, `commit-msg`, `post-commit`, `reference-transaction` en een
     fsmonitor uit de repo niet, zonder wel (`scripts/bonzaiwork/spikes/brains/git-safety.sh`).
   - `.git/config` geldt als onbetrouwbaar. Ook filters (`filter.<naam>.clean/smudge`), `diff.external`,
     `include.path` en dergelijke kunnen code starten. De sync bewaart daarom zijn eigen kopie van de
     verwachte `.git/config` in `userData` en vergelijkt vóór elke git-actie; wijkt hij af, dan geen
     git-actie en "Actie nodig" met "Herstellen". `GIT_SSH_COMMAND` gaat al vóór `core.sshCommand` (§3.2);
     de remote-controle zit in laag 2.
   - Bij het persoonlijke brein staat de git-map buiten de map (§5.1.1), dus buiten bereik van de gewone
     bewerk-tools; de `-c`-opties gelden ook daar.

## 8. API en UI

### 8.1 API (wordt contract §7.5)

Het contract ([§7.4](./frontend-contract.md)) is leidend; elke route die iets verandert vraagt het host-token (review #5).

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
| `POST /bonzaiwork/brains/:workspaceId/pull` | host | projectbrein en persoonlijk brein bijwerken (max. ~5 s), daarna de globale instructies bijwerken, ook als bijwerken mislukte (§5.1) |
| `POST /bonzaiwork/brains/:workspaceId/sync` | host | vastleggen + versturen |
| `GET /bonzaiwork/brains/:workspaceId/history` | client | laatste commits: wie, wat, wanneer, welke chat |
| `POST /bonzaiwork/brains/:workspaceId/resolve` | host | `{ strategy: "ai" \| "keep-mine-apart" }` |
| `* /bonzaiwork/brains/mcp` | lokaal token | de breinen-MCP (§5.2), alleen voor de engine |
| `GET /bonzaiwork/brains/:workspaceId/workflows` | client | werkwijzen (ook die van het persoonlijke brein) met hun stappen en de status van de lopende run |
| `POST /bonzaiwork/brains/:workspaceId/workflows/:name/runs` | host | nieuwe run: vorige naar `_runs/`, chatgroep aanmaken |
| `POST /bonzaiwork/brains/:workspaceId/workflows/:name/stages/:stage/start` | host | invoer controleren, stap als nieuwe chat starten; `409` met de ontbrekende invoer |
| `POST /bonzaiwork/brains/:workspaceId/workflows/:name/stages/:stage/check` | host | `{ verdict: "pass" \| "fail", reason? }` van een persoon, of de modelcontrole laten draaien |

```ts
type BrainKind = "project" | "personal";
type BrainState = "synced" | "syncing" | "behind" | "ahead" | "offline" | "conflict" | "read_only" | "local_only" | "needs_trust" | "error";
// needs_trust: een clone of pull bracht verbindingen, plugins, agents of scripts mee waarover de
// gebruiker nog moet beslissen (§7.1). Synchroniseren en chatten gaan door; die onderdelen laden niet.
type BrainStatus = {
  kind: BrainKind;
  state: BrainState;            // local_only: persoonlijk brein met lokale geschiedenis, zonder origin
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

### 8.2 UI

Volgens `DESIGN.md`; regels per scherm citeren in de PR, met screenshots (headless, demo-backend). Woorden:
"brein", "ophalen", "delen", "geschiedenis", "nagekeken" — niet "pull", "push", "commit", "frontmatter"
(DESIGN.md C3, geen techniek in beeld).

- **Onboarding**: stap "Je persoonlijke brein": "Kies je bestaande notitiemap", "Begin met een nieuw brein"
  of "Haal je brein op uit een repo" (§5.1); daarna mappen uitsluiten (§5.1.1).
- **Nieuw project**: derde keuze naast "Nieuwe map" en "Bestaande map": **"Uit een gedeeld brein"**.
  Velden: link naar de repo (browserlink mag, §3.2), naam, map, knop "Verbinding testen". Geen velden voor
  wachtwoorden of tokens. Daarna voortgang, zo nodig de vingerafdruk van een onbekende host, en de
  vertrouwensstap (§7.1).
- **Projectkop/zijbalk**: statuspil "Bijgewerkt · 2 min geleden" / "Bezig met delen…" / "3 wijzigingen nog
  niet gedeeld" / "Actie nodig" / "Alleen lezen" / "Alleen op deze laptop". Klik → paneel met "Nu
  bijwerken", "Wijzigingen delen" en de laatste geschiedenis.
- **"Mijn brein"**: altijd bovenaan in de projectlijst, niet te archiveren.
- **Chat**: onder een afgeronde beurt een stille regel "Gedeeld met het brein · 3 concepten" (of "Wordt
  gedeeld zodra je weer online bent"). Lezen in een ander brein in woorden: "Las *Offerteproces* in het
  Sales-brein". De toestemmingskaart voor een ander brein (§5.2) in de bestaande stijl.
- **Werkwijzen**: op de projectpagina en in de composer ("Werkwijze starten"). Een lopende run als
  stappenbalk in de sidecar (klaar / bezig / wacht op jou / afgekeurd), met per stap het outputbestand om
  te openen en aan te passen. Controlekaart in de stijl van de toestemmingskaarten: "Klopt de
  conceptofferte?" → Goedkeuren / Openen en aanpassen / Opnieuw. "Volgende stap" pas na goedkeuring. Een
  ontbrekende invoer in woorden ("De brief uit stap 1 ontbreekt").
- **Concept in de sidecar**: titel, type en tags; de vertrouwenstrede uit OKF ("Door AI geschreven, niet
  nagekeken" / "Nagekeken door Jan, 30 okt" / "Nagekeken vóór de laatste wijziging"), de `status`
  ("Concept", "Vastgesteld", "Vervangen") en "Verlopen" na `stale_after`; knop **"Klopt"** (§6.2) en de
  bronnen als links.
- **Conflictkaart** boven de composer, in dezelfde stijl als de toestemmingskaarten (§4.5).
- **Projectinstellingen → Brein**: link, branch, modus, synchronisatie uitzetten, vertrouwde onderdelen,
  geschiedenis, en welke andere breinen dit project zonder vragen mag raadplegen. Bij "Mijn brein" ook:
  map wisselen, uitgesloten mappen, privérepo koppelen.
- **Projectinstellingen → Toestemmingen → "Extra mappen"**: op v2 vergrendeld met de reden ("Met de
  huidige engine kan de agent ook buiten de projectmap lezen en schrijven. Een lijst met toegestane mappen
  werkt nog niet."), net als "Hoeveel mag de agent zelf doen?"; waar hij wel werkt, zegt de uitleg dat hij
  voor alle projecten geldt (P4, C5; fase 0 §6.6). Breintoegang staat daar nooit.
- **App-instellingen**: naam en e-mail voor de geschiedenis (en voor `human:<id>` bij "Klopt").
- **Demo-backend**: een voorbeeldbrein in elke staat, zodat ontwerpreview zonder server kan.
- **Smoketest** (`scripts/smoke-packaged.mjs`): nieuwe `data-testid`'s (`brain-url-input`, `brain-clone`,
  `brain-status`) en een clone van een lokale bare repo via `file://`.

Nog niet gebouwd (stand 30-10): "Werkwijze starten" in de composer (werkwijzen staan op de projectpagina,
niet als stappenbalk in de sidecar), runs als chatgroep, het aantal concepten in de regel onder de beurt
(hij zegt alleen "Gedeeld met het brein", en alleen als die chat zelf gedeeld werd), en een OKF-bundel
importeren.

## 9. Beslissingen

| # | Vraag | Besluit |
|---|---|---|
| B1 | Meegeleverde git of systeem-git? | **Meegeleverd** (`dugite`); SSH van het systeem |
| B2 | Welke hosts, hoe inloggen? | **GitLab en GitHub, altijd SSH** met de sleutels die collega's al hebben; geen HTTPS, geen tokens |
| B3 | Vastleggen per beurt of gebundeld? | **Per beurt** |
| B4 | Rechtstreeks of via branch/PR? | **Rechtstreeks in fase 1**, "via voorstel" als modus in fase 3 |
| B5 | Vertrouwen per gebruiker of centraal? | **Per gebruiker** |
| B6 | Brein als project of extra map? | **Een brein is altijd een eigen project, gedeeld met teamleden.** Plus één **persoonlijk brein** per gebruiker dat in elk project meetelt. Andere al-geclonede breinen zijn in een chat te raadplegen (alleen lezen) |
| N1 | Persoonlijk brein verplicht als privérepo? Kan een bestaand second brain? | **Nee, lokaal is prima.** Koppelen aan een privérepo kan optioneel. Een bestaand second brain wordt **gekozen, niet gekopieerd** (§5.1.1) |
| N2 | Mag de AI uit eigen beweging in andere breinen kijken? | **Alleen als de gebruiker erom vraagt, of na een voorstel van de AI** dat de gebruiker goedkeurt (§5.2) |
| N3 | Persoonlijke instructies altijd volledig in elke chat? | **Ja**, tot de grens van N6 (niet de 192 KiB van de projectinstructies; dat is een gedeeld budget, §5.1) |
| N4 | Mag de AI bestaande notities in een gekozen second brain wijzigen? | **Ja**, in de hele map (behalve uitgesloten mappen); iedereen migreert naar BonzaiWork. Met een eigen geschiedenis om terug te draaien en zonder werk van de gebruiker te overschrijven (§5.1.1) |
| N5 | Welke formaten? | **Alleen Markdown** (`.md`-bestanden en mappen) |

| N6 | Hoe groot mogen de persoonlijke instructies zijn die volledig in elke chat gaan? | **32 KiB** (ruwweg 8k tokens per beurt), met een waarschuwing in "Mijn brein" erboven en ingekort meesturen. Met ICM is `AGENTS.md` alleen routering (~60 regels), dus vooral `voorkeuren.md` telt |
| I1 | Worden de outputs van werkwijze-runs gedeeld of blijven ze per gebruiker? | **Per gebruiker** (§6.9). Blijvende kennis uit een run wordt opgeslagen als kennis in `knowledge/` (`/vastleggen`) |
| I2 | `icm-architect` (MIT) meeleveren als skill? | **Ja**, met naamsvermelding, voor `/werkwijze` en `/inrichten`. Zo kunnen gebruikers ook zelf ICM-werkwijzen en -werkruimtes maken (§6.4); zijn Python-scripts niet, die doet de app (§6.9) |
| I3 | Welke controles mag een werkwijze gebruiken? | **Persoon en klein model** (via LiteLLM) altijd; **script** alleen in een vertrouwd brein (§7.1) |

## 10. Fasering

**Fase 0: uitzoeken (2–3 dagen)**: gedaan, zie [`project-breinen-fase0.md`](./project-breinen-fase0.md) en de
tabel in §3. Wat alleen op macOS en Windows te testen is (signing, sleutelhanger, agent-service,
cloudmappen, de file-watcher op macOS), staat daar in §8 en gebeurt aan het begin van fase 1.
- `dugite`: grootte en signing → 107–152 MB, uitgedund 16–57 MB; signing nog op macOS/Windows (fase 0 §1, §8).
- SSH via het systeem → foutpatronen gemeten; vergrendelde sleutel alleen met `ssh -v` te herkennen;
  Windows: systeem-ssh expliciet, agent-service staat standaard uit (fase 0 §2).
- `DownstreamServerHost`: sessie-activiteit en een MCP-entry → **ja** (fase 0 §3, §4.1).
- Eigen instructie-entries per sessie → **ja** voor prompts en commando's, **nee** voor sub-taken. Gekozen:
  `<OPENCODE_CONFIG_DIR>/AGENTS.md`, die ook sub-taken krijgen; geen hook in `server.ts` (fase 0 §5).
- Toestemmingsregels vanuit de hooks → `deny` (git, `.git/**`, paden): **ja**, via policies; `allow`: standaard;
  `ask`: **nee**, één regel in de bestaande hook van `managed-opencode-v2.ts` (fase 0 §4.2, §6.4).
- dugite met `-c core.hooksPath=… -c core.fsmonitor=false` → hooks en fsmonitor draaien **niet** (fase 0 §6.5).
- Persoonlijke skills in elke chat → junction `<OPENCODE_CONFIG_DIR>/skills` (fase 0 §5).
- Nieuwe skills na een pull → **vanzelf**, zonder `engine/reload`; ook MCP's, dus vertrouwen vóór bijwerken (fase 0 §6.1).
- **Blokkerend voor B5**: niet-vertrouwde onderdelen uitzetten → **ja, zonder patch**: policies voor MCP's en
  skills, sparse-checkout voor plugins, agents en commando's met shell (fase 0 §6.3).
- Andere breinen via de gewone tools en "Extra mappen" → zonder regel lezen en schrijven ze overal buiten
  het project; "Extra mappen" komt niet bij v2; absolute `read:`/`edit:`-policies dichten een breinmap
  zonder de chats erin te raken (fase 0 §6.6).
- Uitkomst: de tabel in §3 is ingevuld; `PATCHES.md` verandert pas als de `ask`-regel gebouwd wordt.

**Fase 1: MVP**
- `packages/bonzaiwork-brains`: git/ssh, links omzetten, host-sleutels, sync-machine (mutex, pull, commit
  per beurt, push met retry, offline, alleen-lezen), registry, routes, geheimenscan.
- Project-brein toevoegen (verbinding testen, clone, vertrouwensstap), statuspil, regel onder de chat,
  conflictkaart met "Bewaar mijn versie apart", instellingen-sectie, demo-backend.
- Persoonlijk brein: nieuwe map of bestaande vault kiezen in de onboarding, mappen uitsluiten, project
  "Mijn brein", optionele privérepo, instructies (volledig) en skills in elk project,
  `persoonlijk_brein_*`-tools (lezen, zoeken, schrijven, bewerken), geschiedenis met terugzetten (git-map altijd in `userData`), `voorkeur_voorstellen` met kaart.
- Breinsjabloon (§6): `AGENTS.md` als ICM-ingang, `_meta/schema.md`, `_templates/`, `knowledge/` met
  root-`index.md` (`okf_version: "0.2"`), `log.md` en `references/`, een lege `workflows/`; skills en
  commando's voor verwerken, vastleggen, onderhoud en `/werkwijze` (met `icm-architect`, I2). App-regels
  in de globale instructies van de engine (§6.6).
- Werkwijzen als bestanden: de AI volgt de contracten via de routering in `AGENTS.md`; de sync controleert
  de structuur vóór commit en deelt `output/` niet (§6.5, I1). Globale `git`- en `.git/**`-deny via de
  hooks; controle van remote, branch en geschiedenis in de sync (§7.4). In de sync
  (`okf.ts`): conformiteit, `generated`, `index.md` per map, `log.md`, `references/` onveranderlijk.
- UI: knop "Klopt" (`verified`) en de vertrouwenstrede en `status` bij een concept in de sidecar.
- Beheerdershandleiding `docs/bonzaiwork/brein-beheer.md`: repo aanmaken, SSH-toegang voor het team, en de
  branch-bescherming van §7.4 laag 3 (met de GitLab-instelling "Developers + Maintainers").
- Klaar als: twee apps (twee gebruikers) op één repo zien elkaars kennis na één beurt; een voorkeur die
  in project X wordt geleerd, staat in het persoonlijke brein en werkt in project Y; offline werken en
  later delen werkt; een conflict verliest niets; de app leest of bewaart geen SSH-sleutels.

Stand fase 1 (gebouwd):
- Alles hierboven, met tests: `packages/bonzaiwork-brains/test` (twee gebruikers op één bare repo:
  delen na een beurt, conflict, offline, alleen-lezen, geheimen, vertrouwen, git-veiligheid, OKF/ICM,
  persoonlijk brein) en `e2e/brains.e2e.ts` tegen de echte server en engine. Dezelfde tests draaien in CI
  ook op de meegeleverde git.
- Git meeleveren: `scripts/bonzaiwork/fetch-git.mjs` (checksum, uitdunnen, geen HTTPS) →
  `apps/bonzaiwork/resources/git` → `extraResources` in `electron-builder.bonzaiwork.mjs`. Uitgedund:
  Linux 14 MB, macOS 11 MB, Windows 52 MB. Op Linux gedraaid; macOS en Windows alleen uitgepakt en
  gecontroleerd.
- Een lege repo krijgt bij het ophalen het breinsjabloon (`/setup`).
- "Herstellen" controleert een herschreven geschiedenis opnieuw: zet de beheerder de vorige stand terug,
  dan loopt alles weer ([`brein-beheer.md`](./brein-beheer.md) §3).
- Open: de handmatige tests uit fase 0 §8 (signing van de meegeleverde git, sleutelhanger,
  Windows-agent, file-watcher, cloudmappen), en "twee apps op één repo" met twee echte laptops.

**Fase 2: teamwerk**
- Andere breinen raadplegen (`breinen_lijst`, `brein_zoeken`, `brein_lezen`), met de toestemmingskaart
  bij een voorstel van de AI en automatisch goedkeuren als de gebruiker het brein zelf noemde.
- "Laat de AI het samenvoegen", geschiedenis met chat-links, periodieke fetch, routines bij het brein,
  "Als brein synchroniseren" voor bestaande repo's, "Nieuw gedeeld brein".
- Voorbeeldroutine: dagelijks "Wat is er nieuw in mijn breinen" (leest de nieuwe regels in elke `log.md`).
- Wekelijkse onderhoudsroutine (slaat over als een teamlid al onderhoud deed), "Inrichten" met de
  Restructure-modus van `icm-architect` voor een bestaand second brain of een bestaande repo, en een
  OKF-bundel importeren.
- **Werkwijzen draaien in de app** (§6.5): invoer controleren, elke stap als nieuwe chat in de groep van de
  run, controlekaart en modelcontrole, "volgende stap" pas na `pass`, stappenbalk. Een werkwijze als
  routine (een controle door een persoon zet de routine op "wacht op jou", zoals R2).

Stand fase 2 (bezig):
- **Andere breinen raadplegen** gebouwd: `breinen_lijst`, `brein_zoeken`, `brein_lezen` in de
  breinen-MCP (alleen lezen, alleen Markdown, eerst bijwerken als het brein rustig is). De engine vraagt
  bij `brein_zoeken`/`brein_lezen` via een `ask`-regel uit `downstreamEnginePermissions()` (één regel extra
  in het al gepatchte `managed-opencode-v2.ts`). De UI toont "Mag BonzaiWork in het brein Sales kijken?",
  keurt automatisch één keer goed als de gebruiker het brein zelf noemde of het eerder in dit gesprek
  toestond, en stuurt nooit "altijd" naar de engine. e2e: vraag en daarna lezen met bron, tegen de echte engine.
- **"Laat de AI het samenvoegen"** gebouwd: de sync voegt de versie van het team samen zonder commit
  (`git merge --no-commit`), zodat beide versies tussen markeringen in de notities staan; `index.md` en
  `log.md` regelt hij zelf. De app start een chat "Versies samenvoegen" met een vaste opdracht. Na die
  beurt rondt de sync de samenvoeging af, maar alleen als geen notitie nog markeringen heeft; anders
  blijft de kaart staan ("Opnieuw met de AI"). Overleeft een herstart (`MERGE_HEAD`); "Bewaar mijn versie
  apart" kan ook dan.
- **Periodiek kijken**: elke 10 minuten haalt de server voor rustige breinen op wat het team deelde
  (alleen `fetch`); de pil toont dan "2 nieuwe wijzigingen van het team". De map verandert pas vóór de
  volgende beurt.
- Geschiedenis: "Open de chat" bij je eigen beurten.
- **Een bestaand project wordt een brein** (Projectinstellingen → Brein): een map die al een git-repo met
  SSH-link is, wordt met **"Als brein synchroniseren"** een brein zoals hij is (niets geclonet of
  verplaatst; wat erin staat telt als vertrouwd). Een gewone map gaat met **"Deel als nieuw brein"** in
  een lege repo: `git init` in de map, het sjabloon waar het ontbreekt, eerste commit en push. Een repo die
  niet leeg is, wordt geweigerd ("haal hem op als gedeeld brein"). Een lege repo ophalen via "Uit een
  gedeeld brein" richt hem ook in (fase 1).
- **Werkwijzen draaien in de app** (§6.5): de projectstart toont elke werkwijze (`workflows/*/CONTEXT.md`)
  met een stappenbalk en de ene volgende handeling. Status komt van schijf (`output/` en `check.md`). Een
  stap start alleen als zijn invoer er is (anders "Ontbreekt: …") en de vorige stap `pass` heeft, als
  nieuwe chat "<werkwijze>: <stap>" met het contract en de exacte invoerpaden. Controle door een persoon:
  Goedkeuren / Openen / Afkeuren (met reden) schrijft `check.md`; door een model: een chat die de Check
  uit het contract beantwoordt en `check.md` schrijft (dat is het projectmodel, niet een apart klein model
  via LiteLLM); een script volgt in fase 3. "Nieuwe run" zet de vorige in `_runs/<datum>-<onderwerp>/`.
  `output/`, `check.md` en `_runs/` worden niet gedeeld (I1). Nog niet: runs als chatgroep, werkwijzen in
  de composer, en een werkwijze als routine.
- **Onderhoud** (Projectinstellingen → Brein): "Wekelijks onderhoud" plant een routine (maandag 9:00)
  die de kennis controleert met `okf-lint`; staat er die week al een onderhoudsregel in `log.md`, dan
  stopt hij (in de opdracht, niet in code). "Inrichten" start een chat met `icm-architect` in de
  Restructure-modus, die eerst het plan laat zien en op akkoord wacht.
- **Routines met breinen** (na de beslissing hieronder): de routineplanner draait nu in het serverproces
  (`packages/bonzaiwork-routines`). In de routine-editor kies je "Breinen die deze routine zonder vragen
  mag lezen"; voor die breinen beantwoordt de planner de vraag zelf, andere wachten op de gebruiker. Mijn
  brein → Onderhoud → "Wat is er nieuw in je breinen" opent de editor met een ochtendroutine en alle
  gedeelde breinen aangevinkt. e2e: een routine leest zonder klik in het brein dat erbij staat, een andere
  wacht.
- **Andere breinen alleen via de MCP** (§5.2, fase 0 §6.6) gebouwd: de hooks zetten voor elke
  geregistreerde breinmap, het persoonlijke brein en `<OPENCODE_CONFIG_DIR>` `read:`/`edit:`-deny met het
  absolute pad (op Windows met beide scheidingstekens). Een map die de engine al open had, houdt de
  policies waarmee hij werd gebouwd (gemeten): verandert de lijst, dan bouwt BonzaiWork de geladen mappen
  opnieuw met `POST /api/location/reload`, maar pas als geen chat loopt (die herbouw annuleert open
  vragen). De herbouw laat ook de MCP-verbindingen vallen die OpenWork per map registreerde; de host
  registreert ze meteen opnieuw (`syncWorkspaceMcp`), en de pull vóór een beurt wacht op een herbouw tot de
  breinen-tools weer verbonden zijn, zodat geen beurt zonder tools start. e2e: lezen en schrijven in Sales vanuit Mijn brein geblokkeerd, een chat in Sales zelf leest
  gewoon (ook met het volle pad), en Mijn brein is ook vanuit Sales dicht na de herbouw.
- **"Breinen die dit project zonder vragen mag raadplegen"** (Projectinstellingen → Brein → Andere
  breinen, voor elk project): in `brains.json` per project. De server beantwoordt de vraag voor die breinen
  in lopende chats van dat project, ook als de chat niet open staat; de kaart blijft dan weg. Routines en
  projecten gebruiken dezelfde code (`answers.ts`). e2e: na het aanvinken leest een chat zonder klik.
- `brains.json` kende de modus "via voorstel" niet: zo'n brein viel bij een herstart weg. Hersteld, met
  het open voorstel.
- **Windows** is nergens getest: wat er anders loopt, de handmatige test en de regels voor verdere
  ontwikkeling staan in [`windows.md`](./windows.md). Al opgelost: na een clone vergelijkt de server de map
  hoofdletterongevoelig en met beide slashes (`samePath`).
- **Nog open in fase 2**: een OKF-bundel importeren, runs als chatgroep, werkwijzen in de composer en een
  werkwijze als routine.
- Beslist (30-10): GitHub-voorstellen via de `gh` van de gebruiker op de laptop (BonzaiWork bewaart geen
  token, B2 blijft staan); routines mogen zonder klik lezen in de breinen die bij de routine zijn
  aangevinkt.

Stand fase 3 (bezig):
- **Via voorstel** gebouwd (`proposals.ts`, modus `proposal`): na elke beurt gaan de commits die nog niet
  op de gedeelde branch staan naar `bonzaiwork/<gebruiker>/<datum>` (geforceerd; de branch is van de
  gebruiker en wordt bij elk bijwerken opnieuw op de gedeelde branch gezet). De eerste push maakt het
  voorstel: GitLab via push options in dezelfde SSH-push, GitHub met `gh pr create` van de gebruiker
  (gevonden in PATH, Homebrew-plekken of `BONZAIWORK_GH`). Zonder `gh` of zonder push options: een link
  "Voorstel maken". Samengevoegd (ook squash, ook met ander werk erbij; `git merge-tree`) → de map volgt
  de gedeelde branch weer. "Alleen lezen" na een geweigerde push biedt "Als voorstel delen".

**Fase 3: via voorstel en groter zoeken**
- Modus "via voorstel": branch + merge request (GitLab) / pull request (GitHub). Ook aangeboden als een
  push op een beschermde branch faalt.
- Hybride zoeken voor grote breinen (§6.8).
- Werkwijzen met een script als controle of stap, voor vertrouwde breinen (§6.9).

## 11. Testen

- **Unit** (`packages/bonzaiwork-brains/test`): echte git op tijdelijke mappen, een bare repo als
  "server", twee clones als twee gebruikers (via `file://`; SSH zit niet in de sync-logica). Scenario's:
  fast-forward, rebase, push geweigerd → opnieuw, conflict → niets kwijt, offline → later delen,
  `Permission denied` → alleen-lezen, geheim → geen commit, inbox nooit mee, persoonlijk brein schrijft
  nooit buiten zijn map of in een uitgesloten map, breinen-MCP leest niet uit `.git`, niet via symlinks
  naar buiten en alleen `.md`.
- **OKF** (`okf.ts`): een concept zonder `type` blokkeert de commit; `generated` staat bij elk gewijzigd
  concept; elke `index.md` volgt uit de frontmatter en is na een rebase-conflict opnieuw gemaakt; twee
  gelijktijdige `log.md`-regels blijven allebei staan, per datum, nieuwste eerst; wijzigen of verwijderen
  in `references/` wordt geweigerd en teruggezet; onbekende frontmattersleutels blijven staan. De
  voorbeeldbundels uit Google's repo gaan ongewijzigd door de conformiteitscontrole.
- **ICM** (`icm.ts`): een stapcontract zonder `Inputs`, `Process`, `Outputs` of `Check`, of met een
  reference-pad dat niet bestaat, blokkeert de commit; een stap met ontbrekende of lege invoer start niet en
  noemt de invoer; de status volgt uit `output/` en `check.md` (ook `fail: <waarom>`); "volgende stap" kan
  pas na `pass`; `output/` en `_runs/` komen nooit in een commit; een link van `knowledge/` naar
  `workflows/` geeft een waarschuwing. De voorbeeldwerkspaces uit de ICM-repo gaan door de structuurcontrole
  (met de afwijkingen uit §6.9).
- **Gekozen vault** (fixture: een kleine Obsidian-vault met wikilinks, frontmatter, `.obsidian/` en
  bijlagen): bewerken met verouderde versie → geweigerd; elke beurt staat in de eigen geschiedenis en is
  terug te zetten; een vault zonder git (lokaal of in een cloudmap) en een vault met Obsidian Git krijgen
  géén `.git` en hun geschiedenis staat in `userData`; bijlagen en `.obsidian/` blijven ongewijzigd; vault die al
  een git-repo is, wordt niet aangeraakt als iets anders hem synchroniseert.
- **Git-veiligheid**: een `pre-commit`-hook en een `core.fsmonitor` in de repo draaien niet bij een sync;
  een gewijzigde `.git/config` stopt de sync met "Actie nodig"; een force-push van buiten de sync (de
  voorouder-controle faalt) stopt de push; rebasen van eigen, onverstuurde commits gaat wel door.
- **Wat er meegaat**: een nieuwe pptx gaat niet mee en staat als "niet gedeeld" in de status; een gewijzigd
  script dat al gedeeld was, gaat wel mee; AI-wijzigingen en eigen wijzigingen landen in aparte commits met
  de juiste `generated.by`.
- **Globale instructies**: offline of met een onbereikbare host schrijft de pull-route ze toch, met de
  lokale versie; een sub-taak krijgt ze ook; `persoonlijk_brein_schrijven` weigert `AGENTS.md` en
  `_meta/voorkeuren.md`.
- **Andere breinen**: een chat in project X kan met `read`/`write`/`edit` niet in een ander geregistreerd
  brein, het persoonlijke brein of `<OPENCODE_CONFIG_DIR>`; een chat in dat brein zelf wel; een nieuw
  geregistreerd brein is meteen dicht, een verwijderd brein weer open.
- **Engine** (`scripts/bonzaiwork/spikes/brains/engine-probe.mjs`): bij elke engine-update opnieuw; elk
  veranderd antwoord is een blokkade voor de update.
- **Links en SSH**: unit-tests voor het omzetten van links; een test tegen een lokale `sshd` (in CI een
  container) met een testsleutel in een agent: onbekende host → vingerafdruk, gewijzigde host-sleutel →
  stop, vergrendelde sleutel → juiste melding.
- **Server-e2e**: uitbreiding van `packages/bonzaiwork-litellm/e2e`: clone, registratie als workspace,
  chatbeurt met de stand-in LiteLLM die een bestand schrijft, daarna staat de commit op de bare repo; een
  tweede workspace leest dat bestand via `brein_lezen`; zonder dat de prompt het brein noemt, wacht
  `brein_lezen` op toestemming.
- **UI**: headless (`seed.appWeb` / `pnpm world up dev-app-web`), demo-backend per brein-staat,
  screenshots voor de PR.
- **Verpakt**: smoketest met een `file://`-repo.
