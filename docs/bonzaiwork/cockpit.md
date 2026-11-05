# De cockpit: de nieuwe interface van BonzaiWork

BonzaiWork opent nu als een **beslissingsgerichte cockpit**: één plek waar staat wat alleen jij kunt
beslissen, wat de agent voor je doet en wat er de app verlaat. De interface volgt het ontwerpcanvas
"Personal agent app: decision-first cockpit", variant **v2** (de huisstijl van iodigital.com), en
vervangt de vorige UI van `apps/bonzaiwork` op dezelfde plek. Er is geen feature flag: deze app is
van de fork zelf, en de opdracht was de interface te vervangen.

## Vormgeving

- **Tokens** (`apps/bonzaiwork/src/styles.css`): wit en warm grijs (`#f4f4f2`) als banden in plaats
  van randen, bijna-zwarte inkt, één accentblauw (`#365fd9`) voor de primaire actie, links en focus,
  een donkere variant. De bestaande semantische namen (`--background`, `--muted`, `--primary`) wijzen
  naar de iO-waarden, zodat bestaande schermen meekomen; nieuwe schermen gebruiken de iO-namen
  (`bg-surface-alt`, `text-ink-muted`, `border-line`, `rounded-panel`).
- **Letters**: Manrope voor alles, Instrument Serif cursief voor het ene accentwoord in een
  paginatitel (`<Accent>`).
- **Paginagrammatica** (`apps/bonzaiwork/src/components/io.tsx`): een hero (bovenkop, titel van 56px,
  intro, acties rechtsonder), daarna banden op een kolom van 1360px; beslissingen in een zwart paneel;
  lijsten als rijen met haarlijnen; status als woord met icoon in een pil.
- **Schil** (`features/shell/top-nav.tsx`, `status-footer.tsx`): bovenbalk met Vandaag · Agent · Inbox
  · Projecten · Runs · Bibliotheek, zoeken (⌘K), Activiteit, Instellingen en het accountmenu; onderaan
  een donkere statusregel. Op een telefoon een donkere tabbalk (Vandaag · Agent · Vastleggen · Inbox · Runs).

Waar het ontwerp en `DESIGN.md` botsen over het uiterlijk (hoofdletter-bovenkoppen, pijlen achter
links, grote titels) volgt de app het ontwerp. De gedragsregels van `DESIGN.md` gelden wel: echte
knoppen en links, focusringen, laad-, lege-, fout- en vergrendelde staten, ongedaan maken boven
bevestigen, en toestemming die actie, gegevens en risico noemt.

## Schermen

| Ontwerp | Route | Component |
|---|---|---|
| Today | `#/` | `features/today/today-page.tsx` |
| Day plan | `#/vandaag/plan` | `features/today/plan-page.tsx` |
| Quick capture | dialoog (Vastleggen) | `features/today/capture-dialog.tsx` |
| Mobile | `#/` op telefoonbreedte | `features/today/today-page.tsx` + tabbalk |
| Inbox triage | `#/inbox` | `features/inbox/inbox-page.tsx` |
| Agent: personal chats, Conversation | `#/agent[/c/:chat]` | `features/agent/agent-page.tsx` |
| Command palette | ⌘K | `features/shell/command-palette.tsx` |
| Projects | `#/projecten` | `features/projects/projects-page.tsx` |
| Project home, tabbladen | `#/p/:id[/todos\|runs\|chats\|uitvoer\|bronnen\|besluiten\|activiteit]` | `features/project/project-page.tsx` |
| Project chat met runkaart | `#/p/:id/c/:chat` | `features/project/…` + `features/chat/*` |
| New project | `#/projecten/nieuw[/:project/:chat]` | `features/projects/new-project-page.tsx` |
| Edit project | `#/p/:id/bewerken` | `features/project/…` |
| Complete a project | `#/p/:id/afronden` | `features/project/…` |
| Runs | `#/runs` | `features/runs/runs-page.tsx` |
| Run detail + stage review, Interrupted run | `#/runs/:id` | `features/runs/run-page.tsx` |
| Delegate | `#/delegeren[/:todo]` | `features/runs/delegate-page.tsx` |
| Approval R4 (versturen), R3 (delen) | `#/goedkeuring/:id` | `features/approvals/approval-page.tsx` |
| Library, plank, pagina | `#/bibliotheek`, `/plank/:id`, `/pagina/:id` | `features/library/*` |
| Library change review | `#/bibliotheek/voorstel/:id` | `features/library/proposal-page.tsx` |
| Activity + sent log | `#/activiteit[/verzonden]` | `features/activity/activity-page.tsx` |
| Settings: connections and keys | `#/instellingen` (`verbindingen`) | `features/settings/app-settings.tsx` |
| Settings: agent and permissions | `#/instellingen/agent` | `features/settings/…` |
| Settings: workspaces | `#/instellingen/werkwijzen` | `features/settings/…` |
| Onboarding | `#/welkom` | `features/onboarding/onboarding.tsx` |

De bestaande onderdelen blijven bereikbaar: Bestanden, Routines, Brein en Instellingen als tabbladen
van een project, `#/routines`, `#/brein`, het agendapaneel (⌘J of het accountmenu) en de oude
instellingengroepen als routes.

## Gegevens: demo en live

Alle cockpitschermen praten met `Backend.cockpit` (`apps/bonzaiwork/src/backend/cockpit.ts`), met
hooks in `backend/cockpit-queries.ts`.

| Onderdeel | Demo (`backend/demo/cockpit*.ts`) | Live (`backend/live/cockpit.ts`) |
|---|---|---|
| Heeft jou nodig | runs die wachten, vragen, goedkeuringen | toestemmingen, vragen, vastgelopen chats en routines van de server |
| To-do's, wachten-op, vastleggen | ja | op dit apparaat (localStorage), tot de server routes heeft |
| Inbox | mail, vastgelegd, agentvoorstellen | alleen vastgelegd; mail staat op slot |
| Dagplanning | voorstel met agendablokken | eenvoudig, uit de to-do's |
| Runs | runs met stappen, controles, vragen, herstel | routines en lopende chats (zonder stappen) |
| Delegeren | brief met werkwijze, context en limieten | start een chat in het project met de brief |
| Goedkeuringen, verzendlog | versturen met 20 s wachttijd en ongedaan maken | op slot (Outlook-koppeling ontbreekt) |
| Bibliotheek | planken, pagina's, voorstellen, vragen | op slot (bibliotheekroutes ontbreken) |
| Activiteit | log met wie en waarop gebaseerd | het auditlog van de projecten |
| Projectbrief (gebied, doel, klaar als) | ja | op dit apparaat |

Wat op slot staat, blijft zichtbaar met de reden (`CockpitCapabilities`, `DESIGN.md` P4).

De demo vertelt één verhaal rond de bestaande demoprojecten: offertes voor Bakkerij Van Dijk, de
klantenservice, de financiën. Alle namen zijn verzonnen; de voorbeeldnamen uit het ontwerp zijn
vervangen. "Workspace" uit het ontwerp heet in de app **werkwijze**; de LiteLLM-key heet **modelkey**
of **projectkey** (zie `copy.test.ts`).

## Copy

Nieuwe teksten staan per onderdeel in `apps/bonzaiwork/src/copy/*.ts`; `copy.test.ts` controleert ze
samen met `copy.ts`.
