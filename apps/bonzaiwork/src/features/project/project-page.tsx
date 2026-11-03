import { lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Check, ChevronDown, FolderPlus, LayoutGrid } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys, useProject, useRoutines } from "~/backend/queries";
import type { Project } from "~/backend/types";
import { ProjectIcon } from "~/components/project-icon";
import { PageTitle, TopBar, TopBarHost, type TopBarHostSlots } from "~/components/top-bar";
import { Button } from "~/components/ui/button";
import { EmptyState, Skeleton } from "~/components/ui/misc";
import { Panel, Sheet } from "~/components/ui/overlay";
import { Tabs } from "~/components/ui/tabs";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { href, navigate, type ProjectTab, type Route, type SettingsGroup, type SettingsSection } from "~/lib/router";
import { chord } from "~/lib/shortcuts";
import { DESKTOP, useMediaQuery, WIDE } from "~/lib/use-media";

import { ChatView } from "../chat/chat-view";
import { ProjectFileLinks, useOpenedFile } from "../chat/file-link";
import { ProjectHome } from "../chat/project-home";
import { useSidebarProjects } from "../projects/use-listed-projects";
import { useUi } from "../shell/ui-store";
import { BrainTab } from "../brain/brain-tab";
import { Details } from "./details";
import { FilesTab } from "./files-tab";
import { ProjectRuntimeProvider } from "./runtime";

// Routines and settings are their own chunks, fetched on the first visit of that tab.
const RoutinesPage = lazy(() => import("../routines/routines-page").then((module) => ({ default: module.RoutinesPage })));
const ProjectSettingsPage = lazy(() => import("../settings/project-settings").then((module) => ({ default: module.ProjectSettingsPage })));

const TABS: readonly ProjectTab[] = ["work", "files", "routines", "brain", "settings"];

/** An unknown id: a not-found state inside the page; the sidebar stays (brief §3, C6). */
export function ProjectMissing() {
  return (
    <div className="flex h-full flex-col">
      <TopBar>
        <PageTitle>{copy.nav.projects}</PageTitle>
      </TopBar>
      <EmptyState
        title={copy.project.notFound}
        action={
          <Button variant="secondary" onClick={() => navigate({ name: "projects" })}>
            {copy.project.notFoundAction}
          </Button>
        }
      />
    </div>
  );
}

export function ProjectLoading() {
  return (
    <div className="flex h-full flex-col" aria-busy="true">
      <TopBar>
        <Skeleton className="h-4 w-40" />
      </TopBar>
      <div className="mx-auto mt-[14vh] w-full max-w-2xl px-6">
        <Skeleton className="mx-auto mb-5 h-6 w-72" />
        <Skeleton className="h-28 w-full rounded-shell" />
      </div>
    </div>
  );
}

function TabSkeleton() {
  return (
    <div className="mx-auto mt-8 flex w-full max-w-3xl flex-col gap-4 px-6" aria-busy="true">
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>
  );
}

const SWITCHER_ITEM =
  "flex h-8 cursor-default select-none items-center gap-2 rounded-lg px-2.5 text-sm outline-none data-[highlighted]:bg-hover pointer-coarse:h-10 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground";

