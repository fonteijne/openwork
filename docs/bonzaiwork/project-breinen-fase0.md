# Project-breinen: fase 0, bevindingen

Bij: [`project-breinen-plan.md`](./project-breinen-plan.md) §10, fase 0. Stand 2026-10-30.

Gemeten in een Linux-container met de gepinde engine **OpenCode v2.0.26** (`constants.json`), **dugite
3.3.2** (git 2.56.0) en OpenSSH 9.6. Wat alleen op een Mac of Windows-pc te testen is, staat in §8 als
handmatige test; dat is in deze fase **niet** gedaan.

Herhaalbaar, zodat we het bij elke engine-update opnieuw controleren:

- `bun scripts/bonzaiwork/spikes/brains/engine-probe.mjs`: 31 controles op de echte engine (zelfde
  `OPENCODE_CONFIG_DIR`-opzet als `managed-opencode-v2.ts`, nep-model dat tool-calls doet). Een antwoord
  dat verandert, geeft `UNEXPECTED` en exitcode 1. Uitkomst nu: 31 × `ok`.
- `bash scripts/bonzaiwork/spikes/brains/ssh-matrix.sh`: git met de systeem-SSH in `BatchMode` tegen
  een tijdelijke `sshd`, alle foutgevallen uit plan §3.2.
- `bash scripts/bonzaiwork/spikes/brains/git-safety.sh`: hooks en fsmonitor in `.git` met en zonder de
  `-c`-opties van de sync (plan §7.4, laag 4).

## Samenvatting

| Vraag (plan §10) | Antwoord | Gevolg voor het plan |
|---|---|---|
| dugite: grootte | Volledig **107–152 MB** uitgepakt, niet 30–40 MB. Zonder Git Credential Manager, LFS en dergelijke: macOS **16 MB**, Linux **19 MB**, Windows **57 MB** (8, 9,5 en 26 MB gecomprimeerd) | §3.1: uitgedunde git meeleveren via `extraResources`, niet het npm-pakket |
| dugite: signing | Niet te bouwen hier. macOS: 148 symlinks en Mach-O-bestanden in `Resources/`; Windows: `.exe`'s vallen buiten de huidige `signExts` | Handmatige test §8 |
| SSH: vergrendelde sleutel buiten de agent | Geeft **dezelfde fout** als "geen toegang". Alleen `ssh -v` toont het verschil: eerst `Server accepts key`, daarna `Permission denied` | "Verbinding testen" draait met `-v`; de gewone sync niet |
| `DownstreamServerHost`: sessie-activiteit | De engine stuurt `session.execution.started/succeeded/failed/interrupted` met `sessionID` op `/api/event` per map | Nieuwe host-methode, alleen in `downstream-hooks.ts` (§3) |
| MCP in de globale engine-config | Werkt (`mcp.servers` of de bestaande globale runtime-config van OpenWork) | Host-methode schrijft de globale runtime-config, zoals bij providers |
| `ask`/`allow` per tool | `ask` werkt via engine-`permissions`, niet via `experimental.policies` (alleen allow/deny). Resource is altijd `*`, nooit het brein | Eén regel extra in het al gepatchte `managed-opencode-v2.ts`; per brein vragen doet de UI (§4) |
| Eigen instructie-entries per sessie (`bonzaiwork.personal`) | Werken naast die van de server, ook bij commando-beurten; **sub-taken erven ze niet** | Niet gekozen; geen `server.ts`-hook nodig (§5) |
| Persoonlijke instructies en skills in elke chat | `<OPENCODE_CONFIG_DIR>/AGENTS.md` en `<OPENCODE_CONFIG_DIR>/skills/` laadt de engine zelf, in elk project, **ook in sub-taken**, live (vanaf ~100 ms na schrijven) | Geen patch, geen MCP en geen sessie-id in de pull-route nodig (§5) |
| `deny` per pad (uitgesloten mappen, `.git/**`, `_meta/voorkeuren.md`) | `tool.use` `read:<pad>`/`edit:<pad>` werkt; paden relatief aan de map, regel geldt in alle projecten; `grep` en `shell` gaan erlangs | Vangrail zonder patch; eerlijke tekst in de UI (§6.4) |
| Hooks/fsmonitor in `.git` en de git van de sync | Met `-c core.hooksPath=<leeg> -c core.fsmonitor=false` draaien ze niet, zonder wel | Laag 4 van plan §7.4 werkt (§6.5) |
| Nieuwe skills na een pull | Skills, commando's, `AGENTS.md` en zelfs MCP's uit `opencode.json` werken meteen, **zonder** `engine/reload` | §4.2: reload-stap vervalt; de vertrouwenscontrole moet daarom vóór het bijwerken (§6) |
| MCP's/plugins van een niet-vertrouwd brein uitzetten | Policies halen MCP's en skills weg en blokkeren tools; **plugins niet**. Plugins draaien al bij het openen van de map | `git sparse-checkout` houdt riskante bestanden buiten de map tot de gebruiker vertrouwt (§6) |
| `git` en `.git/**` verbieden voor de AI | Globale policies `tool.use` `shell:git *` en `edit:.git/*` → deny, ook in ketens en met absolute paden; een brein kan ze niet opheffen | Laag 1 van plan §7.4 zonder patch; een brein heeft geen `opencode.json` nodig (§6.4) |

