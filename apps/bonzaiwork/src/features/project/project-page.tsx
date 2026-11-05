import { lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Check, ChevronsUpDown, FolderPlus, LayoutGrid } from "lucide-react";

import type { ProjectBrief } from "~/backend/cockpit";
import { useBrief, useRuns, useTodos } from "~/backend/cockpit-queries";
import { useProject } from "~/backend/queries";
import type { Project } from "~/backend/types";
import { PageHero, Tag, dot } from "~/components/io";
import { ProjectIcon } from "~/components/project-icon";
import { TopBarHost, type TopBarHostSlots } from "~/components/top-bar";
import { Skeleton } from "~/components/ui/misc";
import { Panel, Sheet } from "~/components/ui/overlay";
import { copy } from "~/copy";
import { projectsCopy } from "~/copy/projects";
import { cn } from "~/lib/cn";
import { href, navigate, type ProjectTab, type Route, type SettingsGroup, type SettingsSection } from "~/lib/router";
import { chord } from "~/lib/shortcuts";
import { DESKTOP, useMediaQuery } from "~/lib/use-media";

import { closeProjectFile, useOpenedFile } from "../chat/file-link";
import { useSidebarProjects } from "../projects/use-listed-projects";
import { useUi } from "../shell/ui-store";
import { BrainTab } from "../brain/brain-tab";
import { ChatsTab } from "./chats-tab";
import { CompletePage } from "./complete-page";
import { dayLabel } from "./dates";
import { Details } from "./details";
import { EditPage } from "./edit-page";
import { FilesTab } from "./files-tab";
import { ActivityTab, DecisionsTab, OutputsTab, RunsTab, SourcesTab, TodosTab } from "./list-tabs";
import { OverviewTab } from "./overview-tab";
import { ProjectRuntimeProvider, useProjectState } from "./runtime";
import { AccentTitle, areaTagText, ButtonLink } from "./shared";

// Routines and settings are their own chunks, fetched on the first visit of that tab.
const RoutinesPage = lazy(() => import("../routines/routines-page").then((module) => ({ default: module.RoutinesPage })));
const ProjectSettingsPage = lazy(() => import("../settings/project-settings").then((module) => ({ default: module.ProjectSettingsPage })));

/** The design's tabs, then (quieter, at the end) the older ones that stay reachable. */
const MAIN_TABS: readonly ProjectTab[] = ["overview", "todos", "runs", "work", "outputs", "sources", "decisions", "activity"];
const MORE_TABS: readonly ProjectTab[] = ["files", "routines", "brain", "settings"];

/** An unknown id: a not-found state inside the page; the navigation stays (brief §3, C6). */
export function ProjectMissing() {
  return (
    <PageHero
      documentTitle={copy.project.notFound}
      eyebrow={copy.nav.projects}
      title={copy.project.notFound}
      size="md"
      actions={
        <ButtonLink href={href({ name: "projects" })} variant="secondary">
          {copy.project.notFoundAction}
        </ButtonLink>
      }
    />
  );
}

