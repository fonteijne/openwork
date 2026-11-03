import type { Project } from "~/backend/types";

import { InstructionsSection } from "./instructions";
import { ModelsSection } from "./models";
import { MethodsSection } from "./werkwijzen";

/** Agent group (brief §6): what the agent knows, which model it uses, which ways of working it has. */
export function AgentGroup(props: { project: Project }) {
  return (
    <div className="flex flex-col gap-8">
      <InstructionsSection projectId={props.project.id} />
      <ModelsSection project={props.project} />
      <MethodsSection projectId={props.project.id} scope="project" />
    </div>
  );
}
