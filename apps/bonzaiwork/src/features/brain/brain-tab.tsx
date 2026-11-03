import type { Project } from "~/backend/types";

import { BrainSettingsSection } from "./brain-settings";

/**
 * Project · Brein (brief §6). Stub: the existing settings section. The brains agent replaces it with
 * the state line, the Actie-nodig object, knowledge rows, history and "Technische details".
 */
export function BrainTab(props: { project: Project }) {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-4 pt-5 pb-16 sm:px-6">
        <BrainSettingsSection project={props.project} />
      </div>
    </main>
  );
}
