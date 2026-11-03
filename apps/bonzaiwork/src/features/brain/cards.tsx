import { useQueryClient } from "@tanstack/react-query";
import { useState, type KeyboardEvent } from "react";
import { CircleAlert, GitMerge, ShieldQuestion, UserRoundPen } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys, useBrain, useProposals, useRefreshAttention } from "~/backend/queries";
import type { PreferenceProposal, TrustItem } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Chip } from "~/components/ui/chip";
import { Textarea } from "~/components/ui/field";
import { Kbd } from "~/components/ui/misc";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { errorText } from "~/lib/errors";
import { href } from "~/lib/router";
import { fileName } from "~/lib/tools";

import { useBrainAction } from "./actions";
import { attentionKind, dismissTrust, useTrustDismissed } from "./model";
import { useStartChat } from "./start-chat";
import { WorkflowCheckCard } from "./workflows";

/**
 * Chords belong to the focused card, never to `window` (brief §4): ⏎ runs the primary, esc the
 * quiet choice, and only when the key lands on the card itself, not on a control inside it.
 */
function cardKeys(chords: { enter?: () => void; escape?: () => void }) {
  return (event: KeyboardEvent<HTMLElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.target !== event.currentTarget) return;
    if (event.key === "Enter" && chords.enter) {
      event.preventDefault();
      chords.enter();
    } else if (event.key === "Escape" && chords.escape) {
      event.preventDefault();
      chords.escape();
    }
  };
}

/**
 * "Laat de AI het samenvoegen" (plan §4.5): both versions go into the notes and a new chat merges
 * them with a fixed instruction; that turn's end shares it.
 */
function useMergeWithAi(projectId: string) {
  const backend = useBackend();
  const startChat = useStartChat(projectId);
  return async () => {
    const { prompt } = await backend.brains.mergeWithAi(projectId);
    if (prompt) await startChat({ title: copy.brain.mergeChatTitle, prompt });
  };
}

function trustLabel(item: TrustItem): string {
  return copy.brain.trustKinds[item.kind](item.mcpServers);
}

/**
 * The one "Actie nodig" object (brief §8): the same Callout on Vandaag, on the Brein tab and above
 * the chat composer, with its own words for a conflict ("Jij en Sanne wijzigden hetzelfde"), for
 * parts that can run code, and for an error ("Bijwerken is gestopt"). Nothing while the brain is
 * fine; nothing for a trust question the user put aside ("Nu niet" is remembered, assessment P-7).
 * The card is the focal element while the decision is open (T4) and names action · data · risk (P9).
 */
export function BrainAttentionCard(props: { projectId: string; /** Off on the Brein tab itself. */ link?: boolean; className?: string }) {
  const brain = useBrain(props.projectId);
  const { busy, run, brains } = useBrainAction(props.projectId);
  const merge = useMergeWithAi(props.projectId);
  const dismissed = useTrustDismissed(props.projectId, brain?.status ?? null);
  if (!brain) return null;
  const { status } = brain;
  const kind = attentionKind(status);
  if (!kind) return null;
  if (kind === "needs_trust" && dismissed) return null;
  const link = props.link === false ? undefined : <a href={href({ name: "project-brain", projectId: props.projectId })}>{copy.brain.attention.openBrain}</a>;
  const disabled = busy !== null;

  if (kind === "conflict") {
    const files = status.conflictFiles;
    const primary = () => void run("merge", merge, copy.brain.attention.merging);
    return (
      <Callout
        className={props.className}
        testId="brain-conflict"
        label={copy.brain.attention.label}
        decision
        tabIndex={0}
        onKeyDown={cardKeys({ enter: primary })}
        icon={<GitMerge />}
        title={status.merging ? copy.brain.mergingTitle : copy.attention.brain.conflict(status.conflictBy)}
        chip={files[0] ? `${fileName(files[0])}${files.length > 1 ? ` +${files.length - 1}` : ""}` : undefined}
        state={status.merging ? copy.brain.attention.mergingState : copy.brain.attention.conflictState(files.length)}
        actions={
          <>
            <Button variant="primary" disabled={disabled} onClick={primary}>
              {status.merging ? copy.brain.mergeAgain : copy.brain.mergeWithAi}
              <Kbd>⏎</Kbd>
            </Button>
            <Button variant="secondary" disabled={disabled} onClick={() => void run("apart", () => brains.keepMineApart(props.projectId), copy.brain.keptApart)}>
              {copy.brain.keepMineApart}
            </Button>
          </>
        }
        link={link}
      />
    );
  }

  if (kind === "needs_trust") {
    const items = status.pendingTrust;
    const allow = () => void run("trust", () => brains.trust(props.projectId, items.map((item) => item.path)), copy.brain.trusted);
    const later = () => {
      dismissTrust(props.projectId, status);
      toast(copy.brain.tab.trustLaterRemembered);
    };
    return (
      <Callout
        className={props.className}
        testId="brain-trust"
        label={copy.brain.attention.label}
        decision
        tabIndex={0}
        onKeyDown={cardKeys({ enter: allow, escape: later })}
        icon={<ShieldQuestion />}
        title={copy.attention.brain.needsTrust}
        state={copy.brain.attention.trustState}
        actions={
          <>
            <Button variant="primary" disabled={disabled} onClick={allow}>
              {copy.attention.brain.allow}
              <Kbd>⏎</Kbd>
            </Button>
            <Button variant="quiet" disabled={disabled} onClick={later}>
              {copy.attention.brain.later}
              <Kbd>esc</Kbd>
            </Button>
          </>
        }
        link={link}
      >
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.path} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-foreground">
              <span>{trustLabel(item)}</span>
              <Chip mono size="sm">
                {fileName(item.path)}
              </Chip>
            </li>
          ))}
        </ul>
      </Callout>
    );
  }

  const repair = () => void run("repair", () => brains.repair(props.projectId), copy.brain.attention.repairing);
  return (
    <Callout
      className={props.className}
      testId="brain-error"
      label={copy.brain.attention.label}
      tone="failure"
      tabIndex={0}
      onKeyDown={cardKeys({ enter: repair })}
      icon={<CircleAlert />}
      title={copy.attention.brain.error}
      state={status.error ?? copy.brain.attention.errorState}
      actions={
        <Button variant="primary" disabled={disabled} onClick={repair}>
          {copy.attention.brain.repair}
          <Kbd>⏎</Kbd>
        </Button>
      }
      link={link}
    />
  );
}

