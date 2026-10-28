import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useBackend } from "./context";
import type { AppStatus, Project } from "./types";

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
  env: ["env"] as const,
  versions: ["versions"] as const,
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

/** The models this project may use: the key's models, narrowed by the project's allow-list. */
export function projectModels(status: AppStatus | undefined, project: Project | null) {
  const models = status?.models ?? [];
  if (!project?.allowedModels) return models;
  const allowed = new Set(project.allowedModels);
  return models.filter((model) => allowed.has(model.id));
}

/** The model a new chat in this project starts with. */
export function startModel(status: AppStatus | undefined, project: Project | null): string | null {
  const models = projectModels(status, project);
  if (project?.defaultModel && models.some((model) => model.id === project.defaultModel)) return project.defaultModel;
  if (status?.defaultModel && models.some((model) => model.id === status.defaultModel)) return status.defaultModel;
  return models[0]?.id ?? null;
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
