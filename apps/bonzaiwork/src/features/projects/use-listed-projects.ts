import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";

import { useBackend } from "~/backend/context";
import { keys, useAttention, usePersonalBrain, useProjects, useToday } from "~/backend/queries";
import type { Project, ProjectSummary } from "~/backend/types";
import type { ChipStatus } from "~/components/ui/chip";

/**
 * The projects as the shell lists them, shared by the sidebar, Vandaag, the palette and the
 * project switcher (brief §4): one ordering, one set of summaries, one attention count.
 */

const toSummaries = (results: { data: ProjectSummary | undefined }[]): (ProjectSummary | null)[] => results.map((result) => result.data ?? null);

/** One summary per listed project, polled like the projects page did. */
function useSummaries(projects: Project[]): Map<string, ProjectSummary> {
  const backend = useBackend();
  const data = useQueries({
    queries: projects.map((project) => ({
      queryKey: keys.summary(project.id),
      queryFn: () => backend.projects.summary(project.id),
      staleTime: 10_000,
      refetchInterval: 20_000,
    })),
    combine: toSummaries,
  });
  return useMemo(() => {
    const map = new Map<string, ProjectSummary>();
    data.forEach((summary, index) => {
      const project = projects[index];
      if (project && summary) map.set(project.id, summary);
    });
    return map;
  }, [data, projects]);
}

/**
 * The projects the sidebar lists: not archived, not the personal brain (decision B1); pinned first
 * in a stable order (⌘1…⌘9), then by activity.
 */
/** The same status the sidebar shows for a project row: key first, then waiting, failed, running. */
export function projectChipStatus(hasKey: boolean, summary: { waitingCount: number; failedCount: number; runningCount: number } | undefined): ChipStatus {
  if (!hasKey) return "locked";
  if (summary?.waitingCount) return "waiting";
  if (summary?.failedCount) return "failed";
  if (summary?.runningCount) return "running";
  return "idle";
}

export function useSidebarProjects() {
  const projects = useProjects();
  const personalId = usePersonalBrain()?.projectId ?? null;
  const listed = useMemo(() => (projects.data ?? []).filter((project) => !project.archivedAt && project.id !== personalId), [projects.data, personalId]);
  const summaries = useSummaries(listed);
  const sorted = useMemo(
    () =>
      [...listed].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        if (a.pinned) return a.name.localeCompare(b.name, "nl");
        const activity = (summaries.get(b.id)?.lastActivityAt ?? 0) - (summaries.get(a.id)?.lastActivityAt ?? 0);
        return activity || a.name.localeCompare(b.name, "nl");
      }),
    [listed, summaries],
  );
  const pinned = useMemo(() => sorted.filter((project) => project.pinned), [sorted]);
  return { projects: sorted, pinned, summaries, isLoading: projects.isLoading };
}

/**
 * What needs the person, for the badges (brief §4): one poll of `attention.list()` (brief §9).
 * "Vandaag" counts everything in Voor jou; "Routines" the routines with attention, a failed or a
 * missed run.
 */
export function useAttentionCounts(): { today: number; routines: number } {
  const attention = useAttention();
  const today = useToday();
  return useMemo(() => {
    const items = attention.data ?? [];
    // The world's cards (a mail with a draft, a promise, an appointment that starts soon) wait on the person too.
    const world = today.data?.enabled ? today.data.items.length : 0;
    return { today: items.length + world, routines: items.filter((item) => item.kind === "routine").length };
  }, [attention.data, today.data]);
}
