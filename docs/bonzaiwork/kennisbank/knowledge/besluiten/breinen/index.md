# Decision

* [Alleen SSH met de sleutels die er al zijn](alleen-ssh.md) - Clone, fetch en push gaan altijd via de SSH van het systeem met BatchMode; geen HTTPS, tokens of wachtwoorden, en de app leest geen sleutels.
* [Git gaat mee in de app](git-meegeleverd.md) - dugite (de git van GitHub Desktop) gaat uitgedund mee in de build en draait altijd geïsoleerd van de git-omgeving van de gebruiker.
* [Kennis in OKF, acties in ICM](okf-en-icm.md) - Een brein gebruikt twee open standaarden: OKF v0.2 in knowledge/ voor wat het team weet, ICM in workflows/ voor hoe het team werkt.
* [Modi per brein](modi-per-brein.md) - Per brein kies je automatisch (standaard), handmatig of alleen lezen; via voorstel (branch plus merge request) volgt in fase 3.
* [Per beurt vastleggen en versturen](per-beurt-vastleggen.md) - Na elke beurt (alle chats stil plus 15 s) legt BonzaiWork vast en pusht; alleen Markdown gaat vanzelf mee, AI- en gebruikerswijzigingen in aparte commits.
* [Skills komen uit de app](skills-uit-de-app.md) - De OKF- en ICM-skills en de commando's levert de app via de config-map van de engine; een brein krijgt geen kopie en het persoonlijke brein begint schoon.
* [Synchronisatie is code, geen instructie](sync-is-code.md) - De AI doet geen git: BonzaiWork werkt een brein bij en legt het vast op vaste momenten, zoals hooks in Claude Code. De AI mag zelf geen git uitvoeren.
* [Vertrouwen per gebruiker](vertrouwen-per-gebruiker.md) - Wat een gedeeld brein kan uitvoeren (MCP's, plugins, agents, commando's met shell, scripts) laadt pas na akkoord van elke gebruiker zelf.
* [Voorkeuren alleen via een voorstelkaart](voorkeuren-via-kaart.md) - De AI kan AGENTS.md en _meta/voorkeuren.md van het persoonlijke brein niet zelf schrijven; voorkeur_voorstellen toont altijd een kaart.