PATCHES blijft gelijk in aantal bestanden: alles hieronder past in ons eigen `downstream-hooks.ts`, plus
**één regel** in het al gepatchte `managed-opencode-v2.ts` voor de `ask`-regels (§4). Ook geen hook in
`server.ts` voor instructie-entries (§5).

## 1. Git meeleveren (B1)

### 1.1 Grootte

dugite-native v2.56.0-2, zoals `dugite@3.3.2` hem downloadt:

| Platform | Tarball | Uitgepakt | Uitgedund, uitgepakt | Uitgedund, gecomprimeerd |
|---|---|---|---|---|
| macOS arm64 | 63 MB | 151 MB | 16 MB | 8,0 MB |
| Linux x64 | 67 MB | 152 MB | 19 MB | 9,5 MB |
| Windows x64 | 47 MB | 107 MB | 57 MB | 26 MB |

Het grootste deel is **Git Credential Manager** (.NET-runtime, Avalonia, Skia: 83 MB op Linux) en
**git-lfs** (14 MB). Die gebruiken we niet: GCM is voor HTTPS-inloggen (B2 sluit dat uit), LFS is opslag
voor grote bestanden (wij weigeren > 10 MB, plan §4.3). Windows blijft groter omdat MinGit geen symlinks
gebruikt (elke git-builtin is een kopie) en een MSYS-laag meebrengt (`usr/bin`, 24 MB).

Uitdunnen (getest op Linux: clone, ondiepe clone, commit, fetch, rebase, push en sparse-checkout werken
daarna nog):

- alles van GCM: `git-credential-manager*`, `git-credential-helper-selector*`, de .NET-dll's/dylibs
  (`System.*`, `Microsoft.*`, `Avalonia*`, `*Sharp*`, `libcoreclr`, `av_libglesv2`, `msalruntime`, `gcmcore`,
  `GitHub.dll`, `GitLab.dll`, `Atlassian*`) en hun taalmappen;
- `git-lfs*`, `scalar*`, `git-daemon*`, `git-http-backend*`, `git-http-push*`, `git-imap-send*`;
- `share/locale`, `share/doc`, `share/man`, `share/gitweb`;
- op Windows ook de MSYS-`ssh*.exe` en `usr/lib/ssh` (zie §2.3: die mogen we nooit gebruiken).

Optioneel ook `git-remote-http(s)` en `git-http-fetch` weghalen: dan **kán** de meegeleverde git geen HTTPS
meer, wat B2 afdwingt in plaats van alleen afspreekt. Dan moet ook de bundel-check uit §1.3 dat bewaken.

### 1.2 Verpakken

Niet het npm-pakket in `node_modules` (dat downloadt bij `postinstall` en zou in de asar belanden), maar
zoals upstream de engine-binaries meelevert: per platform een uitgedunde map in
`apps/desktop/resources/git-<platform>` en in `electron-builder.bonzaiwork.mjs` een `extraResources`-regel
`→ git`, met dezelfde filter-aanpak als `resources/sidecars`. De sync roept git aan via de JS-API van
dugite (gebundeld in `server-hooks.js`) met `LOCAL_GIT_DIRECTORY=<resources>/git`; dugite zet dan zelf
`GIT_EXEC_PATH`, `GIT_TEMPLATE_DIR` en `PREFIX`. Een klein script (`scripts/bonzaiwork/fetch-git.mjs`, fase 1)
downloadt de tarball, controleert de checksum uit `embedded-git.json` en dunt uit.

### 1.3 Git altijd geïsoleerd draaien

Twee dingen die in deze container misgingen en bij collega's ook kunnen:

