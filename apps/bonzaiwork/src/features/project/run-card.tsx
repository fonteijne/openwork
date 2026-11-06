import { useMemo, useState } from "react";
import { Check, Eye, Lock, LoaderCircle, X } from "lucide-react";

import type { Run, RunAction, RunStage, StageReview } from "~/backend/cockpit";
import { useCockpit, useCockpitMutation, useWerkwijzen } from "~/backend/cockpit-queries";
import { CheckLine, LinkArrow, LockedNote, StatusBadge } from "~/components/io";
import { Button } from "~/components/ui/button";
import { Input, Textarea } from "~/components/ui/field";
import { Select } from "~/components/ui/select";
import { toast } from "~/components/ui/toast";
import { projectsCopy } from "~/copy/projects";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { href } from "~/lib/router";

import { RunMarkdown } from "./run-markdown";
import { runStatusKind } from "./shared";

const R = projectsCopy.run;

type Act = { action: RunAction; note?: string | null };

function StageNumber(props: { index: number; state: RunStage["state"]; current: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
        props.current ? "bg-surface-inverse text-ink-inverse" : props.state === "pending" ? "border border-dashed border-line-strong text-ink-muted" : props.state === "failed" ? "border border-danger text-danger" : "bg-surface-raised text-ink",
      )}
    >
      {props.index + 1}
    </span>
  );
}

/** The current review: the artifact in a white box, its checks and the three decisions. */
function ReviewStage(props: { run: Run; stage: RunStage; review: StageReview; act: (input: Act, done: string) => void; busy: boolean }) {
  const { run, review } = props;
  const [mode, setMode] = useState<"view" | "edit" | "rerun">("view");
  const [draft, setDraft] = useState(review.edits ?? review.body);
  const [note, setNote] = useState("");
  const last = review.stageIndex >= run.stages.length - 1;
  return (
    <section aria-label={`${R.yourReview}: ${props.stage.title}`} className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-4">
        <StageNumber index={review.stageIndex} state={props.stage.state} current />
        <span className="min-w-0 flex-[1_1_200px] text-lg font-semibold text-ink">{props.stage.title}</span>
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Eye className="size-4" aria-hidden="true" />
          {R.yourReview}
        </span>
      </div>
      <div className="flex flex-col gap-4 rounded-card bg-surface-raised p-6 lg:p-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="me-auto whitespace-nowrap font-mono text-sm font-medium text-ink">{review.file}</span>
          {review.delta ? <span className="text-ink-muted">{review.delta}</span> : null}
          <LinkArrow href={href({ name: "run", runId: run.id })} className="text-sm">
            {R.openArtifact}
          </LinkArrow>
        </div>
        {mode === "edit" ? (
          <label className="flex flex-col gap-2">
            <span className="text-base font-semibold text-ink">{R.editLabel}</span>
            <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={12} className="font-mono text-sm" />
          </label>
        ) : (
          <>
            {review.edits ? <p className="m-0 text-sm font-semibold text-ink-muted">{R.editsNote}</p> : null}
            <RunMarkdown source={review.edits ?? review.body} />
          </>
        )}
      </div>
      {review.checks.length ? (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {review.checks.map((check) => (
            <CheckLine key={check.text} result={check.result}>
              {check.text}
            </CheckLine>
          ))}
        </ul>
      ) : null}
      {mode === "rerun" ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!note.trim()) return;
            props.act({ action: "rerun", note: note.trim() }, R.rerunStarted);
          }}
        >
          <label className="flex flex-col gap-2">
            <span className="text-base font-semibold text-ink">{R.rerunLabel}</span>
            <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder={R.rerunPlaceholder} autoFocus className="h-12 rounded-full px-5" />
          </label>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="primary" size="xl" disabled={props.busy || !note.trim()}>
              {R.rerunSend}
            </Button>
            <Button variant="secondary" size="xl" onClick={() => setMode("view")}>
              {R.cancel}
            </Button>
          </div>
        </form>
      ) : mode === "edit" ? (
        <div className="flex flex-wrap gap-3">
          <Button
            variant="primary"
            size="xl"
            disabled={props.busy}
            onClick={() => {
              props.act({ action: "edit", note: draft }, R.edited);
              setMode("view");
            }}
          >
            {R.editSave}
          </Button>
          <Button variant="secondary" size="xl" onClick={() => setMode("view")}>
            {R.cancel}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="xl" disabled={props.busy} onClick={() => props.act({ action: "accept" }, R.continued)}>
            {last ? R.finish : R.continue(review.stageIndex + 2)}
          </Button>
          <Button variant="secondary" size="xl" onClick={() => setMode("edit")}>
            {R.edit}
          </Button>
          <Button variant="secondary" size="xl" onClick={() => setMode("rerun")}>
            {R.rerun}
          </Button>
          <span className="min-w-[12rem] flex-[1_1_200px] text-sm text-ink-muted">{last ? R.lastNote : R.nextNote}</span>
        </div>
      )}
    </section>
  );
}

/**
 * A run inside the chat that started it (design v2-ProjectChats): title and id, the status, the
 * werkwijze and its version, what the run may do, and the stages; the stage that waits on you is
 * open with its artifact, checks and decisions. Buttons go through `cockpit.runs.act`.
 */
