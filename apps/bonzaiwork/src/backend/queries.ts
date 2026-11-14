import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useBackend } from "./context";
import type { AppStatus, AttentionItem, Brain, Project } from "./types";

export { hasNoModels, newProjectModels, preferredIn, projectModels, startModel } from "./models";

/** Query keys: one place, so mutations invalidate exactly what they change. */
export const keys = {
  status: ["status"] as const,
  projects: ["projects"] as const,
  summary: (projectId: string) => ["summary", projectId] as const,
  usage: (projectId: string) => ["usage", projectId] as const,
  routines: (projectId: string | null) => ["routines", projectId ?? "all"] as const,
  allRoutines: ["routines"] as const,
  runs: (routineId: string) => ["runs", routineId] as const,
  instructions: (projectId: string) => ["config", projectId, "instructions"] as const,
  skills: (projectId: string, scope: "project" | "global") => ["config", projectId, "skills", scope] as const,
  skill: (projectId: string, name: string) => ["config", projectId, "skill", name] as const,
  commands: (projectId: string, scope: "workspace" | "global") => ["config", projectId, "commands", scope] as const,
  connections: (projectId: string) => ["config", projectId, "connections"] as const,
  runMode: (projectId: string) => ["config", projectId, "run-mode"] as const,
  folders: (projectId: string) => ["config", projectId, "folders"] as const,
  files: (projectId: string) => ["config", projectId, "files"] as const,
  audit: (projectId: string) => ["config", projectId, "audit"] as const,
  agents: (projectId: string) => ["composer", projectId, "agents"] as const,
  entries: (projectId: string) => ["composer", projectId, "entries"] as const,
  brains: ["brains"] as const,
  brainHistory: (projectId: string) => ["brains", projectId, "history"] as const,
  // Under "brains": every brain action refreshes it (adopt, publish).
  brainCandidate: (projectId: string) => ["brains", projectId, "candidate"] as const,
  concept: (projectId: string, path: string) => ["brains", projectId, "concept", path] as const,
  proposals: ["brain-proposals"] as const,
  brainAuthor: ["brain-author"] as const,
  workflows: (projectId: string) => ["workflows", projectId] as const,
  reads: (projectId: string) => ["brain-reads", projectId] as const,
  agendaSettings: ["agenda", "settings"] as const,
  agendaDay: (date: string) => ["agenda", "day", date] as const,
  /** Every agenda query: a change to a quarter or a post can change any day. */
  agenda: ["agenda"] as const,
  env: ["env"] as const,
  versions: ["versions"] as const,
  /** Every project summary: a decision answered anywhere changes the counts. */
  summaries: ["summary"] as const,
  /** "Voor jou": everything that waits on the person, across projects (ui-ux-overhaul §5). */
  attention: ["attention"] as const,
  /** The personal agent's view of the day: Start hier, Komt eraan, the world's cards. */
  today: ["today"] as const,
  todaySettings: ["today", "settings"] as const,
  /** Recent chats across projects; the limit is appended, so this prefix refreshes every size. */
  recent: ["recent-chats"] as const,
};

export function useStatus() {
  const backend = useBackend();
  return useQuery({ queryKey: keys.status, queryFn: () => backend.status(), staleTime: 30_000 });
}

export function useProjects() {
  const backend = useBackend();
  return useQuery({ queryKey: keys.projects, queryFn: () => backend.projects.list(), staleTime: 15_000 });
}

export function useProject(projectId: string): { project: Project | null; isLoading: boolean; isError: boolean } {
  const projects = useProjects();
  return {
    project: projects.data?.find((entry) => entry.id === projectId) ?? null,
    isLoading: projects.isLoading,
    isError: projects.isError,
  };
}

export function useSummary(projectId: string, options: { poll?: boolean } = {}) {
  const backend = useBackend();
  return useQuery({
    queryKey: keys.summary(projectId),
    queryFn: () => backend.projects.summary(projectId),
    staleTime: 10_000,
    refetchInterval: options.poll ? 20_000 : false,
  });
}

