import { isoLocal, timeOf, weekday } from "./clock.ts";
import { dutchDuration, proposal, QUARTER_MINUTES, type TimeRange } from "./overview.ts";
import { AWAY_LABEL, type DayView } from "./types.ts";

/**
 * The booking document (plan §6): Markdown with the instructions for the assistant, the booking
 * proposal, points of attention, the timeline per day and the same data as JSON. A chat that can use
 * the Bridge CLI turns it into bookings, after the user approves. Pure: no clock, no I/O.
 */

/** The fixed text of plan §6.2, word for word. Change it only together with `INSTRUCTIONS_VERSION`. */
export const INSTRUCTIONS = [
  "## Instructies voor de assistent",
  "",
  "Dit document komt uit de agenda van BonzaiWork. Het is een momentopname van gemeten en zelf",
  "ingevoerde tijd, in kwartieren. Het is een voorstel, geen boeking. Gebruik het om de gebruiker te",
  "helpen deze uren in Bridge te boeken met de Bridge CLI.",
  "",
  "Werk in deze volgorde en sla geen stap over:",
  "",
  "1. Controleer de toegang met `bridge check_access`. Faalt dat, stop dan en meld het; doe geen",
  "   wijzigingen.",
  "2. Lees wat er al geboekt is in deze periode met `bridge export_worklog <van> <tot>`. Vergelijk per",
  "   datum en boekingspost met het boekvoorstel en noem mogelijke dubbele boekingen. Boek die niet zonder",
  "   expliciete keuze van de gebruiker.",
  "3. Controleer elke Bridge-post uit het voorstel met `bridge list_projects --search \"<label of id>\"`.",
  "   Gebruik alleen een entity-ID die je zo in Bridge terugvindt. Leid nooit een post af uit een",
  "   gelijkende naam. Kun je een post niet bevestigen, vraag de gebruiker dan om de juiste post.",
  "4. Schrijf per boeking een korte, zakelijke omschrijving (één zin, Nederlands) op basis van het",
  "   omschrijvingsmateriaal: projecten, chattitels en notities. Notities van de gebruiker gaan voor.",
  "   Verzin geen werk dat niet in het materiaal staat. Laat persoonsnamen en gevoelige gegevens weg.",
  "5. Laat de gebruiker het volledige voorstel zien als tabel: id, datum, post (entity-ID en label),",
  "   duur, omschrijving en referentie. Noem de aandachtspunten uit dit document: tijd zonder",
  "   Bridge-post, gedeelde kwartieren en eventuele dubbele boekingen. \"Away from BonzaiWork\" is tijd",
  "   zonder activiteit in BonzaiWork; boek die niet, tenzij de gebruiker er zelf een boeking van maakt.",
  "6. Valideer elke boeking met `bridge add_worklog --entity <ENTITY_ID> --minutes <minuten>",
  "   --desc \"<omschrijving>\" --date <datum> --dry-run`. Heeft de boeking een referentie, kijk dan met",
  "   `bridge add_worklog --help` welke optie daarvoor is en gebruik die. Een dry-run is geen goedkeuring.",
  "7. Vraag expliciet om goedkeuring, per boeking of voor de hele lijst. Boek pas na een duidelijk \"ja\".",
  "   Pas na een wijziging van de gebruiker het voorstel aan en vraag opnieuw.",
  "8. Boek alleen wat is goedgekeurd, zonder `--dry-run`. Gebruik `--allow-duplicate` nooit, tenzij de",
  "   gebruiker een bewuste dubbele boeking expliciet heeft bevestigd.",
  "9. Lees na afloop opnieuw uit met `bridge export_worklog <van> <tot>` en bevestig per id dat precies",
  "   de bedoelde boeking er staat.",
  "",
  "Gebruik `bridge update_worklog` en `bridge delete_worklog` alleen als de gebruiker daar zelf om vraagt,",
  "altijd eerst met `--dry-run` en na expliciete toestemming. Verwijderen is destructief.",
  "",
  "Het JSON-blok onderaan bevat dezelfde gegevens als de tabellen. Bij verschil geldt het JSON-blok.",].join("\n");

