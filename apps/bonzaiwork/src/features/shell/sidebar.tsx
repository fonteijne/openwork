import { useMemo, useState } from "react";
import { BookOpen, CalendarClock, ChevronRight, Inbox, MessageSquarePlus, PanelLeftClose, Plus, Search, Settings } from "lucide-react";

import { useBackend } from "~/backend/context";
import { projectHasKey, usePersonalBrain, useProjects, useStatus } from "~/backend/queries";
import type { Project } from "~/backend/types";
import { BrandMark } from "~/components/brand";
import { ProjectIcon } from "~/components/project-icon";
import { Button } from "~/components/ui/button";
import { StatusChip, type ChipStatus } from "~/components/ui/chip";
import { Skeleton } from "~/components/ui/misc";
import { Tooltip } from "~/components/ui/tooltip";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { href, navigate, type Route } from "~/lib/router";
import { chord, focusComposer } from "~/lib/shortcuts";
import { DESKTOP, useMediaQuery } from "~/lib/use-media";

import { AgendaStatusRow } from "../agenda/agenda-status-row";
import { ChatList } from "../chat/chat-list";
import { ProjectRuntimeProvider } from "../project/runtime";
import { projectChipStatus, useAttentionCounts, useSidebarProjects } from "../projects/use-listed-projects";
import { HelpMenu } from "./help-menu";
import { useUi } from "./ui-store";

// Kept for pages that still import them from here; the sources are src/lib.
export { FOCUS_COMPOSER_EVENT } from "~/lib/shortcuts";
export { MOD } from "~/lib/platform";

/** At most this many collapsed project rows; the rest is behind "Alle projecten" (brief §4). */
const MAX_ROWS = 8;

function NavLink(props: { href: string; icon: React.ReactNode; label: string; active: boolean; count?: number; countLabel?: string }) {
  return (
    <a
      href={props.href}
      aria-current={props.active ? "page" : undefined}
      aria-label={props.count ? props.countLabel : undefined}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-full px-3 text-sm text-muted-foreground transition-colors duration-100 hover:bg-hover hover:text-foreground pointer-coarse:h-10 [&_svg]:size-4 [&_svg]:shrink-0",
        props.active && "bg-background font-semibold text-foreground shadow-card",
      )}
    >
      {props.icon}
      <span className="min-w-0 flex-1 truncate">{props.label}</span>
      {props.count ? <span aria-hidden="true" className="min-w-5 rounded-full bg-amber-3 px-1.5 text-center text-[11px] font-semibold text-amber-11 tabular-nums">{props.count}</span> : null}
    </a>
  );
}

/** The open project's chats, in place (brief §4). "Nieuwe chat" is the one filled control (P7). */
function ExpandedProject(props: { project: Project; activeChatId: string | null; open: boolean }) {
  return (
    <div className="ms-2.5 mt-1 mb-2 flex flex-col border-s border-border ps-0.5">
      <Button
        variant="secondary"
        size="sm"
        className="mx-1 mb-1 justify-start gap-2 px-2.5"
        onClick={() => {
          navigate({ name: "project", projectId: props.project.id, chatId: null });
          focusComposer();
        }}
      >
        <MessageSquarePlus />
        <span className="min-w-0 flex-1 truncate text-start">{copy.chatList.newChat}</span>
        {props.open ? <kbd className="font-sans text-[11px] font-normal text-subtle-foreground pointer-coarse:hidden">{chord("newChat")}</kbd> : null}
      </Button>
      <ChatList activeChatId={props.activeChatId} />
    </div>
  );
}

/** Short words in the 256px column ("Wacht", not "Wacht op jou"); the dots of Bezig and Wacht need their word (V2). */
function sidebarStatusWord(status: ChipStatus): string | undefined {
  if (status === "locked") return copy.shell.status.locked;
  if (status === "waiting") return copy.shell.status.waitingShort;
  return undefined;
}