export function useUsage(projectId: string) {
  const backend = useBackend();
  return useQuery({ queryKey: keys.usage(projectId), queryFn: () => backend.projects.usage(projectId), staleTime: 60_000, enabled: backend.capabilities.usage });
}

export function useRoutines(projectId: string | null) {
  const backend = useBackend();
  return useQuery({
    queryKey: keys.routines(projectId),
    queryFn: () => backend.routines.list(projectId),
    enabled: backend.capabilities.routines,
    refetchInterval: 30_000,
  });
}

export function useRoutineRuns(routineId: string | null) {
  const backend = useBackend();
  return useQuery({
    queryKey: keys.runs(routineId ?? "none"),
    queryFn: () => backend.routines.runs(routineId ?? ""),
    enabled: Boolean(routineId) && backend.capabilities.routines,
    refetchInterval: 15_000,
  });
}

export function useAgents(projectId: string) {
  const backend = useBackend();
  return useQuery({ queryKey: keys.agents(projectId), queryFn: () => backend.composer.agents(projectId), staleTime: 5 * 60_000 });
}

export function useComposerEntries(projectId: string) {
  const backend = useBackend();
  return useQuery({ queryKey: keys.entries(projectId), queryFn: () => backend.composer.entries(projectId), staleTime: 60_000 });
}

export function modelName(status: AppStatus | undefined, id: string | null): string | null {
  if (!id) return null;
  return status?.models.find((model) => model.id === id)?.name ?? id;
}

/** Can this project chat right now? */
export function projectHasKey(status: AppStatus | undefined, project: Project | null): boolean {
  if (!status || !project) return false;
  return status.keyMode === "user" ? status.user.hasKey : project.key.hasKey;
}

export function useRefresh() {
  const client = useQueryClient();
  return (...queryKeys: readonly (readonly unknown[])[]) => Promise.all(queryKeys.map((queryKey) => client.invalidateQueries({ queryKey })));
}

/** Every brain with its status; polled, because sharing happens on the server after a turn. */
export function useBrains() {
  const backend = useBackend();
  return useQuery({ queryKey: keys.brains, queryFn: () => backend.brains.list(), enabled: backend.capabilities.brains, refetchInterval: 10_000, staleTime: 5_000 });
}

export function useBrain(projectId: string): Brain | null {
  return useBrains().data?.find((brain) => brain.projectId === projectId) ?? null;
}

export function usePersonalBrain(): Brain | null {
  return useBrains().data?.find((brain) => brain.status.kind === "personal") ?? null;
}

export function useBrainHistory(projectId: string, enabled = true) {
  const backend = useBackend();
  return useQuery({ queryKey: keys.brainHistory(projectId), queryFn: () => backend.brains.history(projectId), enabled: enabled && backend.capabilities.brains, staleTime: 10_000 });
}

export function useConcept(projectId: string, path: string | null) {
  const backend = useBackend();
  return useQuery({
    queryKey: keys.concept(projectId, path ?? ""),
    queryFn: () => backend.brains.concept(projectId, path ?? ""),
    enabled: Boolean(path?.startsWith("knowledge/") && path.endsWith(".md")) && backend.capabilities.brains,
    staleTime: 10_000,
  });
}

/** Preferences the AI proposed; the card asks the user (brains plan §7.3). */
export function useProposals() {
  const backend = useBackend();
  return useQuery({ queryKey: keys.proposals, queryFn: () => backend.brains.proposals(), enabled: backend.capabilities.brains, refetchInterval: 5_000 });
}

export function useBrainAuthor() {
  const backend = useBackend();
  return useQuery({ queryKey: keys.brainAuthor, queryFn: () => backend.brains.author(), enabled: backend.capabilities.brains });
}