- De omgeving bevatte `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_*` en `GIT_ASKPASS` (hier van de container),
  waardoor een `git@github.com:`-link stilzwijgend via een andere weg ging. Ook een `~/.gitconfig` met
  `commit.gpgsign=true`, `url.*.insteadOf` of `core.sshCommand` verandert wat git doet.
- dugite's eigen systeemconfig op Windows zet `core.autocrlf=true`, `credential.helper=manager` en een
  **verplicht** LFS-filter (`filter.lfs.required=true`): zonder git-lfs faalt dan een checkout van een repo
  met LFS-attributen.

Dus elke git-aanroep krijgt een **opgebouwde** omgeving, net als `inheritedEngineEnv` in
`managed-opencode-v2.ts`: alleen `PATH`, `HOME`/`USERPROFILE`, taal- en tijdvariabelen, `SSH_AUTH_SOCK`,
plus `GIT_TERMINAL_PROMPT=0`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=<userData>/bonzaiwork/gitconfig`
(van ons: naam, e-mail, `core.autocrlf=false`, `commit.gpgsign=false`, `filter.lfs.required=false`) en
`GIT_SSH_COMMAND` (§2). `~/.ssh/config` blijft wel gelden: dat is waar de sleutels van de gebruiker staan.

### 1.4 Andere git-gebruikers in de app

`readConfiguredInstructions` (`apps/server/src/opencode-v2-instructions.ts`) roept `git` van het `PATH`
aan, niet dugite; plan §3.1 ("dat werkt dan ook in breinen") klopt dus alleen als er een systeem-git is.
Op een Mac zonder Xcode-tools geeft `/usr/bin/git` dan de installatiepopup. Het gebeurt alleen als een
project `instructions` in zijn `opencode.json` heeft, en het faalt netjes. Mogelijke oplossing in fase 1:
de BonzaiWork-entry zet `<resources>/git/bin` vooraan in `PATH`; dan gebruiken server en engine dezelfde
git. Nog te controleren: of de engine zelf git aanroept (snapshots) en of de AI dan via `shell` alsnog git
vindt (de policy uit §6.3 blokkeert dat).

## 2. Toegang via SSH (B2)

### 2.1 Wat git en ssh melden

`ssh-matrix.sh`, met `GIT_SSH_COMMAND="ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o
UserKnownHostsFile=… -o ConnectTimeout=5"`. Exitcode is altijd 128; de eerste regel van stderr bepaalt de
melding. Voorstel voor de Nederlandse tekst:

| Geval | Herkenbaar aan | Melding |
|---|---|---|
| Onbekende host | `No … host key is known for` / `Host key verification failed` | Vingerafdruk tonen en één keer vragen (§2.2) |
| Host-sleutel veranderd | `REMOTE HOST IDENTIFICATION HAS CHANGED` | "De server van dit brein meldt zich anders dan eerst. Synchroniseren is gestopt; vraag je beheerder of dit klopt." |
| Geen toegang | `Permission denied (publickey)` | "Je account heeft geen toegang tot dit brein." |
| Sleutel met wachtwoord, niet in de agent | **Zelfde** als hierboven | Alleen met `-v` te zien (§2.1.1): "Je SSH-sleutel is vergrendeld; ontgrendel hem in je sleutelhanger of ssh-agent." |
| Repo bestaat niet | `does not appear to be a git repository` (GitHub: `Repository not found`, GitLab: `could not be found`) | "Dit brein bestaat niet (meer) op deze plek." |
| Poort dicht | `Connection refused` | "De server van dit brein is niet bereikbaar." |
| Naam onbekend / geen internet | `Could not resolve hostname` | "Geen verbinding. Je wijzigingen worden gedeeld zodra je weer online bent." |
| Ontgrendelde sleutel in de agent, of sleutel zonder wachtwoord | exit 0 | – |

De GitHub- en GitLab-teksten bij "bestaat niet" en "geen schrijfrechten" (plan §4.3) komen van hun eigen
servers en zijn hier niet gemeten; dat doet de handmatige test (§8).

#### 2.1.1 Vergrendelde sleutel herkennen