function ProjectRow(props: { project: Project; status: ChipStatus; open: boolean; expanded: boolean; activeChatId: string | null; onToggle: () => void }) {
  const { project } = props;
  return (
    <li>
      <div className={cn("flex h-8 items-center gap-1 rounded-full pe-2.5 ps-1 transition-colors duration-100 hover:bg-hover pointer-coarse:h-11", props.open && "bg-background shadow-card")}>
        <button
          type="button"
          aria-expanded={props.expanded}
          aria-label={props.expanded ? copy.shell.collapseProject(project.name) : copy.shell.expandProject(project.name)}
          onClick={props.onToggle}
          className="flex size-6 shrink-0 items-center justify-center rounded-full text-subtle-foreground hover:bg-active hover:text-foreground pointer-coarse:size-11"
        >
          <ChevronRight className={cn("size-3.5 transition-transform duration-150 motion-reduce:transition-none", props.expanded && "rotate-90")} aria-hidden="true" />
        </button>
        <a
          href={href({ name: "project", projectId: project.id, chatId: null })}
          aria-current={props.open ? "page" : undefined}
          // The name gets the room: short words for running/waiting, an icon alone (word on hover and for
          // assistive tech) for failed and "Geen key", whose shapes differ.
          className={cn("flex h-full min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground hover:text-foreground", props.open && "font-semibold text-foreground")}
        >
          <ProjectIcon icon={project.icon} color={project.color} size="sm" />
          <span className="min-w-0 flex-1 truncate">{project.name}</span>
        </a>
        <StatusChip status={props.status} label={sidebarStatusWord(props.status)} wordHidden={props.status === "failed" || props.status === "locked"} className="shrink-0 text-[11px]" />
      </div>
      {props.expanded ? (
        <ProjectRuntimeProvider projectId={project.id}>
          <ExpandedProject project={project} activeChatId={props.activeChatId} open={props.open} />
        </ProjectRuntimeProvider>
      ) : null}
    </li>
  );
}