export function ProjectLoading() {
  return (
    <div className="flex flex-col" aria-busy="true" aria-label={copy.common.loading}>
      <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-5 px-6 pb-10 pt-10 lg:px-12 lg:pt-16">
        <Skeleton className="h-6 w-72" />
        <Skeleton className="h-14 w-2/3" />
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="mt-6 h-10 w-full" />
      </div>
      <div className="bg-surface-alt">
        <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 px-6 py-16 lg:px-12">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
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

export function tabRoute(projectId: string, tab: ProjectTab): Route {
  switch (tab) {
    case "work":
      return { name: "project", projectId, chatId: null };
    case "files":
      return { name: "project-files", projectId };
    case "routines":
      return { name: "project-routines", projectId, routineId: null };
    case "brain":
      return { name: "project-brain", projectId };
    case "settings":
      return { name: "project-settings", projectId, group: "project" };
    case "overview":
      return { name: "project-overview", projectId };
    case "todos":
      return { name: "project-todos", projectId };
    case "runs":
      return { name: "project-runs", projectId };
    case "outputs":
      return { name: "project-outputs", projectId };
    case "sources":
      return { name: "project-sources", projectId };
    case "decisions":
      return { name: "project-decisions", projectId };
    case "activity":
      return { name: "project-activity", projectId };
    case "edit":
      return { name: "project-edit", projectId };
    case "complete":
      return { name: "project-complete", projectId };
  }
}

const SWITCHER_ITEM =
  "flex min-h-10 cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 text-base outline-none data-[highlighted]:bg-hover [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground";

/** ⌘⇧P (S7): every project in a menu, opened from the quiet button next to the eyebrow. */
function ProjectSwitcher(props: { project: Project }) {
  const open = useUi((state) => state.switcherOpen);
  const setOpen = useUi((state) => state.setSwitcher);
  const { projects } = useSidebarProjects();
  const others = useMemo(() => projects.filter((project) => project.id !== props.project.id), [projects, props.project.id]);
  return (
    <MenuPrimitive.Root open={open} onOpenChange={setOpen}>
      <MenuPrimitive.Trigger
        className="flex size-11 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-hover hover:text-ink data-[popup-open]:bg-hover"
        aria-label={`${props.project.name}: ${projectsCopy.header.switcher}`}
        title={`${projectsCopy.header.switcher} · ${chord("switchProject")}`}
      >
        <ChevronsUpDown className="size-4" aria-hidden="true" />
      </MenuPrimitive.Trigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Positioner className="z-50 outline-none" sideOffset={4} align="start" collisionPadding={8}>
          <MenuPrimitive.Popup className="max-h-[var(--available-height)] min-w-64 max-w-[var(--available-width)] overflow-y-auto rounded-2xl bg-popover p-1.5 text-popover-foreground shadow-popover outline-none">
            <MenuPrimitive.Item className={SWITCHER_ITEM} onClick={() => navigate({ name: "project-overview", projectId: props.project.id })}>
              <ProjectIcon icon={props.project.icon} color={props.project.color} size="sm" />
              <span className="min-w-0 flex-1 truncate font-semibold">{props.project.name}</span>
              <Check />
            </MenuPrimitive.Item>
            {others.map((project) => (
              <MenuPrimitive.Item key={project.id} className={SWITCHER_ITEM} onClick={() => navigate({ name: "project-overview", projectId: project.id })}>
                <ProjectIcon icon={project.icon} color={project.color} size="sm" />
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
              </MenuPrimitive.Item>
            ))}
            <MenuPrimitive.Separator className="mx-1 my-1 h-px bg-border" />
            <MenuPrimitive.Item className={SWITCHER_ITEM} onClick={() => navigate({ name: "projects" })}>
              <LayoutGrid />
              <span className="min-w-0 flex-1 truncate">{projectsCopy.header.allProjects}</span>
            </MenuPrimitive.Item>
            <MenuPrimitive.Item className={SWITCHER_ITEM} onClick={() => navigate({ name: "project-new", fromProjectId: null, fromChatId: null })}>
              <FolderPlus />
              <span className="min-w-0 flex-1 truncate">{projectsCopy.header.newProject}</span>
            </MenuPrimitive.Item>
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}

/** The underline tab strip: real links, the current one with an ink rule; scrolls sideways on phones. */
function TabStrip(props: { project: Project; tab: ProjectTab; counts: Partial<Record<ProjectTab, number>> }) {
  const link = (tab: ProjectTab, quiet: boolean) => {
    const current = props.tab === tab;
    const count = props.counts[tab];
    return (
      <a
        key={tab}
        href={href(tabRoute(props.project.id, tab))}
        aria-current={current ? "page" : undefined}
        className={cn(
          "inline-flex min-h-12 shrink-0 items-center gap-1.5 border-b-2 text-[15px] font-semibold leading-5 no-underline transition-colors",
          current ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink",
          quiet && !current && "font-medium",
        )}
      >
        {copy.project.tabs[tab]}
        {count !== undefined ? <span className="tabular-nums">{count}</span> : null}
      </a>
    );
  };
  return (
    <nav aria-label={projectsCopy.header.tabsLabel} className="-mx-6 overflow-x-auto px-6 [scrollbar-width:none] lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
      <div className="flex min-w-max items-center gap-6 border-b border-line">
        {MAIN_TABS.map((tab) => link(tab, false))}
        <span aria-hidden="true" className="h-5 w-px bg-line" />
        {MORE_TABS.map((tab) => link(tab, true))}
      </div>
    </nav>
  );
}

function useTabCounts(projectId: string, brief: ProjectBrief | null | undefined): Partial<Record<ProjectTab, number>> {
  const todos = useTodos();
  const runs = useRuns();
  const chats = useProjectState((state) => state.chats);
  return useMemo(() => {
    const chatCount = Object.values(chats).filter((chat) => !chat.parentId && !chat.archived).length;
    return {
      todos: todos.data ? todos.data.filter((todo) => todo.projectId === projectId && !todo.done).length : undefined,
      runs: runs.data ? runs.data.filter((run) => run.projectId === projectId).length : undefined,
      work: chatCount,
      outputs: brief?.outputs.length,
      sources: brief?.sources.length,
      decisions: brief?.decisions.length,
    };
  }, [todos.data, runs.data, chats, brief, projectId]);
}

/**
 * The project header (design v2-Project): the area tag and eyebrow, the title with its last word
 * in the serif accent, the goal as lead, Details bewerken and Delegeren, then the tab strip.
 */
function ProjectHeader(props: { project: Project; tab: ProjectTab; brief: ProjectBrief | null | undefined }) {
  const { project, brief } = props;
  const counts = useTabCounts(project.id, brief);
  const compact = props.tab === "work";
  const state = project.archivedAt !== null ? "completed" : (brief?.state ?? "active");
  return (
    <PageHero
      documentTitle={`${copy.project.tabs[props.tab]} · ${project.name}`}
      tag={brief ? <Tag>{areaTagText(brief.area)}</Tag> : undefined}
      eyebrow={
        <span className="flex flex-wrap items-center gap-x-1">
          {dot(brief?.area.name, projectsCopy.state[state], compact ? (brief?.keyAlias ? projectsCopy.keyTag(brief.keyAlias) : null) : brief?.target ? projectsCopy.header.target(dayLabel(brief.target)) : null)}
        </span>
      }
      title={<AccentTitle text={project.name} />}
      size={compact ? "md" : "lg"}
      lead={compact ? undefined : (brief?.goal ?? project.description ?? undefined)}
      actions={
        compact ? undefined : (
          <>
            <ButtonLink href={href({ name: "project-edit", projectId: project.id })}>{projectsCopy.header.editDetails}</ButtonLink>
            <ButtonLink href={href({ name: "delegate", todoId: null })} variant="primary">
              {projectsCopy.header.delegate}
            </ButtonLink>
          </>
        )
      }
      below={<TabStrip project={project} tab={props.tab} counts={counts} />}
      className={cn("pb-0! lg:pb-0!", compact && "lg:pt-12!")}
    />
  );
}

/** Nested pages (files, routines, brain, settings) put their bar actions here: a slim row above them. */
function LegacyTab(props: { children: ReactNode }) {
  const [leading, setLeading] = useState<HTMLElement | null>(null);
  const [actions, setActions] = useState<HTMLElement | null>(null);
  const slots = useMemo<TopBarHostSlots>(() => ({ leading, actions }), [leading, actions]);
  return (
    <div className="flex min-h-[70vh] flex-col bg-surface">
      <div className="mx-auto flex w-full max-w-[1360px] items-center gap-2 px-6 pt-4 lg:px-12 [&:not(:has(>div>*))]:hidden">
        <div ref={setLeading} className="flex items-center empty:hidden" />
        <div ref={setActions} className="ms-auto flex items-center gap-1 empty:hidden" />
      </div>
      <TopBarHost.Provider value={slots}>
        <div className="flex min-h-0 flex-1 flex-col">{props.children}</div>
      </TopBarHost.Provider>
    </div>
  );
}

function TabContent(props: { project: Project; tab: ProjectTab; chatId: string | null; routineId: string | null; group: SettingsGroup; section: SettingsSection | null; brief: ProjectBrief | null | undefined }) {
  const { project } = props;
  switch (props.tab) {
    case "overview":
      return <OverviewTab project={project} brief={props.brief} />;
    case "todos":
      return <TodosTab project={project} />;
    case "runs":
      return <RunsTab project={project} />;
    case "outputs":
      return <OutputsTab project={project} brief={props.brief} />;
    case "sources":
      return <SourcesTab project={project} brief={props.brief} />;
    case "decisions":
      return <DecisionsTab project={project} brief={props.brief} />;
    case "activity":
      return <ActivityTab project={project} />;
    case "work":
      return <ChatsTab project={project} chatId={props.chatId} brief={props.brief} />;
    case "files":
      return (
        <LegacyTab>
          <FilesTab project={project} />
        </LegacyTab>
      );
    case "routines":
      return (
        <LegacyTab>
          <Suspense fallback={<TabSkeleton />}>
            <RoutinesPage projectId={project.id} routineId={props.routineId} />
          </Suspense>
        </LegacyTab>
      );
    case "brain":
      return (
        <LegacyTab>
          <BrainTab project={project} />
        </LegacyTab>
      );
    case "settings":
      return (
        <LegacyTab>
          <Suspense fallback={<TabSkeleton />}>
            <ProjectSettingsPage projectId={project.id} group={props.group} section={props.section} />
          </Suspense>
        </LegacyTab>
      );
    case "edit":
    case "complete":
      return null;
  }
}

/**
 * A project (design v2-Project and friends): the header with its tab strip and the tab below;
 * Bewerken and Afronden are pages of their own. A file opened from a chat (`?bestand=`) shows in
 * the Details panel (a sheet on phones), as before.
 */
export function ProjectPage(props: { projectId: string; tab: ProjectTab; chatId: string | null; routineId: string | null; group: SettingsGroup; section: SettingsSection | null }) {
  const { project, isLoading } = useProject(props.projectId);
  const brief = useBrief(props.projectId);
  const desktop = useMediaQuery(DESKTOP);
  const sheetOpen = useUi((state) => state.sidecarSheetOpen);
  const setSheet = useUi((state) => state.setSidecarSheet);
  const reading = useOpenedFile(props.projectId) !== null;

  if (!project) return isLoading ? <ProjectLoading /> : <ProjectMissing />;

  const detailsOpen = reading || sheetOpen;
  const closeDetails = (open: boolean) => {
    if (open) return;
    setSheet(false);
    if (reading) closeProjectFile();
  };

  return (
    <ProjectRuntimeProvider projectId={project.id}>
      {props.tab === "edit" ? (
        <EditPage project={project} brief={brief.data} />
      ) : props.tab === "complete" ? (
        <CompletePage project={project} brief={brief.data} />
      ) : (
        <div className="flex flex-col">
          <ProjectHeader project={project} tab={props.tab} brief={brief.data} />
          <TabContent project={project} tab={props.tab} chatId={props.chatId} routineId={props.routineId} group={props.group} section={props.section} brief={brief.data} />
        </div>
      )}
      <Panel open={detailsOpen && desktop} onOpenChange={closeDetails} label={copy.shell.details} className={reading ? "w-[min(calc(100vw-1rem),40rem)]" : undefined}>
        <Details project={project} chatId={props.chatId} tab={props.tab} onClose={() => closeDetails(false)} />
      </Panel>
      <Sheet open={detailsOpen && !desktop} onOpenChange={closeDetails} side="right" label={copy.shell.details} className={reading ? "w-[min(92vw,36rem)]" : undefined}>
        <Details project={project} chatId={props.chatId} tab={props.tab} onClose={() => closeDetails(false)} />
      </Sheet>
    </ProjectRuntimeProvider>
  );
}

