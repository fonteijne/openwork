# Project-breinen: implementatieplan

Status: **voorstel, beslissingen B1–B6 en N1–N5 genomen** (§9). Nog niets gebouwd.

## 1. Het idee in één alinea

Een nieuw project kan, behalve een lege map in `~/BonzaiWork/<naam>` of een bestaande map, ook een
**git-repo zijn die BonzaiWork via SSH clonet** in `~/BonzaiWork/<naam>`. Zo'n repo is een
**project-brein**: de gedeelde kennis en workflows van een team, ingericht als **LLM-wiki naar Karpathy**
(§6): bronnen in `raw/`, door de AI bijgehouden pagina's in `wiki/`, het schema in `AGENTS.md` en
werkwijzen als skills in `.opencode/`. BonzaiWork werkt in die map zoals in elk ander project, maar **haalt vóór het
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
  src/wiki.ts                        LLM-wiki vóór elke commit: index.md genereren, logregel, raw/ bewaken
  templates/                         schema-AGENTS.md (team en persoonlijk), skills en commando's (§6)
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
- De twee bestanden die iedereen raakt, geven nooit een conflict: `wiki/index.md` maakt de sync opnieuw,
  `wiki/log.md` voegt git samen met `merge=union` (§6.3).

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
  doet BonzaiWork `git init` **zonder origin**, puur om de geschiedenis bij te houden (§5.1.1, "Vangnet").
  De status is dan "Alleen op deze laptop". Later koppelen aan een eigen privérepo via SSH is dan alleen
  een origin toevoegen en de bestaande geschiedenis versturen; daarna dezelfde sync als een projectbrein.
- Het is ook een **gewoon project** ("Mijn brein", altijd bovenaan, niet te archiveren): daar chat je om
  je eigen kennis en workflows te ordenen.
