import { Boxes, KeyRound } from "lucide-react";

import { hasNoModels, projectHasKey, useStatus } from "~/backend/queries";
import type { AppStatus, Project } from "~/backend/types";
import { copy } from "~/copy";
import { href } from "~/lib/router";

/** C5: blocked is not an error. Neutral, with what to do and where. */
export function KeyBlocked(props: { projectId: string }) {
  const status = useStatus();
  const userMode = status.data?.keyMode === "user";
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
      <KeyRound className="size-4 shrink-0" />
      <span>{userMode ? copy.keys.userMissing : copy.keys.projectMissing}</span>
      <a
        className="font-medium text-foreground underline underline-offset-2"
        href={userMode ? href({ name: "settings" }) : href({ name: "project-settings", projectId: props.projectId, section: "key" })}
      >
        {copy.keys.link}
      </a>
    </span>
  );
}

/** C5, like KeyBlocked: the project's model choice leaves nothing to chat with. */
export function ModelsBlocked(props: { projectId: string }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
      <Boxes className="size-4 shrink-0" />
      <span>{copy.chat.modelsMissing}</span>
      <a className="font-medium text-foreground underline underline-offset-2" href={href({ name: "project-settings", projectId: props.projectId, section: "key" })}>
        {copy.chat.modelsPick}
      </a>
    </span>
  );
}

/** Why this project cannot chat right now, if it cannot: a missing key comes first. */
export function chatBlocked(status: AppStatus | undefined, project: Project) {
  if (!projectHasKey(status, project)) return <KeyBlocked projectId={project.id} />;
  if (hasNoModels(status, project)) return <ModelsBlocked projectId={project.id} />;
  return undefined;
}