Met `BatchMode=yes` biedt ssh de publieke sleutel (`.pub` naast de privésleutel) aan, de server
accepteert hem, maar ssh kan niet tekenen zonder wachtwoord en valt stil terug. In `ssh -v` staat dan
`debug1: Server accepts key: <pad> …` gevolgd door `Permission denied`. Bij een sleutel zonder toegang
ontbreekt die eerste regel. "Verbinding testen" en de foutanalyse na een mislukte sync draaien daarom
`ssh -v -T <host>` en zoeken die regel (alleen het patroon, de debug-uitvoer gaat niet de log in: er staan
paden en vingerafdrukken in). Zonder `.pub`-bestand is het onderscheid niet te maken; dan valt de melding
terug op "geen toegang, of je sleutel is vergrendeld".

### 2.2 Host-sleutels

- Vingerafdruk voor de bevestiging: `ssh-keyscan -p <poort> -t ed25519,ecdsa,rsa <host>` en daarvan
  `ssh-keygen -lf -`. Beide staan in OpenSSH op macOS en Windows. Bevestigen schrijft de gescande regels
  naar `<userData>/bonzaiwork/known_hosts`.
- `UserKnownHostsFile` met twee bestanden (eerst dat van BonzaiWork met de meegeleverde GitHub- en
  GitLab-sleutels, dan `~/.ssh/known_hosts`), met `StrictHostKeyChecking=yes`. De paden komen tussen
  aanhalingstekens in `GIT_SSH_COMMAND`; op Windows met voorwaartse slashes (§2.3).
- Een veranderde sleutel stopt de sync (gemeten). Er is geen tussenweg die stil accepteert.

### 2.3 Windows

- dugite brengt op Windows een **eigen MSYS-`ssh.exe`** mee (`usr/bin/ssh.exe`). Git for Windows gebruikt
  die standaard. Die praat niet met de Windows-service "OpenSSH Authentication Agent" (named pipe), dus een
  vergrendelde sleutel in die agent werkt er niet mee. Daarom: `GIT_SSH_COMMAND` altijd expliciet naar
  `C:/Windows/System32/OpenSSH/ssh.exe` (pad uit `%WINDIR%`, voorwaartse slashes, tussen aanhalingstekens:
  git voert het uit via `sh`), en de MSYS-ssh weg uit de bundel (§1.1) zodat een vergissing niet ongemerkt
  werkt.
- Op Windows staat de agent-service **standaard uit** ("Disabled"). Collega's die sleutels in Git Bash
  gebruiken, hebben vaak de agent van Git Bash, die wij dan niet zien. Sleutels zonder wachtwoord in
  `%USERPROFILE%\.ssh` werken wel. De melding bij een vergrendelde sleutel op Windows noemt daarom de
  service ("Zet in Services 'OpenSSH Authentication Agent' aan en voeg je sleutel toe met `ssh-add`").
- De OpenSSH-client is sinds Windows 10 1809 standaard geïnstalleerd, maar kan zijn verwijderd. Ontbreekt
  `ssh.exe`, dan zegt "Verbinding testen" dat en hoe je hem aanzet (Optionele onderdelen).

### 2.4 macOS

`/usr/bin/ssh` leest `UseKeychain`/`AddKeysToAgent` uit `~/.ssh/config`. Niet getest: of een sleutel
waarvan het wachtwoord in de sleutelhanger staat, maar die nog niet in de agent zit, in `BatchMode` werkt.
Zo niet, dan is de melding uit §2.1 de juiste ("ontgrendel hem in je sleutelhanger": één keer `ssh-add
--apple-use-keychain`). Handmatige test §8.

## 3. Weten wanneer een beurt klaar is (`Stop`-hook)

De engine stuurt op `GET /api/event?location[directory]=<map>` per beurt
`session.execution.started` en daarna `session.execution.succeeded`, `.failed` of `.interrupted`, elk met
`data.sessionID` (gemeten; een commando met `/verwerk` geeft dezelfde events). `GET /api/session/active`
geeft per map de lopende chats (`type: "running"`); dat gebruikt de BonzaiWork-UI al.

Voorstel voor `DownstreamServerHost` (alleen `downstream-hooks.ts`, dat heeft via
`DownstreamStartInput.engine.connection()` de engine-URL en het wachtwoord al):

```ts
type SessionActivity = { workspaceId: string; sessionId: string; state: "running" | "idle"; outcome?: "succeeded" | "failed" | "interrupted" };
/** Volgt de engine-events van de lokale workspaces; verbindt opnieuw na een herstart van de engine. */
onSessionActivity(listener: (activity: SessionActivity) => void): () => void;
/** Lopende chats in een workspace, voor "nooit bijwerken terwijl een chat loopt" (plan §4.2). */
runningSessions(workspaceId: string): Promise<string[] | null>;
```

