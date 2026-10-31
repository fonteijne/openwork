import type { ChatErrorKind, QuestionField } from "../types";

/**
 * How the demo agent answers. Not a model: a handful of believable plays,
 * picked by keywords, that exercise every chat state the real engine can
 * produce (reasoning, tool rail, permission, question, streaming, errors).
 */

export type Step =
  | { kind: "reasoning"; text: string; ms: number }
  | {
      kind: "tool";
      tool: string;
      input: Record<string, unknown>;
      output?: string;
      error?: string;
      ms: number;
      permission?: { action: string; resources: string[] };
    }
  | { kind: "text"; text: string }
  | { kind: "question"; field: QuestionField; follow: (answer: string) => Step[] }
  | { kind: "error"; error: ChatErrorKind };

export type Plan = { title: string; steps: Step[] };

export type PlanContext = {
  hasConnection: (name: string) => boolean;
};

const LEADING = /^(?:kun je|kan je|wil je|zou je|graag|help me( met)?|ik wil( graag)?|maak|schrijf|zoek|geef|zet|reken|werk|bedenk|controleer|stel|vat)\s+/i;
const ARTICLES = /^(?:een|de|het|even|alvast|mij|me)\s+/i;

/** A short chat title from the first message, like the engine's titler. */
export function titleFrom(prompt: string): string {
  let text = prompt.replace(/\s+/g, " ").trim().split(/[.?!\n]/)[0] ?? prompt;
  for (let i = 0; i < 3; i += 1) text = text.replace(LEADING, "").replace(ARTICLES, "");
  const words = text.split(" ").filter(Boolean).slice(0, 7);
  const title = words.join(" ").replace(/[,:;]$/, "");
  if (!title) return "Nieuwe chat";
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function subject(prompt: string): string {
  const match = prompt.match(/\b(?:voor|aan|over|naar)\s+([^,.?!\n]{3,60})/i);
  return (match?.[1] ?? titleFrom(prompt)).trim();
}

function writeStep(path: string): Step {
  return {
    kind: "tool",
    tool: "write",
    input: { filePath: path },
    output: "Bestand geschreven",
    ms: 900,
    permission: { action: "edit", resources: [path] },
  };
}

function quote(prompt: string): Plan {
  const client = subject(prompt);
  const file = `offertes/2026-034-${slug(client) || "nieuwe-klant"}.md`;
  return {
    title: titleFrom(prompt),
    steps: [
      { kind: "reasoning", text: "Sjabloon en prijslijst erbij pakken, dan de uren schatten en doorrekenen.", ms: 900 },
      { kind: "tool", tool: "skill", input: { name: "offerte-schrijven" }, ms: 250 },
      { kind: "tool", tool: "read", input: { filePath: "sjablonen/sjabloon-offerte.md" }, output: "# Offerte {nummer}", ms: 500 },
      { kind: "tool", tool: "read", input: { filePath: "prijslijst-2026.md" }, output: "Uurtarief: € 92,50", ms: 450 },
      {
        kind: "text",
        text: `Ik heb een concept gemaakt voor **${client}**:\n\n| Onderdeel | Aantal | Tarief | Totaal |\n|---|---|---|---|\n| Intake en advies | 4 uur | € 92,50 | € 370,00 |\n| Uitvoering | 18 uur | € 92,50 | € 1.665,00 |\n| Projectbegeleiding | 3 uur | € 92,50 | € 277,50 |\n\n**Totaal:** € 2.312,50 excl. btw (€ 2.798,13 incl. btw)\n\nIk sla de offerte op als **${file}**.`,
      },
      writeStep(file),
      { kind: "text", text: "Opgeslagen. Wil je dat ik er een begeleidende mail bij schrijf, of de uren per fase anders verdeel?" },
    ],
  };
}

function mail(prompt: string): Plan {
  const to = subject(prompt);
  return {
    title: titleFrom(prompt),
    steps: [
      {
        kind: "question",
        field: {
          key: "tone",
          title: "Toon",
          description: "Welke toon past bij deze mail?",
          multiple: false,
          custom: true,
          options: [
            { value: "formal", label: "Zakelijk", description: "U-vorm, afstandelijk" },
            { value: "friendly", label: "Vriendelijk", description: "Je-vorm, persoonlijk" },
            { value: "short", label: "Kort en direct", description: "Maximaal vijf zinnen" },
          ],
        },
        follow: (answer) => {
          const formal = /zakelijk|formeel|u-vorm/i.test(answer);
          const greeting = formal ? "Geachte heer, mevrouw," : "Hoi,";
          const you = formal ? "u" : "je";
          return [
            { kind: "tool", tool: "skill", input: { name: "nederlands-zakelijk" }, ms: 250 },
            {
              kind: "text",
              text: `Hier is een voorstel (${answer.toLowerCase()}):\n\n---\n\n**Onderwerp:** ${titleFrom(prompt)}\n\n${greeting}\n\nDank voor ${formal ? "uw" : "je"} bericht. Ik kom graag bij ${you} terug op ${to}. Hieronder zet ik de belangrijkste punten op een rij:\n\n- wat we hebben afgesproken;\n- wat de volgende stap is;\n- wanneer ${you} van ons hoort.\n\nLaat ${formal ? "u" : "het"} gerust weten als er iets niet klopt.\n\nMet vriendelijke groet,\n\nSanne Bakker\n\n---\n\nZal ik hem korter maken, of een Engelse versie toevoegen?`,
            },
          ];
        },
      },
    ],
  };
}

function research(prompt: string, context: PlanContext): Plan {
  const topic = subject(prompt);
  return {
    title: titleFrom(prompt),
    steps: [
      { kind: "reasoning", text: "Eerst breed zoeken, dan de drie meest relevante bronnen openen en vergelijken.", ms: 1_100 },
      { kind: "tool", tool: "websearch", input: { query: topic }, output: "10 resultaten", ms: 1_600 },
      { kind: "tool", tool: "webfetch", input: { url: "https://www.kvk.nl/zoeken" }, output: "…", ms: 1_200 },
      { kind: "tool", tool: "webfetch", input: { url: "https://www.emerce.nl/research" }, output: "…", ms: 1_400 },
      { kind: "tool", tool: "webfetch", input: { url: "https://www.frankwatching.com" }, output: "…", ms: 1_100 },
      ...(context.hasConnection("google-drive") ? [{ kind: "tool" as const, tool: "google-drive_search_files", input: { query: "concurrentie" }, output: "2 bestanden", ms: 900 }] : []),
      {
        kind: "text",
        text: `Dit is wat ik vond over **${topic}**:\n\n| Bureau | Diensten | Prijsindicatie | Opvallend |\n|---|---|---|---|\n| Studio Noord | Webdesign, branding | € 8.000 – € 25.000 | Werkt veel voor gemeenten |\n| Pixelwerf | Webshops (Shopify) | vanaf € 6.500 | Snelle oplevering, vaste pakketten |\n| De Bouwplaats | Maatwerk, apps | € 20.000+ | Groot team, langere doorlooptijd |\n| Lijnrecht | Webdesign, SEO | € 4.000 – € 12.000 | Sterk in lokale vindbaarheid |\n| Kade 12 | Content, campagnes | op uurbasis | Weinig techniek in huis |\n\n**Wat betekent dit voor ons?**\n\n- In het segment € 5.000 – € 15.000 zitten de meeste spelers; wij onderscheiden ons met vast onderhoud.\n- Niemand biedt een **conversiegarantie** of meetbare doelen in de offerte. Dat kan een sterk verkoopargument zijn.\n- Pixelwerf is de enige die prijzen openlijk toont; bezoekers waarderen dat.\n\nDe bedragen zijn indicaties van de websites zelf (oktober 2026). Zal ik dit uitwerken tot een positioneringsvoorstel?`,
      },
    ],
  };
}

function summary(prompt: string): Plan {
  return {
    title: titleFrom(prompt),
    steps: [
      { kind: "tool", tool: "glob", input: { pattern: "**/*.md" }, output: "12 bestanden", ms: 300 },
      { kind: "tool", tool: "read", input: { filePath: "notities/overleg-oktober.md" }, ms: 500 },
      { kind: "tool", tool: "read", input: { filePath: "notities/actiepunten.md" }, ms: 450 },
      {
        kind: "text",
        text: "**In het kort**\n\n1. Er lopen drie trajecten; twee liggen op schema.\n2. Het grootste risico is de planning in december: twee mensen zijn dan met verlof.\n3. Er staan vier actiepunten open, waarvan één al over de deadline is (offerte Mertens opvolgen).\n4. Het budget is voor 72% besteed, in lijn met de planning.\n5. Volgende stap: een besluit over het extra webinar in januari.\n\nZal ik de open actiepunten als lijstje met eigenaar en datum klaarzetten?",
      },
    ],
  };
}

function plan(prompt: string): Plan {
  const file = `planning/${slug(titleFrom(prompt)) || "plan"}.md`;
  return {
    title: titleFrom(prompt),
    steps: [
      { kind: "reasoning", text: "De taak opdelen in weken, met afhankelijkheden vooraan.", ms: 900 },
      {
        kind: "text",
        text: "**Voorstel**\n\n**Week 1**\n- [ ] Doel en planning vastleggen\n- [ ] Betrokkenen informeren\n\n**Week 2**\n- [ ] Eerste versie maken\n- [ ] Feedback ophalen bij twee collega's\n\n**Week 3**\n- [ ] Verwerken en afronden\n- [ ] Evaluatie inplannen\n\nIk zet deze checklist in de projectmap.",
      },
      writeStep(file),
      { kind: "text", text: `Klaar: **${file}**. Wil je er data en namen bij?` },
    ],
  };
}

function answer(prompt: string): Plan {
  const topic = titleFrom(prompt).toLowerCase();
  return {
    title: titleFrom(prompt),
    steps: [
      { kind: "reasoning", text: "De vraag in stappen opdelen en kijken wat er al in de projectmap staat.", ms: 1_000 },
      { kind: "tool", tool: "grep", input: { pattern: topic.split(" ")[0] ?? topic }, output: "3 resultaten", ms: 350 },
      {
        kind: "text",
        text: `Zo zou ik **${topic}** aanpakken:\n\n1. **Op een rij zetten wat er al is.** In de projectmap vond ik drie bestanden die erover gaan.\n2. **Bepalen wat het moet opleveren.** Een korte tekst, een overzicht, of een besluit?\n3. **Een eerste versie maken** en die samen aanscherpen.\n\nZal ik met stap 1 beginnen en je een overzicht geven van wat er al ligt?`,
      },
    ],
  };
}

/** "Laat de AI het samenvoegen" (plan §4.5): read both versions, write one. */
function mergeVersions(prompt: string): Plan {
  const file = /`([^`]+\.md)`/.exec(prompt)?.[1] ?? "knowledge/notitie.md";
  return {
    title: "Versies samenvoegen",
    steps: [
      { kind: "tool", tool: "read", input: { filePath: file }, output: "<<<<<<< jouw versie\nStandaard 10%, vaste klanten 20%\n=======\nStandaard 15%\n>>>>>>>", ms: 500 },
      { kind: "tool", tool: "edit", input: { filePath: file }, output: "Bijgewerkt", ms: 700 },
      { kind: "text", text: "Samengevoegd: de standaardkorting is nu 15% (de versie van je collega) en de 20% voor vaste klanten uit jouw versie staat erbij." },
    ],
  };
}

/** Another brain (plan §5.2): the AI lists the brains, then asks before it reads one the user did not name. */
function otherBrain(prompt: string): Plan {
  const brain = "Klantenservice";
  return {
    title: titleFrom(prompt),
    steps: [
      { kind: "tool", tool: "breinen_breinen_lijst", input: {}, output: "- Klantenservice: retouren, klachten en de toon van onze antwoorden.", ms: 400 },
      { kind: "text", text: `Het brein ${brain} heeft het retourbeleid. Mag ik daar kijken?` },
      {
        kind: "tool", tool: "breinen_brein_lezen", input: { brein: brain, pad: "knowledge/beleid/retouren.md" },
        output: "Retouren binnen 30 dagen, op kosten van de klant tenzij het product defect is.", ms: 600,
        permission: { action: "breinen_brein_lezen", resources: ["*"] },
      },
      { kind: "text", text: `Volgens het brein ${brain} (\`knowledge/beleid/retouren.md\`): retouren binnen 30 dagen, op kosten van de klant, behalve bij een defect. Zal ik dat in de offertevoorwaarden van dit project zetten?` },
    ],
  };
}

export function planReply(prompt: string, context: PlanContext): Plan {
  const text = prompt.toLowerCase();
  if (text.includes("budget op") || text.includes("#budget")) return { title: titleFrom(prompt), steps: [{ kind: "error", error: "budget_exceeded" }] };
  if (text.includes("#fout")) return { title: titleFrom(prompt), steps: [{ kind: "error", error: "litellm_unreachable" }] };
  if (text.includes("twee versies samen")) return mergeVersions(prompt);
  if (/\bretour|#brein\b/.test(text)) return otherBrain(prompt);
  if (/\bofferte/.test(text)) return quote(prompt);
  if (/\b(e-?mail|mail|brief|bericht aan)\b/.test(text)) return mail(prompt);
  if (/\b(zoek|onderzoek|concurrent|markt|nieuws|vergelijk|web)\w*/.test(text)) return research(prompt, context);
  if (/\b(samenvat|vat .* samen|overzicht)\w*/.test(text)) return summary(prompt);
  if (/\b(plan|planning|checklist|stappenplan)\w*/.test(text)) return plan(prompt);
  return answer(prompt);
}
