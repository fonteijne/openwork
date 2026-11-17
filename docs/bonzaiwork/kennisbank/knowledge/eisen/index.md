# Policy

* [Harde eisen E1–E7](harde-eisen.md) - Zelfstandige app, eigen UI, mergebare upstream, alleen LiteLLM, keys via virtual keys in de keychain, geen OpenWork-cloud, geen code uit /ee.
* [Importeren, niet aanpassen](gouden-regel.md) - Nieuwe functionaliteit in eigen mappen; een upstream-bestand alleen via configuratie, een minimale hook of een upstream-PR, en altijd in PATCHES.md.
* [Niet doen](niet-doen.md) - Geen apps/app aanpassen, niets uit ee/, niet rebasen op upstream, geen keys in config of logs, geen gegenereerde SDK committen, geen npm/yarn, geen tweede provider.
* [Ontwikkelen zonder Windows-machine](windows-regels.md) - Platform meegeven en op Linux testen, paden met node:path, geen POSIX-gereedschap in productiecode, externe programma's met een volledig pad, regeleinden met \r?\n.