De sync-machine telt per workspace de lopende chats en start de 15 s-timer pas bij nul. Omdat dit in het
serverproces draait, dekt het ook routines en een gesloten venster. De UI-terugval uit plan §3.3 punt 2 is
dan niet nodig; "bijwerken vóór de beurt" blijft in de UI (`chats.send` wacht op `/pull`).

## 4. De breinen-MCP en zijn toestemmingen

### 4.1 Overal beschikbaar

Een MCP-server in de globale engine-config (`mcp.servers`) is er in elk project (gemeten). Het
engine-configbestand schrijft `managed-opencode-v2.ts` echter helemaal zelf, dus daar kunnen de hooks niet
bij. De bestaande weg van OpenWork wel: de `mcp`-sectie van de **globale runtime-config**
(`ENGINE_GLOBAL_RUNTIME_CONFIG_ID`). `engine-v2-preview.ts` registreert die bij elke map via
`PUT /api/experimental/mcp/<naam>` en houdt hem gezond. De host-methode is dus de MCP-tegenhanger van
`updateEngineProviders`, met `writeGlobalRuntimeOpencodeConfig`:

```ts
updateEngineMcp(servers: Record<string, Record<string, unknown> | null>): Promise<boolean>;
```

met `{ type: "remote", url: "http://127.0.0.1:<poort>/bonzaiwork/brains/mcp", headers: { authorization: "Bearer <lokaal token>" }, codemode: false }`.
`codemode: false` is nodig: anders zitten de tools achter de `execute`-tool van Code Mode en zien
toestemmingsregels ze niet als eigen tool.

### 4.2 `ask` en `allow`

- Zonder regel draait een MCP-tool **zonder te vragen** (gemeten). `persoonlijk_brein_*` hoeft dus niets.
- `experimental.policies` kent alleen `allow`/`deny` (acties `provider.use`, `tool.use`,
  `integration.use`); `ask` kan daar niet.
- Een engine-`permissions`-regel `{ action: "breinen_brein_lezen", resource: "*", effect: "ask" }` geeft de
  gewone toestemmingsvraag (gemeten). De actie is `<servernaam>_<toolnaam>`.
- Die `permissions` rendert `renderOpencodeV2Config` uit eigen bronnen. Voorstel: naast
  `downstreamEnginePolicies()` een `downstreamEnginePermissions()` in `downstream-hooks.ts`, en in
  `managed-opencode-v2.ts` die ene regel erbij in de `permissions`-lijst. Dat bestand staat al in PATCHES;
  de rij wordt "2 regels + import". Zonder patch is er geen globale `ask` gevonden.

### 4.3 Per brein vragen

De resource is altijd `["*"]`, de metadata is leeg: de engine zegt niet **welk** brein. Wel staat in de
vraag `source.id`, de tool-call; de argumenten (`brein: "Sales"`) staan in dat bericht. De UI:

- leest de tool-call en toont "Mag BonzaiWork in het Sales-brein kijken?";
- keurt automatisch één keer goed als het laatste bericht van de gebruiker dat brein noemt (N2);
- biedt "Altijd in dit gesprek" **niet** via de engine aan (dat zou alle breinen vrijgeven), maar onthoudt
  zelf per gesprek welke breinen mochten en keurt die verder automatisch één keer goed.

Alternatief: per brein eigen tools (`brein_sales_lezen`); dan doet de engine het per brein, maar groeit de
toollijst met elk brein. Keuze voor fase 2.

## 5. Persoonlijke instructies en skills in elke chat

Gemeten met de engine-opzet van `managed-opencode-v2.ts`:

- **`<OPENCODE_CONFIG_DIR>/AGENTS.md`** laadt de engine als globale instructie, in elke chat van elk
  project, naast het `AGENTS.md` van het project. Een wijziging geldt vanaf de volgende beurt (de engine
  kijkt naar het bestand).
- **`<OPENCODE_CONFIG_DIR>/skills/`** (ook als symlink/junction naar een andere map) en de config-sleutel
  `skills` geven skills in elk project, ook live.

`~/.config/opencode` werkt inderdaad niet (eigen config-map), maar de config-map van de engine zelf wel.
Geen patch en geen MCP nodig.

Vergeleken met een **eigen instructie-entry per sessie** (`PUT
/api/experimental/session/:id/instructions/entries/bonzaiwork.personal`, zoals `server.ts` zijn eigen
entries zet), ook gemeten:

| | Instructie-entry per sessie | `<OPENCODE_CONFIG_DIR>/AGENTS.md` |
|---|---|---|
| Eigen sleutel naast `openwork.context` | werkt (204, staat in de lijst, komt in de beurt) | – |
| Prompt-beurt | ja | ja |
| Commando-beurt (`/api/session/:id/command`) | ja | ja |
| Sub-taak (child session via de `subagent`-tool) | **nee** | **ja** |
| Routine, of een beurt die de UI niet ziet | alleen als de runner hem zet | ja, vanzelf |
| Wie kan hem wijzigen | elke houder van een client-token via `/opencode2` (alleen de twee sleutels van de server zijn afgeschermd) | alleen het serverproces (bestand buiten elk project) |
| Wanneer zetten | vóór elke beurt, met het sessie-id | alleen als de inhoud verandert |

De config-map wint op elk punt. Eén nadeel: de engine ziet een nieuw bestand via zijn file-watcher. Gemeten
op Linux: direct na het schrijven soms nog de oude versie, vanaf ~100 ms na het schrijven altijd de nieuwe
(9 van 9). De pull-route wacht daarom ~0,5 s als het bestand **veranderde**; omdat voorkeuren zelden
veranderen, kost dat bijna nooit iets. Op macOS (FSEvents) en Windows opnieuw meten (§8).

Ook de app-regels (plan §6.6, eerst als entry `bonzaiwork.rules` bedacht) passen in hetzelfde bestand: één
globale instructie met eerst de app-regels, dan `AGENTS.md` en `_meta/voorkeuren.md` van het persoonlijke
brein. Voorstel voor de host:

```ts
/** Zet of verwijdert de instructies en skills die in elke chat gelden. */
setEngineGlobalContext(input: { instructions: string | null; skillsDirectory: string | null }): Promise<void>;
```

- **Instructies als kopie**, geen symlink: een bestandssymlink vraagt op Windows beheerdersrechten of
  ontwikkelaarsmodus, en het bestand is een samenvoeging van meerdere bronnen. De sync schrijft het bij
  elke wijziging opnieuw (en controleert vooraf de 32 KiB uit N6).
- **Skills als junction** (`fs.symlink(doel, pad, "junction")`): een map-junction werkt op Windows zonder
  rechten, op macOS/Linux is het een gewone symlink.
- De config-map is `<runtimeStorageDir>/opencode-v2/state[/instances/<engineInstanceId>]/config`. Die
  rekent `managed-opencode-v2.ts` uit en geeft hem niet door; `downstream-hooks.ts` rekent hem met dezelfde
  helpers (`runtimeStorageDir`, `engineInstanceId`) na. De test van het aanhaakpunt bewaakt dat.
- Klein gevolg: in het project "Mijn brein" zelf staat dezelfde tekst twee keer in de context (als
  projectinstructie en als kopie). Acceptabel; de hook kan hem daar later weglaten.

## 6. Na een pull, en een niet-vertrouwd brein

### 6.1 Geen reload nodig, dus eerst vertrouwen

