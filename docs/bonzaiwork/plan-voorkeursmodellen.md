# Implementatieplan: voorkeursmodellen in projectinstellingen

Issue: [fonteijne/openwork#7](https://github.com/fonteijne/openwork/issues/7) · Stand: plan, nog niet gebouwd. Open vragen beantwoord op 2026-10-30.

## Doel

Susan (niet-technisch) wil niet nadenken over welke modellen aanstaan. Daarom:

1. **Schakelaar "Alle modellen van de key" aan = alles aangevinkt en vergrendeld.** Een vinkje uitzetten kan dan niet.
2. **Schakelaar uit = alles uitgevinkt.** Daarna vinkt ze met de hand aan wat ze wil.
3. **Knop "Voorkeursmodellen aanzetten"** (alleen bij schakelaar uit) vinkt precies de vijf voorkeursmodellen aan en de rest uit.
4. **Nieuwe projecten starten met alleen de voorkeursmodellen.** De rest zet ze aan in de projectinstellingen.

Dit gedrag is afgestemd met de opdrachtgever op 2026-10-30 (zie "Beantwoorde vragen", V5–V6).

De voorkeursmodellen zijn deze vijf LiteLLM-model-id's (V1, V2). Er zijn er niet meer:

| Model | LiteLLM-id |
|---|---|
| GPT-6 Luna | `gpt-6-luna` |
| GLM 5 | `glm-5` |
| GLM 4.7 Flash | `glm-4.7-flash` |
| Qwen 3.8 27B | `qwen3.8-27b` |
| Gemini 3.8 Flash | `gemini-3.8-flash` |

## Hoe het nu werkt

| Onderdeel | Plek | Gedrag nu |
|---|---|---|
| Modellijst + schakelaar | `apps/bonzaiwork/src/features/settings/project-settings.tsx` (`KeySection`) | Schakelaar uit → `allowedModels` wordt **alle** model-id's. Een vinkje uitzetten mag niet als het het laatste is (`if (next.length)`). |
| Opslag | `Project.allowedModels` (`backend/types.ts`), `ProjectMeta` (`backend/live/meta.ts`, contract §7.1) | `null` = alle modellen van de key, inclusief modellen die later bijkomen; anders een lijst model-id's. |
| Filteren | `projectModels()` / `startModel()` in `backend/queries.ts` | Composer, chat, project-home en routine-editor gebruiken alleen de modellen uit deze lijst. |
| Nieuw project | `features/projects/new-project-dialog.tsx` → `backend.projects.create` (demo + live) | `allowedModels` is altijd `null`. In `keyMode=workspace` wordt de key **na** het aanmaken gekoppeld. |
| Modellen van LiteLLM | `packages/bonzaiwork-litellm/src/server-hooks.ts` → `GET /bonzaiwork/status` | `models` (één lijst voor alle keys samen) en `defaultModel`. |
| Ingebakken instellingen | `packages/bonzaiwork-policy/src/index.ts` (`readSettings`), `apps/bonzaiwork/desktop-main/main.ts`, `scripts/build-electron-entry.mjs` | `BONZAIWORK_LITELLM_BASE_URL`, `BONZAIWORK_KEY_MODE`, `BONZAIWORK_DEFAULT_MODEL`. |

## Beslissingen in dit plan

| # | Beslissing | Waarom |
|---|---|---|
| B1 | De voorkeurslijst bestaat uit **LiteLLM-model-id's**, niet uit weergavenamen. | Namen verschillen per LiteLLM-config. Alleen id's matchen betrouwbaar. |
| B2 | De lijst staat als standaard in `@bonzaiwork/policy` (`PREFERRED_MODEL_IDS`). Een build kan hem overschrijven met `BONZAIWORK_PREFERRED_MODELS` (komma-gescheiden), zoals `BONZAIWORK_DEFAULT_MODEL`. | Dit volgt O3 (instellingen worden in de build ingebakken). Er komt geen nieuwe UI voor beheer. De LiteLLM-config ligt buiten onze invloed, dus een vlag in LiteLLM valt af (V3). |
| B3 | De server geeft de lijst door in `GET /bonzaiwork/status` als `preferredModels: string[]`, ongefilterd en in de ingestelde volgorde. | De UI leest één bron. Het filteren tegen de key gebeurt bij het lezen, net als bij `allowedModels`. |
| B4 | `allowedModels: []` wordt een geldige toestand: "nog niets gekozen". `null` blijft "alle modellen van de key". | Nodig voor de flow "alles uitvinken, dan zelf aanvinken". |
| B5 | Een project zonder bruikbaar model is **geblokkeerd, geen fout** (DESIGN C5/P4). Composer en routine-editor tonen dan "Geen modellen gekozen" met de actie "Modellen kiezen" naar de projectinstellingen. | Een lege lijst mag nooit tot een stille fout bij het versturen leiden. |
| B6 | Nieuwe projecten krijgen `allowedModels = preferredModels` (de ingestelde id's). Is de lijst leeg, dan blijft het `null`. | Dit werkt ook als de key pas later gekoppeld wordt: het filteren gebeurt bij het lezen. |
| B7 | Bestaande projecten blijven zoals ze zijn: geen migratie (V4). Ze houden "Alle modellen van de key" (`null`). De gebruiker zet zelf de schakelaar uit en kiest "Alleen voorkeursmodellen". | Stilletjes modellen weghalen die iemand gebruikt, breekt lopende chats en routines. |

## Stappen

### 1. Policy: voorkeurslijst (`packages/bonzaiwork-policy`)

- `src/index.ts`
  - `export const PREFERRED_MODEL_IDS: readonly string[] = ["gpt-6-luna", "glm-5", "glm-4.7-flash", "qwen3.8-27b", "gemini-3.8-flash"]`.
  - `BonzaiworkSettings` krijgt `preferredModels: string[]`.
  - `readSettings`: `BONZAIWORK_PREFERRED_MODELS` splitsen op `,`, trimmen, lege waarden en dubbele id's weghalen, de volgorde houden. Niet gezet → `PREFERRED_MODEL_IDS`. Een lege string (`""`) betekent bewust geen voorkeur → `[]`.
  - Helper `pickPreferredModels(models, preferred)`: de doorsnede, in de volgorde van `preferred`. Puur en getest.
- `test/policy.test.ts`: tests voor de standaard, de override, trimmen/dedupe, de lege string en de doorsnede.

### 2. Build en Electron-entry

- `apps/bonzaiwork/scripts/build-electron-entry.mjs`: `BONZAIWORK_PREFERRED_MODELS` als optionele ingebakken waarde (docblock + doorgeven).
- `apps/bonzaiwork/desktop-main/main.ts`: de waarde doorgeven aan de server-env, zoals `BONZAIWORK_DEFAULT_MODEL` (alleen als hij gezet is).
- `docs/bonzaiwork/README.md`: de variabele toevoegen bij de ingebakken instellingen.

### 3. Server: status (`packages/bonzaiwork-litellm`)

- `src/server-hooks.ts` → `status()`: `preferredModels: settings.preferredModels` toevoegen.
- `test/proxy.test.ts`: de status bevat `preferredModels`, en dat werkt in beide key-modi.
- `docs/bonzaiwork/frontend-contract.md` §5.5 en §7.1: `preferredModels` documenteren en de betekenis van `[]` toevoegen naast `null`.

### 4. Frontend-backendlaag (`apps/bonzaiwork/src/backend`)

- `types.ts`
  - `AppStatus.preferredModels: string[]`.
  - `NewProjectInput.allowedModels: string[] | null`.
  - Het commentaar bij `Project.allowedModels` wordt: `null = every model of the key; [] = none chosen yet`.
- Nieuwe pure module `models.ts` (met `models.test.ts`). Daarin komen `projectModels` en `startModel` uit `queries.ts`, plus:
  - `preferredIn(status)`: de id's uit `preferredModels` die de key biedt.
  - `hasNoModels(status, project)`: true bij een key met modellen maar een lege doorsnede.
  
  `queries.ts` exporteert deze functies opnieuw, zodat bestaande imports blijven werken.
- `live/index.ts`
  - `readStatus`: `preferredModels: strings(field(payload, "preferredModels"))`.
  - `projects.create`: `allowedModels` meesturen in de eerste `meta.patch`.
- `live/meta.ts`: `readMeta` neemt `[]` al over (`Array.isArray`). Een test in `live/meta.test.ts` legt vast dat `[]` niet terugvalt naar `null`.
- `demo/seed.ts` + `demo/index.ts`
  - `DEMO_MODELS` uitbreiden met de vijf voorkeursmodellen (echte id's uit de tabel bovenaan, met de weergavenamen erbij). De bestaande modellen blijven en dienen als "overige".
  - Demo-state krijgt `preferredModels`.
  - `projects.create` neemt `input.allowedModels` over. De audit-regel noemt de modelkeuze.
  - Demo-schakelaar `?voorkeur=geen` simuleert een key zonder voorkeursmodellen, voor de geblokkeerde staat.

### 5. Projectinstellingen: modelsectie (`features/settings/project-settings.tsx`)

Volg DESIGN S2 (compacte rijen), P3 (meer tonen pas als de schakelaar uit staat), C1 (werkwoord eerst) en P5 (bestaande `Button`, `Row`, `Switch`).

De drie toestanden van de lijst:

| Toestand | `allowedModels` | Vinkjes | Knop "Voorkeursmodellen aanzetten" |
|---|---|---|---|
| Schakelaar aan | `null` | Alle aangevinkt en vergrendeld (`disabled`, gedimd). Zo werkt het nu al. | Verborgen |
| Schakelaar net uitgezet | `[]` | Alle uitgevinkt, met de hand aan te vinken | Zichtbaar |
| Met de hand gekozen of na de knop | lijst id's | Precies die id's aangevinkt | Zichtbaar |

- **Schakelaar aan → `setAllowed(null)`**, zoals nu. Alle vinkjes staan aan en zijn vergrendeld. Ook modellen die de key later krijgt, doen mee.
- **Schakelaar uit → `setAllowed([])`** in plaats van alle id's: alles uitgevinkt.
- **Knop "Voorkeursmodellen aanzetten"**: een `quiet`-knop rechts in een rij onder de schakelaar. Alleen zichtbaar als de schakelaar uit staat (P3).
  - Klikken → `setAllowed(preferredIn(status))`. Dat **vervangt** de selectie: de vijf voorkeursmodellen gaan aan, alle andere uit.
  - Uitgeschakeld met een tooltip "Deze key biedt geen voorkeursmodellen" als de key er geen van biedt (P4). Biedt de key er maar een paar, dan gaan alleen die aan.
  - Na het klikken een toast "Voorkeursmodellen aangezet" (C2).
- Er komt geen knop "Alles uitvinken" en geen knop "Alles aanvinken" (V5, V6). Opnieuw beginnen gaat via schakelaar aan en weer uit.
- Het vinkje mag nu ook het laatste model uitzetten: de guard `if (next.length)` gaat weg.
- **Lege selectie** (`allowed` is `[]` of de doorsnede is leeg): onder de lijst één regel in neutrale inkt, "Nog geen model gekozen. Vink minstens één model aan om te chatten." (C5/C6, geen rood).
- **Voorkeursmodellen herkenbaar maken:** een klein label "Voorkeur" rechts naast de naam (neutrale token, geen kleuraccent). Het model-id blijft verborgen op smalle schermen, zoals nu. De volgorde van de lijst blijft die van de key, zodat er niets verspringt.
- De `Select` voor het standaardmodel blijft filteren op de gekozen modellen. Als het huidige standaardmodel wegvalt, toont de select "Eerste beschikbare model" (bestaand gedrag van `startModel`).
- Copy in `copy.ts` (`settings`): `allowedPreferred` ("Voorkeursmodellen aanzetten"), `allowedPreferredUnavailable`, `allowedPreferredDone`, `allowedEmpty`, `preferredBadge`.

### 6. Nieuw project (`features/projects/new-project-dialog.tsx`)

- `allowedModels: status.data?.preferredModels.length ? status.data.preferredModels : null` meegeven aan `create` (B6).
- Standaardmodel: valt `status.defaultModel` buiten de voorkeurslijst, dan is het eerste voorkeursmodel dat de key biedt de start, of `null`. Zo verwijst het nieuwe project niet direct naar een uitgezet model.
- Geen nieuwe controls in de dialoog: de keuze is "standaard goed" en aan te passen in de instellingen (P3).

### 7. Geblokkeerde staat in chat en routines

- `features/chat/composer.tsx`, `chat-view.tsx`, `project-home.tsx`: als `hasNoModels(...)` geldt, wordt versturen geblokkeerd met een `Locked`-melding "Geen modellen gekozen" en de knop "Modellen kiezen" (→ `navigate({ name: "project-settings", projectId, section: "key" })`).
- `features/routines/routine-editor.tsx`: dezelfde melding in plaats van een lege modelkeuze.
- Het onderscheid met "geen key" (`projectHasKey`) blijft: die melding gaat voor.

### 8. Verificatie

- `pnpm --filter @bonzaiwork/policy test`, `pnpm --filter @bonzaiwork/litellm test`, `pnpm --filter @bonzaiwork/app test` en `typecheck` voor alle drie.
- **Headless UI-check** in demomodus (`pnpm --filter @bonzaiwork/app dev`, headless Chrome via Playwright), met screenshots voor de PR (DESIGN P10):
  1. Schakelaar aan → alle vinkjes aan en vergrendeld, knop verborgen.
  2. Schakelaar uit → alles uitgevinkt + de lege-selectie-regel + de knop.
  3. Eerst een ander model met de hand aanvinken, daarna "Voorkeursmodellen aanzetten" → precies de vijf vinkjes, het andere model weer uit, plus de toast.
  4. Key zonder voorkeursmodellen (`?voorkeur=geen`) → knop uitgeschakeld met tooltip.
  5. Composer met de geblokkeerde staat "Geen modellen gekozen".
  6. Nieuw project → instellingen tonen alleen de voorkeursmodellen aangevinkt.
- Een live check tegen een echte LiteLLM (macOS): biedt `GET /v1/models` de vijf id's precies zo? Lokale tests bewijzen niet dat de id's kloppen.

### 9. PR

- Eén PR met stappen 1 t/m 7. Geen feature flag: het gaat om een kleine UI-aanpassing en een standaardwaarde (AGENTS.md: "never flag additive UI, polish").
- In de PR-tekst: de DESIGN-regels S2, P3, P4, P5, C1, C2, C5 en C6, plus de screenshots uit stap 8.

## Beantwoorde vragen

| # | Vraag | Antwoord |
|---|---|---|
| V1 | Wat zijn de exacte LiteLLM-model-id's? | `gpt-6-luna`, `glm-5`, `glm-4.7-flash`, `qwen3.8-27b`, `gemini-3.8-flash` (tabel bovenaan). |
| V2 | Ontbreekt er een model (de nummering in het issue sloeg 2 over)? | Nee, deze vijf zijn alle voorkeursmodellen. |
| V3 | Moet de lijst zonder nieuwe build te wijzigen zijn, bijvoorbeeld via LiteLLM's `model_info`? | Nee. De lijst zit in de build (B2). De LiteLLM-config ligt buiten onze invloed. |
| V4 | Moeten bestaande projecten naar de voorkeursmodellen? | Nee, geen migratie (B7). Ze houden "Alle modellen" en de gebruiker kiest zelf. |

| V5 | Is een knop "Alles aanvinken" nodig? | Nee. Schakelaar aan zet alles aan en vergrendelt de vinkjes. |
| V6 | Hoe werken schakelaar en knop samen? | Aan: alles aan en vergrendeld. Uit: alles uit, met de hand aan te vinken. "Voorkeursmodellen aanzetten": alleen de vijf aan. Geen knop "Alles uitvinken". |