/** Plan §7.3: a preference only enters every chat after the user says so, optionally reworded. */
export function ProposalCard(props: { proposal: PreferenceProposal; className?: string }) {
  const backend = useBackend();
  const client = useQueryClient();
  const refreshAttention = useRefreshAttention();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(props.proposal.preference);
  const [busy, setBusy] = useState(false);
  const decide = async (decision: "accept" | "reject") => {
    if (busy) return;
    setBusy(true);
    try {
      await backend.brains.decide(props.proposal.id, decision, decision === "accept" && editing ? text.trim() : null);
      toast(decision === "accept" ? copy.brain.proposalAdded : copy.brain.proposal.rejected);
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
    } finally {
      setBusy(false);
      await client.invalidateQueries({ queryKey: keys.proposals });
      await refreshAttention();
    }
  };
  const canAdd = !busy && (!editing || text.trim().length > 0);
  return (
    <Callout
      className={props.className}
      testId="brain-proposal"
      label={copy.brain.proposal.label}
      decision
      tabIndex={0}
      onKeyDown={cardKeys({ enter: () => { if (canAdd) void decide("accept"); }, escape: () => void decide("reject") })}
      icon={<UserRoundPen />}
      title={copy.brain.proposalTitle}
      state={props.proposal.reason ?? copy.brain.proposal.state}
      actions={
        <>
          <Button variant="primary" disabled={!canAdd} onClick={() => void decide("accept")}>
            {copy.brain.proposalAdd}
            <Kbd>⏎</Kbd>
          </Button>
          {editing ? null : (
            <Button variant="secondary" disabled={busy} onClick={() => setEditing(true)}>
              {copy.brain.proposalEdit}
            </Button>
          )}
          <Button variant="quiet" disabled={busy} onClick={() => void decide("reject")}>
            {copy.brain.proposalReject}
            <Kbd>esc</Kbd>
          </Button>
        </>
      }
      link={<a href={href({ name: "brain" })}>{copy.brain.proposal.yourBrain}</a>}
    >
      {editing ? (
        <Textarea aria-label={copy.brain.proposalTitle} value={text} onChange={(event) => setText(event.target.value)} rows={2} autoFocus />
      ) : (
        <p className="text-sm text-foreground">{props.proposal.preference}</p>
      )}
    </Callout>
  );
}

/** The newest open proposal, if any; the rest follow once it is decided. */
export function ProposalCards(props: { className?: string; /** Every proposal (Jouw brein) instead of the first. */ all?: boolean }) {
  const proposals = useProposals();
  const list = props.all ? (proposals.data ?? []) : (proposals.data ?? []).slice(0, 1);
  if (!list.length) return null;
  return (
    <>
      {list.map((proposal) => (
        <ProposalCard key={proposal.id} proposal={proposal} className={props.className} />
      ))}
    </>
  );
}

/**
 * Above the chat composer (brief §7, §8), most urgent first and one at a time: the brain's own
 * decision, then a workflow check for the chat that finished the stage (pass the chat's title;
 * see `stageChatTitle`), then a preference proposal.
 */
export function BrainCards(props: { projectId: string; chatTitle?: string | null }) {
  const brain = useBrain(props.projectId);
  const dismissed = useTrustDismissed(props.projectId, brain?.status ?? null);
  const kind = brain ? attentionKind(brain.status) : null;
  if (kind !== null && !(kind === "needs_trust" && dismissed)) return <BrainAttentionCard projectId={props.projectId} />;
  return (
    <>
      {/* The check belongs to the chat that ran the stage: without a title to match, no card (S5). */}
      {props.chatTitle !== undefined ? <WorkflowCheckCard projectId={props.projectId} chatTitle={props.chatTitle} /> : null}
      <ProposalCards />
    </>
  );
}
