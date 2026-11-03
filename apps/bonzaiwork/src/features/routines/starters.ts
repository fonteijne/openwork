import type { RoutineInput, RoutineSchedule } from "~/backend/types";
import { localTimezone, WEEKDAYS } from "~/lib/schedule";

export type StarterRoutine = { id: string; name: string; prompt: string; schedule: RoutineSchedule };

/** Three starter routines for the empty state (brief §8); each opens the editor prefilled. */
export function starterRoutines(): StarterRoutine[] {
  const timezone = localTimezone();
  return [
    {
      id: "week",
      name: "Weekoverzicht",
      prompt: "Maak een overzicht van wat er deze week in dit project is gebeurd: afgeronde taken, nieuwe bestanden en open vragen. Sluit af met de drie dingen die komende week aandacht nodig hebben.",
      schedule: { kind: "weekly", timezone, daysOfWeek: [1], hour: 8, minute: 30 },
    },
    {
      id: "files",
      name: "Dagelijkse samenvatting van nieuwe bestanden",
      prompt: "Bekijk de bestanden die sinds gisteren zijn toegevoegd of gewijzigd en vat per bestand in één zin samen wat erin staat en wat ermee moet gebeuren.",
      schedule: { kind: "weekly", timezone, daysOfWeek: WEEKDAYS, hour: 9, minute: 0 },
    },
    {
      id: "closing",
      name: "Maandafsluiting voorbereiden",
      prompt: "Zet de openstaande posten van deze maand op een rij, markeer wat nog ontbreekt en maak een lijst van wat de boekhouder nodig heeft.",
      schedule: { kind: "weekly", timezone, daysOfWeek: [5], hour: 16, minute: 0 },
    },
  ];
}

export function starterTemplate(starter: StarterRoutine): Partial<RoutineInput> {
  return { name: starter.name, prompt: starter.prompt, schedule: starter.schedule };
}
