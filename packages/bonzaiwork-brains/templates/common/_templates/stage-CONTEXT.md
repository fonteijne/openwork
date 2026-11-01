# <NN_stap> - <de taak in vijf woorden>

Eén taak: <het ene ding dat deze stap doet>.

## Inputs
- Working (deze run): `../<vorige-stap>/output/<bestand>.md`
- Reference (elke run): `../../../knowledge/<map>/<concept>.md`

Do NOT load: andere stappen, eerdere runs, de rest van `knowledge/`.

## Process
1. Ontbreekt een invoer of is hij leeg, stop en zeg welke.
2. <Wat de stap doet, volgens de reference.>

## Outputs
- `<resultaat>.md` -> `output/`

## Check
<Wie of wat controleert, als één concrete handeling: de gebruiker leest het na, of een klein model beantwoordt <vraag>. Een controle die geen persoon is, schrijft `check.md` naast de output, eerste regel `pass` of `fail: <waarom>`.>
