import { useQueryClient } from "@tanstack/react-query";
import { CloudOff, Check, LoaderCircle } from "lucide-react";
import { useEffect } from "react";

import { keys, useBrain, useBrainHistory } from "~/backend/queries";
import { copy } from "~/copy";

const RECENT = 15 * 60_000;

/**
 * One quiet line under the last turn (brains plan §8.2): what happened to
 * the turn's work. Shows state, not an explanation (DESIGN.md P1). "Gedeeld"
 * only when this chat's own turn is in the shared history (review #5).
 */
export function BrainTurnLine(props: { projectId: string; chatId: string }) {
  const client = useQueryClient();
  const brain = useBrain(props.projectId);
  const lastSyncAt = brain?.status.lastSyncAt ?? null;
  const history = useBrainHistory(props.projectId, brain?.status.state === "synced");
  // A new share means new history; the list polls, the history does not.
  useEffect(() => {
    if (lastSyncAt) void client.invalidateQueries({ queryKey: keys.brainHistory(props.projectId) });
  }, [client, lastSyncAt, props.projectId]);
  if (!brain) return null;
  const { status } = brain;
  const sharedHere = (history.data ?? []).some((entry) => entry.chatId === props.chatId && Date.now() - entry.at < RECENT);
  const line =
    status.state === "syncing" ? { icon: <LoaderCircle className="animate-spin" />, text: copy.brain.states.syncing }
      : status.state === "offline" && status.ahead > 0 ? { icon: <CloudOff />, text: copy.brain.turnPending }
        : status.state === "synced" && sharedHere ? { icon: <Check />, text: copy.brain.turnShared }
          : null;
  if (!line) return null;
  return (
    <p className="flex items-center gap-1.5 text-xs text-subtle-foreground [&_svg]:size-3.5" role="status" data-testid="brain-turn-line">
      {line.icon}
      {line.text}
    </p>
  );
}
