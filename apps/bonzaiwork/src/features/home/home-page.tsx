import { useEffect, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";

import { useBackend } from "~/backend/context";
import { keys, useAttention, useBrainAuthor, useBrains, useRecentChats, useRoutines } from "~/backend/queries";
import type { Brain, BrainHistoryEntry, Project } from "~/backend/types";
import { PageTitle, TopBar } from "~/components/top-bar";
import { copy } from "~/copy";
import { SEEN_ALL_EVENT } from "~/lib/shortcuts";
import { SMALL_UP, useMediaQuery } from "~/lib/use-media";

import { useSidebarProjects } from "../projects/use-listed-projects";
import { AttentionSection } from "./attention-section";
import { HomeComposer } from "./home-composer";
import { awayRows, MAX_AWAY_ROWS, nextRoutine, readLastSeen, writeLastSeen } from "./model";
import { BusySection, ProjectsSection, WhileAwaySection, WorkdaySection } from "./sections";

/** Enough recent chats to find what runs and what finished since last time (brief §5). */
const RECENT_LIMIT = 24;

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
  const smallUp = useMediaQuery(SMALL_UP);
  const { projects, summaries } = useSidebarProjects();
  const attention = useAttention();
  const recent = useRecentChats(RECENT_LIMIT);
  const routines = useRoutines(null);
  const brains = useBrains();
  const author = useBrainAuthor();
  const histories = useBrainHistories(brains.data ?? []);
  const [lastSeenAt, setLastSeenAt] = useState(() => readLastSeen());

  const projectMap = useMemo(() => new Map<string, Project>(projects.map((project) => [project.id, project])), [projects]);
  const brainMap = useMemo(() => new Map<string, Brain>((brains.data ?? []).map((brain) => [brain.projectId, brain])), [brains.data]);
  const routineMap = useMemo(() => new Map((routines.data ?? []).map((routine) => [routine.id, routine])), [routines.data]);
  const next = useMemo(() => nextRoutine(routines.data ?? []), [routines.data]);
  const items = attention.data ?? [];
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

  const composer = <HomeComposer projects={projects} size={smallUp ? "large" : "default"} autoFocus={false} />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar>
        <PageTitle>{copy.home.title}</PageTitle>
      </TopBar>
      <main className="min-h-0 flex-1 overflow-y-auto" data-testid="home-page">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pt-6 pb-12 sm:px-6 sm:pt-8">
          {smallUp ? composer : null}
          <AttentionSection items={attention.data} loading={attention.isLoading} projects={projectMap} brains={brainMap} routines={routineMap} nextRoutine={next} />
          <BusySection chats={recent.data ?? []} projects={projectMap} />
          <WhileAwaySection rows={away} projects={projectMap} lastSeenAt={lastSeenAt} onSeenAll={seenAll} />
          <WorkdaySection nextRoutine={next} projects={projectMap} />
          <ProjectsSection projects={projects} summaries={summaries} items={items} />
        </div>
      </main>
      {smallUp ? null : <div className="shrink-0 border-t border-border bg-background px-3 pt-2 pb-[max(8px,env(safe-area-inset-bottom))]">{composer}</div>}
    </div>
  );
}
