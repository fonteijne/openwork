# BonzaiWork: eerste alfa (`0.1.0-alpha.1`)

> **Wat.** Hoe we van een geteste `nightly`-commit een alfa maken die je met de hand aan testers geeft,
> wat testers moeten weten en wat er voor een volgende alfa of bèta nog moet gebeuren.
> Stand: 3 november 2026.

## 1. Beslissingen voor deze alfa

| # | Beslissing | Gevolg |
|---|---|---|
| A1 | **Inhoud:** de huidige `nightly`. Geen extra features: wat daar staat (projecten, chats, keys en voorkeursmodellen, Vandaag, breinen, routines, agenda, Feedback sturen) gaat mee. Meetings (werkstroom D) zijn nog niet gebouwd en zitten er dus niet in. | Geen feature-freeze-werk; alleen het releasepad en bekende beperkingen. |
| A2 | **Platform:** alleen macOS, Apple silicon (arm64). | De releaseworkflow bouwt alleen `mac-arm64`. Windows en Linux volgen later (zie §6). |
| A3 | **Tekenen:** geen Developer ID. De app wordt **ad hoc** getekend (`identity: "-"`), niet genotariseerd. | macOS waarschuwt bij de eerste start; testers moeten de app één keer toestaan (§4). Automatisch bijwerken werkt niet. |
| A4 | **Verspreiden:** met de hand (bijv. via een gedeelde map). Geen GitHub-release, geen updater-feed. | Een nieuwe alfa installeren testers zelf over de oude heen. Hun projecten, keys en instellingen blijven staan. |
| A5 | **Versie:** `0.1.0-alpha.N` in `apps/bonzaiwork/package.json`. De build gebruikt deze versie, niet de `0.0.0-dev` van upstream. | De versie staat in de bestandsnamen (`bonzaiwork-mac-arm64-0.1.0-alpha.1.dmg`), in Info.plist en in elk feedbackrapport. |

## 2. Eenmalig instellen

Settings → Secrets and variables → Actions van `fonteijne/openwork`:

| Soort | Naam | Nodig | Waarvoor |
|---|---|---|---|
| Secret | `BONZAIWORK_LITELLM_BASE_URL` | ja | De LiteLLM-URL die in de app komt (O3). Als secret, zodat hij niet in de logs van deze publieke repo staat. |
| Variable | `BONZAIWORK_DEFAULT_MODEL` | nee | Standaardmodel; zonder deze waarde is dat het eerste model van de key. |
| Variable | `BONZAIWORK_KEY_MODE` | nee | `user` (standaard) of `workspace` (O1 is nog open). |
| Variable | `BONZAIWORK_PREFERRED_MODELS` | nee | Komma-gescheiden. Zonder deze waarde geldt de ingebouwde lijst (M1). |

> **Let op, publieke repo.** De build uit de workflow is 14 dagen als artifact te downloaden, en bij een
> publieke repo kan in principe elke ingelogde GitHub-gebruiker dat. In de app zit de LiteLLM-URL, geen
> key: zonder key kan niemand iets met LiteLLM. Mag ook de URL niet uitlekken, bouw de alfa dan lokaal op
> een Mac (§3, stap 3b) en gebruik de workflow niet.

## 3. Een alfa uitbrengen

1. **Kies de commit.** Neem een commit op `nightly` waarop de BonzaiWork-CI groen is (typecheck, tests,
   engine-E2E, verpakte Linux-app met smoketest). Noteer de sha.
2. **Test die commit op een Mac**, vanuit een schone checkout (README, "Testen op `nightly`"), met de
   checklist in §5.
