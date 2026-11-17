# Process

* [Releasestroom](release-stroom.md) - Upstream-release → upstream-sync/<tag> → nightly → main; werk → nightly → main. CI draait één keer per wijziging en slaat documentatie over.

# System

* [Agenda](agenda.md) - Meet per kwartier waaraan je in BonzaiWork werkte, zonder model, en maakt een boekdocument dat een gewone chat in Bridge kan omzetten.
* [BonzaiWork in één schema](overzicht.md) - Eigen UI en Electron-entry boven een ongewijzigde OpenWork-server, met BonzaiWork-logica in server-hooks en LiteLLM als enige provider.
* [Breinen](breinen.md) - Git-repo's met gedeelde kennis (OKF) en werkwijzen (ICM); BonzaiWork werkt ze bij vóór een beurt en legt ze vast na een beurt, in code.
* [De BonzaiWork-app](ui-app.md) - React-app in apps/bonzaiwork met één Backend-interface en twee implementaties (live en demo); importeert niets uit de upstream-UI.
* [Engine v2](engine-v2.md) - De UI praat alleen met OpenCode v2 via /workspace/:id/opencode2; v1 draait mee maar handhaaft LiteLLM-only niet. v2 krijgt een eigen geschiedenisdatabase.
* [Feedback](feedback.md) - Feedback sturen verzamelt een screenshot en opgeschoonde logs lokaal en opent een vooraf ingevuld GitHub-issueformulier; geen sleutel of relay.
* [LiteLLM-laag](litellm-laag.md) - LiteLLM is de enige provider: een loopback-proxy injecteert de key per workspace, en de gate en de engine-policies laten geen andere provider toe.
* [Persoonlijke agent](persoonlijke-agent.md) - Taken, mail, Slack, beloftes en afspraken op Vandaag, elk met de eerste stap al gedaan; de agent leest en stelt voor, de gebruiker verstuurt.
* [Routines](routines.md) - Een prompt die op een schema in een project draait en een nieuwe chat oplevert; de planner draait in het serverproces, dus alleen als de app open is.
* [Server-hooks](server-hooks.md) - Alle BonzaiWork-serverlogica draait als één hookbundel (OPENWORK_SERVER_HOOKS) in het OpenWork-serverproces; downstream-hooks.ts is de enige brug.
* [Upstream-laag](upstream-laag.md) - Hoe BonzaiWork op OpenWork staat: eigen paden, minimale hooks in upstream-bestanden, PATCHES.md en de Electron-entry die upstream ongewijzigd laadt.
