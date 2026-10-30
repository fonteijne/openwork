import { ArrowDownToLine, ArrowUpFromLine, History, Wrench } from "lucide-react";

import { useBrain, useBrainHistory } from "~/backend/queries";
import type { BrainStatus } from "~/backend/types";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "~/components/ui/menu";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { relativeTime } from "~/lib/format";
import { navigate } from "~/lib/router";

import { attention, useBrainAction } from "./actions";

export function brainStateLabel(status: BrainStatus, now = Date.now()): string {
  const states = copy.brain.states;
  switch (status.state) {
    case "synced": return states.synced(status.lastSyncAt ? relativeTime(status.lastSyncAt, now) : null);
    case "syncing": return states.syncing;
    case "behind": return states.behind(status.behind);
    case "ahead": return states.ahead(status.ahead);
    case "offline": return states.offline(status.ahead);
    case "conflict": return states.conflict;
    case "read_only": return states.read_only;
    case "local_only": return states.local_only;
    case "needs_trust": return states.needs_trust;
    case "error": return states.error;
  }
}

function Dot(props: { status: BrainStatus }) {
  const busy = props.status.state === "syncing";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        busy ? "bw-pulse bg-primary" : attention(props.status) ? "bg-amber-9" : "bg-subtle-foreground",
      )}
    />
  );
}

/**
 * The brain's state in the project header (brains plan §8.2): one quiet
 * pill, a menu with "Nu bijwerken", "Wijzigingen delen" and the latest
 * history. Neutral unless the user has to act (DESIGN.md V2, C5).
 */
export function BrainPill(props: { projectId: string; className?: string }) {
  const brain = useBrain(props.projectId);
  const history = useBrainHistory(props.projectId, brain !== null);
  const { busy, run, brains } = useBrainAction(props.projectId);
  if (!brain) return null;
  const { status } = brain;
  const label = brainStateLabel(status);
  const canShare = status.mode !== "read_only" && status.remote !== null && status.state !== "conflict";
  const recent = (history.data ?? []).slice(0, 3);
  return (
    <Menu
      align="end"
      trigger={
        <button
          type="button"
          data-testid="brain-status"
          data-state={status.state}
          aria-label={`${copy.brain.pillLabel}: ${label}`}
          className={cn(
            "inline-flex h-7 min-w-0 max-w-64 shrink-0 items-center gap-1.5 rounded-full px-2.5 max-sm:size-9 max-sm:justify-center max-sm:px-0 text-xs text-muted-foreground ring-1 ring-inset ring-border hover:bg-hover hover:text-foreground pointer-coarse:h-9",
            attention(status) && "text-foreground ring-amber-9/60",
            props.className,
          )}
        >
          <Dot status={status} />
          {/* On a phone the title needs the room; the dot and the menu still say it. */}
          <span className="truncate max-sm:sr-only">{label}</span>
        </button>
      }
    >
      <MenuLabel>{label}</MenuLabel>
      {status.remote ? (
        <MenuItem icon={<ArrowDownToLine />} disabled={busy !== null || status.state === "conflict"} onClick={() => void run("update", () => brains.prepare(props.projectId, ""), copy.brain.updated)}>
          {copy.brain.updateNow}
        </MenuItem>
      ) : null}
      {canShare ? (
        <MenuItem icon={<ArrowUpFromLine />} disabled={busy !== null} onClick={() => void run("share", () => brains.share(props.projectId), copy.brain.shared)}>
          {status.state === "offline" || status.state === "read_only" ? copy.brain.retry : copy.brain.shareNow}
        </MenuItem>
      ) : null}
      {status.state === "error" ? (
        <MenuItem icon={<Wrench />} disabled={busy !== null} onClick={() => void run("repair", () => brains.repair(props.projectId), copy.brain.repaired)}>
          {copy.brain.repair}
        </MenuItem>
      ) : null}
      <MenuSeparator />
      <MenuLabel>{copy.brain.history}</MenuLabel>
      {recent.length ? recent.map((entry) => (
        <MenuItem key={entry.commit} disabled>
          {entry.title} <span className="text-subtle-foreground">{entry.author}, {relativeTime(entry.at)}</span>
        </MenuItem>
      )) : <MenuItem disabled>{copy.brain.historyEmpty}</MenuItem>}
      <MenuItem icon={<History />} onClick={() => navigate({ name: "project-settings", projectId: props.projectId, section: "brain" })}>
        {copy.brain.historyAll}
      </MenuItem>
    </Menu>
  );
}