3. **Bouw.**
   - a. **Workflow:** zet de tag op precies die commit. De workflow **BonzaiWork release (macOS)** start
     vanzelf.

     ```bash
     git tag bonzaiwork-v0.1.0-alpha.1 <geteste-sha>
     ```

     ```bash
     git push origin bonzaiwork-v0.1.0-alpha.1
     ```

     Het tagvoorvoegsel `bonzaiwork-v` botst niet met de `v*`-tags van upstream. Klopt de tag niet met de
     versie in `apps/bonzaiwork/package.json`, dan stopt de workflow. Met de hand kan ook: Actions →
     **BonzaiWork release (macOS)** → **Run workflow** met de tag of sha.
     Uitkomst: artifact `bonzaiwork-0.1.0-alpha.1-mac-arm64` met de `.dmg`, de `.zip` en `SHA256SUMS.txt`.
   - b. **Lokaal op een Mac (arm64)**, vanuit dezelfde schone checkout:

     ```bash
     CSC_IDENTITY_AUTO_DISCOVERY=false BONZAIWORK_LITELLM_BASE_URL=<litellm-url> node apps/bonzaiwork/scripts/package.mjs --mac dmg zip --arm64 --publish never
     ```

     De bestanden staan in `apps/desktop/dist-electron/bonzaiwork/`.
4. **Controleer de build zelf**, op een Mac die BonzaiWork nog niet heeft (of met een nieuw macOS-account):
   installeer de `.dmg` zoals een tester dat doet (§4) en loop §5 in het kort na: starten, key koppelen,
   één chat, Feedback sturen.
5. **Deel** de `.dmg` en `SHA256SUMS.txt` met de testers, met de tekst van §4.
6. **Promoveer** dezelfde sha naar `main` (README, "Promoveren naar `main`"), zodat `main` de stand van de
   alfa is.
7. **Volgende alfa:** verhoog de versie in `apps/bonzaiwork/package.json` (`0.1.0-alpha.2`) via een PR naar
   `nightly`, en begin weer bij stap 1.

## 4. Voor testers

Plak dit bij de download.

> **BonzaiWork 0.1.0-alpha.1 (macOS, Apple silicon)**
>
> Dit is een vroege testversie. Werk niet met bestanden waarvan je geen kopie hebt.
>
> **Installeren**
> 1. Open `bonzaiwork-mac-arm64-0.1.0-alpha.1.dmg` en sleep **BonzaiWork** naar **Apps**.
> 2. Open BonzaiWork. macOS meldt dat het de ontwikkelaar niet kan controleren. Klik op **Gereed** (niet
>    op "Verplaats naar prullenmand").
> 3. Ga naar **Systeeminstellingen → Privacy en beveiliging**, scrol naar beneden en klik bij
>    BonzaiWork op **Open toch**. Bevestig met je wachtwoord of Touch ID. Dit hoeft maar één keer.
>
> Meldt macOS dat de app "beschadigd" is, voer dan in Terminal uit:
> `xattr -dr com.apple.quarantine /Applications/BonzaiWork.app` en open de app opnieuw.
>
> **Beginnen:** je hebt een LiteLLM-key nodig. Die krijg je van ons. De app vraagt er bij de eerste start
> om en bewaart hem in je sleutelhanger.
>
> **Iets gevonden?** Gebruik **Hulp → Feedback sturen** in de app. Die maakt een screenshot en opgeschoonde
> logs (zonder keys) en opent een ingevuld GitHub-issue. Let op: de repo is openbaar, dus zet er geen
> vertrouwelijke inhoud in.
>
> **Bijwerken:** de app werkt zichzelf niet bij. Een nieuwe testversie installeer je op dezelfde manier
> over de oude heen; je projecten, key en instellingen blijven staan.

## 5. Checklist vóór het delen (op een Mac, verpakte app)

Per regel: afvinken, met datum, sha en wie.

**Installeren en starten**
- [ ] De `.dmg` opent; slepen naar Apps; eerste start na **Open toch** lukt.
- [ ] **Hulp → Over BonzaiWork** toont `Versie 0.1.0-alpha.1`, en het feedbackformulier `BonzaiWork: 0.1.0-alpha.1`.
- [ ] Afsluiten en opnieuw openen: geen tweede waarschuwing, key nog gekoppeld (sleutelhanger).

