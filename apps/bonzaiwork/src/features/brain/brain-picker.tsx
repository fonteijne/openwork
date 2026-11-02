import { Check } from "lucide-react";

import { useBrains, useProjects } from "~/backend/queries";
import type { Brain, BrainStatus, Project } from "~/backend/types";

type BrainRef = Pick<Brain, "projectId" | "path"> & { status: Pick<BrainStatus, "kind"> };
type ProjectRef = Pick<Project, "id" | "name">;
import { cn } from "~/lib/cn";

/** A shared brain's name as people see it: its project's name, else its folder. */
export function brainName(brain: BrainRef, projects: readonly ProjectRef[] | undefined): string {
  return projects?.find((project) => project.id === brain.projectId)?.name ?? brain.path.split(/[\\/]/).filter(Boolean).at(-1) ?? brain.projectId;
}

/** The project of a brain by the name the AI used, like the brains MCP finds it (name or folder, then a clear part). */
export function brainIdByName(name: string, brains: readonly BrainRef[], projects: readonly ProjectRef[] | undefined): string | null {
  const key = name.trim().toLowerCase().replace(/[-_ ]?brein$/, "").trim();
  if (!key) return null;
  const names = (brain: BrainRef) => [brainName(brain, projects), brain.path.split(/[\\/]/).filter(Boolean).at(-1) ?? ""].map((entry) => entry.toLowerCase());
  const team = brains.filter((brain) => brain.status.kind === "project");
  const exact = team.filter((brain) => names(brain).some((entry) => entry === key || entry.replace(/[-_ ]?brein$/, "").trim() === key));
  if (exact.length === 1) return exact[0]?.projectId ?? null;
  const partial = team.filter((brain) => names(brain).some((entry) => entry.includes(key)));
  return partial.length === 1 ? partial[0]?.projectId ?? null : null;
}

/** Shared brains on this laptop as toggles (routines, Projectinstellingen → Brein). */
export function BrainPicker(props: { label: string; hint: string; exclude: string | null; value: readonly string[]; onChange: (value: string[]) => void; disabled?: boolean }) {
  const brains = useBrains();
  const projects = useProjects();
  const choices = (brains.data ?? [])
    .filter((brain) => brain.status.kind === "project" && brain.projectId !== props.exclude)
    .map((brain) => ({ id: brain.projectId, name: brainName(brain, projects.data) }));
  if (!choices.length) return null;
  const toggle = (id: string) => props.onChange(props.value.includes(id) ? props.value.filter((entry) => entry !== id) : [...props.value, id]);
  const labelId = `brain-picker-${props.exclude ?? "all"}`;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium" id={labelId}>{props.label}</span>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-1.5">
        {choices.map((choice) => {
          const checked = props.value.includes(choice.id);
          return (
            <button
              key={choice.id}
              type="button"
              role="checkbox"
              aria-checked={checked}
              disabled={props.disabled}
              onClick={() => toggle(choice.id)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm ring-1 ring-inset transition-colors duration-100 disabled:opacity-60 pointer-coarse:h-10 [&_svg]:size-3.5",
                checked ? "bg-muted text-foreground ring-foreground/40" : "text-muted-foreground ring-border hover:text-foreground",
              )}
            >
              {checked ? <Check /> : null}
              {choice.name}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{props.hint}</p>
    </div>
  );
}