/** In the JSON block as `versie`, so a later change of the instructions is recognisable. */
export const INSTRUCTIONS_VERSION = 1;

const WEEKDAYS = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];
const KINDS = { project: "project", other: "anders", away: "away" } as const;
const SOURCES = { measured: "gemeten", user: "gebruiker" } as const;

/** One table cell: no line breaks, `|` and backticks escaped. */
export function cell(value: string): string {
  return value.replace(/\s*[\r\n]+\s*/g, " ").replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/`/g, "\\`").trim();
}

/** An entity id in code style, unless it holds a backtick (then escaped text). */
const code = (value: string) => (value.includes("`") ? cell(value) : `\`${value.replace(/\|/g, "\\|")}\``);
const dash = "–";
const quoted = (values: readonly string[]) => values.map((value) => `"${value}"`).join(", ");
const range = (time: TimeRange) => `${time.from}–${time.to}`;

/** "a", "a en b", "a, b en c". */
function joinDutch(values: readonly string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  return `${values.slice(0, -1).join(", ")} en ${values.at(-1)}`;
}

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [`| ${header.join(" | ")} |`, `|${header.map(() => "---").join("|")}|`, ...rows.map((row) => `| ${row.map((value) => value || " ").join(" | ")} |`)].join("\n");
}

export type BookingDocumentInput = {
  from: string;
  to: string;
  /** The days of the period (empty days may be left out). */
  days: readonly DayView[];
  now: number;
  timeZone: string;
};

