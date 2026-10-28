import { lazy, Suspense, useEffect } from "react";

import { useProjects, useStatus } from "~/backend/queries";
import { BrandMark } from "~/components/brand";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/misc";
import { copy } from "~/copy";
import { errorText } from "~/lib/errors";
import { navigate, useRoute, type Route } from "~/lib/router";

import { ProjectRuntimeProvider } from "./features/project/runtime";
import { ProjectsPage } from "./features/projects/projects-page";
import { AppShell } from "./features/shell/app-shell";

// The projects list ships with the first load; every other page is its own
// chunk, fetched on first visit (the project page a little earlier, below).
const loadProjectPage = () => import("./features/project/project-page");
// Opened straight on a project: fetch its page alongside the backend, not after the first render.
if (window.location.hash.startsWith("#/p/")) void loadProjectPage();
const ProjectPage = lazy(() => loadProjectPage().then((module) => ({ default: module.ProjectPage })));
const RoutinesPage = lazy(() => import("./features/routines/routines-page").then((module) => ({ default: module.RoutinesPage })));
const ProjectSettingsPage = lazy(() => import("./features/settings/project-settings").then((module) => ({ default: module.ProjectSettingsPage })));
const AppSettingsPage = lazy(() => import("./features/settings/app-settings").then((module) => ({ default: module.AppSettingsPage })));
const Onboarding = lazy(() => import("./features/onboarding/onboarding").then((module) => ({ default: module.Onboarding })));

const INTENT_EVENTS = ["pointerover", "touchstart", "focusin"] as const;

/**
 * Fetch the project page's code the moment a pointer, finger or focus lands on
 * a project link, and otherwise once the first screen has long settled, so it
 * never competes with the first paint.
 */
function prefetchProjectPage(): () => void {
  let done = false;
  const load = () => {
    if (done) return;
    done = true;
    stop();
    void loadProjectPage();
  };
  const onIntent = (event: Event) => {
    if (event.target instanceof Element && event.target.closest('a[href^="#/p/"]')) load();
  };
  const timer = window.setTimeout(() => (typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(load) : load()), 10_000);
  function stop() {
    window.clearTimeout(timer);
    for (const type of INTENT_EVENTS) document.removeEventListener(type, onIntent, true);
  }
  for (const type of INTENT_EVENTS) document.addEventListener(type, onIntent, { capture: true, passive: true });
  return stop;
}

/** A page chunk is still on its way: keep the page frame, show its shape. */
function PageSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-busy="true" aria-label={copy.boot.connecting}>
      <div className="h-12 shrink-0 border-b border-border" data-titlebar="page" />
      <div className="mx-auto mt-10 flex w-full max-w-3xl flex-col gap-4 px-6">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </div>
  );
}

function routeProjectId(route: Route): string | null {
  return "projectId" in route ? route.projectId : null;
}

/**
 * Loading keeps the destination layout (DESIGN.md States). index.html carries
 * the same markup, so the page paints before any script runs and React takes
 * over without a visible change.
 */
function ShellSkeleton() {
  return (
    <div className="flex h-dvh bg-background" aria-busy="true" aria-label={copy.boot.connecting}>
      <div className="hidden w-[264px] flex-col gap-3 border-e border-border bg-sidebar p-3 lg:flex">
        <div className="flex h-8 items-center gap-2 px-1">
          <BrandMark />
          <span className="text-sm font-semibold text-foreground">{copy.appName}</span>
        </div>
        <Skeleton className="mt-3 h-7 w-full" />
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-7 w-4/5" />
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 lg:px-4" data-titlebar="page">
          <BrandMark className="lg:hidden" />
          <span className="text-sm font-semibold text-foreground lg:hidden">{copy.appName}</span>
        </div>
        <div className="mx-auto mt-10 flex w-full max-w-4xl flex-col gap-4 px-6">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </div>
    </div>
  );
}

function Unavailable(props: { message: string; onRetry: () => void }) {
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <BrandMark className="mb-2 size-10" />
      <h1 className="text-base font-semibold">{copy.boot.unavailable}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{props.message}</p>
      <Button variant="secondary" onClick={props.onRetry}>
        {copy.boot.retry}
      </Button>
    </main>
  );
}

function Page(props: { route: Route }) {
  const { route } = props;
  switch (route.name) {
    case "projects":
      return <ProjectsPage />;
    case "project":
      return <ProjectPage projectId={route.projectId} chatId={route.chatId} />;
    case "project-routines":
      return <RoutinesPage projectId={route.projectId} routineId={route.routineId} />;
    case "project-settings":
      return <ProjectSettingsPage projectId={route.projectId} section={route.section} />;
    case "routines":
      return <RoutinesPage projectId={null} routineId={route.routineId} />;
    case "settings":
      return <AppSettingsPage />;
    case "onboarding":
      return <ProjectsPage />;
  }
}

export function App() {
  const route = useRoute();
  const status = useStatus();
  const projects = useProjects();
  const needsUserKey = status.data?.keyMode === "user" && !status.data.user.hasKey;
  const firstRun = status.data?.keyMode === "workspace" && projects.data?.length === 0;

  useEffect(() => {
    if (route.name === "onboarding" && status.data && !needsUserKey && !firstRun) navigate({ name: "projects" }, { replace: true });
  }, [route.name, status.data, needsUserKey, firstRun]);

  // Opening a project is the next step from almost every first screen.
  useEffect(prefetchProjectPage, []);

  if (status.isLoading || (projects.isLoading && !projects.data)) return <ShellSkeleton />;
  if (status.isError) return <Unavailable message={errorText(status.error)} onRetry={() => void status.refetch()} />;
  if (needsUserKey || (firstRun && (route.name === "projects" || route.name === "onboarding")))
    return (
      <Suspense fallback={<ShellSkeleton />}>
        <Onboarding />
      </Suspense>
    );

  const projectId = routeProjectId(route);
  const shell = (
    <AppShell route={route} projectId={projectId}>
      <Suspense fallback={<PageSkeleton />}>
        <Page route={route} />
      </Suspense>
    </AppShell>
  );
  return projectId ? (
    <ProjectRuntimeProvider key={projectId} projectId={projectId}>
      {shell}
    </ProjectRuntimeProvider>
  ) : (
    shell
  );
}
