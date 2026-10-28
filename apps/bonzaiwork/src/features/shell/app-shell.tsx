import { lazy, Suspense, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

import { useBackend } from "~/backend/context";
import type { Backend } from "~/backend/types";

import { Sheet } from "~/components/ui/overlay";
import { copy } from "~/copy";
import { useMediaQuery, DESKTOP } from "~/lib/use-media";
import { useOpenedOnce } from "~/lib/use-opened-once";
import type { Route } from "~/lib/router";

import { Sidebar } from "./sidebar";
import { useUi } from "./ui-store";

const CommandPalette = lazy(() => import("./command-palette").then((module) => ({ default: module.CommandPalette })));
const NewProjectDialog = lazy(() => import("../projects/new-project-dialog").then((module) => ({ default: module.NewProjectDialog })));

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
      <div className="flex min-w-0 flex-1 flex-col">
        <EngineBanner />
        {props.children}
      </div>
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
