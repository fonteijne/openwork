import { lazy, Suspense, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

import { useBackend } from "~/backend/context";
import { useStatus } from "~/backend/queries";
import type { Backend } from "~/backend/types";
import { Sheet } from "~/components/ui/overlay";
import { copy } from "~/copy";
import { goBack, goForward, navigate, type Route } from "~/lib/router";
import { focusComposer, inOverlay, matchShortcut, PROJECT_SLOTS, SEEN_ALL_EVENT, type ShortcutId } from "~/lib/shortcuts";
import { DESKTOP, SMALL_UP, useMediaQuery, WIDE } from "~/lib/use-media";
import { useOpenedOnce } from "~/lib/use-opened-once";

import { useAgendaPresence } from "../agenda/presence";
import { BottomTabs } from "./bottom-tabs";
import { useSidebarProjects } from "../projects/use-listed-projects";
import { Sidebar } from "./sidebar";
import { useUi } from "./ui-store";

const CommandPalette = lazy(() => import("./command-palette").then((module) => ({ default: module.CommandPalette })));
const NewProjectDialog = lazy(() => import("../projects/new-project-dialog").then((module) => ({ default: module.NewProjectDialog })));
// The agenda panel is its own chunk: closed means not loaded (agenda plan §7.6).
const AgendaPanelHost = lazy(() => import("../agenda/agenda-panel").then((module) => ({ default: module.AgendaPanelHost })));
const FeedbackDialog = lazy(() => import("../feedback/feedback-dialog").then((module) => ({ default: module.FeedbackDialog })));
const ShortcutsSheet = lazy(() => import("./shortcuts-sheet").then((module) => ({ default: module.ShortcutsSheet })));

const NO_ENGINE: NonNullable<Backend["engine"]> = { current: () => "ready", subscribe: () => () => undefined, error: () => null, retry: () => undefined };

/** While the live engine starts or copies older chats, say so instead of leaving screens empty (C6). */
function EngineBanner() {
  const engine = useBackend().engine ?? NO_ENGINE;
  const state = useSyncExternalStore(engine.subscribe, engine.current);
  if (state === "ready") return null;
  if (state === "failed") {
    return (
      <div role="alert" className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-border bg-red-3 px-4 py-2 text-xs font-semibold text-red-11">
        <span>{engine.error()}</span>
        <button type="button" className="rounded-full px-2 py-0.5 underline underline-offset-2 hover:bg-red-11/10" onClick={() => engine.retry()}>
          {copy.boot.retry}
        </button>
      </div>
    );
  }
  return (
    <div role="status" className="flex shrink-0 items-center justify-center gap-2 border-b border-border bg-electric-3 px-4 py-2 text-xs font-semibold text-electric-11">
      <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
      {state === "migrating" ? copy.boot.engineMigrating : copy.boot.engineStarting}
    </div>
  );
}

/**
 * The one window listener for the shortcuts table (brief §4, S6). Chords are inert while focus is
 * in an overlay, except the agenda and the shortcuts sheet, which toggle from anywhere.
 */
function useShortcuts(route: Route, projectId: string | null) {
  const desktop = useMediaQuery(DESKTOP);
  const wide = useMediaQuery(WIDE);
  const status = useStatus();
  const readOnly = status.data?.readOnly ?? false;
  const { pinned } = useSidebarProjects();

  useEffect(() => {
    const run = (id: ShortcutId) => {
      const ui = useUi.getState();
      switch (id) {
        case "home":
          navigate({ name: "home" });
          return;
        case "search":
          ui.setPalette(true);
          return;
        case "newChat":
          if (projectId) navigate({ name: "project", projectId, chatId: null });
          else if (route.name !== "home") navigate({ name: "home" });
          focusComposer();
          return;
        case "newProject":
          if (!readOnly) ui.setNewProject(true);
          return;
        case "switchProject":
          if (projectId) ui.setSwitcher(true);
          else ui.setPalette(true);
          return;
        case "agenda":
          ui.toggleAgenda(wide);
          return;
        case "details":
          if (projectId) ui.toggleDetails(wide);
          return;
        case "sidebar":
          if (desktop) ui.toggleSidebar();
          else ui.setDrawer(!ui.drawerOpen);
          return;
        case "settings":
          navigate({ name: "settings" });
          return;
        case "back":
          goBack();
          return;
        case "forward":
          goForward();
          return;
        case "shortcuts":
          ui.setShortcuts(!ui.shortcutsOpen);
          return;
        case "seenAll":
          // Vandaag keeps lastSeenAt (brief §5); elsewhere the chord goes there first.
          if (route.name !== "home") navigate({ name: "home" });
          window.dispatchEvent(new Event(SEEN_ALL_EVENT));
          return;
        default: {
          const slot = PROJECT_SLOTS.find((entry) => id === `project${entry}`);
          const project = slot ? pinned[slot - 1] : undefined;
          if (project) navigate({ name: "project", projectId: project.id, chatId: null });
        }
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const found = matchShortcut(event);
      if (!found) return;
      if (inOverlay(event.target) && found.id !== "agenda" && found.id !== "shortcuts") return;
      event.preventDefault();
      run(found.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [route.name, projectId, readOnly, pinned, desktop, wide]);
}

/** Sidebar column on desktop (collapsible), a drawer below that; a tab bar on phones; pages fill the rest. */
export function AppShell(props: { route: Route; projectId: string | null; children: ReactNode }) {
  const desktop = useMediaQuery(DESKTOP);
  const smallUp = useMediaQuery(SMALL_UP);
  const collapsed = useUi((state) => state.sidebarCollapsed);
  const drawerOpen = useUi((state) => state.drawerOpen);
  const setDrawer = useUi((state) => state.setDrawer);
  const paletteOpened = useOpenedOnce(useUi((state) => state.paletteOpen));
  const newProjectOpen = useUi((state) => state.newProjectOpen);
  const setNewProject = useUi((state) => state.setNewProject);
  const setSidecarSheet = useUi((state) => state.setSidecarSheet);
  const newProjectOpened = useOpenedOnce(newProjectOpen);
  const feedbackOpen = useUi((state) => state.feedbackOpen);
  const setFeedback = useUi((state) => state.setFeedback);
  const feedbackOpened = useOpenedOnce(feedbackOpen);
  const shortcutsOpened = useOpenedOnce(useUi((state) => state.shortcutsOpen));
  const agendaOpened = useOpenedOnce(useUi((state) => state.agendaOpen));
  const rememberProject = useUi((state) => state.rememberProject);
  const routeKey = JSON.stringify(props.route);
  useAgendaPresence(props.projectId);
  useShortcuts(props.route, props.projectId);

  // The home composer starts in the project the person worked in last (brief §5).
  useEffect(() => {
    if (props.projectId) rememberProject(props.projectId);
  }, [props.projectId, rememberProject]);

  // Navigating closes the drawer; the details sheet too, on phones (the 1024–1279 panel stays, brief §4).
  useEffect(() => {
    setDrawer(false);
    if (!desktop) setSidecarSheet(false);
  }, [routeKey, desktop, setDrawer, setSidecarSheet]);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
      {desktop ? (
        collapsed ? null : (
          <aside className="flex w-64 shrink-0 flex-col border-e border-border" aria-label={copy.appName}>
            <Sidebar route={props.route} projectId={props.projectId} />
          </aside>
        )
      ) : (
        <Sheet open={drawerOpen} onOpenChange={setDrawer} side="left" label={copy.appName}>
          <Sidebar route={props.route} projectId={props.projectId} />
        </Sheet>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <EngineBanner />
        <div className="flex min-h-0 flex-1 flex-col">{props.children}</div>
        {smallUp ? null : <BottomTabs route={props.route} />}
      </div>
      {agendaOpened ? (
        <Suspense fallback={null}>
          <AgendaPanelHost projectId={props.projectId} />
        </Suspense>
      ) : null}
      {paletteOpened ? (
        <Suspense fallback={null}>
          <CommandPalette route={props.route} projectId={props.projectId} />
        </Suspense>
      ) : null}
      {newProjectOpened ? (
        <Suspense fallback={null}>
          <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProject} />
        </Suspense>
      ) : null}
      {feedbackOpened ? (
        <Suspense fallback={null}>
          <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedback} />
        </Suspense>
      ) : null}
      {shortcutsOpened ? (
        <Suspense fallback={null}>
          <ShortcutsSheet />
        </Suspense>
      ) : null}
    </div>
  );
}
