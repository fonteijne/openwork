# Windows: wat nog niet getest is

BonzaiWork wordt gebouwd en getest op Linux (container en CI) en draait ook op macOS. Op Windows is niets
van de breinen, de meegeleverde git, de voorstellen of de routines ooit gedraaid. Dit document houdt bij
wat op Windows anders loopt, wat er dus ongetest is, en hoe het getest kan worden zodra iemand een
Windows-pc heeft. Het hoort bij [`project-breinen-plan.md`](./project-breinen-plan.md) en
[fase 0 §8](./project-breinen-fase0.md#8-nog-te-doen-op-echte-machines).

**Bijhouden.** Wie code schrijft met een `win32`-tak, een pad, een externe opdracht of iets anders dat
op Windows anders kan lopen, zet het hier in de tabel (§2) en houdt zich aan §4. Wie op Windows test,
vinkt af in §3 en zet de uitkomst erbij (datum, Windows-versie, x64 of arm64, gevonden fouten).

## 1. Wat wel gedekt is

Alleen logica die een `platform`-parameter krijgt, is met Windows-invoer getest, op Linux:

- `samePath` (`packages/bonzaiwork-brains/src/server-hooks.ts`): dezelfde map met gemengde slashes en een
  andere hoofdletter (`test/units.test.ts`).
- `bundledGit` (`src/git.ts`): de omgeving voor dugite op Windows (`test/units.test.ts`).
- `systemSshPath` en `sshCommand` (`src/ssh.ts`): het pad naar de OpenSSH van Windows en de aanhalingstekens,
  ook met een `'` in de gebruikersnaam; de melding bij een vergrendelde sleutel noemt de agent-service
  (`test/ssh.test.ts`).
- `isCloudFolder` (`src/personal.ts`): alleen OneDrive onder macOS (`~/Library/CloudStorage`), **niet** een
  Windows-pad als `C:\Users\…\OneDrive - Bedrijf`.
- `findGh` (`src/proposals.ts`): een expliciete `BONZAIWORK_GH`; de Windows-plekken niet.
- `fetch-git.mjs --target win32-x64`: download, checksum en uitdunnen zijn op Linux gedraaid op de echte
  Windows-tarball (uitkomst 52 MB, de MSYS-ssh weg, `usr/bin/sh.exe` er nog). De uitgedunde git zelf is
  **nooit gestart**.

Alles hieronder is dus niet getest.

## 2. Wat op Windows anders loopt

| # | Onderdeel | Wat de code op Windows doet | Waar | Risico als het niet klopt |
|---|---|---|---|---|
| W1 | Meegeleverde git starten | `cmd\git.exe`, met `ucrt64` (x64) of `clangarm64` (arm64) in `PATH` en `GIT_EXEC_PATH` | `src/git.ts` `bundledGit` | Breinen werken niet; dan de git van het systeem (als die er is) |
| W2 | Git voor arm64 | De mapnaam `clangarm64` is aangenomen, niet uit de tarball gelezen | `src/git.ts` | Idem, alleen op Windows-arm64 |
| W3 | Git uitdunnen | Weg: GCM, LFS, HTTPS-helpers, MSYS-`ssh*.exe`, `scp`, `sftp`; `sh.exe` blijft (git voert `GIT_SSH_COMMAND` via `sh` uit) | `scripts/bonzaiwork/fetch-git.mjs` | Een ontbrekende dll of een git die toch HTTPS of de MSYS-ssh pakt |
| W4 | `fetch-git.mjs` op een Windows-buildmachine | Pakt uit met de `tar` van Windows 10+; `du` bestaat niet, dus de grootte wordt "?"; de versiecontrole draait alleen bij dezelfde target | `fetch-git.mjs` | Script faalt op een Windows-buildmachine; vanaf Linux/macOS cross-bouwen met `BONZAIWORK_GIT_TARGET=win32-x64` werkt wel |
| W5 | Tekenen | `signExts` is `[".dll", ".node"]`: de `.exe`'s van git worden niet door ons getekend (die van Git for Windows zijn dat zelf al; nakijken) | `apps/desktop/electron-builder.base.yml` | SmartScreen of Defender houdt git tegen bij de eerste aanroep |
| W6 | SSH | `GIT_SSH_COMMAND` naar `%WINDIR%\System32\OpenSSH\ssh.exe`, met voorwaartse slashes en aanhalingstekens (`sh`), nooit de MSYS-ssh | `src/ssh.ts` `systemSshPath`, `sshCommand` | Geen verbinding, of een sleutel in de Windows-agent wordt niet gezien |
| W7 | SSH-agent | De service "OpenSSH Authentication Agent" staat standaard **uit**; een sleutel die alleen in de agent van Git Bash zit, zien wij niet; de melding noemt de service | `src/messages.ts` | Onduidelijke "geen toegang"-meldingen |
| W8 | Vergrendelde sleutel herkennen | Zoekt `Server accepts key` in `ssh -v`; alleen gemeten met OpenSSH op Linux | `src/ssh.ts` `checkConnection` | Verkeerde melding (geen toegang in plaats van vergrendeld) |
| W9 | Host-sleutels | Eigen `known_hosts` in userData; het pad gaat met voorwaartse slashes en aanhalingstekens naar ssh | `src/ssh.ts` `sshArguments` | Vingerafdruk-stap faalt bij een pad met spaties |
| W10 | Andere breinen dicht | `read:`/`edit:`-deny met het absolute pad, op Windows twee keer: `C:\…\Sales\*` en `C:/…/Sales/*`. Niet bekend is welke vorm (en welke hoofdletter van de schijf) de engine als resource gebruikt | `src/server-hooks.ts` `closedFolders` | Een chat kan toch in een ander brein lezen of schrijven, of (erger) een brein kan zichzelf niet lezen |
| W11 | Mappen herbouwen | `POST /api/location/reload` als de lijst gesloten mappen verandert, daarna de MCP's opnieuw registreren; open bestanden in een map kunnen op Windows vergrendeld zijn | `src/server-hooks.ts` `reloadFoldersWhenQuiet`, `apps/server/src/downstream-hooks.ts` `reloadEngineFolders` | Herbouw faalt en een nieuw brein blijft open voor reeds geopende mappen |
| W12 | Paden vergelijken | `samePath`: hoofdletterongevoelig en beide slashes, alleen bij het registreren na een clone | `src/server-hooks.ts` | Andere plekken vergelijken nog exact (zie §4) |
| W13 | Map voor een nieuw brein | De app bouwt `C:\…\BonzaiWork` + `/` + naam (gemengde slashes) | `apps/bonzaiwork/src/backend/live/index.ts` (`defaultFolder()` en de clone) | Map op een vreemde plek of een mislukte clone |
| W14 | Persoonlijk brein: geschiedenis buiten de map | `--git-dir` in userData (`%APPDATA%`), `--work-tree` de notitiemap, mogelijk op een andere schijf | `src/sync.ts` `initLocal` | Geen geschiedenis voor een vault op `D:\` |
| W15 | Skills in elke chat | Junction `<OPENCODE_CONFIG_DIR>\skills` naar de skills van het persoonlijke brein (geen beheerdersrechten nodig) | `apps/server/src/downstream-hooks.ts` `setEngineGlobalContext` | Persoonlijke skills ontbreken in chats |
| W16 | Atomisch opslaan | Schrijven naar een tijdelijk bestand, dan `rename` over het oude; op Windows kan dat `EPERM` geven als een virusscanner het bestand open heeft | `src/registry.ts`, `src/server-hooks.ts` (voorstellen), `bonzaiwork-routines/src/routines.ts` | Instellingen of routines worden niet opgeslagen |
| W17 | Regeleinden | Gebundelde git met `core.autocrlf=false`; notities met CRLF (Kladblok) gaan zo de geschiedenis in. De OKF-frontmatter leest CRLF; de werkwijze- en ICM-lezers splitsen op `\n` en laten een `\r` staan | `src/okf.ts`, `src/icm.ts`, `src/workflows.ts` | Gemengde regeleinden in een team; een stapcontract dat net niet herkend wordt |
| W18 | Bestandsnamen | `:`, `?`, `*` en namen als `CON` mogen niet; een repo van een Mac-collega kan ze bevatten; paden langer dan 260 tekens | git-checkout in `src/sync.ts` | Clone of bijwerken faalt voor iedereen op Windows |
| W19 | OneDrive "Bestanden op aanvraag" | Zoeken slaat bestanden die alleen online staan niet expliciet over | `src/mcp.ts` (zoeken), `src/personal.ts` | Zoeken haalt de hele vault binnen of hangt |
| W20 | `gh` vinden | `PATH` (met `;`), daarna `%ProgramFiles%\GitHub CLI\gh.exe` en `%LOCALAPPDATA%\Programs\GitHub CLI\gh.exe` | `src/proposals.ts` `findGh` | Geen pull request, alleen de link "Voorstel maken" |
| W21 | `gh` starten | Een eigen, kleine omgeving (geen `GIT_*`); of `gh` zo zijn login vindt (Windows Credential Manager) is niet bekend | `src/proposals.ts` `ghEnvironment` | Idem |
| W22 | Routines en tijdzones | Tijdzone van het apparaat via `Intl`; Windows-zonenamen worden IANA | `apps/bonzaiwork/src/lib/schedule.ts` | Routine op het verkeerde uur |
| W23 | Paden in de UI | De kennisnotitie en `fileName()` gaan uit van `/`; een pad met `\` vindt het concept niet | `apps/bonzaiwork/src/features/brain/concept-facts.tsx` | "Klopt" en de vertrouwensregel ontbreken bij een notitie |

## 3. Handmatige test

Met een build uit CI (`package.mjs` met `BONZAIWORK_GIT_TARGET=win32-x64`, of een Windows-runner) op
Windows 11 x64. Per regel: afvinken, met datum en uitkomst.

**Git en de verpakte app (W1–W5)**

- [ ] De verpakte app start git uit `resources\git` (`git --version` in de log van de breinen).
- [ ] Geen SmartScreen- of Defender-melding bij de eerste clone; anders `.exe` aan `signExts` toevoegen.
- [ ] `git ls-remote https://…` faalt (geen HTTPS in de bundel).
- [ ] Op een Windows-buildmachine: `node scripts/bonzaiwork/fetch-git.mjs` slaagt.
- [ ] Windows-arm64: de mapnaam `clangarm64` klopt (W2).

**SSH (W6–W9)**

- [ ] "Verbinding testen" en clonen tegen github.com, gitlab.com en een eigen GitLab-server (vingerafdruk).
- [ ] Agent-service uit, sleutel zonder wachtwoord: werkt.
- [ ] Agent-service uit, sleutel met wachtwoord: melding noemt de service.
- [ ] Agent-service aan, sleutel met `ssh-add` toegevoegd: werkt.
- [ ] Sleutel alleen in de agent van Git Bash: melding is begrijpelijk.
- [ ] Gebruikersnaam met een spatie (`C:\Users\Anna de Vries`): `known_hosts` en clone werken.
- [ ] OpenSSH-client verwijderd (Optionele onderdelen): "Verbinding testen" zegt dat en hoe je hem aanzet.

**Breinen (W10–W14)**

- [ ] Een chat in project X kan met `read`/`write` niet in `C:\…\BonzaiWork\Sales` (ook niet via
      `..\Sales\…`); een chat in Sales leest zichzelf wel, ook met het volle pad. Zet in de log welke
      resource de engine noemt (backslashes? hoofdletter van de schijf?) en pas `closedFolders` daarop aan.
- [ ] Een nieuw brein registreren terwijl een ander project open is: daarna is het nieuwe brein ook vanuit
      dat project dicht (herbouw, W11).
- [ ] "Uit een gedeeld brein" met de standaardmap: het project opent op de juiste map (W12, W13).
- [ ] Persoonlijk brein op `D:\Notities`: vastleggen, geschiedenis, terugzetten (W14).
- [ ] Een persoonlijke skill werkt in een chat in een ander project (W15).
- [ ] Een repo met een bestand `vraag?.md` of een heel lang pad: duidelijke melding, de rest werkt (W18).
- [ ] Een notitie met CRLF uit Kladblok: OKF-controle, index en log kloppen; een stapcontract met CRLF wordt
      herkend (W17).

**Overig (W16, W19–W23)**

- [ ] Instellingen en routines overleven een herstart, ook met Defender aan (W16).
- [ ] Vault in OneDrive met bestanden op aanvraag: zoeken blijft snel en haalt niets binnen (W19).
- [ ] `winget install GitHub.cli` + `gh auth login`: "Als voorstel delen" maakt een pull request (W20, W21).
- [ ] Een routine om 9:00 draait om 9:00 lokale tijd, ook na de overgang naar zomertijd (W22).
- [ ] Een kennisnotitie openen uit de zijbalk: "Klopt" staat erbij (W23).

## 4. Regels voor verdere ontwikkeling zonder Windows-machine

1. **Geef `platform` mee** aan elke functie die op Windows anders werkt (zoals `bundledGit`,
   `systemSshPath`, `samePath`, `findGh`), en test die met Windows-invoer op Linux. Lees
   `process.platform` alleen aan de rand.
2. **Paden**: bouw ze met `node:path` (`join`, `resolve`), niet met `/`; vergelijk mappen met `samePath`;
   toon of match een bestandsnaam via `split(/[\\/]/)`. Een pad dat naar git gaat, mag `/` gebruiken.
3. **Geen POSIX-gereedschap** in productiecode (`sh`, `du`, `chmod`, `find`). Wel in testscripts, dan met een
   melding dat ze op Windows niet draaien. `tar` alleen in de buildscripts.
4. **Externe programma's** (`git`, `ssh`, `gh`): altijd met een volledig pad of een uitdrukkelijke
   zoeklijst, nooit met `shell: true`, en met `windowsHide: true`.
5. **Regeleinden**: lees Markdown met `/\r?\n/`, niet met `"\n"`; schrijf wat de app zelf maakt met `\n`.
6. **Bestandsrechten** (`mode: 0o600`) doen op Windows niets; vertrouw er niet op voor geheimen.
7. **Opslaan met `rename`**: verwacht `EPERM`/`EBUSY` op Windows; een poging opnieuw na een korte pauze
   is beter dan een fout. Nog niet gebouwd (W16).
8. **Elke nieuwe Windows-afwijking** krijgt een rij in §2 en, als hij te testen is, een regel in §3.

## 5. Aanbevolen: een Windows-job in CI

GitHub Actions heeft `windows-latest`-runners. Zonder eigen Windows-pc dekt een job daar het grootste deel
van W1, W3, W4, W12, W14, W16–W18 en W20:

- `pnpm install`, dan de unit-tests van `@bonzaiwork/brains`, `@bonzaiwork/routines` en de app;
- `node scripts/bonzaiwork/fetch-git.mjs` (op Windows zelf, met de versiecontrole) en daarna de sync-tests
  met `BONZAIWORK_GIT_DIRECTORY` (zoals de Linux-job doet);
- `package.mjs --dir --win` en een smoketest van de verpakte app.

Niet gedekt: de Windows-agent en sleutels met wachtwoord (W7, W8), SmartScreen (W5), OneDrive (W19) en de
e2e tegen de engine, die op Windows eerst een eigen opzet nodig heeft. Die job is nog niet gebouwd: een
nieuwe job die rood begint, moet eerst lokaal of in een aparte branch op groen komen.
