import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowDownToLine, ShieldQuestion } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys, useHarness } from "~/backend/queries";
import type { RemoteCheck, TeamRepo } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Chip, StatusChip } from "~/components/ui/chip";
import { Row, Skeleton } from "~/components/ui/misc";
import { ConfirmDialog } from "~/components/ui/overlay";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { errorText } from "~/lib/errors";
import { fileName } from "~/lib/tools";

import { BrainLinkField } from "./link-field";
import { brainChip } from "./model";

/** The trust label of one part the team ships, in the brain's own words. */
const trustLabel = (item: TeamRepo["status"]["pendingTrust"][number]) => copy.brain.trustKinds[item.kind](item.mcpServers);

/**
 * Instellingen → Breinen → "Skills van je team" (brein-harnas-plan §2.1): one read-only repository
 * whose skills, commands and agents count in every project. Linking goes through the same tested
 * link field as a brain; parts that can run code wait on the same trust card; "Nu bijwerken" and
 * "Loskoppelen" (confirmed) are the only other actions. No "harnas" in view (C3).
 */
export function TeamRepoRows(props: { readOnly: boolean }) {
  const backend = useBackend();
  const client = useQueryClient();
  const harness = useHarness();
  const [open, setOpen] = useState(false);
  const [check, setCheck] = useState<RemoteCheck | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const repo = harness.data?.repo ?? null;
  const refresh = () => Promise.all([client.invalidateQueries({ queryKey: keys.harness }), client.invalidateQueries({ queryKey: ["config"] })]);
  const run = async (name: string, task: () => Promise<unknown>, done?: string) => {
    if (busy) return;
    setBusy(name);
    try {
      await task();
      await refresh();
      if (done) toast(done);
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
    } finally {
      setBusy(null);
    }
  };
  if (!backend.capabilities.harness) return null;
  if (harness.isLoading) return <Row label={copy.brain.harness.team.title} value={<Skeleton className="h-4 w-32" />} />;
  if (!repo) {
    return (
      <>
        <Row
          label={copy.brain.harness.team.title}
          hint={copy.brain.harness.team.hint}
          value={open ? undefined : copy.brain.harness.team.none}
          action={
            <Button variant="secondary" size="sm" disabled={props.readOnly} aria-expanded={open} data-testid="team-repo-link" onClick={() => setOpen(!open)}>
              {copy.brain.harness.team.link}
            </Button>
          }
        />
        {open ? (
          <div className="border-b border-border py-3">
            <div className="rounded-2xl bg-muted/70 p-4">
              <BrainLinkField check={check} onCheck={setCheck} disabled={props.readOnly || busy !== null} autoFocus />
              <div className="mt-3 flex items-center gap-2">
                <Button
                  variant="primary"
                  disabled={props.readOnly || busy !== null || !check?.ok}
                  onClick={() => {
                    if (check?.ok) void run("link", () => backend.brains.linkTeamRepo(check.sshUrl), copy.brain.harness.team.linked).then(() => { setOpen(false); setCheck(null); });
                  }}
                >
                  {busy === "link" ? copy.common.loading : copy.brain.harness.team.link}
                </Button>
                <Button variant="quiet" disabled={busy !== null} onClick={() => setOpen(false)}>
                  {copy.common.cancel}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }
  const chip = brainChip(repo.status);
  const pending = repo.status.pendingTrust;
  return (
    <>
      <Row
        label={copy.brain.harness.team.title}
        hint={repo.remote ?? undefined}
        value={
          <span className="flex items-center gap-1.5">
            <Chip>{copy.brain.harness.team.version(repo.version)}</Chip>
            <StatusChip status={chip.status} label={chip.label} />
          </span>
        }
        action={
          <span className="flex items-center gap-1">
            <Button variant="secondary" size="sm" disabled={props.readOnly || busy !== null} data-testid="team-repo-update" onClick={() => void run("update", () => backend.brains.updateTeamRepo(), copy.brain.harness.team.updated)}>
              <ArrowDownToLine />
              {copy.brain.harness.team.update}
            </Button>
            <Button variant="quiet" size="sm" disabled={props.readOnly || busy !== null} onClick={() => setUnlinking(true)}>
              {copy.brain.harness.team.unlink}
            </Button>
          </span>
        }
      />
      {pending.length ? (
        <div className="py-3">
          <Callout
            testId="team-repo-trust"
            label={copy.brain.attention.label}
            decision
            icon={<ShieldQuestion />}
            title={copy.brain.harness.team.trustTitle}
            state={copy.brain.harness.team.trustState}
            actions={
              <Button variant="primary" disabled={props.readOnly || busy !== null} onClick={() => void run("trust", () => backend.brains.trustTeamRepo(pending.map((item) => item.path)), copy.brain.trusted)}>
                {copy.attention.brain.allow}
              </Button>
            }
          >
            <ul className="flex flex-col gap-1">
              {pending.map((item) => (
                <li key={item.path} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-foreground">
                  <span>{trustLabel(item)}</span>
                  <Chip mono size="sm">
                    {fileName(item.path)}
                  </Chip>
                </li>
              ))}
            </ul>
          </Callout>
        </div>
      ) : null}
      <ConfirmDialog
        open={unlinking}
        onOpenChange={setUnlinking}
        title={copy.brain.harness.team.unlinkTitle}
        body={copy.brain.harness.team.unlinkBody}
        confirmLabel={copy.brain.harness.team.unlink}
        onConfirm={() => {
          setUnlinking(false);
          void run("unlink", () => backend.brains.unlinkTeamRepo(), copy.brain.harness.team.unlinked);
        }}
      />
    </>
  );
}
