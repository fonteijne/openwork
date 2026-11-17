# Decision

* [Alleen de gebruiker verstuurt](alleen-gebruiker-verstuurt.md) - De agent leest zonder klik voor zijn eigen rondes, maar heeft geen tool die iets verstuurt; de server verstuurt pas na een klik op de kaart.
* [De agenda telt in kwartieren](agenda-kwartier.md) - Elk kwartier op de klok krijgt precies één toewijzing; een kwartier zonder activiteit is Away from BonzaiWork en kan een meeting worden. Eigen invoer gaat voor.
* [De agent kiest één taak](agent-kiest-taak.md) - Start hier toont één taak die de agent kiest; Niet nu geeft hooguit drie keer een andere. Ideeën parkeer je in inbox.md zonder de taak te verlaten.
* [De app opent op Vandaag](vandaag-als-start.md) - De startpagina is Vandaag: wat op je wacht, wat loopt, wat gebeurde terwijl je weg was en je werkdag; projecten zijn containers met tabbladen.
* [Eén begrip Agent](een-begrip-agent.md) - In de app heet het Agent (pagina), Mijn agent (project) en Agent op Vandaag; Brein blijft de naam voor een gedeeld projectbrein. Code en routes zijn niet hernoemd.
* [Een boekdocument in plaats van zelf boeken](agenda-boekdocument.md) - BonzaiWork boekt niets in Bridge; het maakt per dag of week een Markdown-boekdocument dat een gewone chat na jouw goedkeuring omzet. Geen model in de MVP.
* [Feedback via een redirect naar GitHub](feedback-redirect.md) - Feedback sturen opent een vooraf ingevuld GitHub-issueformulier; de gebruiker logt zelf in. Geen sleutel in de app, geen relay.
* [Slack-to-do's als eigen lijst op Vandaag](slack-todos-op-vandaag.md) - Je eigen Slack-to-do's staan in een eigen lijst op Vandaag en worden daar in Slack zelf afgevinkt; ze worden geen taak in een brein en de agent komt er niet aan.
* [Taken als Markdown-checkbox in de breinen](taken-als-checkbox.md) - Taken staan als Markdown-checkbox in het persoonlijke brein en in project-breinen, met een eigenaar; zonder eigenaar is het team-backlog.
* [Voorkeursmodellen in de build](voorkeursmodellen.md) - Een lijst LiteLLM-model-id's zit in de build (PREFERRED_MODEL_IDS, te overschrijven met BONZAIWORK_PREFERRED_MODELS); nieuwe projecten starten met alleen die modellen.
