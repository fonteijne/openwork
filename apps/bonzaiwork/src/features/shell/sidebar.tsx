import { useMemo } from "react";
import { CalendarClock, ChevronLeft, FolderPlus, LayoutGrid, Megaphone, MessageSquarePlus, Search, Settings, SlidersHorizontal } from "lucide-react";

import { useBackend } from "~/backend/context";
import { useProject, useProjects, useStatus } from "~/backend/queries";
import type { Project } from "~/backend/types";
import { BrandMark } from "~/components/brand";
import { ProjectIcon } from "~/components/project-icon";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/misc";
import { Tooltip } from "~/components/ui/tooltip";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { href, navigate, type Route } from "~/lib/router";

import { ChatList } from "../chat/chat-list";
import { useUi } from "./ui-store";

export const FOCUS_COMPOSER_EVENT = "bonzaiwork:focus-composer";
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? "⌘" : "Ctrl";

function NavLink(props: { href: string; icon: React.ReactNode; label: string; active: boolean; trailing?: React.ReactNode }) {
  return (
    <a
      href={props.href}
      aria-current={props.active ? "page" : undefined}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-full px-3 text-sm text-muted-foreground transition-colors duration-100 hover:bg-hover hover:text-foreground pointer-coarse:h-10 [&_svg]:size-4 [&_svg]:shrink-0",
        props.active && "bg-background font-semibold text-foreground shadow-card",
      )}
    >
      {props.icon}
      <span className="min-w-0 flex-1 truncate">{props.label}</span>
      {props.trailing}
    </a>
  );
}

function ProjectLink(props: { project: Project; active: boolean }) {
  return (
    <a
      href={href({ name: "project", projectId: props.project.id, chatId: null })}
      aria-current={props.active ? "page" : undefined}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-full px-2 text-sm text-muted-foreground transition-colors duration-100 hover:bg-hover hover:text-foreground pointer-coarse:h-10",
        props.active && "bg-background font-semibold text-foreground shadow-card",
      )}
    >
      <ProjectIcon icon={props.project.icon} color={props.project.color} size="sm" />
      <span className="min-w-0 flex-1 truncate">{props.project.name}</span>
    </a>
  );
}

function GlobalNav(props: { route: Route }) {
  const projects = useProjects();
  const setNewProject = useUi((state) => state.setNewProject);
  const status = useStatus();
  const active = useMemo(() => (projects.data ?? []).filter((project) => !project.archivedAt).sort((a, b) => a.name.localeCompare(b.name, "nl")), [projects.data]);
  const pinned = active.filter((project) => project.pinned);
  const others = active.filter((project) => !project.pinned);
  return (
    <>
      <nav className="flex flex-col gap-px px-2 pt-1" aria-label={copy.appName}>
        <NavLink href={href({ name: "projects" })} icon={<LayoutGrid />} label={copy.nav.projects} active={props.route.name === "projects"} />
        <NavLink href={href({ name: "routines", routineId: null })} icon={<CalendarClock />} label={copy.nav.routines} active={props.route.name === "routines"} />
        <NavLink href={href({ name: "settings" })} icon={<Settings />} label={copy.nav.settings} active={props.route.name === "settings"} />
      </nav>
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {projects.isLoading ? (
          <div className="flex flex-col gap-2 px-2 pt-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
        ) : (
          <>
            {pinned.length ? (
              <div className="mb-3">
                <p className="px-2.5 pb-1 text-xs font-medium text-subtle-foreground">{copy.nav.pinned}</p>
                <div className="flex flex-col gap-px">
                  {pinned.map((project) => (
                    <ProjectLink key={project.id} project={project} active={false} />
                  ))}
                </div>
              </div>
            ) : null}
            {others.length ? (
              <div>
                <p className="px-2.5 pb-1 text-xs font-medium text-subtle-foreground">{copy.nav.projects}</p>
                <div className="flex flex-col gap-px">
                  {others.map((project) => (
                    <ProjectLink key={project.id} project={project} active={false} />
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
      <div className="border-t border-border p-2">
        <Button variant="ghost" className="w-full justify-start gap-2.5 px-2.5 text-muted-foreground hover:text-foreground" onClick={() => setNewProject(true)} disabled={status.data?.readOnly}>
          <FolderPlus />
          {copy.projects.new}
        </Button>
      </div>
    </>
  );
}

function ProjectNav(props: { projectId: string; route: Route }) {
  const { project, isLoading } = useProject(props.projectId);
  const activeChatId = props.route.name === "project" ? props.route.chatId : null;
  return (
    <>
      <div className="px-2 pt-1">
        <a
          href={href({ name: "projects" })}
          className="mb-1 inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs text-subtle-foreground hover:bg-hover hover:text-foreground pointer-coarse:h-9"
        >
          <ChevronLeft className="size-3.5" />
          {copy.nav.allProjects}
        </a>
        <a
          href={href({ name: "project", projectId: props.projectId, chatId: null })}
          className="flex items-center gap-2.5 rounded-full px-1.5 py-1.5 hover:bg-hover"
        >
          {project ? <ProjectIcon icon={project.icon} color={project.color} /> : <Skeleton className="size-7" />}
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{project?.name ?? (isLoading ? "" : "—")}</span>
        </a>
        <Button
          variant="secondary"
          className="mt-2 mb-2 w-full justify-start gap-2"
          onClick={() => {
            navigate({ name: "project", projectId: props.projectId, chatId: null });
            window.setTimeout(() => window.dispatchEvent(new Event(FOCUS_COMPOSER_EVENT)), 30);
          }}
        >
          <MessageSquarePlus />
          {copy.chatList.newChat}
        </Button>
      </div>
      <ChatList activeChatId={activeChatId} />
      <div className="flex flex-col gap-px border-t border-border p-2">
        <NavLink href={href({ name: "project-routines", projectId: props.projectId, routineId: null })} icon={<CalendarClock />} label={copy.nav.routines} active={props.route.name === "project-routines"} />
        <NavLink href={href({ name: "project-settings", projectId: props.projectId, section: "general" })} icon={<SlidersHorizontal />} label={copy.settings.projectTitle} active={props.route.name === "project-settings"} />
      </div>
    </>
  );
}

export function Sidebar(props: { route: Route; projectId: string | null }) {
  const backend = useBackend();
  const setPalette = useUi((state) => state.setPalette);
  const setFeedback = useUi((state) => state.setFeedback);
  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <div className="flex h-12 shrink-0 items-center gap-2 px-3 pt-[env(safe-area-inset-top)]" data-titlebar="sidebar">
        <a href={href({ name: "projects" })} className="flex min-w-0 items-center gap-2 rounded-full py-1 pe-1.5" aria-label={copy.appName}>
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
        <Tooltip label={copy.nav.searchHint} shortcut={`${MOD} K`} side="bottom">
          <Button variant="quiet" size="icon-sm" aria-label={copy.nav.search} onClick={() => setPalette(true)}>
            <Search />
          </Button>
        </Tooltip>
      </div>
      {props.projectId ? <ProjectNav projectId={props.projectId} route={props.route} /> : <GlobalNav route={props.route} />}
      <div className="px-2 pb-2">
        <Button variant="ghost" className="w-full justify-start gap-2.5 px-2.5 text-muted-foreground hover:text-foreground" onClick={() => setFeedback(true)}>
          <Megaphone />
          {copy.feedback.open}
        </Button>
      </div>
    </div>
  );
}
