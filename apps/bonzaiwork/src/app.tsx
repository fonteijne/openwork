import { lazy, Suspense, useEffect } from "react";

import { useProjects, useStatus } from "~/backend/queries";
import { BrandMark } from "~/components/brand";
import { PageTitle, TopBar } from "~/components/top-bar";
import { Button } from "~/components/ui/button";
import { EmptyState, Skeleton } from "~/components/ui/misc";
import { copy } from "~/copy";
import { errorText } from "~/lib/errors";
import { navigate, routeProjectId, routeTab, useRoute, type Route } from "~/lib/router";

import { AppShell } from "./features/shell/app-shell";
import { TodayPage } from "./features/today/today-page";

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
const PlanPage = lazy(() => import("./features/today/plan-page").then((module) => ({ default: module.PlanPage })));
const InboxPage = lazy(() => import("./features/inbox/inbox-page").then((module) => ({ default: module.InboxPage })));
const AgentPage = lazy(() => import("./features/agent/agent-page").then((module) => ({ default: module.AgentPage })));
const RunsPage = lazy(() => import("./features/runs/runs-page").then((module) => ({ default: module.RunsPage })));
const RunPage = lazy(() => import("./features/runs/run-page").then((module) => ({ default: module.RunPage })));
const DelegatePage = lazy(() => import("./features/runs/delegate-page").then((module) => ({ default: module.DelegatePage })));
const ApprovalPage = lazy(() => import("./features/approvals/approval-page").then((module) => ({ default: module.ApprovalPage })));
const LibraryHome = lazy(() => import("./features/library/library-home").then((module) => ({ default: module.LibraryHome })));
const ShelfPage = lazy(() => import("./features/library/shelf-page").then((module) => ({ default: module.ShelfPage })));
const LibraryPageView = lazy(() => import("./features/library/page-view").then((module) => ({ default: module.LibraryPageView })));
const ProposalPage = lazy(() => import("./features/library/proposal-page").then((module) => ({ default: module.ProposalPage })));
const ActivityPage = lazy(() => import("./features/activity/activity-page").then((module) => ({ default: module.ActivityPage })));
const NewProjectPage = lazy(() => import("./features/projects/new-project-page").then((module) => ({ default: module.NewProjectPage })));

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
    <div className="flex flex-col" aria-busy="true" aria-label={copy.boot.connecting}>
      <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-5 px-6 pb-12 pt-16 lg:px-12">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-14 w-2/3" />
        <Skeleton className="h-6 w-1/2" />
      </div>
      <div className="flex-1 bg-surface-alt">
        <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 px-6 py-16 lg:px-12">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
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
    <div className="flex h-dvh flex-col bg-background" aria-busy="true" aria-label={copy.boot.connecting}>
      <div className="flex h-[72px] shrink-0 items-center gap-6 border-b border-border px-6 lg:h-[92px] lg:px-12" data-titlebar="page">
        <BrandMark className="size-9" />
        <span className="hidden text-lg font-extrabold xl:inline">{copy.appName}</span>
        <div className="hidden gap-8 lg:flex">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
      {/* The Vandaag shape: hero, then the "Needs you" band. */}
      <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-5 px-6 pt-16 lg:px-12">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-14 w-2/3" />
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="mt-8 h-72 w-full rounded-panel" />
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
      return <TodayPage />;
    case "plan":
      return <PlanPage />;
    case "inbox":
      return <InboxPage />;
    case "agent":
      return <AgentPage chatId={route.chatId} />;
    case "runs":
      return <RunsPage />;
    case "run":
      return <RunPage runId={route.runId} />;
    case "delegate":
      return <DelegatePage todoId={route.todoId} />;
    case "approval":
      return <ApprovalPage approvalId={route.approvalId} />;
    case "library":
      return <LibraryHome />;
    case "library-shelf":
      return <ShelfPage shelfId={route.shelfId} />;
    case "library-page":
      return <LibraryPageView pageId={route.pageId} />;
    case "library-proposal":
      return <ProposalPage proposalId={route.proposalId} />;
    case "activity":
      return <ActivityPage view={route.view} />;
    case "project-new":
      return <NewProjectPage fromProjectId={route.fromProjectId} fromChatId={route.fromChatId} />;
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
  return route.name === "home" || route.name === "projects" || route.name === "routines" || route.name === "settings" || route.name === "brain" || route.name === "onboarding" || route.name === "plan" || route.name === "runs";
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

  useEffect(() => {
    if (!status.data) return;
    if (gated && route.name !== "onboarding") navigate({ name: "onboarding" }, { replace: true });
    if (!gated && route.name === "onboarding") navigate({ name: "home" }, { replace: true });
  }, [gated, route.name, status.data]);

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