In v2.0.26 pikt de engine zonder `engine/reload` op: nieuwe en gewijzigde skills, commando's,
`AGENTS.md` (project en globaal) en **een nieuwe MCP in `opencode.json`** (gemeten). Plan §4.2 ("daarna
`POST /workspace/:id/engine/reload`") vervalt. Het gevolg is belangrijker: wat in de map landt, is meteen
actief. De vertrouwenscontrole moet dus gebeuren **vóór** bestanden in de map komen, niet na de pull.

### 6.2 Wat een brein kan meebrengen

| Onderdeel | Wat de engine ermee doet (gemeten) | Policy kan het tegenhouden? |
|---|---|---|
| `.opencode/plugins/*.js` | **Draait al bij het openen van de map**, vóór de eerste chat | Nee |
| MCP in `opencode.json` | Start het commando zodra de map geopend wordt | Ja: `integration.use` `mcp:<naam>` → deny |
| `!`…`` in `.opencode/commands/*.md` | Draait shell **zonder toestemming** zodra iemand het commando kiest | Nee |
| `.opencode/agents/*.md` | Eigen agent met eigen rechten (niet gemeten) | Deny-policies gelden ook daar |
| Skills, `AGENTS.md` | Tekst voor het model | `integration.use` `skill:<id>` → deny |
| `experimental.policies` in het brein | Kan een globale deny **niet** opheffen (gemeten) | – |

### 6.3 Voorstel: sparse-checkout tot de gebruiker vertrouwt

Zonder upstream-patch is de enige manier om een plugin tegen te houden: hem niet in de map zetten.
`git sparse-checkout` (non-cone) doet precies dat en is getest met clone, commit, fetch, rebase en push:

```
git sparse-checkout set --no-cone '/*' \
  '!/opencode.json' '!/opencode.jsonc' '!/.opencode/opencode.json' '!/.opencode/opencode.jsonc' \
  '!/.opencode/plugin/' '!/.opencode/plugins/' '!/.opencode/agent/' '!/.opencode/agents/' \
  '!/.opencode/commands/<bestand met !`>.md'
```

- Uitgesloten bestanden blijven in de repo en in elke commit van de gebruiker (git raakt ze niet aan), maar
  staan niet op schijf; de engine ziet ze dus niet. Vertrouwen = de regel weghalen; ze verschijnen dan.
- Bij elke pull eerst `git diff --name-only HEAD FETCH_HEAD -- <deze paden>`. Verandert er iets in een
  vertrouwd onderdeel, dan gaat het eerst weer op de uitsluitlijst en vraagt de app opnieuw (plan §7.1).
- Commando's worden per bestand beoordeeld: alleen een commando met `` !` `` gaat buiten de map; de
  BonzaiWork-sjablonen (`/verwerk` enz.) gebruiken dat nooit.
- Maakt de AI zelf zo'n bestand aan in een uitgesloten pad, dan weigert `git add -A` het (exitcode 1,
  "outside of your sparse-checkout definition") maar legt de rest wél vast. Dezelfde paden ook in
  `.git/info/exclude` zetten maakt dat stil; de sync meldt het bestand.
- Extra zekerheid voor MCP's: hun namen uit het (niet uitgecheckte) `opencode.json` ook als
  `integration.use`-deny in de globale policies, via een `enginePolicies()` in de hooks (zie hieronder).

### 6.4 Git en paden verbieden voor de AI

Policies hebben de vorm `{ action: "tool.use", resource: "<toestemming>:<resource>", effect: "deny" }`; de
engine vergelijkt met `*` (ook over `/` heen) en `?` als jokers, en de **laatste** passende regel wint. De
globale config wint van die van een brein. Gemeten:

| Policy | Blokkeert | Laat door |
|---|---|---|
| `shell:git *` | `git status`, `ls && git status` | `ls` |
| `edit:.git/*` | `write`/`edit` op `.git/hooks/pre-commit`, ook als de AI een absoluut pad geeft | `echo x > .git/hooks/post-commit` via `shell` |
| `read:Dagboek/*` | `read` van `Dagboek/geheim.md` | `grep GEHEIM .` vindt de inhoud nog |
| `edit:_meta/voorkeuren.md` | bewerken van dat bestand | – |

- De resource is het pad **relatief aan de map** van de chat (`.git/hooks/pre-commit`,
  `Dagboek/geheim.md`), ook als de AI een absoluut pad gebruikt. Een regel geldt dus in **elk** project: een
  map `Dagboek/` is overal dicht, en een regel op `AGENTS.md` zou elk `AGENTS.md` dichtzetten. Voor `.git/*`
  is dat precies goed; voor uitgesloten mappen en `_meta/voorkeuren.md` acceptabel; voor het `AGENTS.md`
  van het persoonlijke brein niet.
- `grep`, `glob` en `shell` gaan erlangs. Het is een vangrail, geen slot; de echte garanties blijven dat de
  sync code is (plan §2) en de lagen 2–4 van plan §7.4.
- `shell:git *` is beter dan het `opencode.json` met `permission.bash "git *"` uit de eerste versie van het
  plan: dat zou de AI zelf kunnen wijzigen, en in v2 heet de tool `shell`, niet `bash`.

Dynamische policies kosten geen patch: `downstreamEnginePolicies()` wordt bij elke config-schrijf
opnieuw aangeroepen (`setProviders` → `writeConfig` → `renderOpencodeV2Config`), en de bestaande
host-methode `reloadEngineProviders()` veroorzaakt die schrijf. Voorstel:

```ts
type DownstreamServerHooks = {
  // …bestaand
  /** Extra engine-policies (bijv. `tool.use shell:git *`, `integration.use mcp:<naam>`); gelezen bij elke config-schrijf. */
  enginePolicies?(): Array<{ action: "provider.use" | "tool.use" | "integration.use"; resource: string; effect: "allow" | "deny" }>;
  /** Engine-permissions met `ask` (§4.2); vraagt één regel in managed-opencode-v2.ts. */
  enginePermissions?(): Array<{ action: string; resource: string; effect: "allow" | "deny" | "ask" }>;
};
```

