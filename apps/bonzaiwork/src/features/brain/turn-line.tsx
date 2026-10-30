import { CloudOff, Check, LoaderCircle } from "lucide-react";

import { useBrain } from "~/backend/queries";
import { copy } from "~/copy";

const RECENT = 15 * 60_000;

/**
 * One quiet line under the last turn (brains plan §8.2): what happened to
 * the turn's work. Shows state, not an explanation (DESIGN.md P1).
 */
export function BrainTurnLine(props: { projectId: string }) {
  const brain = useBrain(props.projectId);
  if (!brain) return null;
  const { status } = brain;
  const line =
    status.state === "syncing" ? { icon: <LoaderCircle className="animate-spin" />, text: copy.brain.states.syncing }
      : status.state === "offline" && status.ahead > 0 ? { icon: <CloudOff />, text: copy.brain.turnPending }
        : status.state === "local_only" && status.lastSyncAt === null ? null
          : status.state === "synced" && status.lastSyncAt && Date.now() - status.lastSyncAt < RECENT ? { icon: <Check />, text: copy.brain.turnShared }
            : null;
  if (!line) return null;
  return (
    <p className="flex items-center gap-1.5 text-xs text-subtle-foreground [&_svg]:size-3.5" role="status" data-testid="brain-turn-line">
      {line.icon}
      {line.text}
    </p>
  );
}
