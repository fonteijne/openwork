import { useEffect, useMemo, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";

import { useBackend } from "~/backend/context";
import { keys, useAttention, useBrainAuthor, useBrains, useProjects, useRecentChats, useRoutines, useToday } from "~/backend/queries";
import type { Brain, BrainHistoryEntry, Project } from "~/backend/types";
import { PageTitle, TopBar } from "~/components/top-bar";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { errorText } from "~/lib/errors";
import { SEEN_ALL_EVENT } from "~/lib/shortcuts";
import { cn } from "~/lib/cn";
import { DESKTOP, SMALL_UP, useMediaQuery, WIDE } from "~/lib/use-media";

import { useSidebarProjects } from "../projects/use-listed-projects";
import { withWorld } from "../today/model";
import { CleanupRow, DayCloseCard, FocusLine, PlanSection, SentToday, StartSection, TodayBlocked, UpcomingSection } from "../today/today-sections";
import { AttentionSection } from "./attention-section";
import { HomeComposer } from "./home-composer";
import { awayRows, MAX_AWAY_ROWS, nextRoutine, readLastSeen, writeLastSeen } from "./model";
import { BusySection, ProjectsSection, WhileAwaySection, WorkdaySection } from "./sections";

/** Enough recent chats to find what runs and what finished since last time (brief §5). */

const toHistory = (results: { data: BrainHistoryEntry[] | undefined }[]): (BrainHistoryEntry[] | null)[] => results.map((result) => result.data ?? null);

/** The history of every shared brain, for colleagues' changes in "Terwijl je weg was". */
function useBrainHistories(brains: readonly Brain[]): { brain: Brain; entries: BrainHistoryEntry[] }[] {
  const backend = useBackend();
  const shared = useMemo(() => brains.filter((brain) => brain.status.kind === "project"), [brains]);
  const data = useQueries({
    queries: shared.map((brain) => ({
      queryKey: keys.brainHistory(brain.projectId),
      queryFn: () => backend.brains.history(brain.projectId),
      staleTime: 60_000,
      enabled: backend.capabilities.brains,
    })),
    combine: toHistory,
  });
  return useMemo(() => shared.map((brain, index) => ({ brain, entries: data[index] ?? [] })), [shared, data]);
}

/** ⌘⇧U marks everything as seen (brief §5): the chord lives in the shortcuts table; the shell fires the event. */
function useSeenAll(onSeenAll: () => void) {
  useEffect(() => {
    window.addEventListener(SEEN_ALL_EVENT, onSeenAll);
    return () => window.removeEventListener(SEEN_ALL_EVENT, onSeenAll);
  }, [onSeenAll]);
}

/**
 * Vandaag (brief §5): one composer that starts work in any project, then only the sections with
 * content: Voor jou, Bezig, Terwijl je weg was, Je werkdag, Projecten. The first card is the focal
 * element; without one, the composer (P7). No sentence explains the interface (P1). On a phone the
 * composer sticks to the bottom, in thumb reach (brief §4).
 */
export function HomePage() {
  const backend = useBackend();
  const client = useQueryClient();
  const smallUp = useMediaQuery(SMALL_UP);
  const { projects, summaries } = useSidebarProjects();
  const attention = useAttention();
  const recent = useRecentChats();
  const routines = useRoutines(null);
  const brains = useBrains();
  const author = useBrainAuthor();
  const histories = useBrainHistories(brains.data ?? []);
  const [lastSeenAt, setLastSeenAt] = useState(() => readLastSeen());

  const projectMap = useMemo(() => new Map<string, Project>(projects.map((project) => [project.id, project])), [projects]);
  const brainMap = useMemo(() => new Map<string, Brain>((brains.data ?? []).map((brain) => [brain.projectId, brain])), [brains.data]);
  const routineMap = useMemo(() => new Map((routines.data ?? []).map((routine) => [routine.id, routine])), [routines.data]);
  const next = useMemo(() => nextRoutine(routines.data ?? []), [routines.data]);
  // The personal agent (docs/bonzaiwork/persoonlijke-agent-plan.md §4): off, Vandaag is as it was.
  const today = useToday();
  const agent = today.data?.enabled ? today.data : null;
  // A to-do can live in any brain, also one that is not in the sidebar (the personal brain).
  const allProjects = useProjects();
  const everyProject = useMemo(() => new Map<string, Project>((allProjects.data ?? []).map((project) => [project.id, project])), [allProjects.data]);
  const items = useMemo(() => withWorld(attention.data ?? [], agent?.items ?? []), [attention.data, agent]);
  // What stops an agent goes first (P7); otherwise the to-do to start with is the focal element.
  const decisionWaits = items.some((item) => item.kind === "permission" || item.kind === "question");
  const away = useMemo(
    () => awayRows({ chats: recent.data ?? [], history: histories, lastSeenAt, ownAuthor: author.data?.author?.name ?? null, limit: MAX_AWAY_ROWS }),
    [recent.data, histories, lastSeenAt, author.data],
  );

  const seenAll = () => {
    const now = Date.now();
    writeLastSeen(now);
    setLastSeenAt(now);
  };
  useSeenAll(seenAll);

  // "Parkeren" (T5): the thought goes to the inbox of the personal brain; the page stays as it is.
  const park = async (text: string): Promise<boolean> => {
    try {
      await backend.today.park(text);
      toast(copy.today.parkedToast);
      void client.invalidateQueries({ queryKey: keys.today });
      return true;
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
      return false;
    }
  };
  // With the personal agent on there is more to show: a second column on a wide window keeps the
  // day (Komt eraan, dagplan, Je werkdag) beside the work instead of below it.
  const wide = useMediaQuery(WIDE);
  const desktop = useMediaQuery(DESKTOP);
  const columns = Boolean(agent) && wide;
  const composer = <HomeComposer projects={projects} size={smallUp && !agent ? "large" : "default"} autoFocus={false} onPark={agent && !agent.blocked ? park : undefined} />;
  const cleanup = agent?.cleanup[0];
  const day = (
    <>
      {agent ? <UpcomingSection rows={agent.upcoming} projects={everyProject} compact={!columns} /> : null}
      {agent?.plan ? <PlanSection plan={agent.plan} open={columns} /> : null}
      {agent ? <SentToday sent={agent.sent} /> : null}
      <WorkdaySection nextRoutine={next} projects={projectMap} />
      {cleanup ? <CleanupRow candidate={cleanup} /> : null}
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar>
        <PageTitle>{copy.home.title}</PageTitle>
      </TopBar>
      <main className="min-h-0 flex-1 overflow-y-auto" data-testid="home-page">
        <div className={cn("mx-auto w-full px-4 pt-6 pb-12 sm:px-6", columns ? "grid max-w-6xl grid-cols-[minmax(0,1fr)_19rem] items-start gap-x-10" : "max-w-3xl sm:pt-8")}>
          <div className={cn("flex min-w-0 flex-col", agent ? "gap-6" : "gap-8")}>
            {smallUp ? composer : null}
            {agent?.focus ? <FocusLine focus={agent.focus} projects={everyProject} /> : null}
            {agent?.blocked ? <TodayBlocked reason={agent.blocked} /> : null}
            {agent?.close ? <DayCloseCard close={agent.close} done={agent.done} /> : null}
            {agent && !agent.blocked ? <StartSection view={agent} projects={everyProject} isFocal={!decisionWaits} /> : null}
            <AttentionSection
              items={attention.data ? items : undefined}
              loading={attention.isLoading}
              projects={projectMap}
              brains={brainMap}
              routines={routineMap}
              nextRoutine={next}
              focal={!agent?.start || decisionWaits}
              maxCards={agent ? 3 : undefined}
            />
            {columns ? null : day}
            <BusySection chats={recent.data ?? []} projects={projectMap} />
            <WhileAwaySection rows={away} projects={projectMap} lastSeenAt={lastSeenAt} onSeenAll={seenAll} />
            {/* With the agent on, the page keeps to the day: the sidebar already lists the projects on a desktop. */}
            {agent && desktop ? null : <ProjectsSection projects={projects} summaries={summaries} items={items} />}
          </div>
          {/* The day stays in view while the work column scrolls. */}
          {columns ? <aside className="sticky top-6 flex min-w-0 flex-col gap-6" data-testid="home-day">{day}</aside> : null}
        </div>
      </main>
      {smallUp ? null : <div className="shrink-0 border-t border-border bg-background px-3 pt-2 pb-[max(8px,env(safe-area-inset-bottom))]">{composer}</div>}
    </div>
  );
}
