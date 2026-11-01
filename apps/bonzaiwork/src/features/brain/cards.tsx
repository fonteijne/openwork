import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { GitMerge, ShieldQuestion, UserRoundPen } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys, useBrain, useProposals } from "~/backend/queries";
import type { PreferenceProposal, TrustItem } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/field";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { errorText } from "~/lib/errors";
import { fileName } from "~/lib/tools";

import { useBrainAction } from "./actions";
import { useStartChat } from "./start-chat";

/** Same shape as the consent card: the decision sits where the user acts (DESIGN.md T4). */
function Card(props: { icon: ReactNode; title: string; body: ReactNode; actions: ReactNode; label: string; testId: string }) {
  return (
    <section aria-label={props.label} data-testid={props.testId} className="bw-enter rounded-window bg-background p-5 ring-1 ring-amber-9/60">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-3 text-amber-11 [&_svg]:size-4">{props.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{props.title}</p>
          <div className="mt-0.5 text-sm text-muted-foreground">{props.body}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 sm:ps-10">{props.actions}</div>
    </section>
  );
}

/**
 * "Laat de AI het samenvoegen" (plan §4.5): both versions go into the notes and
 * a new chat merges them with a fixed instruction; that turn's end shares it.
 */
function useMergeWithAi(projectId: string) {
  const backend = useBackend();
  const startChat = useStartChat(projectId);
  return async () => {
    const { prompt } = await backend.brains.mergeWithAi(projectId);
    if (prompt) await startChat({ title: copy.brain.mergeChatTitle, prompt });
  };
}

/** Plan §4.5: nothing is lost; the AI merges, or the user's version goes to a branch of its own. */
export function ConflictCard(props: { projectId: string }) {
  const brain = useBrain(props.projectId);
  const { busy, run, brains } = useBrainAction(props.projectId);
  // One busy flag for both buttons (review): the merge runs through the card's own action.
  const merge = useMergeWithAi(props.projectId);
  if (brain?.status.state !== "conflict") return null;
  const merging = brain.status.merging;
  const files = brain.status.conflictFiles.map((file) => fileName(file));
  return (
    <Card
      testId="brain-conflict"
      label={merging ? copy.brain.mergingTitle : copy.brain.conflictTitle(brain.status.conflictBy)}
      icon={<GitMerge />}
      title={merging ? copy.brain.mergingTitle : copy.brain.conflictTitle(brain.status.conflictBy)}
      body={
        <>
          {files.length ? (
            <span className="mb-0.5 block">
              {files.slice(0, 3).map((file, index) => (
                <span key={file}>
                  {index > 0 ? ", " : null}
                  <code className="rounded bg-muted px-1 py-px font-mono text-[0.85em]">{file}</code>
                </span>
              ))}
            </span>
          ) : null}
          {merging ? brain.status.error : copy.brain.conflictBody}
        </>
      }
      actions={
        <>
          <Button variant="primary" disabled={busy !== null} onClick={() => void run("merge", merge)}>
            {merging ? copy.brain.mergeAgain : copy.brain.mergeWithAi}
          </Button>
          <Button variant="secondary" disabled={busy !== null} onClick={() => void run("apart", () => brains.keepMineApart(props.projectId), copy.brain.keptApart)}>
            {copy.brain.keepMineApart}
          </Button>
        </>
      }
    />
  );
}

function trustLabel(item: TrustItem): string {
  return copy.brain.trustKinds[item.kind](item.mcpServers);
}

/** Plan §7.1: what a shared brain brings that can run code, until the user decides. */
export function TrustCard(props: { projectId: string }) {
  const brain = useBrain(props.projectId);
  const { busy, run, brains } = useBrainAction(props.projectId);
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (brain?.status.state !== "needs_trust" || !brain.status.pendingTrust.length) return null;
  const items = brain.status.pendingTrust;
  const signature = items.map((item) => item.path).join("|");
  if (dismissed === signature) return null;
  return (
    <Card
      testId="brain-trust"
      label={copy.brain.trustTitle}
      icon={<ShieldQuestion />}
      title={copy.brain.trustTitle}
      body={
        <>
          <ul className="mb-1 flex flex-col gap-0.5">
            {items.map((item) => (
              <li key={item.path} className="flex min-w-0 items-baseline gap-2">
                <span className="text-foreground">{trustLabel(item)}</span>
                <code className="truncate rounded bg-muted px-1 py-px font-mono text-[0.85em]">{item.path}</code>
              </li>
            ))}
          </ul>
          {copy.brain.trustBody}
        </>
      }
      actions={
        <>
          <Button variant="primary" disabled={busy !== null} onClick={() => void run("trust", () => brains.trust(props.projectId, items.map((item) => item.path)), copy.brain.trusted)}>
            {copy.brain.trustAllow}
          </Button>
          <Button variant="secondary" disabled={busy !== null} onClick={() => setDismissed(signature)}>
            {copy.brain.trustLater}
          </Button>
        </>
      }
    />
  );
}

/** Plan §7.3: a preference only enters every chat after the user says so, optionally reworded. */
function Proposal(props: { proposal: PreferenceProposal }) {
  const backend = useBackend();
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(props.proposal.preference);
  const [busy, setBusy] = useState(false);
  const decide = async (decision: "accept" | "reject") => {
    setBusy(true);
    try {
      await backend.brains.decide(props.proposal.id, decision, decision === "accept" && editing ? text.trim() : null);
      if (decision === "accept") toast(copy.brain.proposalAdded);
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
    } finally {
      setBusy(false);
      await client.invalidateQueries({ queryKey: keys.proposals });
    }
  };
  return (
    <Card
      testId="brain-proposal"
      label={copy.brain.proposalTitle}
      icon={<UserRoundPen />}
      title={copy.brain.proposalTitle}
      body={editing ? (
        <Textarea aria-label={copy.brain.proposalTitle} value={text} onChange={(event) => setText(event.target.value)} rows={2} className="mt-1" autoFocus />
      ) : (
        <>
          <span className="block text-foreground">{props.proposal.preference}</span>
          {props.proposal.reason ? <span className="block">{props.proposal.reason}</span> : null}
        </>
      )}
      actions={
        <>
          <Button variant="primary" disabled={busy || (editing && !text.trim())} onClick={() => void decide("accept")}>
            {copy.brain.proposalAdd}
          </Button>
          {editing ? null : (
            <Button variant="secondary" disabled={busy} onClick={() => setEditing(true)}>
              {copy.brain.proposalEdit}
            </Button>
          )}
          <Button variant="quiet" disabled={busy} onClick={() => void decide("reject")}>
            {copy.brain.proposalReject}
          </Button>
        </>
      }
    />
  );
}

export function ProposalCard() {
  const proposals = useProposals();
  const first = proposals.data?.[0];
  return first ? <Proposal key={first.id} proposal={first} /> : null;
}

/** The cards above the composer, at most one at a time, most urgent first. */
export function BrainCards(props: { projectId: string }) {
  const brain = useBrain(props.projectId);
  const proposals = useProposals();
  if (brain?.status.state === "conflict") return <ConflictCard projectId={props.projectId} />;
  if (proposals.data?.length) return <ProposalCard />;
  if (brain?.status.state === "needs_trust") return <TrustCard projectId={props.projectId} />;
  return null;
}
