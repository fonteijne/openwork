import { lazy, Suspense, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

import { useBackend } from "~/backend/context";
import { useStatus } from "~/backend/queries";
import type { Backend } from "~/backend/types";
import { PAGE_TITLE } from "~/components/top-bar";
import { copy } from "~/copy";
import { goBack, goForward, navigate, type Route } from "~/lib/router";
import { focusComposer, inOverlay, matchShortcut, PROJECT_SLOTS, SEEN_ALL_EVENT, type ShortcutId } from "~/lib/shortcuts";
import { DESKTOP, SMALL_UP, useMediaQuery, WIDE } from "~/lib/use-media";
import { useOpenedOnce } from "~/lib/use-opened-once";

import { useAgendaPresence } from "../agenda/presence";
import { useSidebarProjects } from "../projects/use-listed-projects";
import { StatusFooter } from "./status-footer";
import { MobileTabs, TopNav } from "./top-nav";
import { useUi } from "./ui-store";

const CaptureDialog = lazy(() => import("../today/capture-dialog").then((module) => ({ default: module.CaptureDialog })));
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
          // The cockpit has a top bar, not a sidebar: the chord opens search instead.
          ui.setPalette(true);
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

/**
 * The cockpit frame: the top bar, the page (it scrolls), the status line; on phones the tab bar
 * instead of the status line. Overlays (palette, capture, agenda, dialogs) mount on first use.
 */
export function AppShell(props: { route: Route; projectId: string | null; children: ReactNode }) {
  const desktop = useMediaQuery(DESKTOP);
  const smallUp = useMediaQuery(SMALL_UP);
  const captureOpen = useUi((state) => state.captureOpen);
  const setCapture = useUi((state) => state.setCapture);
  const captureOpened = useOpenedOnce(captureOpen);
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

  // A route change that leaves focus nowhere (the drawer's trigger left with the old page) puts it
  // on the new page's heading, so a screen reader hears where it landed. Focus someone placed on
  // purpose (the composer, a card) is left alone (S5).
  // The first route (and StrictMode's second run of this effect) moves nothing: only a change does.
  const lastRoute = useRef(routeKey);
  useEffect(() => {
    if (lastRoute.current === routeKey) return;
    lastRoute.current = routeKey;
    // Checked twice: the closing drawer hands focus back (to a trigger that left) only once its exit ends.
    const check = () => {
      const active = document.activeElement;
      if (active && active !== document.body && active.isConnected && !active.closest("[data-closed], [data-ending-style]")) return;
      document.querySelector<HTMLElement>(PAGE_TITLE)?.focus({ preventScroll: true });
    };
    const timers = [window.setTimeout(check, 300), window.setTimeout(check, 700)];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [routeKey]);

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-surface">
        {copy.shell.skipToContent}
      </a>
      <TopNav route={props.route} />
      <EngineBanner />
      <main id="main" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {props.children}
      </main>
      {smallUp ? <StatusFooter /> : <MobileTabs route={props.route} />}
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
      {captureOpened ? (
        <Suspense fallback={null}>
          <CaptureDialog open={captureOpen} onOpenChange={setCapture} projectId={props.projectId} />
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
