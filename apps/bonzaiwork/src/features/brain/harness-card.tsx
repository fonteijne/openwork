import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PackageCheck } from "lucide-react";

import { useBackend } from "~/backend/context";
import { useBrain } from "~/backend/queries";
import type { OutdatedItem } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Chip } from "~/components/ui/chip";
import { Skeleton } from "~/components/ui/misc";
import { ConfirmDialog, Dialog } from "~/components/ui/overlay";
import { copy } from "~/copy";
import { href } from "~/lib/router";

import { useBrainAction } from "./actions";

const ref = (item: OutdatedItem) => ({ kind: item.kind, name: item.name });
const title = (item: OutdatedItem) => (item.kind === "command" ? `/${item.name}` : item.name);

/** "Verschillen bekijken": the project's copy against the version BonzaiWork ships, in a dialog. */
function DiffDialog(props: { projectId: string; item: OutdatedItem | null; onClose: () => void }) {
  const backend = useBackend();
  const item = props.item;
  const diff = useQuery({
    queryKey: ["brain-harness-diff", props.projectId, item?.kind ?? "", item?.name ?? ""],
    queryFn: () => backend.brains.harnessDiff(props.projectId, item?.kind ?? "skill", item?.name ?? ""),
    enabled: item !== null,
  });
  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && props.onClose()} title={copy.brain.harness.diffTitle(item ? title(item) : "")} size="lg">
      {diff.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : diff.data ? (
        <pre className="max-h-[60vh] overflow-auto rounded-xl bg-muted/70 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap" data-testid="brain-harness-diff">
          {diff.data.split("\n").map((line, index) => (
            <span key={index} className={line.startsWith("+") && !line.startsWith("+++") ? "text-jade-11" : line.startsWith("-") && !line.startsWith("---") ? "text-red-11" : line.startsWith("@@") || line.startsWith("+++") || line.startsWith("---") ? "text-muted-foreground" : undefined}>
              {line}
              {"\n"}
            </span>
          ))}
        </pre>
      ) : (
        <p className="text-sm text-muted-foreground">{copy.brain.harness.diffEmpty}</p>
      )}
    </Dialog>
  );
}

/**
 * Brein-harnas-plan H3: copies of BonzaiWork's own parts in a team brain that are older than this
 * app ships. Unchanged copies take "Bijwerken" or "Uit het project halen"; a copy the team changed
 * says so and takes "Verschillen bekijken", "Versie van BonzaiWork overnemen" (confirmed) or "Zo
 * laten". Never a blocker: chatting and knowledge work as they are (P9: action · data · risk).
 */
export function HarnessCard(props: { projectId: string; /** Off on the Brein tab itself. */ link?: boolean; className?: string }) {
  const brain = useBrain(props.projectId);
  const { busy, run, brains } = useBrainAction(props.projectId);
  const [diffItem, setDiffItem] = useState<OutdatedItem | null>(null);
  const [takeOver, setTakeOver] = useState<OutdatedItem | null>(null);
  const items = brain?.status.outdated ?? [];
  if (!brain || brain.status.kind !== "project" || !items.length) return null;
  const disabled = busy !== null;
  const unchanged = items.filter((item) => !item.modified);
  const link = props.link === false ? undefined : <a href={href({ name: "project-brain", projectId: props.projectId })}>{copy.brain.attention.openBrain}</a>;
  const update = (list: OutdatedItem[]) => void run("harness-update", () => brains.harnessUpdate(props.projectId, list.map(ref)), copy.brain.harness.updated);
  const remove = (item: OutdatedItem) => void run("harness-remove", () => brains.harnessRemove(props.projectId, [ref(item)]), copy.brain.harness.removedFromProject);
  const leave = (item: OutdatedItem) => void run("harness-dismiss", () => brains.harnessDismiss(props.projectId, [ref(item)]), copy.brain.harness.left);
  return (
    <>
      <Callout
        className={props.className}
        testId="brain-harness"
        label={copy.brain.harness.outdatedLabel}
        icon={<PackageCheck />}
        title={copy.brain.harness.outdatedTitle(items.length)}
        state={copy.brain.harness.outdatedState}
        actions={
          unchanged.length ? (
            <Button variant="primary" disabled={disabled} onClick={() => update(unchanged)}>
              {copy.brain.harness.updateAll(unchanged.length)}
            </Button>
          ) : undefined
        }
        link={link}
      >
        <ul className="flex flex-col divide-y divide-border">
          {items.map((item) => (
            <li key={`${item.kind}:${item.name}`} className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0" data-testid={`brain-harness-${item.kind}-${item.name}`}>
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="font-medium text-foreground">{title(item)}</span>
                <Chip mono size="sm">
                  {copy.brain.harness.versions(item.from, item.to)}
                </Chip>
                {item.modified ? <span className="text-muted-foreground">{copy.brain.harness.modified}</span> : null}
              </div>
              <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
                {item.modified ? (
                  <>
                    <Button variant="secondary" size="sm" disabled={disabled} onClick={() => setDiffItem(item)}>
                      {copy.brain.harness.diff}
                    </Button>
                    <Button variant="secondary" size="sm" disabled={disabled} onClick={() => setTakeOver(item)}>
                      {copy.brain.harness.takeOver}
                    </Button>
                    <Button variant="quiet" size="sm" disabled={disabled} onClick={() => leave(item)}>
                      {copy.brain.harness.leave}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="secondary" size="sm" disabled={disabled} onClick={() => update([item])}>
                      {copy.brain.harness.update}
                    </Button>
                    <Button variant="quiet" size="sm" disabled={disabled} title={copy.brain.harness.removeFromProjectHint} onClick={() => remove(item)}>
                      {copy.brain.harness.removeFromProject}
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Callout>
      <DiffDialog projectId={props.projectId} item={diffItem} onClose={() => setDiffItem(null)} />
      <ConfirmDialog
        open={takeOver !== null}
        onOpenChange={(open) => !open && setTakeOver(null)}
        title={copy.brain.harness.takeOverTitle(takeOver ? title(takeOver) : "")}
        body={copy.brain.harness.takeOverBody}
        confirmLabel={copy.brain.harness.takeOver}
        onConfirm={() => {
          const item = takeOver;
          setTakeOver(null);
          if (item) update([item]);
        }}
      />
    </>
  );
}
