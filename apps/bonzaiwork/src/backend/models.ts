import type { AppStatus, Project } from "./types";

type ModelChoice = Pick<Project, "allowedModels" | "defaultModel">;

/** The models this project may use: the key's models, narrowed by the project's allow-list. */
export function projectModels(status: AppStatus | undefined, project: Pick<Project, "allowedModels"> | null) {
  const models = status?.models ?? [];
  if (!project?.allowedModels) return models;
  const allowed = new Set(project.allowedModels);
  return models.filter((model) => allowed.has(model.id));
}

/** The model a new chat in this project starts with. */
export function startModel(status: AppStatus | undefined, project: ModelChoice | null): string | null {
  const models = projectModels(status, project);
  if (project?.defaultModel && models.some((model) => model.id === project.defaultModel)) return project.defaultModel;
  if (status?.defaultModel && models.some((model) => model.id === status.defaultModel)) return status.defaultModel;
  return models[0]?.id ?? null;
}

/** The preferred models this key offers, in the configured order. */
export function preferredIn(status: AppStatus | undefined): string[] {
  const offered = new Set(status?.models.map((model) => model.id));
  return (status?.preferredModels ?? []).filter((id) => offered.has(id));
}

/** The allow-list a new project starts with: the preferred models, or every model when none are configured. */
export function newProjectModels(status: AppStatus | undefined): string[] | null {
  return status?.preferredModels.length ? [...status.preferredModels] : null;
}

/** The key offers models, but the project's choice leaves none of them: chatting is blocked until one is picked. */
export function hasNoModels(status: AppStatus | undefined, project: Pick<Project, "allowedModels"> | null): boolean {
  return Boolean(status?.models.length) && projectModels(status, project).length === 0;
}