- **Telt mee in elk project**, op twee manieren:
  1. **Instructies en skills**: het `AGENTS.md` van het persoonlijke brein komt **altijd volledig** als
     extra instructie in elke chat (N3), met als enige grens dezelfde 192 KiB als voor projectinstructies
     (`opencode-v2-instructions.ts`); wordt die overschreden, dan meldt "Mijn brein" dat en vraagt de app
     om in te korten. Zijn skills staan in elk project in de composer. Fase 0 bepaalt hoe: de engine draait
     met een eigen `OPENCODE_CONFIG_DIR` (`managed-opencode-v2.ts`), dus `~/.config/opencode` werkt niet;
     opties zijn de globale skills- en instructiepaden van die config-map vanuit de hooks laten wijzen
     naar `~/BonzaiWork/Persoonlijk`, of de MCP-route hieronder.
  2. **Schrijven vanuit elk project**: leert de AI in project X iets persoonlijks ("ik wil samenvattingen
     altijd in drie punten"), dan legt hij dat vast met `persoonlijk_brein_schrijven` (nieuwe notitie) of
     `persoonlijk_brein_bewerken` (bestaande notitie). Dat kan overal in het persoonlijke brein, behalve
     in uitgesloten mappen (N4), en alleen in `.md`-bestanden (N5). Elke wijziging komt in de
     geschiedenis en is terug te draaien (§5.1.1); de `Stop`-hook deelt hem daarna als er een repo aan hangt.
- **Wat waar hoort**: teamkennis in het projectbrein, persoonlijke voorkeuren en eigen werkwijzen in het
  persoonlijke brein. Bij twijfel vraagt de AI het (staat in de vaste instructie, §6). Het persoonlijke
  brein schrijft nooit naar een projectbrein en omgekeerd.

#### 5.1.1 Een bestaand second brain kiezen

Waarom kiezen in plaats van kopiëren: een kopie geeft twee versies die uit elkaar lopen, en verplaatsen
breekt wat de collega al heeft (Obsidian, de sync via iCloud of Obsidian Sync, plugins). Met kiezen blijft
hun eigen werkwijze werken en ziet BonzaiWork altijd de actuele notities. Het doel is dat iedereen naar
BonzaiWork migreert: tijdens de overgang kan Obsidian ernaast blijven draaien, en BonzaiWork wordt
geleidelijk het hoofdgereedschap voor dezelfde map.

- **Wiki-structuur erbij**: de app voegt in de gekozen map `AGENTS.md` (het schema, met "Mijn voorkeuren";
  gaat volledig in elke chat, N3), `raw/`, `wiki/` en de skills toe (§6.5). In Obsidian zijn dat gewone
  notities, dus de collega kan ze lezen en bijwerken. Bestond er al een `AGENTS.md`, dan vult de app die
  aan in plaats van hem te vervangen.
- **De AI mag in de hele map schrijven (N4)**: nieuwe notities aanmaken en bestaande bijwerken, vanuit
  elk project, zonder per wijziging toestemming te vragen. Nieuwe kennis komt in `wiki/` volgens het
  schema; bestaande notities werkt hij bij waar ze staan. Bewerken gaat per passage (oude tekst → nieuwe tekst), nooit door een
  hele notitie te overschrijven.
- **Vangnet: geschiedenis van elke wijziging.** Omdat de AI vrij mag schrijven, moet elke wijziging terug
  te halen zijn. Bij elke `Stop`-hook legt BonzaiWork de `.md`-wijzigingen vast in git, met de chat erbij.
  In "Mijn brein → Geschiedenis": wat is er veranderd, vanuit welke chat, en **"Zet deze notitie terug"**
  of **"Draai deze beurt terug"**. Waar de git-map staat, hangt af van de map:

  | Persoonlijk brein | Git-map | Waarom |
  |---|---|---|
  | Al een git-repo die BonzaiWork synchroniseert | die repo | geschiedenis is er al |
  | Geen git-repo, **lokale map** (ook de nieuwe `~/BonzaiWork/Persoonlijk`) | `git init` **in de map, zonder origin** | één mechanisme met de projectbreinen; de geschiedenis verhuist mee met de map; later een privérepo koppelen = origin toevoegen en versturen |
  | Map in **iCloud, OneDrive, Dropbox of Google Drive** | **buiten de map**: `userData/bonzaiwork/history/<id>.git` met de vault als werkmap (`GIT_DIR`/`GIT_WORK_TREE`, geen `.git` in de vault) | een `.git` die door cloud-sync gaat, raakt beschadigd (half gesynchroniseerde objecten, `index.lock`, "conflict"-kopieën), zeker met twee apparaten |
  | Al een git-repo die **iets anders** synchroniseert (Obsidian Git-plugin) | ook **buiten de map**, zoals hierboven | twee programma's die in dezelfde repo committen, geven conflicten |

  De code is in alle gevallen dezelfde git-laag; alleen de plek van de git-map verschilt. Cloudmappen
  herkent de app aan hun pad (`~/Library/Mobile Documents`, `~/Library/CloudStorage/*`, de
  OneDrive-/Dropbox-mappen uit hun eigen instellingen). In `.git/info/exclude` staat dat alleen
  `.md`-bestanden meegaan (N5), zodat bijlagen de geschiedenis niet groot maken. Er gaat niets naar
  buiten zolang er geen origin is.
- **Niet tegelijk met de gebruiker schrijven**: `persoonlijk_brein_bewerken` geeft de versie mee die de AI
  las; is de notitie intussen veranderd (de collega typt in Obsidian, de cloud-sync haalde iets binnen),
  dan weigert de tool en leest de AI opnieuw. Zo overschrijft de AI nooit werk van de gebruiker.
- **Niet verwijderen of hernoemen in fase 1**: hernoemen breekt `[[wikilinks]]` (Obsidian werkt die bij,
  wij nog niet). Opruimen stelt de AI voor; de gebruiker doet het. Hernoemen met bijwerken van links
  komt in fase 2.
- **Alleen de instructies gaan altijd mee**, niet de hele map. Een vault met duizenden notities komt dus
  niet in elke chat; de AI zoekt erin als dat helpt. Dat houdt N3 werkbaar.
- **Alleen Markdown (N5)**: de AI ziet, zoekt en schrijft alleen `.md`-bestanden. Afbeeldingen, pdf's en
  andere bijlagen in de vault blijven onzichtbaar en onaangeroerd.
- **Mappen uitsluiten**: bij het kiezen (en later in de instellingen) vinkt de gebruiker mappen uit die de
  AI nooit mag lezen of wijzigen, bijvoorbeeld `Dagboek/` of `Gezondheid/`. Altijd uit: `.obsidian/`,
  `.trash/`, `.logseq/`, `.git/`.
- **Bestaande sync blijft van de gebruiker**: staat de map in iCloud, OneDrive, Dropbox of gebruikt hij
  Obsidian Sync, dan synchroniseert BonzaiWork niet via git en raakt die sync niet aan (de geschiedenis
  staat dan buiten de map, zie "Vangnet"). Is de map al een git-repo (bijv.
  de Obsidian Git-plugin), dan vraagt de app: "Synchroniseert iets anders deze map al?" Ja → BonzaiWork
  blijft van git af (twee programma's die allebei committen geven conflicten). Nee → BonzaiWork mag de
  sync doen zoals bij een projectbrein.
- **Cloudmappen**: bestanden die alleen online staan (iCloud "Optimaliseer opslag", OneDrive "Bestanden op
  aanvraag") slaat zoeken over in plaats van ze te downloaden; `AGENTS.md` en `wiki/index.md` laat de app lokaal houden
  waar het systeem dat toestaat. Een notitie bewerken die alleen online staat, doet de tool pas als het
  systeem hem heeft opgehaald. Fase 0 test dit op macOS en Windows.
- **Obsidian-gewoonten**: `[[wikilinks]]`, tags en frontmatter laat de AI heel en gebruikt hij ook in
  nieuwe notities, zodat ze in de graph van de collega passen.
- **Project "Mijn brein"** wijst naar de gekozen map. Bijlagen uit chats komen daar in
  `.opencode/openwork/inbox/`; Obsidian en Logseq tonen mappen met een punt niet.

### 5.2 Informatie uit andere breinen (alleen lezen)

In een chat: "haal de offerte-workflow uit het Sales-brein". Alleen breinen die al op deze laptop staan.

- De server-hooks bieden een **lokale MCP-server "breinen"** (loopback-route met een lokaal token, zoals de
  LiteLLM-proxy) en zetten die in de globale engine-config (`mcp`-sectie van de runtime-config; nieuwe
  host-methode in `downstream-hooks.ts`). Zo is hij in elk project beschikbaar zonder per-project-instelling.
- Hulpmiddelen:

  | Tool | Wat |
  |---|---|
  | `breinen_lijst` | naam, beschrijving (eerste alinea van `AGENTS.md`), laatst bijgewerkt |
  | `brein_zoeken(brein, vraag)` | begint bij `wiki/index.md` van dat brein, zoekt daarna in de pagina's en skills; geeft fragmenten met pad |
  | `brein_lezen(brein, pad)` | leest één `.md`-bestand binnen dat brein (niet uit `.git` of de inbox) |
  | `persoonlijk_brein_lezen/zoeken` | idem voor het persoonlijke brein, zonder uitgesloten mappen |
  | `persoonlijk_brein_schrijven/bewerken` | nieuwe notitie / passage vervangen, met versiecontrole (§5.1.1) |

  Alle breinen-tools werken alleen met `.md`-bestanden (N5).

- Vóór lezen werkt de tool dat brein bij als het rustig is (snelle fetch, max. ~3 s), zodat je de versie
  van het team ziet.
- **Alleen lezen**: wil je iets uit brein A in brein B gebruiken, dan schrijft de AI het in het huidige
  project (met bronvermelding "uit het Sales-brein, `wiki/concepten/offertes.md`"). Het andere brein verandert
  nooit vanuit een andere chat; dat voorkomt verrassingen voor dat team.
- In de chat ziet de gebruiker de stap in woorden: "Las *Offertes* in het Sales-brein".
- **Alleen op verzoek, of na een voorstel (N2).** De AI kijkt in een ander brein als de gebruiker erom
  vraagt. Denkt de AI dat een ander brein helpt, dan stelt hij dat in één zin voor ("Het Sales-brein heeft
  een offerte-workflow; zal ik daar kijken?") en wacht op antwoord. `breinen_lijst` mag hij altijd
  gebruiken, anders weet hij niet wat hij kan voorstellen. Afgedwongen, niet alleen gevraagd:
  - `brein_zoeken` en `brein_lezen` staan in de engine-toestemmingen op **ask**, met het brein als
    resource. Een eigen voorstel van de AI wordt zo de bekende toestemmingskaart "Mag BonzaiWork in het
    Sales-brein kijken?" (Toestaan / Altijd in dit gesprek / Weigeren).
  - Vroeg de gebruiker er zelf om, dan hoeft die niet nog eens te klikken: noemt het laatste bericht van
    de gebruiker dat brein (naam of map), dan keurt de UI de kaart automatisch één keer goed.
  - Het persoonlijke brein valt hierbuiten: dat hoort bij de gebruiker en de `persoonlijk_brein_*`-tools
    staan op **allow**.

## 6. Wat er in een brein staat: een LLM-wiki (naar Karpathy)

Elk brein volgt het [LLM Wiki-patroon van Andrej Karpathy](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).
De AI zoekt niet bij elke vraag opnieuw in losse documenten (RAG). Hij **bouwt en onderhoudt een blijvende,
onderling gelinkte wiki in Markdown**: kennis wordt één keer verwerkt en daarna actueel gehouden ("a
persistent, compounding artifact"). Mensen kiezen bronnen en stellen vragen; de AI doet het bijhouden. Dat
past bij BonzaiWork: de sync maakt de wiki gedeeld, git geeft de geschiedenis (bij Karpathy is de wiki ook
een git-repo), en Obsidian kan ernaast blijven als lezer.

"Nieuw gedeeld brein" (fase 2) zet deze structuur en de eerste commit in een lege repo die de gebruiker op
GitHub of GitLab aanmaakte. Een bestaande repo zonder deze structuur krijgt hem pas na "Inrichten als wiki"
(§6.5).

### 6.1 Drie lagen

```
AGENTS.md                 schema: waar dit brein over gaat, conventies, werkwijzen (team schaaft het bij)
raw/                      bronnen: onveranderlijk; de AI leest ze en wijzigt ze nooit
  2026-10-30-kickoff-notulen.md
wiki/                     door de AI bijgehouden pagina's
  index.md                catalogus: elke pagina met link en één regel; de AI leest hem eerst
  log.md                  chronologisch, alleen toevoegen
  overzicht.md            het grote plaatje van dit brein
  samenvattingen/         één pagina per bron
  entiteiten/             producten, systemen, teams, organisaties, rollen
  concepten/              begrippen, werkwijzen, beslissingen
  vergelijkingen/         analyses en afwegingen, vaak ontstaan uit een goede vraag
.opencode/skills/         wiki-verwerken, wiki-vastleggen, wiki-onderhoud, plus eigen teamworkflows
.opencode/commands/       /verwerk, /vastleggen, /onderhoud
.gitattributes            wiki/log.md merge=union
opencode.json             alleen: permission.bash "git *" → deny
```

We houden Karpathy's namen aan (`raw/`, `wiki/`, `index.md`, `log.md`), zodat het patroon herkenbaar
blijft en skills van anderen die het volgen hier ook werken. De submappen en paginasoorten zijn Nederlands.

Elke wiki-pagina heeft frontmatter, en pagina's linken met `[[wikilinks]]` (de Obsidian-graph toont dan
knooppunten en wezen):

```yaml
---
type: concept            # samenvatting | entiteit | concept | vergelijking | overzicht
samenvatting: Hoe we een offerte opbouwen en wie hem goedkeurt.   # één regel, voor de index
bronnen: [raw/2026-10-30-kickoff-notulen.md]
bijgewerkt: 2026-10-30
tags: [offertes]
---
```

### 6.2 Drie werkwijzen

| Werkwijze | Wanneer | Wat de AI doet |
|---|---|---|
| **Verwerken** (ingest, `/verwerk`) | De gebruiker sleept een bestand in de chat, plakt een tekst, of zet een `.md` in `raw/` | Bron als Markdown in `raw/` (een bijlage uit de chat wordt omgezet; alleen `.md` blijft bewaard, N5). Kort de belangrijkste punten bespreken met de gebruiker. Een samenvattingspagina schrijven, en de entiteit- en conceptpagina's bijwerken die de bron raakt ("a single source might touch 10–15 wiki pages"). Eén regel in `log.md` |
| **Vragen** (query) | Elke gewone vraag in de chat | Eerst `wiki/index.md`, dan de relevante pagina's; antwoord met links naar die pagina's. Is het antwoord blijvend waardevol, dan vraagt hij "Zal ik dit vastleggen?" en maakt met `/vastleggen` een pagina (vaak in `vergelijkingen/`) |
| **Onderhoud** (lint, `/onderhoud`) | Op verzoek, of als wekelijkse routine | Zoekt tegenstrijdigheden, beweringen die nieuwere bronnen achterhaald hebben, weespagina's, begrippen die vaak terugkomen maar geen pagina hebben, ontbrekende links en gaten in de kennis. Kleine dingen lost hij zelf op, de rest meldt hij. Eén regel in `log.md` |

In een **gedeeld** brein zou de wekelijkse onderhoudsroutine bij elk teamlid draaien. Daarom kijkt de
routine eerst in `log.md`: staat er de afgelopen 7 dagen al een `onderhoud`-regel (van wie dan ook), dan
slaat hij over.

### 6.3 Wat BonzaiWork zelf doet, niet de AI

Bij Karpathy houdt het model ook `index.md` en `log.md` bij. In een team met sync per beurt geeft dat twee
problemen: iedereen schrijft bij elke verwerking in dezelfde twee bestanden (dus conflicten), en een model
vergeet weleens een regel. Daarom, net als bij git (§2), deterministisch in de sync-machine
(`packages/bonzaiwork-brains/src/wiki.ts`), vlak vóór elke commit:

- **`index.md` wordt gegenereerd** uit de frontmatter (`type`, `samenvatting`), gegroepeerd per soort en
  alfabetisch. De AI leest hem, maar bewerkt hem nooit (dat staat in het schema). Geeft een rebase een
  conflict in `index.md`, dan maakt de sync hem opnieuw en gaat verder; dat conflict komt nooit bij de
  gebruiker.
- **`log.md` voegt samen zonder conflict**: `.gitattributes` zet `wiki/log.md merge=union` (ingebouwd in
  git), zodat twee toevoegingen tegelijk allebei blijven staan. De AI schrijft regels in Karpathy's vaste
  vorm, zodat `grep "^## \[" wiki/log.md` werkt:
  `## [2026-10-30] ingest | Kickoff-notulen` (soorten: `ingest`, `vastleggen`, `onderhoud`). Veranderden
  er wiki-pagina's zonder logregel, dan voegt de sync `## [datum] wijziging | <chattitel>` toe.
- **`raw/` blijft onveranderlijk**: een commit die een bestaand bestand in `raw/` wijzigt of verwijdert,
  weigert de sync; dat bestand gaat terug naar de vorige versie, met een melding. Nieuwe bronnen toevoegen
  mag altijd.
- **Ontbrekende frontmatter**: een pagina zonder `samenvatting` staat in de index als "(geen samenvatting)",
  en `/onderhoud` pakt hem op.

### 6.4 Het schema (`AGENTS.md`)

Het sjabloon; het team schaaft vooral het laatste deel bij, net zoals Karpathy het schema "samen met het
model" laat groeien:

```markdown
# <Naam van het brein>

<Eén alinea: waar dit brein over gaat en voor wie.>

## Hoe dit brein werkt

Dit is een LLM-wiki. Mensen voegen bronnen toe en stellen vragen; jij houdt de wiki bij.

- `raw/` bevat de bronnen. Lees ze; wijzig of verwijder ze nooit. Een nieuwe bron voeg je toe als Markdown.
- `wiki/` is van jou: samenvattingen, entiteiten, concepten, vergelijkingen en `overzicht.md`. Elke pagina
  heeft frontmatter met `type`, `samenvatting` (één regel), `bronnen` en `bijgewerkt`. Link met
  [[wikilinks]]. Werk bestaande pagina's bij in plaats van een tweede over hetzelfde te maken.
- Lees bij elke vraag eerst `wiki/index.md`. Bewerk `index.md` nooit; BonzaiWork maakt hem.
- Voeg na elke verwerking, vastgelegde vraag of onderhoudsronde één regel toe onderaan `wiki/log.md`:
  `## [JJJJ-MM-DD] ingest|vastleggen|onderhoud | Titel`.
- Spreekt een nieuwe bron een pagina tegen, zet dat dan op de pagina, met beide bronnen. Kies niet
  stilzwijgend.
- Werkwijzen: /verwerk (bron verwerken), /vastleggen (antwoord als pagina bewaren), /onderhoud (controle).
  Een werkwijze van het team die vaker terugkomt, wordt een skill in `.opencode/skills/`.

## Samenwerken

BonzaiWork haalt vóór je beurt de nieuwste versie op en deelt je wijzigingen erna; voer zelf geen git uit.
Persoonlijke voorkeuren van de gebruiker horen in het persoonlijke brein, niet hier; vraag bij twijfel.
Andere breinen raadpleeg je alleen als de gebruiker erom vraagt; denk je dat er een helpt, stel het dan in
één zin voor en wacht op antwoord. Zet nooit wachtwoorden, sleutels of privégegevens van personen in het brein.

## Conventies van dit team

<Eigen paginasoorten, naamgeving, taal, wat wel en niet in de wiki hoort. Groeit met het gebruik.>
```

### 6.5 Het persoonlijke brein als wiki

Dezelfde drie lagen en werkwijzen, met twee verschillen:

- **Voorkeuren in het schema.** Het persoonlijke `AGENTS.md` heeft een deel "Mijn voorkeuren" (hoe ik
  samenvattingen wil, mijn rol, mijn schrijfstijl). Omdat dat bestand volledig in elke chat gaat (N3), werkt
  een geleerde voorkeur meteen overal. Kennis gaat in `wiki/`, waar de AI in zoekt; zo blijft het schema
  klein.
- **Bestaand second brain (§5.1.1).** BonzaiWork voegt `AGENTS.md`, `raw/`, `wiki/` (met `index.md`,
  `log.md`, `overzicht.md`) en de skills toe. De bestaande notities blijven waar ze staan: de AI leest ze en
  mag ze bijwerken (N4), maar ze zijn geen bron (ze mogen veranderen) en geen wikipagina (ze zijn van de
  gebruiker). Met **"Inrichten als wiki"** (`/inrichten`, fase 2) verwerkt de AI ze map voor map tot
  wikipagina's, als bron ervan; de originele notities blijven staan. De gebruiker start dat zelf, per map,
  zodat een grote vault niet in één keer omgaat.

### 6.6 Zoeken als een brein groeit

Karpathy: bij een kleine wiki is `index.md` genoeg, bij een grote helpt een zoekmachine (hij noemt `qmd`,
hybride zoeken op Markdown). Fase 1: `index.md` plus gewone tekstzoektocht in `brein_zoeken` en
`persoonlijk_brein_zoeken`. Fase 3: hybride zoeken (trefwoorden + betekenis) als breinen groot worden,
met embeddings via LiteLLM (de enige provider) en de index lokaal.

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
| N3 | Persoonlijke instructies altijd volledig in elke chat? | **Ja**, tot de bestaande grens van 192 KiB |
| N4 | Mag de AI bestaande notities in een gekozen second brain wijzigen? | **Ja**, in de hele map (behalve uitgesloten mappen); iedereen migreert naar BonzaiWork. Met een eigen geschiedenis om terug te draaien en zonder werk van de gebruiker te overschrijven (§5.1.1) |
| N5 | Welke formaten? | **Alleen Markdown** (`.md`-bestanden en mappen) |

## 10. Fasering

**Fase 0: uitzoeken (2–3 dagen)**
- `dugite` in `electron-builder.bonzaiwork.mjs` op macOS en Windows; grootte en signing.
- SSH via het systeem op Windows (OpenSSH-client en ssh-agent-service) en macOS (sleutelhanger); wat
  gebeurt er bij een sleutel met wachtwoord die niet in de agent zit.
- `DownstreamServerHost`: sessie-activiteit, een MCP-entry in de globale engine-config, en of de
  toestemmingsregels voor de breinen-MCP (`ask`/`allow` per tool) daar ook kunnen.
- Hoe komen persoonlijke instructies en skills in elke chat (§5.1, punt 1).
- Laadt de v2-engine nieuwe skills na een pull vanzelf, of altijd `engine/reload`?
- Lokale MCP's/plugins uit een niet-vertrouwd brein uitzetten zonder upstream-patch.

**Fase 1: MVP**
- `packages/bonzaiwork-brains`: git/ssh, links omzetten, host-sleutels, sync-machine (mutex, pull, commit
  per beurt, push met retry, offline, alleen-lezen), registry, routes, geheimenscan.
- Project-brein toevoegen (verbinding testen, clone, vertrouwensstap), statuspil, regel onder de chat,
  conflictkaart met "Bewaar mijn versie apart", instellingen-sectie, demo-backend.
- Persoonlijk brein: nieuwe map of bestaande vault kiezen in de onboarding, mappen uitsluiten, project
  "Mijn brein", optionele privérepo, instructies (volledig) en skills in elk project,
  `persoonlijk_brein_*`-tools (lezen, zoeken, schrijven, bewerken), geschiedenis met terugzetten (`git init` zonder origin, of buiten de map bij cloud-sync).
- LLM-wiki-sjabloon (§6): schema-`AGENTS.md`, `raw/` en `wiki/`, skills en commando's voor verwerken,
  vastleggen en onderhoud, `git *`-deny. In de sync: `index.md` genereren, logregel als vangnet,
  `merge=union` voor `log.md`, `raw/` onveranderlijk.
- Klaar als: twee apps (twee gebruikers) op één repo zien elkaars kennis na één beurt; een voorkeur die
  in project X wordt geleerd, staat in het persoonlijke brein en werkt in project Y; offline werken en
  later delen werkt; een conflict verliest niets; de app leest of bewaart geen SSH-sleutels.

**Fase 2: teamwerk**
- Andere breinen raadplegen (`breinen_lijst`, `brein_zoeken`, `brein_lezen`), met de toestemmingskaart
  bij een voorstel van de AI en automatisch goedkeuren als de gebruiker het brein zelf noemde.
- "Laat de AI het samenvoegen", geschiedenis met chat-links, periodieke fetch, routines bij het brein,
  "Als brein synchroniseren" voor bestaande repo's, "Nieuw gedeeld brein".
- Voorbeeldroutine: dagelijks "Wat is er nieuw in mijn breinen" (leest de nieuwe regels in elke `log.md`).
- Wekelijkse onderhoudsroutine (slaat over als een teamlid al onderhoud deed), en "Inrichten als wiki"
  voor een bestaand second brain of een bestaande repo.

**Fase 3: via voorstel en groter zoeken**
- Modus "via voorstel": branch + merge request (GitLab) / pull request (GitHub). Ook aangeboden als een
  push op een beschermde branch faalt.
- Hybride zoeken voor grote breinen (§6.6).

## 11. Testen

- **Unit** (`packages/bonzaiwork-brains/test`): echte git op tijdelijke mappen, een bare repo als
  "server", twee clones als twee gebruikers (via `file://`; SSH zit niet in de sync-logica). Scenario's:
  fast-forward, rebase, push geweigerd → opnieuw, conflict → niets kwijt, offline → later delen,
  `Permission denied` → alleen-lezen, geheim → geen commit, inbox nooit mee, persoonlijk brein schrijft
  nooit buiten zijn map of in een uitgesloten map, breinen-MCP leest niet uit `.git`, niet via symlinks
  naar buiten en alleen `.md`.
- **Wiki** (`wiki.ts`): `index.md` volgt uit de frontmatter en is na een rebase-conflict opnieuw gemaakt;
  twee gelijktijdige logregels blijven allebei staan (`merge=union`); wijzigen of verwijderen in `raw/`
  wordt geweigerd en teruggezet; wiki-wijziging zonder logregel krijgt er een.
- **Gekozen vault** (fixture: een kleine Obsidian-vault met wikilinks, frontmatter, `.obsidian/` en
  bijlagen): bewerken met verouderde versie → geweigerd; elke beurt staat in de eigen geschiedenis en is
  terug te zetten; een lokale vault zonder git krijgt `git init` zonder origin; een vault in een
  cloudmap of met Obsidian Git krijgt géén `.git` en zijn geschiedenis staat in `userData`; bijlagen en `.obsidian/` blijven ongewijzigd; vault die al
  een git-repo is, wordt niet aangeraakt als iets anders hem synchroniseert.
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
