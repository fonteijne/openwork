import { lazy, Suspense, useEffect, type ReactNode } from "react";

import { Sheet } from "~/components/ui/overlay";
import { copy } from "~/copy";
import { useMediaQuery, DESKTOP } from "~/lib/use-media";
import { useOpenedOnce } from "~/lib/use-opened-once";
import type { Route } from "~/lib/router";

import { Sidebar } from "./sidebar";
import { useUi } from "./ui-store";

const CommandPalette = lazy(() => import("./command-palette").then((module) => ({ default: module.CommandPalette })));
const NewProjectDialog = lazy(() => import("../projects/new-project-dialog").then((module) => ({ default: module.NewProjectDialog })));

/** Sidebar column on desktop, a drawer on phones and tablets; pages fill the rest. */
export function AppShell(props: { route: Route; projectId: string | null; children: ReactNode }) {
  const desktop = useMediaQuery(DESKTOP);
  const drawerOpen = useUi((state) => state.drawerOpen);
  const setDrawer = useUi((state) => state.setDrawer);
  const setPalette = useUi((state) => state.setPalette);
  const paletteOpened = useOpenedOnce(useUi((state) => state.paletteOpen));
  const newProjectOpen = useUi((state) => state.newProjectOpen);
  const setNewProject = useUi((state) => state.setNewProject);
  const setSidecarSheet = useUi((state) => state.setSidecarSheet);
  const newProjectOpened = useOpenedOnce(newProjectOpen);
  const routeKey = JSON.stringify(props.route);

  // Navigating closes the drawer and the sidecar sheet.
  useEffect(() => {
    setDrawer(false);
    setSidecarSheet(false);
  }, [routeKey, setDrawer, setSidecarSheet]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPalette]);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
      {desktop ? (
        <aside className="flex w-[264px] shrink-0 flex-col border-e border-border" aria-label={copy.appName}>
          <Sidebar route={props.route} projectId={props.projectId} />
        </aside>
      ) : (
        <Sheet open={drawerOpen} onOpenChange={setDrawer} side="left" label={copy.appName}>
          <Sidebar route={props.route} projectId={props.projectId} />
        </Sheet>
      )}
      <div className="flex min-w-0 flex-1 flex-col">{props.children}</div>
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
    </div>
  );
}