export function RunCard(props: { run: Run; projectName: string }) {
  const { run } = props;
  const cockpit = useCockpit();
  const werkwijzen = useWerkwijzen(run.projectId);
  const mutation = useCockpitMutation((backend, input: Act) => backend.runs.act(run.id, input.action, input.note ?? null));
  const act = (input: Act, done: string) =>
    mutation.mutate(input, {
      onSuccess: () => toast(done),
      onError: (failure) => toast(errorText(failure), { tone: "error" }),
    });

  const versions = useMemo(() => {
    const list = (werkwijzen.data ?? []).filter((entry) => entry.name === run.werkwijzeName);
    return list.map((entry) => ({ value: entry.id, label: R.werkwijzeOption(entry.name, entry.version, entry.origin, entry.origin === "project" ? props.projectName : null) }));
  }, [werkwijzen.data, run.werkwijzeName, props.projectName]);
  const items = versions.length ? versions : [{ value: run.werkwijzeId ?? "current", label: run.werkwijzeName }];
  const badge = run.status === "review" && run.review ? R.reviewBadge(run.review.stageIndex + 1) : projectsCopy.runStatus[run.status];
  const locked = cockpit.capabilities.runs;

  return (
    <article aria-label={R.label(run.id, run.title)} className="flex flex-col gap-5 rounded-card bg-surface-alt p-6 lg:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="m-0 flex-[1_1_auto] text-[22px] font-semibold leading-[30px] text-ink">
          {run.title} <span className="font-mono text-sm font-medium text-ink-muted">{run.id}</span>
        </h3>
        <StatusBadge kind={runStatusKind(run.status)}>{badge}</StatusBadge>
        <LinkArrow href={href({ name: "run", runId: run.id })}>{R.open}</LinkArrow>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-base">
        <span className="text-ink-muted">{R.werkwijze}</span>
        <Select
          value={run.werkwijzeId ?? items[0]?.value ?? null}
          onValueChange={(value) => {
            if (value === run.werkwijzeId) return;
            const label = items.find((item) => item.value === value)?.label ?? value;
            act({ action: "rerun", note: R.werkwijzeSwitched(label) }, R.werkwijzeSwitched(label));
          }}
          items={items}
          label={R.werkwijze}
          disabled={items.length < 2 || mutation.isPending || locked !== null}
          className="h-10! w-auto! max-w-full bg-surface-raised! text-base! ring-line-strong!"
        />
        {versions.length > 1 ? <span className="text-ink-muted">{R.werkwijzeNote}</span> : null}
      </div>
      {run.grants.length ? (
        <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1.5 p-0 text-base text-ink">
          {run.grants.map((grant) => (
            <li key={grant.text} className="inline-flex items-center gap-1.5">
              {grant.kind === "allow" ? (
                <Check className="size-4 text-success" role="img" aria-label={R.grants.allow} />
              ) : grant.kind === "deny" ? (
                <X className="size-4 text-danger" role="img" aria-label={R.grants.deny} />
              ) : (
                <Lock className="size-4 text-ink" role="img" aria-label={R.grants.ask} />
              )}
              {grant.text}
            </li>
          ))}
        </ul>
      ) : null}
      {locked ? <LockedNote title={R.open}>{locked}</LockedNote> : null}
      <ol aria-label={R.stagesLabel} className="m-0 flex list-none flex-col border-t border-line-strong p-0">
        {run.stages.map((stage, index) => {
          const reviewing = run.review && run.review.stageIndex === index && stage.state === "review";
          if (reviewing && run.review)
            return (
              <li key={stage.title} className="border-b border-line-strong py-5 last:border-b-0">
                <ReviewStage run={run} stage={stage} review={run.review} act={act} busy={mutation.isPending || locked !== null} />
              </li>
            );
          const pending = stage.state === "pending";
          return (
            <li key={stage.title} className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line-strong py-4 last:border-b-0", pending && "text-ink-muted")}>
              <StageNumber index={index} state={stage.state} current={false} />
              <span className={cn("min-w-0 flex-[1_1_200px] text-lg font-semibold", pending ? "text-ink-muted" : "text-ink")}>{stage.title}</span>
              {stage.state === "done" ? (
                <span className="inline-flex items-center gap-1.5 text-sm text-ink">
                  <Check className="size-4 text-success" aria-hidden="true" />
                  {stage.note}
                </span>
              ) : stage.state === "working" ? (
                <span className="inline-flex items-center gap-1.5 text-sm text-ink">
                  <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  {stage.note ?? R.working}
                </span>
              ) : stage.state === "failed" ? (
                <span className="text-sm font-semibold text-danger">{stage.note ?? R.failed}</span>
              ) : (
                <span className="max-w-[48ch] text-sm">{stage.note ?? R.pendingNote}</span>
              )}
              {stage.artifact && stage.state === "done" ? (
                <a href={href({ name: "run", runId: run.id })} className="font-mono text-sm font-medium text-accent underline underline-offset-2">
                  {stage.artifact}
                </a>
              ) : null}
            </li>
          );
        })}
      </ol>
    </article>
  );
}
