# Decision

* [Alleen de v2-engine](alleen-engine-v2.md) - De UI praat uitsluitend met /workspace/:id/opencode2; het model wordt per gesprek gekozen, met defaultModel uit /bonzaiwork/status.
* [App-naam BonzaiWork](app-naam.md) - App-naam BonzaiWork, prefix bonzaiwork; appId voorlopig nl.bonzaiwork.desktop. Signing en updater-host staan nog open.
* [Builder-config als .mjs](builder-config-mjs.md) - De electron-builder-config is apps/desktop/electron-builder.bonzaiwork.mjs: hij leest upstream's YAML en vervangt alleen UI, entry, identiteit en publish.
* [Claude Code-integratie niet met een eigen route weigeren](claude-agent-niet-weigeren.md) - De ingebouwde claude-agent-provider blijft dicht via de engine-policy en OPENCODE_CLAUDE_PATH; geen nieuwe hook om /opencode2/api/integration/* te weigeren.
* [Een eigen aanhaakpunt voor server-uitbreidingen](server-hooks-aanhaakpunt.md) - BonzaiWork-routes en -beleid komen via OPENWORK_SERVER_HOOKS en downstream-hooks.ts, niet via apps/server/src/extensions.
* [Een eigen UI zonder imports uit apps/app](eigen-ui.md) - De BonzaiWork-UI is een nieuwe app in apps/bonzaiwork met eigen clients voor server, engine en desktop-bridge; hij importeert niets uit de upstream-UI.
* [Eigen database voor de v2-geschiedenis](eigen-v2-geschiedenis.md) - v2 krijgt userData/bonzaiwork/opencode/opencode.db in plaats van de database die elke OpenCode-installatie deelt; v1 houdt het gedrag van upstream.
* [Geen modelcatalogus van de OpenWork-cloud](geen-modelcatalogus.md) - De engines halen models.openworklabs.com niet op; ze houden hun meegeleverde catalogus en de LiteLLM-modellen komen uit de provider-entry.
* [Kennisbank als OKF-bundel, bijgehouden door een sessiehook](kennisbank-via-sessiehook.md) - Architectuur en besluiten staan als OKF-bundel in docs/bonzaiwork/kennisbank; een Claude Code-hook houdt hem bij vanuit ontwikkelsessies, zonder upstream-bestanden te wijzigen.
* [Key per gebruiker of per project](key-per-gebruiker-of-project.md) - Nog open (O1). Beide KeyResolvers zijn gebouwd; de build kiest met BONZAIWORK_KEY_MODE=user|workspace, standaard user.
* [Keys in de OS-keychain, injectie in de proxy](keys-keychain-proxy.md) - LiteLLM virtual keys staan versleuteld met safeStorage; de loopback-proxy voegt ze toe. Nooit in config, env, logs of foutmeldingen.
* [LiteLLM is de enige provider](litellm-enige-provider.md) - Alleen provider litellm, afgedwongen in de provider-gate én in de engine-policies; geen tweede of fallback-provider, ook niet voor development.
* [LiteLLM-URL in de build](litellm-url-ingebakken.md) - De LiteLLM-URL wordt bij het bouwen ingebakken (BONZAIWORK_LITELLM_BASE_URL); de onboarding vraagt alleen de key.
* [Project is een workspace](project-is-workspace.md) - Een BonzaiWork-project is een lokale OpenWork-workspace (één map); projectmetadata en overzichtsdata komen als dunne BonzaiWork-laag eromheen.
* [Transcriptie via Whisper in LiteLLM](transcriptie-via-litellm.md) - Meeting-transcriptie loopt via een Whisper-model achter LiteLLM; de splitsing ik/anderen komt uit aparte audiosporen, niet uit diarization.
* [Upstream-releases mergen, niet dev](releases-mergen.md) - In nightly mergen we gepubliceerde upstream-releases via upstream-sync/<tag>-PR's; dev is alleen een spiegel ter referentie. Nooit rebasen op upstream.
* [Upstream-workflows staan uit](upstream-workflows-uit.md) - Alleen BonzaiWork-CI, CodeQL, de feature-registry-check en upstream-sync draaien; fork-workflows.mjs zet de rest bij elke sync uit. Documentatie slaat de CI over.
