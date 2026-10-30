import type { RemoteProblem } from "./ssh.ts";

/**
 * What a brain's status says when something stops it (BrainStatus.error).
 * Dutch, what happened plus what to do next (DESIGN.md C6), no git words
 * (C3). The English git/ssh text only goes to the log.
 */
export function remoteProblemMessage(problem: RemoteProblem, platform: NodeJS.Platform = process.platform): string {
  switch (problem) {
    case "host_unknown":
      return "De server van dit brein is nog onbekend. Controleer de vingerafdruk en bevestig hem.";
    case "host_changed":
      return "De server van dit brein meldt zich anders dan eerst. Synchroniseren is gestopt; vraag je beheerder of dit klopt.";
    case "no_access":
      return "Je account heeft geen toegang tot dit brein. Vraag de beheerder je toe te voegen, of controleer of je SSH-sleutel bij je account staat.";
    case "key_locked":
      return platform === "win32"
        ? "Je SSH-sleutel is vergrendeld. Zet in Services de 'OpenSSH Authentication Agent' aan en voeg je sleutel toe met ssh-add."
        : "Je SSH-sleutel is vergrendeld. Ontgrendel hem in je sleutelhanger of voeg hem toe met ssh-add.";
    case "not_found":
      return "Dit brein bestaat niet (meer) op deze plek. Controleer de link.";
    case "read_only":
      return "Je kunt dit brein lezen maar niet wijzigen. Je wijzigingen blijven op deze laptop; vraag de beheerder om schrijfrechten.";
    case "rejected":
      return "Iemand anders deelde net een wijziging. Probeer het zo opnieuw.";
    case "unreachable":
      return "De server van dit brein is niet bereikbaar. Je wijzigingen worden gedeeld zodra hij terug is.";
    case "offline":
      return "Geen verbinding. Je wijzigingen worden gedeeld zodra je weer online bent.";
    case "ssh_missing":
      return platform === "win32"
        ? "SSH ontbreekt op deze computer. Zet 'OpenSSH-client' aan via Instellingen > Optionele onderdelen."
        : "SSH ontbreekt op deze computer. Installeer de OpenSSH-client.";
    case "unknown":
      return "Synchroniseren lukte niet. Probeer het opnieuw; blijft het misgaan, kijk dan in het logboek.";
  }
}

export const SYNC_MESSAGES = {
  secret: (file: string) => `Niet gedeeld: ${file} lijkt een wachtwoord of sleutel te bevatten. Haal het weg en probeer opnieuw.`,
  configChanged: "De instellingen van dit brein zijn buiten BonzaiWork om veranderd. Synchroniseren is gestopt; kies Herstellen.",
  remoteChanged: "Dit brein wijst naar een andere plek dan waar je het vandaan haalde. Synchroniseren is gestopt; kies Herstellen.",
  branchChanged: "Dit brein staat op een andere versie dan de gedeelde. Synchroniseren is gestopt; kies Herstellen.",
  historyRewritten: "De gedeelde geschiedenis van dit brein is buiten BonzaiWork om herschreven. Er is niets verstuurd; vraag de beheerder wat er gebeurde.",
  conflict: "Jij en een ander wijzigden hetzelfde. Er is niets verloren; kies hoe je verder wilt.",
  merging: "Beide versies staan in de notities; een chat voegt ze samen. Daarna deelt BonzaiWork weer.",
  mergeUnfinished: (count: number) => `In ${count === 1 ? "één notitie staan" : `${count} notities staan`} nog twee versies. Laat de AI het opnieuw doen, of voeg ze zelf samen.`,
  revertConflict: "Deze beurt is niet zomaar terug te draaien: er is daarna nog aan dezelfde notities gewerkt. Zet de notities een voor een terug.",
  invalidKnowledge: (files: readonly string[]) => `Niet gedeeld: ${files.join(", ")} ${files.length === 1 ? "mist" : "missen"} de kop met het type (OKF). Laat de AI het herstellen of vul het type in.`,
  brokenWorkflow: (problems: ReadonlyArray<{ path: string; problem: string }>) => `Niet gedeeld: in de werkwijze ${problems.map((item) => `${item.path} (${item.problem})`).join("; ")}. Laat de AI het herstellen of pas het aan.`,
} as const;