**Kern**
- [ ] Onboarding toont de ingebakken LiteLLM-URL; een foute key wordt geweigerd, een goede gekoppeld.
- [ ] Project aanmaken op een map; alleen de voorkeursmodellen staan aan (M1).
- [ ] Chat met een bestandswijziging; Vandaag toont de chat; een vraag of toestemming kan beantwoord worden.
- [ ] Instellingen: key vervangen; ander model kiezen.

**Breinen, routines, agenda**
- [ ] Een gedeeld brein ophalen via ssh (vingerafdruk-stap) en één beurt die gedeeld wordt.
- [ ] Persoonlijk brein instellen.
- [ ] Een routine maken en met **Nu uitvoeren** starten.
- [ ] De agenda telt kwartieren na een paar beurten; export naar het boekdocument.

**Feedback en privacy**
- [ ] **Feedback sturen** slaat de map op in Downloads en opent het issue-formulier.
- [ ] In de logs van de feedbackmap staat geen key (`grep -r sk- ~/Downloads/BonzaiWork-feedback-*`).

## 6. Bekende beperkingen van deze alfa

Zet deze ook in de tekst voor testers als ze voor hen zichtbaar zijn.

| # | Beperking | Waarom | Wanneer |
|---|---|---|---|
| K1 | Alleen macOS arm64 | Windows is nooit gedraaid ([`windows.md`](./windows.md)); Linux alleen in CI | Windows na de handmatige test in `windows.md` §3; Intel-Macs als er vraag is (`--x64`) |
| K2 | Waarschuwing van macOS bij de eerste start | Geen Developer ID, niet genotariseerd (A3) | Zodra er een Apple Developer-account is: tekenen en notariseren in de releaseworkflow (upstream doet dat al in `build-electron-desktop.yml`) |
| K3 | Geen automatisch bijwerken | Geen feed (A4). De updater van upstream wijst nog naar `github.com/different-ai/openwork`; onze UI start nooit een controle | Vóór de eerste updater-feed: een hook in `apps/desktop/electron/updater.mjs` (README, "Bevindingen voor werkstroom C") |
| K4 | De DevTools-poort (CDP, 9223–9227) staat open op loopback | Upstream zet hem ook in verpakte builds aan; een ander lokaal proces kan de app besturen | Vóór een bredere uitrol: een hook om hem in verpakte builds dicht te zetten, met een uitzondering voor de smoketest (die stuurt de app via CDP) |
| K5 | Bij de eerste start kan een map **OpenWork Chat** in je thuismap verschijnen | Upstream maakt die aan bij een lege werkruimtelijst (`bootstrapFirstLaunchWorkspace`) | Branding (O5) |
| K6 | Meetings ontbreken | Werkstroom D is nog niet gebouwd | Na de alfa, achter een eigen flag |
| K7 | Een meerkeuzevraag met veel opties scrolt niet, dus je kunt niet alles invullen | fonteijne/openwork#22 | **Aanbevolen vóór het delen**: testers lopen hier snel tegenaan |
| K8 | Keys per gebruiker; per project is gebouwd maar niet de standaard | O1 is nog open | Beslissing O1 |

Alleen Linux en dus niet voor deze alfa: fonteijne/openwork#14 (feedback in de thuismap in plaats van
Downloads). De smoketest van de verpakte Linux-app slaagt op 3 november wel op die check; kijk na of het
issue dicht kan.

## 7. Na de alfa

Volgorde voor een volgende alfa of een bèta, de belangrijkste eerst:

1. Wat testers via Feedback sturen melden (label `feedback`).
2. K2: Apple Developer-account, tekenen en notariseren.
3. K3: eigen updater-feed (een privé-releaserepo of eigen host) met de updater-hook. Pas daarna kan
   `BONZAIWORK_PUBLISH_URL` (al in `electron-builder.bonzaiwork.mjs`) gezet worden.
4. K4: de CDP-poort dicht in verpakte builds.
5. K1: Windows (`windows.md` §3), daarna een Windows-job in de releaseworkflow.
6. O1, O5, en de overige punten uit de README, "Volgende stappen".