export function bookingDocument(input: BookingDocumentInput): string {
  const days = input.days.filter((day) => day.date >= input.from && day.date <= input.to).sort((a, b) => a.date.localeCompare(b.date));
  const result = proposal(days);
  const several = input.from !== input.to;
  const onDate = (date: string, text: string) => (several ? `${date} ${text}` : text);
  const created = isoLocal(input.now);

  const header = [
    `# Uren uit BonzaiWork: ${several ? `${input.from} t/m ${input.to}` : input.from}`,
    "",
    `Periode: ${input.from} t/m ${input.to} · Aangemaakt: ${created.slice(0, 10)} ${created.slice(11, 16)} (${input.timeZone})`,
    `Bron: BonzaiWork-agenda op dit apparaat · Eenheid: kwartier (${QUARTER_MINUTES} minuten)`,
    `Te boeken: ${dutchDuration(result.minutes.book)} · Zonder Bridge-post: ${dutchDuration(result.minutes.missing)} · ${AWAY_LABEL}: ${dutchDuration(result.minutes.away)}`,
  ].join("\n");

  const bookings = result.bookings.length
    ? table(["Id", "Datum", "Bridge-post", "Duur", "Minuten", "Tijden", "Omschrijvingsmateriaal", "Referentie"], result.bookings.map((booking) => {
      const material = [
        ...booking.material.projects,
        ...booking.material.labels,
        ...(booking.material.chats.length ? [`chats: ${quoted(booking.material.chats)}`] : []),
        ...(booking.material.notes.length ? [`${booking.material.notes.length > 1 ? "notities" : "notitie"}: ${quoted(booking.material.notes)}`] : []),
      ].join(" · ");
      return [
        booking.id,
        booking.date,
        `${code(booking.bridgePost.entityId)}${booking.bridgePost.label ? ` (${cell(booking.bridgePost.label)})` : ""}`,
        booking.duration,
        String(booking.minutes),
        booking.times.map(range).join(", "),
        cell(material),
        booking.reference ? code(booking.reference) : dash,
      ];
    }))
    : "Geen boekingen met een Bridge-post in deze periode.";

  const attention: string[] = [];
  for (const missing of result.missing) {
    attention.push(`- **Zonder Bridge-post (${dutchDuration(missing.minutes)})**: ${onDate(missing.date, joinDutch(missing.times.map(range)))}, ${missing.kind === "project" ? "project" : "label"} "${missing.label}". Vraag de gebruiker om een post of laat dit weg.`);
  }
  for (const shared of result.shared) {
    attention.push(`- **${shared.minutes === QUARTER_MINUTES ? "Gedeeld kwartier" : "Gedeelde kwartieren"}**: ${onDate(shared.date, `${shared.from}–${shared.to}`)} is geteld bij ${shared.label}; ook actief in ${joinDutch(shared.sharedWith)}.`);
  }
  if (result.away.length) {
    attention.push(`- **${AWAY_LABEL} (niet boeken)**: ${result.away.map((away) => `${onDate(away.date, `${away.from}–${away.to}`)}${away.appClosed ? " (app dicht)" : ""}`).join(", ")}.`);
  }

  const timeline = days.filter((day) => day.blocks.length).map((day) => [
    `### ${WEEKDAYS[weekday(day.date)]} ${day.date}`,
    "",
    table(["Van", "Tot", "Soort", "Project of label", "Bridge-post", "Bron", "Chats", "Notitie", "Referentie"], day.blocks.map((block) => [
      timeOf(block.start),
      timeOf(block.end),
      KINDS[block.kind],
      cell(block.label),
      block.bridgePost ? code(block.bridgePost.entityId) : dash,
      block.kind === "away" && block.appClosed ? "app dicht" : SOURCES[block.source],
      cell(block.chats.join(", ")),
      cell(block.notes.join("; ")),
      block.reference ? code(block.reference) : "",
    ])),
  ].join("\n"));

  const data = {
    bron: "bonzaiwork-agenda",
    versie: INSTRUCTIONS_VERSION,
    aangemaakt: created,
    tijdzone: input.timeZone,
    periode: { van: input.from, tot: input.to },
    eenheid_minuten: QUARTER_MINUTES,
    boekingen: result.bookings.map((booking) => ({
      id: booking.id,
      datum: booking.date,
      bridge_post: { entity_id: booking.bridgePost.entityId, label: booking.bridgePost.label },
      minuten: booking.minutes,
      duur: booking.duration,
      tijden: booking.times.map((time) => ({ van: time.from, tot: time.to })),
      materiaal: { projecten: booking.material.projects, labels: booking.material.labels, chats: booking.material.chats, notities: booking.material.notes },
      referentie: booking.reference,
      gedeeld_met: booking.sharedWith,
    })),
    zonder_post: result.missing.map((missing) => ({ datum: missing.date, soort: KINDS[missing.kind], label: missing.label, minuten: missing.minutes, tijden: missing.times.map((time) => ({ van: time.from, tot: time.to })) })),
    away: result.away.map((away) => ({ datum: away.date, van: away.from, tot: away.to, minuten: away.minutes, app_dicht: away.appClosed })),
    gedeeld: result.shared.map((shared) => ({ datum: shared.date, van: shared.from, tot: shared.to, minuten: shared.minutes, geteld_bij: shared.label, ook_actief_in: shared.sharedWith })),
    tijdlijn: days.flatMap((day) => day.blocks.map((block) => ({
      datum: day.date,
      van: timeOf(block.start),
      tot: timeOf(block.end),
      soort: KINDS[block.kind],
      label: block.label,
      bridge_post: block.bridgePost?.entityId ?? null,
      bron: SOURCES[block.source],
      app_dicht: block.appClosed,
      chats: block.chats,
      notitie: block.notes.length ? block.notes.join("; ") : null,
      referentie: block.reference,
    }))),
  };

  return [
    header,
    "",
    INSTRUCTIONS,
    "",
    "## Boekvoorstel",
    "",
    bookings,
    "",
    "## Aandachtspunten",
    "",
    attention.length ? attention.join("\n") : "Geen.",
    "",
    "## Tijdlijn",
    "",
    timeline.length ? timeline.join("\n\n") : "Geen activiteit in deze periode.",
    "",
    "## Gegevens (JSON)",
    "",
    "```json",
    JSON.stringify(data, null, 2),
    "```",
    "",
  ].join("\n");
}
