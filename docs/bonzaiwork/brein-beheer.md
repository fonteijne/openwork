# Een gedeeld brein beheren

Voor wie in een team een **gedeeld brein** opzet en beheert: een git-repo op GitHub of GitLab die
BonzaiWork per project bijhoudt. Hoe het werkt staat in [`project-breinen-plan.md`](./project-breinen-plan.md);
dit document is de praktijk.

Kort: een brein is een gewone private repo. BonzaiWork haalt hem op via SSH met de sleutels die je
collega's al hebben, haalt vóór elke chatbeurt het nieuwste op, en deelt na elke beurt wat de AI en de
gebruiker veranderden. Niemand hoeft git te kennen.

## 1. De repo aanmaken

1. Maak een **private** repo aan, op GitHub, GitLab.com of je eigen GitLab. Een naam als `sales-brein`
   werkt goed: BonzaiWork stelt die naam voor als projectnaam.
2. Laat hem **leeg** (geen README, geen `.gitignore`). De eerste collega die hem in BonzaiWork ophaalt,
   krijgt het breinsjabloon erin: `AGENTS.md`, `knowledge/` (OKF), `workflows/` (ICM), `_meta/`,
   `_templates/` en de standaardcommando's `/verwerk`, `/vastleggen`, `/onderhoud` en `/werkwijze`
   ([plan §6.1](./project-breinen-plan.md#61-structuur)).
   - Heeft de repo al inhoud, dan blijft die zoals hij is. Je kunt het sjabloon zelf toevoegen of het zo
     laten; BonzaiWork werkt ook met een gewone map Markdown.
3. De standaardbranch (meestal `main`) is wat iedereen deelt. BonzaiWork werkt nooit op andere branches,
   behalve als iemand bij een conflict "Bewaar mijn versie apart" kiest (§5).

## 2. Toegang

BonzaiWork gebruikt **alleen SSH**, nooit HTTPS, tokens of wachtwoorden. Het gebruikt de SSH van het
systeem met dezelfde sleutels, `~/.ssh/config` en ssh-agent (op een Mac ook de sleutelhanger) als de
terminal.

- **Iedereen heeft een SSH-sleutel bij zijn account nodig.** Op GitHub: Settings → SSH and GPG keys. Op
  GitLab: Preferences → SSH Keys. Een collega kan dit testen met `ssh -T git@github.com` of
  `ssh -T git@gitlab.com`; BonzaiWork doet hetzelfde met **"Verbinding testen"**.
- Een sleutel **met een wachtwoord** moet ontgrendeld zijn: in de macOS-sleutelhanger, de
  "OpenSSH Authentication Agent"-service op Windows, of `ssh-add`. Anders meldt BonzaiWork: "Je
  SSH-sleutel is vergrendeld".
- **Rechten** bepalen wat iemand kan:

  | Recht in de repo | In BonzaiWork |
  |---|---|
  | Lezen (GitHub *Read*, GitLab *Reporter*) | Ophalen en bijwerken; delen lukt niet, de status wordt "Alleen lezen" |
  | Schrijven (GitHub *Write*, GitLab *Developer*) | Alles, als de branch het toelaat (§3) |

- Collega's plakken gewoon de link uit hun browser (`https://gitlab.com/team/sales-brein`); BonzaiWork
  zet die om naar het SSH-adres.

### Eigen GitLab-server

De sleutels van `github.com` en `gitlab.com` zitten in de app. Een **eigen server** is de eerste keer
onbekend: BonzaiWork toont dan de vingerafdruk en vraagt de collega die te bevestigen. Geef je team de
juiste vingerafdruk vooraf, bijvoorbeeld in de uitnodiging:

```bash
ssh-keyscan -t ed25519 git.jouwbedrijf.nl 2>/dev/null | ssh-keygen -lf -
```

Verandert de sleutel van de server later (nieuwe server, herinstallatie), dan stopt BonzaiWork met
synchroniseren en zegt dat de server zich anders meldt. Dat is bewust: vertel je team vooraf dat het
komt en wat de nieuwe vingerafdruk is.

## 3. Branchbeveiliging

In de standaardmodus deelt BonzaiWork na elke beurt **rechtstreeks op de standaardbranch**. De branch
moet dat dus toelaten voor wie mag schrijven, en mag geschiedenis niet laten herschrijven.

**GitLab** (Settings → Repository → Protected branches, voor `main`):

- *Allowed to merge*: **Developers + Maintainers**
- *Allowed to push and merge*: **Developers + Maintainers**
- *Allowed to force push*: **uit**

**GitHub** (Settings → Branches of Rules → Rulesets, voor de standaardbranch):

- "Require a pull request before merging" kan, als het team de modus **"Als voorstel, na goedkeuring"**
  gebruikt (§3.1). Zonder die modus wordt iedereen dan "Alleen lezen".
- **Wel** "Block force pushes" en "Restrict deletions".
- Geen verplichte status checks of ondertekende commits: BonzaiWork ondertekent niet.

### 3.1 Delen als voorstel

In de modus **"Als voorstel, na goedkeuring"** (Projectinstellingen → Brein → Delen) gaat het werk van een
collega na elke beurt naar een eigen branch `bonzaiwork/<naam>/<datum>` met een merge request (GitLab)
of pull request (GitHub). Na goedkeuring en samenvoegen (ook "squash") volgt de map van die collega weer
het team. Geweigerde pushes op een beschermde branch bieden in de statuspil "Als voorstel delen" aan.

- **GitLab** (ook een eigen server): niets extra; het merge request ontstaat bij de push zelf.
- **GitHub**: BonzaiWork gebruikt de GitHub CLI (`gh`) die al op de laptop staat, met het account waarmee
  de collega daar is ingelogd. BonzaiWork bewaart zelf geen token. Eenmalig per laptop:

  ```bash
  brew install gh
  ```

  ```bash
  gh auth login
  ```

  Zonder `gh` pusht BonzaiWork de branch toch en toont "Voorstel maken" met een link naar GitHub om het
  pull request daar te openen. Een `gh` op een andere plek wijs je aan met `BONZAIWORK_GH`.

Wie alleen mag meelezen, geef je leesrechten, of zet je in BonzaiWork op **"Nooit (alleen lezen)"**
(Projectinstellingen → Brein → Delen).

Wordt de geschiedenis van de branch toch herschreven (een force push), dan stopt BonzaiWork bij iedereen
met bijwerken en delen, met de melding dat de gedeelde geschiedenis is herschreven. Er gaat niets
verloren: wat collega's daarna maakten, blijft lokaal staan. Zet als beheerder de vorige stand terug
(push de laatste goede commit opnieuw naar de branch); daarna kiest elke collega "Herstellen" in de
statuspil en loopt alles weer. Was het herschrijven bewust (bijvoorbeeld om een gelekt geheim te
verwijderen), dan zet elke collega de synchronisatie uit en haalt het brein opnieuw op als nieuw project.

## 4. Wat er wel en niet gedeeld wordt

Per beurt deelt BonzaiWork ([plan §4.3](./project-breinen-plan.md#43-vastleggen-en-versturen-per-beurt-b3)):

- nieuwe en gewijzigde **Markdown**-bestanden;
- wijzigingen aan bestanden die al gedeeld waren (bijvoorbeeld een script in een skill).

Niet vanzelf:

- **nieuwe bestanden die geen Markdown zijn** (een pptx, een afbeelding): de statuspil meldt ze;
- bestanden **groter dan 10 MB**: git is geen opslag voor grote bestanden;
- wat in `.gitignore` staat, en de `output/`-mappen van werkwijzen (resultaten per run);
- iets dat op een **geheim** lijkt (een API-sleutel, een privésleutel, een wachtwoord in een URL): dan
  stopt het delen voor die beurt met een melding, en blijft het bestand lokaal.

Elke wijziging staat in de geschiedenis op naam van de collega (Instellingen → Breinen → Naam in de
geschiedenis). Wat de AI schreef, heeft de chattitel als bericht, "Via BonzaiWork" en een
`BonzaiWork-Chat`-regel; wat iemand zelf aanpaste (in Obsidian of een editor), staat in een eigen commit.

## 5. Conflicten

Twee collega's die tegelijk hetzelfde bestand aanpassen, krijgen een conflict. Er gaat niets verloren:

- `knowledge/index.md` en `knowledge/log.md` geven nooit een conflict; BonzaiWork voegt die zelf samen.
- Voor andere bestanden ziet de collega een kaart "Jij en … wijzigden hetzelfde" met twee keuzes:
  - **"Laat de AI het samenvoegen"**: beide versies komen in het bestand en een nieuwe chat voegt ze samen
    zonder informatie te verliezen. Na die beurt deelt BonzaiWork het resultaat, op naam van de collega.
    Staat er na het samenvoegen iets in dat op een geheim lijkt, dan wordt het niet gedeeld.
  - **"Bewaar mijn versie apart"**: zijn versie gaat naar de branch `bonzaiwork/<naam>/<datum>`; de map
    volgt weer het team. Wat nog niet vastgelegd was, staat daarna ook als kopie in de map `_bewaard/<datum>/`
    van die collega (die map wordt nooit gedeeld).
- Als beheerder zie je die branches op GitHub of GitLab. Voeg ze samen of verwijder ze als ze verwerkt
  zijn.

## 6. Onderdelen die iets kunnen uitvoeren

Een brein kan meer dan kennis: `opencode.json` (verbindingen/MCP's), plugins in `.opencode/plugins/`,
agents en commando's die shell-opdrachten uitvoeren. Zulke onderdelen kunnen code draaien op de laptop
van je collega's. Daarom ([plan §7.1](./project-breinen-plan.md#71-vertrouwen-per-gebruiker-b5)):

- ze komen pas in de map als **elke collega zelf** "Toestaan" kiest; tot dan werken kennis en chatten al;
- verandert zo'n onderdeel later, dan vraagt BonzaiWork opnieuw;
- de AI kan zelf geen git gebruiken en `.git` niet aanpassen.

Houd ze dus klein en leg in de commit uit waarom ze er zijn. Gewone skills en commando's zonder
shell-opdrachten hebben geen toestemming nodig.

## 7. Problemen

| Melding in BonzaiWork | Wat het meestal is | Wat te doen |
|---|---|---|
| Je account heeft geen toegang tot dit brein | Geen rechten op de repo, of de SSH-sleutel staat niet bij het account | Rechten geven; sleutel toevoegen |
| Je SSH-sleutel is vergrendeld | Sleutel met wachtwoord, niet in de agent of sleutelhanger | Ontgrendelen of `ssh-add` |
| Dit brein bestaat niet (meer) op deze plek | Verkeerde link, of de repo is verplaatst | De nieuwe link geven; opnieuw ophalen |
| De server van dit brein meldt zich anders dan eerst | De host-sleutel is veranderd | Nagaan of dat klopt (§2); bij twijfel niet doorgaan |
| Alleen lezen | Leesrechten, of de branch staat directe push niet toe | §2 en §3 |
| Dit brein bevat een bestandsnaam die BonzaiWork niet veilig kan verwerken | Een naam met een regeleinde of een spatie aan het eind | Het bestand in de repo hernoemen; daarna werkt bijwerken weer |
| Deze repository is niet leeg en hoort niet bij dit brein | Een privérepo met andere geschiedenis gekoppeld aan "Mijn brein" | Een lege, private repo kiezen |
| Geen verbinding | Offline of server onbereikbaar | Niets; BonzaiWork deelt zodra het weer kan |

BonzaiWork levert zijn eigen git mee (git 2.56, zonder HTTPS-ondersteuning); collega's hoeven git niet te
installeren. Alleen SSH moet er zijn; dat zit standaard in macOS, Windows 10/11 en Linux.