### 6.5 De git van de sync voert geen code uit de repo uit

`git-safety.sh` zet `pre-commit`, `commit-msg`, `post-commit`, `reference-transaction` en een
`core.fsmonitor` in de repo en draait `status`, `add -A` en `commit`:

| Aanroep | Wat er draaide |
|---|---|
| `git -c core.hooksPath=<lege map> -c core.fsmonitor=false -c commit.gpgsign=false …` | niets |
| `git …` | alle vier de hooks en de fsmonitor |

Ook getest met de uitgedunde dugite (zelfde uitkomst). Filters, `diff.external` en `include.path` uit
`.git/config` dekt dit niet; daarvoor blijft de vergelijking met de bewaarde kopie uit plan §7.4.

## 7. Wat dit aan het plan verandert

Doorgevoerd in [`project-breinen-plan.md`](./project-breinen-plan.md):

- §3: de tabel ingevuld; geen nieuw gepatcht bestand, één regel extra in `managed-opencode-v2.ts` voor `ask`.
- §3.1: grootte en uitdunnen; git geïsoleerd draaien.
- §3.2: Windows-ssh, foutpatronen.
- §3.3: server-side via engine-events; de UI-terugval vervalt.
- §4.1 en §4.2: clone met `--no-checkout` en sparse-checkout; geen `engine/reload`, vertrouwen vóór bijwerken.
- §5.1 punt 1, §6.6, §6.7, §7.3, §8.1: persoonlijke instructies en app-regels via de config-map van de
  engine in plaats van instructie-entries; de pull-route hoeft geen `sessionId` meer.
- §5.1.1 en §7.3: pad-regels werken, met de grenzen uit §6.4.
- §5.2: `ask` per tool, per brein via de UI.
- §7.1: sparse-checkout als mechanisme; B5 overeind.
- §7.4: lagen 1 en 4 gemeten.
- §10, §11: fase 0 afgevinkt, probe bij elke engine-update.

## 8. Nog te doen op echte machines

Niet te doen in een Linux-container; hoort bij de start van fase 1, met een build uit CI.

**macOS (arm64 en x64)**

- [ ] `electron-builder` met de uitgedunde git in `extraResources`: tekent hij alle Mach-O-bestanden met
      hardened runtime, overleven de 148 symlinks het tekenen, en slaagt notarisatie?
- [ ] Git draait uit de verpakte app (Gatekeeper/quarantaine, geen Xcode-popup).
- [ ] Sleutel met wachtwoord in de sleutelhanger, niet in de agent: werkt `BatchMode` met `UseKeychain`?
- [ ] Brein in iCloud Drive met "Optimaliseer opslag": slaat zoeken bestanden die alleen online staan over,
      en blijven `AGENTS.md` en `knowledge/index.md` lokaal (plan §5.1.1)?

**Windows 11 (x64)**

- [ ] Worden de `.exe`'s en `.dll`'s van git getekend? `signExts` is nu `[".dll", ".node"]`; waarschijnlijk
      `.exe` erbij of de binaries van Git for Windows zoals geleverd laten (die zijn al getekend, controleren).
- [ ] Defender/SmartScreen bij de eerste git-aanroep uit de verpakte app.
- [ ] `GIT_SSH_COMMAND` naar `C:/Windows/System32/OpenSSH/ssh.exe`: clone, fetch, push.
- [ ] Agent-service uit (standaard) en aan; vergrendelde sleutel in en buiten de agent; sleutel die alleen
      in de agent van Git Bash zit.
- [ ] Junction voor `<config>/skills` zonder beheerdersrechten; kopie van `AGENTS.md`.
- [ ] File-watcher: hoe snel ziet de engine een nieuw `<config>/AGENTS.md` (ook op macOS)?
- [ ] OneDrive "Bestanden op aanvraag": zelfde vragen als iCloud hierboven.

**Beide, tegen echte hosts**

- [ ] github.com en gitlab.com met de meegeleverde host-sleutels; een eigen GitLab-server met onbekende
      host-sleutel (vingerafdruk-stap).
- [ ] De eigen foutteksten van GitHub/GitLab voor "repo bestaat niet", "geen schrijfrechten" en
      "beschermde branch" (plan §4.3), voor de tabel in §2.1.
