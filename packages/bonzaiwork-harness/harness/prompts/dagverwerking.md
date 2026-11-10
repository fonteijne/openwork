Dit is de dagelijkse verwerking van mijn brein. Werk zo:

1. Kijk in `knowledge/log.md` wanneer de vorige regel "Dagelijkse verwerking" is vastgelegd. Roep `gesprekken_lezen` aan met `sinds` op dat moment, of op 24 uur geleden als er nog geen regel staat.
2. Lees de gesprekken. Zoek naar wat ook buiten het project telt:
   - **Mensen** die ter sprake kwamen: per persoon `knowledge/mensen/<voornaam-achternaam>.md` (`type: Person`): rol, waar ik ze van ken, afspraken, wat voor ze telt. Bestaat het concept, werk het dan per passage bij met `persoonlijk_brein_bewerken`; anders `persoonlijk_brein_schrijven`. Geen privé- of gezondheidsgegevens.
   - **Projecten**: per project `knowledge/projecten/<project>.md` (`type: Project`): waar het staat, wat er speelt, wie erbij hoort.
   - **Besluiten en afspraken** die later nog gelden: `type: Decision`, met datum en wie besliste.
   - **Voorkeuren** die je uit mijn vragen afleest: stel ze voor met `voorkeur_voorstellen`; schrijf ze nooit zelf.
3. Nieuwe concepten krijgen `status: draft` en de chat als bron (`sources`: `resource: bonzaiwork://chat/<id>`, `title`: de chattitel). Schrijf niets in een projectbrein; dat gebeurt al.
4. Sluit af met drie regels: wat is nieuw, wat is bijgewerkt, welke voorstellen staan open. Was er niets om vast te leggen, zeg dat in één zin.
