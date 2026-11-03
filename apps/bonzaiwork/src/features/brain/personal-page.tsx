import { usePersonalBrain, useProject } from "~/backend/queries";
import { PageTitle, TopBar } from "~/components/top-bar";
import { copy } from "~/copy";

import { BrainSettingsSection } from "./brain-settings";
import { BrainsAppSection } from "./personal-setup";

/**
 * Jouw brein (`#/brein`, brief §8, decision B1): the personal brain is a sidebar item, not a project
 * row. Stub: the setup rows when there is none yet, otherwise its settings section. The brains agent
 * replaces this.
 */
export function PersonalPage() {
  const personal = usePersonalBrain();
  const { project } = useProject(personal?.projectId ?? "");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar>
        <PageTitle>{copy.shell.brain}</PageTitle>
      </TopBar>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-4 pt-5 pb-16 sm:px-6">
          {project ? <BrainSettingsSection project={project} /> : null}
          <BrainsAppSection />
        </div>
      </main>
    </div>
  );
}
