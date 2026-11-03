import { useQueries } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays } from "@bonzaiwork/agenda/model";

import { useBackend } from "~/backend/context";
import { keys } from "~/backend/queries";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/cn";
import { copy } from "~/copy";

import { weekDates } from "./day-model";
import { dayTitle, dutchDuration, minutesToBook } from "./format";

/**
 * The week strip (brief §8; assessment I5, M2): seven cells Monday to Sunday with the hours of
 * each day and the only amber on the strip where a post is missing (V2); a press shows that
 * day, "Vandaag" is one press away from anywhere. The days share the panel's day cache
 * (`keys.agendaDay`), so showing a day costs nothing the second time. Future days stay in
 * place, muted (P4 by analogy: the week keeps its shape).
 */

const weekdayShort = new Intl.DateTimeFormat("nl-NL", { weekday: "short" });
const dayOfMonth = new Intl.DateTimeFormat("nl-NL", { day: "numeric" });

function localDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

/** "5u" or "45m": whole hours once there are any; the Dagkaart carries the exact total. */
function compactDuration(minutes: number): string {
  if (!minutes) return "–";
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}u` : `${minutes}m`;
}

export function WeekStrip(props: { date: string; today: string; onSelect: (date: string) => void }) {
  const backend = useBackend();
  const dates = weekDates(props.date);
  const days = useQueries({
    queries: dates.map((date) => ({
      queryKey: keys.agendaDay(date),
      queryFn: () => backend.agenda.day(date),
      enabled: backend.capabilities.agenda && date <= props.today,
      staleTime: 60_000,
    })),
  });
  const first = dates[0] ?? props.date;
  const nextWeek = addDays(first, 7);

  return (
    <div className="flex flex-col gap-1" data-testid="agenda-week">
      <div className="flex items-center gap-1">
        <Button variant="quiet" size="icon-sm" aria-label={copy.agenda.week.previous} onClick={() => props.onSelect(addDays(props.date, -7))}>
          <ChevronLeft />
        </Button>
        <div role="group" aria-label={copy.agenda.week.label} className="grid min-w-0 flex-1 grid-cols-7 gap-0.5">
          {dates.map((date, index) => {
            const day = days[index]?.data;
            const future = date > props.today;
            const selected = date === props.date;
            const tracked = day ? minutesToBook(day) : 0;
            const missing = day ? day.missingPosts * 15 : 0;
            const local = localDate(date);
            const label = copy.agenda.week.cell(
              dayTitle(date, props.today),
              future ? copy.agenda.week.future : day ? (tracked ? dutchDuration(tracked) : copy.agenda.week.nothing) : null,
              missing ? dutchDuration(missing) : null,
            );
            return (
              <button
                key={date}
                type="button"
                disabled={future}
                aria-pressed={selected}
                aria-label={label}
                onClick={() => props.onSelect(date)}
                className={cn(
                  "flex h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] leading-none outline-none transition-colors duration-100 hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45 motion-reduce:transition-none pointer-coarse:h-12",
                  selected ? "bg-background font-semibold text-foreground shadow-card" : "text-muted-foreground",
                  date === props.today && !selected && "text-foreground",
                )}
              >
                <span>
                  {weekdayShort.format(local).replace(".", "")} <span className="tabular-nums">{dayOfMonth.format(local)}</span>
                </span>
                <span className="flex items-center gap-1 tabular-nums">
                  {future ? "·" : compactDuration(tracked)}
                  {/* Amber only where a post is missing (V2). */}
                  {missing ? <span aria-hidden="true" className="size-1.5 rounded-full bg-amber-9 ring-1 ring-inset ring-amber-11/50" /> : null}
                </span>
              </button>
            );
          })}
        </div>
        <Button variant="quiet" size="icon-sm" aria-label={copy.agenda.week.next} onClick={() => props.onSelect(nextWeek > props.today ? props.today : addDays(props.date, 7))} disabled={nextWeek > props.today}>
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
