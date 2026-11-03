import { BookOpen } from "lucide-react";

import { useBackend } from "~/backend/context";
import { useBrain } from "~/backend/queries";
import { StatusChip } from "~/components/ui/chip";
import { Locked } from "~/components/ui/misc";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { href } from "~/lib/router";

import { brainChip } from "./model";

/**
 * The brain's state as one line for the Details column (brief §6: "Brein · bijgewerkt 2 min"):
 * the pill that used to sit in the top bar, now a row that links to the Brein tab. Icon + word,
 * never hue alone (V2); neutral unless the user has to act (C5); a lock with the reason when brains
 * are off (P4). For a project that is not a brain the line offers the way to make it one.
 */
export function BrainLine(props: { projectId: string; className?: string }) {
  const backend = useBackend();
  const brain = useBrain(props.projectId);
  if (!backend.capabilities.brains) return <Locked className={props.className}>{copy.brain.locked}</Locked>;
  const chip = brain ? brainChip(brain.status) : null;
  return (
    <a
      href={href({ name: "project-brain", projectId: props.projectId })}
      data-testid="brain-line"
      data-state={brain?.status.state}
      className={cn("flex min-h-7 min-w-0 items-center gap-2 rounded-lg text-sm text-foreground underline-offset-2 hover:underline", props.className)}
    >
      <BookOpen className="size-4 shrink-0 text-subtle-foreground" aria-hidden="true" />
      {chip ? <StatusChip status={chip.status} label={chip.label} className="min-w-0 text-sm" /> : <span className="min-w-0 truncate">{copy.brain.notBrain.share}</span>}
    </a>
  );
}