/** One sidebar, the same shape on every page (brief §4). */
export function Sidebar(props: { route: Route; projectId: string | null }) {
  const backend = useBackend();
  const status = useStatus();
  const desktop = useMediaQuery(DESKTOP);
  const setPalette = useUi((state) => state.setPalette);
  const setNewProject = useUi((state) => state.setNewProject);
  const toggleSidebar = useUi((state) => state.toggleSidebar);
  const expandedId = useUi((state) => state.expandedProjectId);
  const setExpanded = useUi((state) => state.setExpandedProject);
  const { projects, summaries, isLoading } = useSidebarProjects();
  const counts = useAttentionCounts();
  const openId = props.projectId;
  // The open project starts expanded; its chevron folds it in until another project is opened.
  const [collapsedOpen, setCollapsedOpen] = useState<string | null>(null);
  if (collapsedOpen !== null && collapsedOpen !== openId) setCollapsedOpen(null);
  const activeChatId = props.route.name === "project" ? props.route.chatId : null;
  // "Jouw brein" is no project row (decision B1), but its chats are: while a page of the brain's own
  // project is open they sit under the nav item. On #/brein the page itself lists them (P7).
  const allProjects = useProjects();
  const personalId = usePersonalBrain()?.projectId ?? null;
  const personalProject = personalId ? ((allProjects.data ?? []).find((project) => project.id === personalId) ?? null) : null;
  const inBrainProject = personalId !== null && openId === personalId;

  // The open project is always listed and expanded unless folded in by hand; one other row may be open by hand.
  const visible = useMemo(() => {
    const rows = projects.slice(0, MAX_ROWS);
    if (openId && !rows.some((project) => project.id === openId)) {
      const open = projects.find((project) => project.id === openId);
      if (open) rows.push(open);
    }
    return rows;
  }, [projects, openId]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <div className="flex h-12 shrink-0 items-center gap-1.5 px-2 pt-[env(safe-area-inset-top)]" data-titlebar="sidebar">
        <Tooltip label={copy.nav.searchHint} shortcut={chord("search")} side="bottom">
          <Button variant="quiet" size="icon-sm" aria-label={copy.nav.search} onClick={() => setPalette(true)}>
            <Search />
          </Button>
        </Tooltip>
        <a href={href({ name: "home" })} className="flex min-w-0 items-center gap-2 rounded-full py-1 pe-1.5" aria-label={copy.appName}>
          <BrandMark />
          <span className="truncate text-sm font-semibold tracking-tight text-foreground">{copy.appName}</span>
        </a>
        {backend.mode === "demo" ? (
          <Tooltip label={copy.boot.demoHint} side="bottom">
            <span tabIndex={0} className="rounded-full bg-electric-3 px-2 py-px text-[11px] font-semibold text-electric-11">
              {copy.boot.demoBadge}
            </span>
          </Tooltip>
        ) : null}
        <div className="flex-1" />
        {desktop ? (
          <Tooltip label={copy.shell.sidebarCollapse} shortcut={chord("sidebar")} side="bottom">
            <Button variant="quiet" size="icon-sm" aria-label={copy.shell.sidebarCollapse} onClick={toggleSidebar}>
              <PanelLeftClose />
            </Button>
          </Tooltip>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <nav className="flex flex-col gap-px pt-1" aria-label={copy.appName}>
          <NavLink href={href({ name: "home" })} icon={<Inbox />} label={copy.shell.today} active={props.route.name === "home"} count={counts.today} countLabel={copy.shell.todayBadge(counts.today)} />
          <NavLink
            href={href({ name: "routines", routineId: null })}
            icon={<CalendarClock />}
            label={copy.shell.routines}
            active={props.route.name === "routines"}
            count={counts.routines}
            countLabel={copy.shell.routinesBadge(counts.routines)}
          />
          <NavLink href={href({ name: "brain" })} icon={<BookOpen />} label={copy.shell.brain} active={props.route.name === "brain" || inBrainProject} />
          {inBrainProject && personalProject ? (
            <div data-testid="sidebar-brain-chats">
              <ProjectRuntimeProvider projectId={personalProject.id}>
                <ExpandedProject project={personalProject} activeChatId={activeChatId} open />
              </ProjectRuntimeProvider>
            </div>
          ) : null}
          <NavLink href={href({ name: "settings" })} icon={<Settings />} label={copy.shell.settings} active={props.route.name === "settings"} />
        </nav>

        <div className="mt-4 flex h-7 items-center justify-between gap-2 ps-3 pe-0.5">
          <span className="text-xs font-medium text-subtle-foreground">{copy.shell.projects}</span>
          <Tooltip label={copy.shell.newProject} shortcut={chord("newProject")} side="bottom">
            <Button variant="quiet" size="icon-sm" className="size-6" aria-label={copy.shell.newProject} disabled={status.data?.readOnly} onClick={() => setNewProject(true)}>
              <Plus />
            </Button>
          </Tooltip>
        </div>
        {isLoading ? (
          <div className="flex flex-col gap-2 px-3 pt-2" aria-busy="true">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-28" />
          </div>
        ) : (
          <ul className="flex flex-col gap-px" aria-label={copy.shell.projects}>
            {visible.map((project) => {
              const open = project.id === openId;
              const summary = summaries.get(project.id);
              const projectStatus = projectChipStatus(projectHasKey(status.data, project), summary);
              return (
                <ProjectRow
                  key={project.id}
                  project={project}
                  status={projectStatus}
                  open={open}
                  expanded={open ? collapsedOpen !== project.id : project.id === expandedId}
                  activeChatId={open ? activeChatId : null}
                  onToggle={() => {
                    if (open) setCollapsedOpen(collapsedOpen === project.id ? null : project.id);
                    else setExpanded(expandedId === project.id ? null : project.id);
                  }}
                />
              );
            })}
          </ul>
        )}
        <a
          href={href({ name: "projects" })}
          aria-current={props.route.name === "projects" ? "page" : undefined}
          className={cn(
            "mt-1 flex h-8 items-center rounded-full px-3 text-sm text-muted-foreground transition-colors duration-100 hover:bg-hover hover:text-foreground pointer-coarse:h-10",
            props.route.name === "projects" && "bg-background font-semibold text-foreground shadow-card",
          )}
        >
          {copy.shell.allProjects}
        </a>
      </div>

      <div className="shrink-0 border-t border-border p-2">
        <AgendaStatusRow />
        <div className="mt-1 flex items-center justify-between">
          <HelpMenu />
        </div>
      </div>
    </div>
  );
}