/** The project name as a switcher (brief §6): a Base UI menu with every project, ⌘⇧P opens it (S7). */
function ProjectSwitcher(props: { project: Project }) {
  const open = useUi((state) => state.switcherOpen);
  const setOpen = useUi((state) => state.setSwitcher);
  const { projects } = useSidebarProjects();
  const others = useMemo(() => projects.filter((project) => project.id !== props.project.id), [projects, props.project.id]);
  return (
    <MenuPrimitive.Root open={open} onOpenChange={setOpen}>
      <MenuPrimitive.Trigger
        className="flex h-8 min-w-0 items-center gap-2 rounded-full ps-1 pe-2 text-foreground transition-colors duration-100 hover:bg-hover data-[popup-open]:bg-active pointer-coarse:h-10"
        aria-label={`${props.project.name}: ${copy.project.switcher}`}
        title={`${copy.project.switcher} · ${chord("switchProject")}`}
      >
        <ProjectIcon icon={props.project.icon} color={props.project.color} />
        <span className="min-w-0 truncate text-lg font-semibold tracking-tight">{props.project.name}</span>
        <ChevronDown className="size-3.5 shrink-0 text-subtle-foreground" aria-hidden="true" />
      </MenuPrimitive.Trigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Positioner className="z-50 outline-none" sideOffset={4} align="start" collisionPadding={8}>
          <MenuPrimitive.Popup className="max-h-[var(--available-height)] min-w-56 max-w-[var(--available-width)] overflow-y-auto rounded-2xl bg-popover p-1.5 text-popover-foreground shadow-popover outline-none origin-[var(--transform-origin)] transition-[opacity,transform] duration-120 data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-75 motion-reduce:transition-none">
            <MenuPrimitive.Item className={SWITCHER_ITEM} onClick={() => navigate({ name: "project", projectId: props.project.id, chatId: null })}>
              <ProjectIcon icon={props.project.icon} color={props.project.color} size="sm" />
              <span className="min-w-0 flex-1 truncate font-semibold">{props.project.name}</span>
              <Check />
            </MenuPrimitive.Item>
            {others.map((project) => (
              <MenuPrimitive.Item key={project.id} className={SWITCHER_ITEM} onClick={() => navigate({ name: "project", projectId: project.id, chatId: null })}>
                <ProjectIcon icon={project.icon} color={project.color} size="sm" />
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
              </MenuPrimitive.Item>
            ))}
            <MenuPrimitive.Separator className="mx-1 my-1 h-px bg-border" />
            <MenuPrimitive.Item className={SWITCHER_ITEM} onClick={() => navigate({ name: "projects" })}>
              <LayoutGrid />
              <span className="min-w-0 flex-1 truncate">{copy.shell.allProjects}</span>
            </MenuPrimitive.Item>
            <MenuPrimitive.Item className={SWITCHER_ITEM} onClick={() => useUi.getState().setNewProject(true)}>
              <FolderPlus />
              <span className="min-w-0 flex-1 truncate">{copy.shell.newProject}</span>
              <kbd className="font-sans text-xs text-subtle-foreground">{chord("newProject")}</kbd>
            </MenuPrimitive.Item>
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}

function tabHref(project: Project, tab: ProjectTab): string {
  return href(parseTabRoute(project, tab));
}

/**
 * Werk · Bestanden · Routines · Brein · Instellingen (brief §6): the `Tabs` primitive with route
 * anchors, so every tab is a page with its own hash; the list is the phone's pill strip.
 */
function ProjectTabs(props: { project: Project; tab: ProjectTab; counts: Partial<Record<ProjectTab, number>>; className?: string }) {
  const items = useMemo(
    () => TABS.map((tab) => ({ value: tab, label: copy.project.tabs[tab], href: tabHref(props.project, tab), count: props.counts[tab] ?? null })),
    [props.project, props.counts],
  );
  return (
    <Tabs
      value={props.tab}
      onValueChange={(tab) => navigate(parseTabRoute(props.project, tab))}
      items={items}
      label={copy.project.tabsLabel}
      surface="page"
      className={props.className}
    />
  );
}

function parseTabRoute(project: Project, tab: ProjectTab): Route {
  switch (tab) {
    case "work":
      return { name: "project", projectId: project.id, chatId: null };
    case "files":
      return { name: "project-files", projectId: project.id };
    case "routines":
      return { name: "project-routines", projectId: project.id, routineId: null };
    case "brain":
      return { name: "project-brain", projectId: project.id };
    case "settings":
      return { name: "project-settings", projectId: project.id, group: "project" };
  }
}

function TabContent(props: { project: Project; tab: ProjectTab; routineId: string | null; group: SettingsGroup; section: SettingsSection | null }) {
  switch (props.tab) {
    case "work":
      return <ProjectHome project={props.project} />;
    case "files":
      return <FilesTab project={props.project} />;
    case "routines":
      return (
        <Suspense fallback={<TabSkeleton />}>
          <RoutinesPage projectId={props.project.id} routineId={props.routineId} />
        </Suspense>
      );
    case "brain":
      return <BrainTab project={props.project} />;
    case "settings":
      // Seam: the settings agent switches ProjectSettingsPage to `group`; until then the group's first section.
      return (
        <Suspense fallback={<TabSkeleton />}>
          <ProjectSettingsPage projectId={props.project.id} group={props.group} section={props.section} />
        </Suspense>
      );
  }
}

/** The project header: tile + name as switcher, tabs, Details. Nested pages feed their actions into it. */
function ProjectFrame(props: { project: Project; tab: ProjectTab; children: ReactNode }) {
  const backend = useBackend();
  const [leading, setLeading] = useState<HTMLElement | null>(null);
  const [actions, setActions] = useState<HTMLElement | null>(null);
  const slots = useMemo<TopBarHostSlots>(() => ({ leading, actions }), [leading, actions]);
  const files = useQuery({ queryKey: keys.files(props.project.id), queryFn: () => backend.config.files(props.project.id), staleTime: 15_000 });
  const routines = useRoutines(props.project.id);
  const counts = useMemo<Partial<Record<ProjectTab, number>>>(
    () => ({ files: files.data?.length, routines: routines.data?.filter((routine) => routine.state !== "archived").length }),
    [files.data, routines.data],
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar details actions={<div ref={setActions} className="flex items-center gap-1 empty:hidden" />}>
        <h1 className="sr-only">{props.project.name}</h1>
        <div ref={setLeading} className="flex items-center empty:hidden" />
        <ProjectSwitcher project={props.project} />
      </TopBar>
      {/* Tabs on a strip of their own: the bar keeps the name focal and room for two page actions (P7). */}
      <ProjectTabs project={props.project} tab={props.tab} counts={counts} className="shrink-0 border-b border-border px-3 py-1 lg:px-4" />
      <TopBarHost.Provider value={slots}>
        <div className="flex min-h-0 flex-1 flex-col">{props.children}</div>
      </TopBarHost.Provider>
    </div>
  );
}

/** A project: a chat, or the tab shell; the Details column on the right (brief §6). */
export function ProjectPage(props: { projectId: string; tab: ProjectTab; chatId: string | null; routineId: string | null; group: SettingsGroup; section: SettingsSection | null }) {
  const { project, isLoading } = useProject(props.projectId);
  const wide = useMediaQuery(WIDE);
  const desktop = useMediaQuery(DESKTOP);
  const sidecarPinned = useUi((state) => state.sidecarPinned);
  const sheetOpen = useUi((state) => state.sidecarSheetOpen);
  const setSheet = useUi((state) => state.setSidecarSheet);
  // A file to read gets more room than the details (brief §4); the file lives in the hash (`?bestand=`).
  const reading = useOpenedFile(props.projectId) !== null;

  if (!project) return isLoading ? <ProjectLoading /> : <ProjectMissing />;

  return (
    <ProjectRuntimeProvider projectId={project.id}>
      <div className="flex h-full min-h-0" data-sidecar-pinned={wide && sidecarPinned ? "" : undefined}>
        <div className="flex min-w-0 flex-1 flex-col">
          {props.chatId ? (
            <ProjectFileLinks project={project} chatId={props.chatId}>
              <ChatView key={props.chatId} project={project} chatId={props.chatId} />
            </ProjectFileLinks>
          ) : (
            <ProjectFrame project={project} tab={props.tab}>
              <TabContent project={project} tab={props.tab} routineId={props.routineId} group={props.group} section={props.section} />
            </ProjectFrame>
          )}
        </div>
        {wide && sidecarPinned ? (
          <aside className={cn("hidden shrink-0 border-s border-border bg-background xl:flex xl:flex-col", reading ? "w-[clamp(20rem,36vw,40rem)]" : "w-80")} aria-label={copy.shell.details}>
            <Details project={project} chatId={props.chatId} />
          </aside>
        ) : null}
        {/* 1024–1279: a non-modal panel that stays open while navigating (brief §4); phones get a sheet. */}
        <Panel open={sheetOpen && desktop && !wide} onOpenChange={setSheet} label={copy.shell.details} className={reading ? "w-[min(calc(100vw-1rem),36rem)]" : undefined}>
          <Details project={project} chatId={props.chatId} onClose={() => setSheet(false)} />
        </Panel>
        <Sheet open={sheetOpen && !desktop} onOpenChange={setSheet} side="right" label={copy.shell.details} className={reading ? "w-[min(92vw,36rem)]" : undefined}>
          <Details project={project} chatId={props.chatId} onClose={() => setSheet(false)} />
        </Sheet>
      </div>
    </ProjectRuntimeProvider>
  );
}
