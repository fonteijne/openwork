import { useMemo, type ReactNode } from "react";

import { projectHasKey, useProject, useStatus } from "~/backend/queries";
import type { Project } from "~/backend/types";
import { Tabs } from "~/components/ui/tabs";
import { copy } from "~/copy";
import { href, navigate, SETTINGS_GROUPS, settingsGroupOf, type SettingsGroup, type SettingsSection } from "~/lib/router";

import { ProjectLoading, ProjectMissing } from "../project/project-page";
import { settingsCopy } from "./copy";
import { AgentGroup } from "./group-agent";
import { ProjectGroup } from "./group-project";
import { TechnischGroup } from "./group-technisch";
import { ToegangGroup } from "./group-toegang";
import { Overview } from "./overview";

// Kept for the app settings and anything else that built on the old module's exports.
export { KeyForm } from "./shared";
export { MethodsSection, SkillEditor } from "./werkwijzen";

function GroupContent(props: { project: Project; group: SettingsGroup }): ReactNode {
  switch (props.group) {
    case "project":
      return <ProjectGroup project={props.project} />;
    case "agent":
      return <AgentGroup project={props.project} />;
    case "toegang":
      return <ToegangGroup project={props.project} />;
    case "technisch":
      return <TechnischGroup project={props.project} />;
  }
}

/**
 * The Instellingen tab of a project (brief §6): four groups as a pill strip (Project · Agent ·
 * Toegang · Technisch), the Overzicht of the other groups' state first (S2), then the group. No
 * second rail, no "Routines openen" row (assessment P-1). The project header and tabs come from the
 * tab shell; an old section hash lands on its group (decision S1).
 */
export function ProjectSettingsPage(props: { projectId: string; group?: SettingsGroup; section?: SettingsSection | null }) {
  const { project, isLoading } = useProject(props.projectId);
  const status = useStatus();
  const group: SettingsGroup = props.group ?? settingsGroupOf(props.section);
  const keyAttention = project !== null && status.data !== undefined && !projectHasKey(status.data, project);
  const items = useMemo(
    () =>
      SETTINGS_GROUPS.map((entry) => ({
        value: entry,
        label:
          entry === "toegang" && keyAttention ? (
            <span className="flex items-center gap-1.5">
              {settingsCopy.groups[entry]}
              <span aria-hidden="true" className="size-1.5 rounded-full bg-amber-9" />
              <span className="sr-only">{settingsCopy.keyAttention}</span>
            </span>
          ) : (
            settingsCopy.groups[entry]
          ),
        href: project ? href({ name: "project-settings", projectId: project.id, group: entry }) : undefined,
      })),
    [project, keyAttention],
  );

  if (!project) return isLoading ? <ProjectLoading /> : <ProjectMissing />;

  return (
    <main className="min-h-0 flex-1 overflow-y-auto" data-testid="project-settings">
      <div className="mx-auto flex w-full max-w-2xl flex-col px-4 pt-3 pb-16 sm:px-6">
        <Tabs<SettingsGroup> value={group} onValueChange={(next) => navigate({ name: "project-settings", projectId: project.id, group: next })} items={items} label={settingsCopy.groupsLabel} surface="page" className="mb-6" />
        {status.data?.readOnly ? <p className="mb-6 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{copy.settings.readOnly}</p> : null}
        <Overview project={project} group={group} />
        <GroupContent project={project} group={group} />
      </div>
    </main>
  );
}
