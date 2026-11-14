import { lazy, Suspense, useEffect, useRef } from "react";

import { useProjects, useStatus } from "~/backend/queries";
import { BrandMark } from "~/components/brand";
import { PageTitle, TopBar } from "~/components/top-bar";
import { Button } from "~/components/ui/button";
import { EmptyState, Skeleton } from "~/components/ui/misc";
import { copy } from "~/copy";
import { errorText } from "~/lib/errors";
import { navigate, parse, routeProjectId, routeTab, useRoute, type Route } from "~/lib/router";

import { HomePage } from "./features/home/home-page";
import { AppShell } from "./features/shell/app-shell";

// Vandaag ships with the first load; every other page is its own chunk, fetched on first visit
// (the project page a little earlier, below).
const loadProjectPage = () => import("./features/project/project-page");
// Opened straight on a project: fetch its page alongside the backend, not after the first render.
if (window.location.hash.startsWith("#/p/")) void loadProjectPage();
const ProjectPage = lazy(() => loadProjectPage().then((module) => ({ default: module.ProjectPage })));
const ProjectsPage = lazy(() => import("./features/projects/projects-page").then((module) => ({ default: module.ProjectsPage })));
const RoutinesPage = lazy(() => import("./features/routines/routines-page").then((module) => ({ default: module.RoutinesPage })));
const AppSettingsPage = lazy(() => import("./features/settings/app-settings").then((module) => ({ default: module.AppSettingsPage })));
const PersonalPage = lazy(() => import("./features/brain/personal-page").then((module) => ({ default: module.PersonalPage })));
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

/**
 * Loading keeps the destination layout (DESIGN.md States). index.html carries
 * the same markup, so the page paints before any script runs and React takes
 * over without a visible change.
 */
function ShellSkeleton() {
  return (
    <div className="flex h-dvh bg-background" aria-busy="true" aria-label={copy.boot.connecting}>
      <div className="hidden w-64 flex-col gap-2 border-e border-border bg-sidebar p-3 lg:flex">
        <div className="flex h-8 items-center gap-2 px-1">
          <BrandMark />
          <span className="text-sm font-semibold text-foreground">{copy.appName}</span>
        </div>
        <Skeleton className="mt-3 h-7 w-full" />
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-7 w-4/5" />
        <Skeleton className="h-7 w-full" />
        <Skeleton className="mt-6 h-7 w-full" />
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-7 w-4/5" />
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 lg:px-4" data-titlebar="page">
          <BrandMark className="lg:hidden" />
          <span className="text-sm font-semibold text-foreground lg:hidden">{copy.appName}</span>
        </div>
        {/* The Vandaag shape (brief §11): the composer card, the "Voor jou" heading, two cards. */}
        <div className="mx-auto mt-10 flex w-full max-w-3xl flex-col gap-4 px-6">
          <Skeleton className="h-28 w-full rounded-shell" />
          <Skeleton className="mt-4 h-4 w-20" />
          <Skeleton className="h-24 w-full rounded-window" />
          <Skeleton className="h-24 w-full rounded-window" />
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

/** An unknown hash: the sidebar stays filled, the page says so and offers the way back (C6). */
function NotFound() {
  return (
    <div className="flex h-full flex-col">
      <TopBar>
        <PageTitle>{copy.shell.notFoundTitle}</PageTitle>
      </TopBar>
      <EmptyState
        title={copy.shell.notFoundBody}
        action={
          <Button variant="secondary" onClick={() => navigate({ name: "home" })}>
            {copy.shell.notFoundAction}
          </Button>
        }
      />
    </div>
  );
}

function Page(props: { route: Route }) {
  const { route } = props;
  const tab = routeTab(route);
  if (tab && "projectId" in route) {
    return (
      <ProjectPage
        projectId={route.projectId}
        tab={tab}
        chatId={route.name === "project" ? route.chatId : null}
        routineId={route.name === "project-routines" ? route.routineId : null}
        group={route.name === "project-settings" ? (route.group ?? "project") : "project"}
        section={route.name === "project-settings" ? (route.section ?? null) : null}
      />
    );
  }
  switch (route.name) {
    case "home":
    case "onboarding":
      return <HomePage />;
    case "projects":
      return <ProjectsPage />;
    case "routines":
      return <RoutinesPage projectId={null} routineId={route.routineId} />;
    case "brain":
      return <PersonalPage />;
    case "settings":
      return <AppSettingsPage group={route.group ?? null} />;
    case "not-found":
      return <NotFound />;
    default:
      return <NotFound />;
  }
}

/** Without a project, the app-level pages go to #/welkom (brief §3). */
function needsOnboarding(route: Route): boolean {
  return route.name === "home" || route.name === "projects" || route.name === "routines" || route.name === "settings" || route.name === "brain" || route.name === "onboarding";
}

export function App() {
  const route = useRoute();
  const status = useStatus();
  const projects = useProjects();
  const needsUserKey = status.data?.keyMode === "user" && !status.data.user.hasKey;
  // Without a project the app-level pages go to #/welkom in every key mode (brief §3); the welcome
  // screen links a personal key first when that mode needs one.
  const firstRun = projects.data?.length === 0;
  const gated = Boolean(status.data) && (needsUserKey || (firstRun && needsOnboarding(route)));

  // A project route the gate sent to #/welkom: where the person goes once the gate lifts.
  const bounced = useRef<Route | null>(null);
  useEffect(() => {
    if (!status.data) return;
    if (gated && route.name !== "onboarding") {
      bounced.current = routeProjectId(route) ? route : null;
      navigate({ name: "onboarding" }, { replace: true });
      return;
    }
    // Read the hash as it is now: "Begin" may already have opened the new project between this
    // render and the effect, and that destination must not be replaced by Vandaag.
    if (!gated && route.name === "onboarding" && parse(window.location.hash).name === "onboarding") {
      navigate(bounced.current ?? { name: "home" }, { replace: true });
    }
    if (!gated) bounced.current = null;
  }, [gated, route, status.data]);

  // Opening a project is the next step from almost every first screen.
  useEffect(prefetchProjectPage, []);

  if (status.isLoading || (projects.isLoading && !projects.data)) return <ShellSkeleton />;
  if (status.isError) return <Unavailable message={errorText(status.error)} onRetry={() => void status.refetch()} />;
  if (gated)
    return (
      <Suspense fallback={<ShellSkeleton />}>
        <Onboarding />
      </Suspense>
    );

  return (
    <AppShell route={route} projectId={routeProjectId(route)}>
      <Suspense fallback={<PageSkeleton />}>
        <Page route={route} />
      </Suspense>
    </AppShell>
  );
}
