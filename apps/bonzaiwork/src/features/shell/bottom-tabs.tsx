import type { ReactNode } from "react";
import { BookOpen, CalendarClock, Clock, Ellipsis, Inbox, Keyboard, LayoutGrid, Megaphone, Settings } from "lucide-react";

import { Menu, MenuItem } from "~/components/ui/menu";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { href, navigate, type Route } from "~/lib/router";
import { useMediaQuery, WIDE } from "~/lib/use-media";

import { useAttentionCounts } from "./sidebar";
import { useUi } from "./ui-store";

const TAB = "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground [&_svg]:size-5 [&_svg]:shrink-0";

function Tab(props: { href: string; icon: ReactNode; label: string; active: boolean; count?: number; countLabel?: string }) {
  return (
    <a href={props.href} aria-current={props.active ? "page" : undefined} aria-label={props.count ? props.countLabel : undefined} className={cn(TAB, props.active && "text-foreground")}>
      <span className="relative">
        {props.icon}
        {props.count ? (
          <span aria-hidden="true" className="absolute -top-1 -right-2 min-w-4 rounded-full bg-amber-9 px-1 text-center text-[10px] font-semibold leading-4 text-ink-12 tabular-nums">
            {props.count}
          </span>
        ) : null}
      </span>
      <span className="truncate">{props.label}</span>
    </a>
  );
}

/** Below 640px: Vandaag · Projecten · Routines · Meer (brief §4). "Meer" is a list with words. */
export function BottomTabs(props: { route: Route }) {
  const wide = useMediaQuery(WIDE);
  const counts = useAttentionCounts();
  const toggleAgenda = useUi((state) => state.toggleAgenda);
  const setShortcuts = useUi((state) => state.setShortcuts);
  const setFeedback = useUi((state) => state.setFeedback);
  const name = props.route.name;
  const inProjects = name === "projects" || name.startsWith("project");
  return (
    <nav aria-label={copy.appName} className="flex h-14 shrink-0 items-stretch border-t border-border bg-sidebar pb-[env(safe-area-inset-bottom)]">
      <Tab href={href({ name: "home" })} icon={<Inbox />} label={copy.shell.today} active={name === "home"} count={counts.today} countLabel={copy.shell.todayBadge(counts.today)} />
      <Tab href={href({ name: "projects" })} icon={<LayoutGrid />} label={copy.shell.projects} active={inProjects} />
      <Tab
        href={href({ name: "routines", routineId: null })}
        icon={<CalendarClock />}
        label={copy.shell.routines}
        active={name === "routines"}
        count={counts.routines}
        countLabel={copy.shell.routinesBadge(counts.routines)}
      />
      <Menu
        side="top"
        align="end"
        trigger={
          <button type="button" className={cn(TAB, (name === "brain" || name === "settings") && "text-foreground")} aria-label={copy.shell.more}>
            <Ellipsis />
            <span>{copy.shell.more}</span>
          </button>
        }
      >
        <MenuItem icon={<BookOpen />} onClick={() => navigate({ name: "brain" })}>
          {copy.shell.brain}
        </MenuItem>
        <MenuItem icon={<Clock />} onClick={() => toggleAgenda(wide)}>
          {copy.shell.agenda}
        </MenuItem>
        <MenuItem icon={<Settings />} onClick={() => navigate({ name: "settings" })}>
          {copy.shell.settings}
        </MenuItem>
        <MenuItem icon={<Keyboard />} onClick={() => setShortcuts(true)}>
          {copy.shell.shortcutsTitle}
        </MenuItem>
        <MenuItem icon={<Megaphone />} onClick={() => setFeedback(true)}>
          {copy.shell.feedback}
        </MenuItem>
      </Menu>
    </nav>
  );
}
