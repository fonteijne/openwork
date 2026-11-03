import { Clock, Lock } from "lucide-react";

import { useBackend } from "~/backend/context";
import { useAgendaDay, useAgendaSettings } from "~/backend/queries";
import { Tooltip } from "~/components/ui/tooltip";
import { copy } from "~/copy";
import { useUi } from "~/features/shell/ui-store";
import { cn } from "~/lib/cn";
import { chord } from "~/lib/shortcuts";
import { useMediaQuery, WIDE } from "~/lib/use-media";

import { dateOf, timeOf } from "./format";

/**
 * The agenda in the sidebar footer, on every page (brief §4, decision A2): what you are on now and
 * since when, or "Niet in BonzaiWork". Reads today once a minute; a click or ⌘J opens the panel.
 * Without the agenda on the server it stays visible with a lock (P4); with tracking off it is muted.
 * Same `agenda-pill` testid and chord as the former top-bar pill.
 */
export function AgendaStatusRow() {
  const backend = useBackend();
  const available = backend.capabilities.agenda;
  const wide = useMediaQuery(WIDE);
  const open = useUi((state) => state.agendaOpen);
  const toggle = useUi((state) => state.toggleAgenda);
  const settings = useAgendaSettings(available);
  const enabled = settings.data?.enabled ?? true;
  const day = useAgendaDay(dateOf(Date.now()), { enabled: available && enabled });
  const now = day.data?.now ?? null;

  const away = now?.label === copy.agenda.away;
  const label = !available || !enabled || !now ? copy.agenda.title : away ? copy.shell.notInApp : now.label;
  // "Sinds" only on a project: the start of an away stretch reads like a stopwatch on pause (assessment L2).
  const since = available && enabled && now && !away ? copy.agenda.since(timeOf(now.since)) : null;
  const tooltip = !available ? copy.agenda.unavailable : !enabled ? copy.agenda.off : open ? copy.agenda.close : copy.agenda.open;

  return (
    <Tooltip label={tooltip} shortcut={chord("agenda")} side="top">
      <button
        type="button"
        data-testid="agenda-pill"
        aria-label={since ? `${copy.agenda.title}: ${label}, ${since}` : copy.agenda.title}
        aria-expanded={open}
        onClick={() => toggle(wide)}
        className={cn(
          "flex h-8 w-full min-w-0 items-center gap-2 rounded-full px-2.5 text-xs font-medium transition-colors duration-150 hover:bg-hover pointer-coarse:h-10 [&_svg]:size-3.5 [&_svg]:shrink-0",
          open ? "bg-active text-foreground" : "text-foreground",
          (!available || !enabled || away) && "text-muted-foreground",
        )}
      >
        {available ? <Clock aria-hidden="true" /> : <Lock aria-hidden="true" />}
        <span className="min-w-0 truncate">{label}</span>
        {since ? <span className="shrink-0 truncate font-normal text-subtle-foreground">· {since}</span> : null}
        <kbd className="ms-auto shrink-0 font-sans text-[11px] font-normal text-subtle-foreground pointer-coarse:hidden">{chord("agenda")}</kbd>
      </button>
    </Tooltip>
  );
}
