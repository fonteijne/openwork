import { Clock, Lock } from "lucide-react";

import { useBackend } from "~/backend/context";
import { useAgendaDay, useAgendaSettings } from "~/backend/queries";
import { Tooltip } from "~/components/ui/tooltip";
import { copy } from "~/copy";
import { MOD } from "~/features/shell/sidebar";
import { useUi } from "~/features/shell/ui-store";
import { cn } from "~/lib/cn";
import { useMediaQuery, WIDE } from "~/lib/use-media";

import { dateOf, timeOf } from "./format";

/**
 * The agenda in the top bar, on every page (plan §7.2): what you are on now and since when, or
 * "Away from BonzaiWork". Reads today once a minute; a click or ⌘J opens the panel. Without the
 * agenda on the server it stays visible with a lock (P4); with tracking off it is muted.
 */
export function AgendaPill() {
  const backend = useBackend();
  const available = backend.capabilities.agenda;
  const wide = useMediaQuery(WIDE);
  const open = useUi((state) => state.agendaOpen);
  const toggle = useUi((state) => state.toggleAgenda);
  const settings = useAgendaSettings(available);
  const enabled = settings.data?.enabled ?? true;
  const day = useAgendaDay(dateOf(Date.now()), { enabled: available && enabled });
  const now = day.data?.now ?? null;

  const label = !available || !enabled || !now ? copy.agenda.title : now.label;
  const since = available && enabled && now ? copy.agenda.since(timeOf(now.since)) : null;
  const tooltip = !available ? copy.agenda.unavailable : !enabled ? copy.agenda.off : open ? copy.agenda.close : copy.agenda.open;

  return (
    <Tooltip label={tooltip} shortcut={`${MOD} J`} side="bottom">
      <button
        type="button"
        data-testid="agenda-pill"
        aria-label={since ? `${copy.agenda.title}: ${label}, ${since}` : copy.agenda.title}
        aria-expanded={open}
        onClick={() => toggle(wide)}
        className={cn(
          "inline-flex h-7 min-w-0 max-w-[16rem] items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ring-1 ring-inset ring-border transition-colors duration-150 hover:bg-hover pointer-coarse:h-9 [&_svg]:size-3.5 [&_svg]:shrink-0",
          open ? "bg-active text-foreground" : "text-foreground",
          (!available || !enabled) && "text-muted-foreground",
        )}
      >
        {available ? <Clock aria-hidden="true" /> : <Lock aria-hidden="true" />}
        <span className="min-w-0 truncate max-sm:hidden">{label}</span>
        {since ? <span className="shrink-0 text-muted-foreground max-md:hidden">{since}</span> : null}
      </button>
    </Tooltip>
  );
}