/** The project's ICM workflows with their status from disk (plan §6.5); polled, a chat changes it. */
export function useWorkflows(projectId: string) {
  const backend = useBackend();
  return useQuery({ queryKey: keys.workflows(projectId), queryFn: () => backend.brains.workflows(projectId), enabled: backend.capabilities.brains, refetchInterval: 10_000, staleTime: 5_000 });
}

/** Other brains this project consults without asking. */
export function useReads(projectId: string) {
  const backend = useBackend();
  return useQuery({ queryKey: keys.reads(projectId), queryFn: () => backend.brains.reads(projectId), enabled: backend.capabilities.brains, staleTime: 10_000 });
}

/** Bridge posts per project and "Werkdag bijhouden" (plan §7.5). */
export function useAgendaSettings(enabled = true) {
  const backend = useBackend();
  return useQuery({ queryKey: keys.agendaSettings, queryFn: () => backend.agenda.settings(), enabled: enabled && backend.capabilities.agenda, staleTime: 30_000 });
}

/**
 * One day of the agenda. The pill reads today once a minute; the open panel polls the day it shows
 * and refreshes on window focus (plan §7.2). A closed panel asks nothing.
 */
export function useAgendaDay(date: string, options: { enabled?: boolean; poll?: boolean } = {}) {
  const backend = useBackend();
  return useQuery({
    queryKey: keys.agendaDay(date),
    queryFn: () => backend.agenda.day(date),
    enabled: (options.enabled ?? true) && backend.capabilities.agenda,
    refetchInterval: options.poll === false ? false : 60_000,
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });
}

/**
 * Everything that waits on the person, across projects: one 10 s poll that replaces the
 * separate summary, routine, brain and proposal clocks on Vandaag (ui-ux-overhaul §9). Off
 * until a project exists; a window focus refreshes it at once.
 */
export function useAttention() {
  const backend = useBackend();
  const projects = useProjects();
  return useQuery({
    queryKey: keys.attention,
    queryFn: () => backend.attention.list(),
    enabled: (projects.data?.length ?? 0) > 0,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
    placeholderData: (previous): AttentionItem[] | undefined => previous,
  });
}

/** One limit for every reader, so the palette and Vandaag share one cache and one poll. */
export const RECENT_LIMIT = 24;

/** The newest chats across projects, for the palette and "Terwijl je weg was". */
export function useRecentChats() {
  const backend = useBackend();
  const projects = useProjects();
  return useQuery({
    queryKey: [...keys.recent, RECENT_LIMIT] as const,
    queryFn: () => backend.chats.recent(RECENT_LIMIT),
    enabled: (projects.data?.length ?? 0) > 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });
}

/**
 * The query keys a resolved item touches. A screen that answers a permission or question,
 * runs or fixes a routine, settles a brain or decides a proposal refreshes these afterwards
 * (`useRefreshAttention`), so the card leaves Vandaag without waiting for the next poll.
 */
export const ATTENTION_KEYS: readonly (readonly unknown[])[] = [keys.attention, keys.recent, keys.summaries, keys.allRoutines, keys.brains, keys.proposals];

/** `const refreshAttention = useRefreshAttention(); await backend.…; await refreshAttention();` */
export function useRefreshAttention() {
  const refresh = useRefresh();
  return () => refresh(...ATTENTION_KEYS);
}

/**
 * What the personal agent has for Vandaag: one 15 s poll (the to-dos are files, read on the
 * server each time). Off where the server has no such routes.
 */
export function useToday() {
  const backend = useBackend();
  return useQuery({
    queryKey: keys.today,
    queryFn: () => backend.today.view(),
    enabled: backend.capabilities.today,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
    placeholderData: (previous) => previous,
  });
}

export function useTodaySettings() {
  const backend = useBackend();
  return useQuery({ queryKey: keys.todaySettings, queryFn: () => backend.today.settings(), enabled: backend.capabilities.today, staleTime: 30_000 });
}

/** After an action on Vandaag: the view, and what a new to-do or a sent reply can change elsewhere. */
export function useRefreshToday() {
  const refresh = useRefresh();
  return () => refresh(keys.today, keys.brains);
}
