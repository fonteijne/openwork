/**
 * Copy for the inbox (design v2-Inbox): sorting what came in before it becomes a to-do.
 * Je-vorm, sentence case; eyebrows are uppercase through CSS.
 */

const NUMBER_WORDS = ["Nul", "Eén", "Twee", "Drie", "Vier", "Vijf", "Zes", "Zeven", "Acht", "Negen", "Tien", "Elf", "Twaalf"] as const;

function countWord(count: number): string {
  return NUMBER_WORDS[count] ?? String(count);
}

export const inboxCopy = {
  documentTitle: "Inbox",
  eyebrow: "Inbox · sorteren",
  /** "Vijf dingen om te " + accent "sorteren" + "." */
  heroCount: (count: number) => `${countWord(count)} ${count === 1 ? "ding" : "dingen"} om te `,
  heroAccent: "sorteren",
  heroTail: ".",
  heroEmpty: "Niets meer om te ",
  lead: "Alleen wat aan jou gericht is, je @vermeldingen en markeringen. Niets wordt een to-do tot jij het accepteert.",
  capture: "Vastleggen",
  groups: {
    mail: "Voorgesteld uit mail",
    captured: "Vastgelegd",
    agent: "Voorgesteld door je agent",
    listLabel: "Te sorteren",
  },
  waitingFor: "Wachten op",
  external: "Extern",
  noProject: "Geen project",
  deadline: (date: string) => `Deadline ${date}`,
  agentFrom: (source: string) => `Agent · ${source}`,
  mailLocked: "Mailvoorstellen staan op slot",
  hint: "Toetsen werken zolang deze lijst focus heeft: A accepteren · L koppelen · H uitstellen · E negeren · D delegeren.",
  inspector: {
    eyebrow: "Voorgestelde to-do · nog niet opgeslagen",
    fromMail: (name: string) => `Uit de mail van ${name}`,
    waiting: (name: string) => `Wachten op ${name}`,
    captured: (when: string) => `Vastgelegd ${when}`,
    agent: "Voorstel van je agent",
    close: "Voorstel sluiten",
    title: "Titel",
    project: "Project",
    projectFromDomain: "Project · uit het maildomein",
    noProject: "Geen project",
    deadline: "Deadline",
    deadlineFromMail: "Deadline · uit de mail",
    filled: "Velden ingevuld door je mailscan. Pas ze gerust aan.",
    flag: "Markeer de mail in Outlook met deze deadline (privé, terug te draaien)",
    duplicateStrong: "Mogelijk hetzelfde",
    duplicate: (title: string) => ` als "${title}" in Vandaag.`,
    linkInstead: "In plaats daarvan koppelen",
    accept: "Accepteren als to-do",
    link: "Koppelen aan bestaande",
    linkMenu: "Koppelen aan",
    linkNone: "Geen open to-do's om aan te koppelen",
    snooze: "Uitstellen",
    dismiss: "Negeren",
    delegate: "Onderzoek delegeren",
    reply: "Antwoord opstellen",
    convert: "Omzetten in project",
    mailLabel: "Externe mail, geciteerd",
    mailFrom: (address: string, when: string) => `Extern · van ${address} · ${when}`,
    imagesOff: "Afbeeldingen uit",
    subject: (subject: string) => `Onderwerp: ${subject}`,
    thread: (count: number) => `Draad van ${count === 1 ? "1 bericht" : `${count} berichten`} · geen eerder gekoppelde items`,
    stays: "De mail blijft in Outlook; de to-do linkt er alleen naar.",
    pick: "Kies links iets om te sorteren.",
  },
  toast: {
    accepted: "Geaccepteerd als to-do",
    linked: (title: string) => `Gekoppeld aan "${title}"`,
    snoozed: "Uitgesteld tot morgen",
    dismissed: "Genegeerd",
    failed: "Dat lukte niet. Probeer het opnieuw.",
    titleMissing: "Geef de to-do eerst een titel.",
  },
  empty: {
    title: "Je inbox is leeg",
    body: "Leg vast wat je moet onthouden. Het wacht hier tot je het sorteert, en wordt pas een to-do als jij dat zegt.",
  },
  error: "Je inbox kon niet worden geladen.",
  retry: "Opnieuw proberen",
  locked: "De inbox staat op slot",
} as const;
