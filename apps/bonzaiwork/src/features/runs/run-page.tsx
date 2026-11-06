import { useState, type ReactNode } from "react";
import { Bot, Check, CircleAlert, CircleDashed, CircleX, Eye, MessageSquare } from "lucide-react";

import type { OutboundEntry, Run, RunAction, RunStage } from "~/backend/cockpit";
import { useCockpit, useCockpitMutation, useRun, useWerkwijzen } from "~/backend/cockpit-queries";
import { useProjects } from "~/backend/queries";
import { Accent, Band, CheckLine, Column, Columns, Container, Eyebrow, InversePanel, LinkArrow, LockedNote, PageHero, PermissionLine, PermissionList, StatusBadge, dot } from "~/components/io";
import { Button } from "~/components/ui/button";
import { Input, Textarea } from "~/components/ui/field";
import { EmptyState, Skeleton } from "~/components/ui/misc";
import { ConfirmDialog } from "~/components/ui/overlay";
import { toast } from "~/components/ui/toast";
import { useDocumentTitle } from "~/components/top-bar";
import { runsCopy } from "~/copy/runs";
import { cn } from "~/lib/cn";
import { formatMoney } from "~/lib/format";
import { href, navigate } from "~/lib/router";

import { DiffView, InkSegmented, ReviewBody, RunStatusBadge, formatClock, formatDay, formatDayTime, lineDiff, plainReview } from "./parts";

const copy = runsCopy.run;
const rc = runsCopy.recovery;

/** Run detail, stage review and recovery (design: v2-RunDetail, v2-Recovery). */
export function RunPage(props: { runId: string }) {
  const cockpit = useCockpit();
  const run = useRun(props.runId);
  const projects = useProjects();
  if (cockpit.capabilities.runs) return <RunLocked reason={cockpit.capabilities.runs} />;
  if (run.isLoading) return <RunSkeleton />;
  if (run.isError) return <RunMissing title={copy.error} onRetry={() => void run.refetch()} />;
  if (!run.data) return <RunMissing title={copy.notFound} body={copy.notFoundBody} />;
  const data = run.data;
  const projectName = data.projectId ? ((projects.data ?? []).find((project) => project.id === data.projectId)?.name ?? null) : null;
  if (data.status === "interrupted" && data.interruption) return <RecoveryView run={data} projectName={projectName} />;
  return <DetailView run={data} projectName={projectName} />;
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function useRunAction(runId: string) {
  return useCockpitMutation((cockpit, input: { action: RunAction; note?: string | null }) => cockpit.runs.act(runId, input.action, input.note ?? null));
}

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : copy.failedAction;
}

/** The title with its last phrase in the serif accent (the design's one italic phrase). */
function accentTitle(title: string): ReactNode {
  const words = title.trim().split(/\s+/);
  if (words.length < 3) return title;
  const tail = words.length >= 5 ? 2 : 1;
  return (
    <>
      {words.slice(0, -tail).join(" ")} <Accent>{words.slice(-tail).join(" ")}</Accent>
    </>
  );
}

function Crumbs(props: { run: Run; projectName: string | null }) {
  return (
    <span>
      <a href={href({ name: "runs" })} className="text-inherit no-underline hover:underline">
        {copy.crumbRuns}
      </a>
      {props.run.projectId && props.projectName ? (
        <>
          {" · "}
          <a href={href({ name: "project-overview", projectId: props.run.projectId })} className="text-inherit no-underline hover:underline">
            {props.projectName}
          </a>
        </>
      ) : null}
      {" · "}
      <span className="font-mono tracking-normal">{props.run.id}</span>
    </span>
  );
}

/** " v3" when the run's werkwijze is known here. */
function useWerkwijzeVersion(run: Run): string {
  const werkwijzen = useWerkwijzen(run.projectId);
  const found = (werkwijzen.data ?? []).find((entry) => entry.id === run.werkwijzeId);
  return found ? ` v${found.version}` : "";
}

function agentLine(run: Run, projectName: string | null, version: string): string {
  const project = projectName ?? copy.noProject;
  return run.werkwijzeId ? copy.agentLine(run.werkwijzeName, version, project) : copy.agentLineNoWerkwijze(project);
}

function WhiteCard(props: { title: string; children: ReactNode; className?: string; id?: string }) {
  return (
    <section aria-labelledby={props.id} className={cn("flex flex-col gap-4 rounded-card bg-surface-raised p-8", props.className)}>
      <h2 id={props.id} className="m-0 text-xl font-semibold text-ink">
        {props.title}
      </h2>
      {props.children}
    </section>
  );
}

function GrantsCard(props: { run: Run }) {
  return (
    <WhiteCard title={copy.grantsTitle} id="run-grants">
      {props.run.grants.length > 0 ? (
        <>
          <p className="m-0 text-sm text-ink-muted">{props.run.werkwijzeId ? copy.grantsBy(props.run.werkwijzeName) : copy.grantsSafe}</p>
          <PermissionList>
            {props.run.grants.map((grant) => (
              <PermissionLine key={grant.text} kind={grant.kind}>
                {grant.text}
              </PermissionLine>
            ))}
          </PermissionList>
        </>
      ) : (
        <p className="m-0 text-base text-ink-muted">{copy.grantsEmpty}</p>
      )}
    </WhiteCard>
  );
}

function RunSkeleton() {
  useDocumentTitle(copy.crumbRuns);
  return (
    <div aria-hidden="true">
      <Container className="flex flex-col gap-5 pb-12 pt-10 lg:pt-16">
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-14 w-full max-w-[760px]" />
        <Skeleton className="h-6 w-96" />
      </Container>
      <div className="bg-surface-alt py-16">
        <Container className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </Container>
      </div>
    </div>
  );
}

function RunLocked(props: { reason: string }) {
  useDocumentTitle(copy.crumbRuns);
  return (
    <Band>
      <LockedNote title={copy.crumbRuns}>{props.reason}</LockedNote>
    </Band>
  );
}

function RunMissing(props: { title: string; body?: string; onRetry?: () => void }) {
  useDocumentTitle(props.title);
  return (
    <Band>
      <EmptyState
        title={props.title}
        body={props.body}
        action={
          props.onRetry ? (
            <Button variant="secondary" size="lg" onClick={props.onRetry}>
              {runsCopy.overview.retry}
            </Button>
          ) : (
            <LinkArrow href={href({ name: "runs" })}>{copy.backToRuns}</LinkArrow>
          )
        }
      />
    </Band>
  );
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

function DetailView(props: { run: Run; projectName: string | null }) {
  const { run } = props;
  const act = useRunAction(run.id);
  const live = run.status === "working" || run.status === "review" || run.status === "question";
  const version = useWerkwijzeVersion(run);

  const stop = () =>
    act.mutate(
      { action: "stop" },
      { onSuccess: () => toast(copy.stopped), onError: (error) => toast(errorText(error), { tone: "error" }) },
    );

  return (
    <>
      <PageHero
        documentTitle={`${run.id} · ${run.title}`}
        eyebrow={<Crumbs run={run} projectName={props.projectName} />}
        title={accentTitle(run.title)}
        meta={
          <>
            <RunStatusBadge status={run.status} className="text-[13px] leading-4" />
            <span>{agentLine(run, props.projectName, version)}</span>
            {run.due ? <span>{copy.due(formatDay(run.due))}</span> : null}
          </>
        }
        actions={
          live ? (
            <Button variant="secondary" size="xl" onClick={stop} disabled={act.isPending}>
              {copy.stop}
            </Button>
          ) : null
        }
      />
      <StagesBand run={run} />
      {run.review ? <ReviewBand run={run} /> : null}
      {run.question ? <QuestionBand run={run} /> : null}
      <Band tone="alt">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <GrantsCard run={run} />
          <BudgetCard run={run} />
          <WhiteCard title={copy.afterTitle} id="run-after">
            {run.after.length > 0 ? (
              <>
                <p className="m-0 text-base text-ink">{copy.afterLead}</p>
                <ul className="m-0 flex list-disc flex-col gap-2 ps-5 text-base text-ink-muted">
                  {run.after.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="m-0 text-base text-ink-muted">{copy.afterEmpty}</p>
            )}
          </WhiteCard>
        </div>
      </Band>
      <SteerBand run={run} />
    </>
  );
}

function StageNote(props: { stage: RunStage }) {
  const { stage } = props;
  if (!stage.note) return null;
  const icon =
    stage.state === "done" ? <Check className="text-success" /> : stage.state === "review" ? <Eye /> : stage.state === "working" ? <CircleDashed /> : stage.state === "failed" ? <CircleX className="text-danger" /> : null;
  return (
    <span className={cn("inline-flex items-start gap-1.5 text-base [&_svg]:mt-1 [&_svg]:size-4 [&_svg]:shrink-0", stage.state === "review" ? "font-semibold text-ink" : stage.state === "pending" ? "text-ink-muted" : "text-ink")}>
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {stage.note}
    </span>
  );
}

function StagesBand(props: { run: Run }) {
  const { run } = props;
  const current = run.stages.findIndex((stage) => stage.state !== "done");
  return (
    <Band tone="alt" label={copy.stagesTitle}>
      <h2 className="m-0 mb-8 text-[28px] font-bold leading-[34px] tracking-[-0.01em] text-ink">
        {copy.stagesTitle} <span className="font-normal text-ink-muted">· {copy.stagesLead}</span>
      </h2>
      {run.stages.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-ink pt-6">
          <div className="flex flex-col gap-1">
            <p className="m-0 text-lg font-semibold text-ink">{copy.noStages}</p>
            <p className="m-0 text-base text-ink-muted">{copy.noStagesBody}</p>
          </div>
          {run.chatRef ? (
            <Button variant="secondary" size="xl" onClick={() => run.chatRef && navigate({ name: "project", projectId: run.chatRef.projectId, chatId: run.chatRef.chatId })}>
              <MessageSquare aria-hidden="true" />
              {copy.openChat}
            </Button>
          ) : null}
        </div>
      ) : (
        <ol className="m-0 list-none p-0">
          <Columns min={200}>
            {run.stages.map((stage, index) => {
              const isCurrent = index === current && run.status !== "done" && run.status !== "stopped";
              return (
                <li key={`${index}-${stage.title}`} aria-current={isCurrent ? "step" : undefined} className="min-w-0">
                  <Column
                    rule={isCurrent ? "strong" : stage.state === "pending" ? "dashed" : stage.state === "failed" ? "danger" : "line"}
                    eyebrow={<span className={isCurrent ? "text-ink" : undefined}>{isCurrent ? `${copy.stage(index + 1)} · ${copy.now}` : copy.stage(index + 1)}</span>}
                    title={stage.title}
                  >
                    <StageNote stage={stage} />
                  </Column>
                </li>
              );
            })}
          </Columns>
        </ol>
      )}
    </Band>
  );
}

type ReviewView = "output" | "edits" | "previous";

function ReviewBand(props: { run: Run }) {
  const { run } = props;
  const review = run.review;
  const act = useRunAction(run.id);
  const [view, setView] = useState<ReviewView>("output");
  const [editing, setEditing] = useState<string | null>(null);
  const [rerun, setRerun] = useState<string | null>(null);
  if (!review) return null;
  const stage = run.stages[review.stageIndex];
  const current = review.edits ?? review.body;
  // The citations line is shown under the card; drop it from the body when the agent wrote it there too.
  const body = review.citations ? current.replace(new RegExp(`\\n+${escapeRegExp(review.citations)}\\s*$`), "") : current;

  const run_ = (input: { action: RunAction; note?: string | null }, done: string, after?: () => void) =>
    act.mutate(input, {
      onSuccess: () => {
        toast(done);
        after?.();
      },
      onError: (error) => toast(errorText(error), { tone: "error" }),
    });

  return (
    <Band label={copy.reviewEyebrow(review.stageIndex + 1, run.stages.length)}>
      <div className="flex flex-col gap-8">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-2">
            <Eyebrow>{copy.reviewEyebrow(review.stageIndex + 1, run.stages.length)}</Eyebrow>
            <h2 className="m-0 text-[28px] font-bold leading-[34px] tracking-[-0.01em] text-ink">{stage?.title ?? review.file}</h2>
            <p className="m-0 text-lg text-ink-muted">{copy.reviewLead}</p>
          </div>
          <InkSegmented
            value={view}
            onValueChange={setView}
            label={copy.views.label}
            track="grey"
            items={[
              { value: "output", label: copy.views.output },
              { value: "edits", label: copy.views.edits },
              { value: "previous", label: copy.views.previous },
            ]}
          />
        </div>

        <div className="flex flex-wrap gap-10">
          <article className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 rounded-card bg-surface-alt p-6 sm:p-12">
            <p className="m-0 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
              <Bot className="size-4" aria-hidden="true" />
              {dot("Agent", "concept", <span key="file" className="font-mono">{review.file}</span>)}
            </p>
            {review.delta ? <p className="m-0 text-sm font-semibold text-ink">{review.delta}</p> : null}
            {editing !== null ? (
              <div className="flex flex-col gap-3">
                <label htmlFor="run-edit" className="text-base font-semibold text-ink">
                  {copy.editLabel}
                </label>
                <Textarea id="run-edit" value={editing} onChange={(event) => setEditing(event.target.value)} rows={14} className="font-mono text-sm" autoFocus />
                <div className="flex flex-wrap gap-3">
                  <Button variant="primary" size="lg" disabled={act.isPending || editing.trim() === ""} onClick={() => run_({ action: "edit", note: editing }, copy.editSaved, () => setEditing(null))}>
                    {copy.editSave}
                  </Button>
                  <Button variant="ghost" size="lg" onClick={() => setEditing(null)}>
                    {copy.cancel}
                  </Button>
                </div>
              </div>
            ) : view === "output" ? (
              <ReviewBody markdown={body} />
            ) : view === "edits" ? (
              review.edits ? (
                <DiffView lines={lineDiff(plainReview(review.body), plainReview(review.edits))} label={copy.views.edits} />
              ) : (
                <p className="m-0 text-base text-ink-muted">{copy.noEdits}</p>
              )
            ) : review.previous ? (
              <>
                <p className="m-0 text-sm text-ink-muted">{copy.diffLegend}</p>
                <DiffView lines={lineDiff(plainReview(review.previous), plainReview(current))} label={copy.views.previous} />
              </>
            ) : (
              <p className="m-0 text-base text-ink-muted">{copy.noPrevious}</p>
            )}
            {review.citations ? <p className="m-0 text-sm text-ink-muted">{review.citations}</p> : null}
          </article>

          <aside aria-label={copy.checks} className="flex min-w-0 flex-[1_1_300px] flex-col gap-8">
            {review.checks.length > 0 ? (
              <div className="flex flex-col gap-3">
                <Eyebrow>{copy.checks}</Eyebrow>
                <ul className="m-0 flex list-none flex-col gap-3 p-0">
                  {review.checks.map((check) => (
                    <CheckLine key={check.text} result={check.result}>
                      {check.text}
                    </CheckLine>
                  ))}
                </ul>
              </div>
            ) : null}
            {review.builtFrom.length > 0 ? (
              <div className="flex flex-col gap-3">
                <Eyebrow>{copy.builtFrom}</Eyebrow>
                <ul className="m-0 list-none border-t border-line p-0">
                  {review.builtFrom.map((source) => (
                    <li key={source.id} className="flex flex-col border-b border-line py-3">
                      {source.href ? (
                        <a href={source.href} className="text-base font-semibold text-ink no-underline hover:underline">
                          {source.title}
                        </a>
                      ) : (
                        <span className="text-base font-semibold text-ink">{source.title}</span>
                      )}
                      <span className="text-sm text-ink-muted">{source.meta}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>

        <div className="flex flex-col gap-5 border-t border-line pt-8">
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="primary" size="xl" disabled={act.isPending} onClick={() => run_({ action: "accept" }, copy.accepted)}>
              {copy.accept}
            </Button>
            <Button
              variant="secondary"
              size="xl"
              disabled={act.isPending}
              aria-expanded={editing !== null}
              onClick={() => {
                setRerun(null);
                setView("output");
                setEditing(editing === null ? plainReview(current) : null);
              }}
            >
              {copy.edit}
            </Button>
            <Button
              variant="secondary"
              size="xl"
              disabled={act.isPending}
              aria-expanded={rerun !== null}
              onClick={() => {
                setEditing(null);
                setRerun(rerun === null ? "" : null);
              }}
            >
              {copy.rerun}
            </Button>
            <Button variant="secondary" size="xl" disabled={act.isPending} onClick={() => run_({ action: "abandon" }, copy.abandoned)}>
              {copy.abandon}
            </Button>
            <p className="m-0 min-w-[16rem] flex-[1_1_260px] text-base text-ink-muted">
              {copy.reviewNote}{" "}
              <button type="button" className="cursor-pointer bg-transparent p-0 text-base text-ink-muted underline underline-offset-2 hover:text-ink" onClick={() => run_({ action: "skip_review" }, copy.skipped)} disabled={act.isPending}>
                {copy.skip}
              </button>
            </p>
          </div>
          {rerun !== null ? (
            <form
              className="flex max-w-[720px] flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (rerun.trim() === "") return;
                run_({ action: "rerun", note: rerun.trim() }, copy.rerunDone, () => setRerun(null));
              }}
            >
              <label htmlFor="run-rerun" className="text-base font-semibold text-ink">
                {copy.rerunLabel}
              </label>
              <Input id="run-rerun" value={rerun} onChange={(event) => setRerun(event.target.value)} placeholder={copy.rerunPlaceholder} autoFocus />
              <div className="flex flex-wrap gap-3">
                <Button type="submit" variant="primary" size="lg" disabled={act.isPending || rerun.trim() === ""}>
                  {copy.rerunSend}
                </Button>
                <Button variant="ghost" size="lg" onClick={() => setRerun(null)}>
                  {copy.cancel}
                </Button>
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </Band>
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function QuestionBand(props: { run: Run }) {
  const { run } = props;
  const question = run.question;
  const [text, setText] = useState("");
  const answer = useCockpitMutation((cockpit, value: string) => cockpit.runs.answer(run.id, value));
  if (!question) return null;
  const send = (value: string) =>
    answer.mutate(value, { onSuccess: () => toast(copy.answered), onError: (error) => toast(errorText(error), { tone: "error" }) });
  return (
    <Band label={copy.questionEyebrow}>
      <InversePanel label={copy.questionEyebrow} className="flex flex-col gap-6">
        <Eyebrow tone="inverse">{dot(copy.questionEyebrow, question.deadline ? copy.questionDeadline(formatDayTime(question.deadline)) : null)}</Eyebrow>
        <h2 className="m-0 max-w-[36ch] text-[28px] font-bold leading-[34px] tracking-[-0.01em] text-ink-inverse sm:text-[40px] sm:leading-[46px]">{question.text}</h2>
        <p className="m-0 max-w-[68ch] text-lg text-ink-inverse-muted">{question.consequence}</p>
        <div className="flex flex-wrap gap-3">
          {question.options.map((option) => (
            <Button key={option} variant="inverse" size="xl" disabled={answer.isPending} onClick={() => send(option)}>
              {option}
            </Button>
          ))}
        </div>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (text.trim()) send(text.trim());
          }}
        >
          <label htmlFor="run-answer" className="text-base font-semibold text-ink-inverse">
            {copy.questionAnswerLabel}
          </label>
          <div className="flex flex-wrap items-center gap-3 rounded-full border border-line-inverse p-1.5 ps-5">
            <input
              id="run-answer"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={copy.questionPlaceholder}
              className="min-h-11 min-w-0 flex-[1_1_220px] bg-transparent text-lg text-ink-inverse outline-none placeholder:text-ink-inverse-muted"
            />
            <Button type="submit" variant="inverse" size="xl" disabled={answer.isPending || text.trim() === ""}>
              {copy.questionSend}
            </Button>
          </div>
        </form>
      </InversePanel>
    </Band>
  );
}

function BudgetCard(props: { run: Run }) {
  const budget = props.run.budget;
  if (!budget)
    return (
      <WhiteCard title={copy.budgetTitle} id="run-budget">
        <p className="m-0 text-base text-ink-muted">{copy.budgetNone}</p>
      </WhiteCard>
    );
  const percent = budget.cap > 0 ? Math.min(100, Math.round((budget.spent / budget.cap) * 100)) : 0;
  return (
    <WhiteCard title={copy.budgetTitle} id="run-budget">
      <p className="m-0 text-[40px] font-semibold leading-[46px] tracking-[-0.015em] text-ink">
        {formatMoney(budget.spent, budget.currency)} <span className="text-lg font-normal tracking-normal text-ink-muted">{copy.budgetOf(formatMoney(budget.cap, budget.currency))}</span>
      </p>
      <div role="progressbar" aria-label={copy.budgetLabel(percent)} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="h-1.5 rounded-full bg-line">
        <div className="h-1.5 rounded-full bg-ink" style={{ width: `${percent}%` }} />
      </div>
      <p className="m-0 text-base text-ink-muted">
        {copy.budgetKey} <span className="whitespace-nowrap font-mono">{budget.keyAlias}</span> · {copy.budgetLeft(budget.keyLeft)}
      </p>
    </WhiteCard>
  );
}

function SteerBand(props: { run: Run }) {
  const { run } = props;
  const [text, setText] = useState("");
  const steer = useCockpitMutation((cockpit, value: string) => cockpit.runs.steer(run.id, value));
  const open = run.status === "working" || run.status === "review" || run.status === "question" || run.status === "draft";
  return (
    <Band label={copy.steerTitle} inner="flex flex-col gap-5">
      <h2 className="m-0 text-[28px] font-bold leading-[34px] tracking-[-0.01em] text-ink">{copy.steerTitle}</h2>
      {open ? (
        <form
          className="flex flex-wrap items-center gap-3 rounded-[28px] bg-surface-alt p-2 ps-5 sm:rounded-full"
          onSubmit={(event) => {
            event.preventDefault();
            const value = text.trim();
            if (!value) return;
            steer.mutate(value, {
              onSuccess: () => {
                setText("");
                toast(copy.steerQueued);
              },
              onError: (error) => toast(errorText(error), { tone: "error" }),
            });
          }}
        >
          <label htmlFor="run-steer" className="sr-only">
            {copy.steerLabel(run.id)}
          </label>
          <input
            id="run-steer"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={copy.steerPlaceholder}
            className="min-h-12 min-w-0 flex-[1_1_280px] bg-transparent text-lg text-ink outline-none placeholder:text-ink-muted"
          />
          <Button type="submit" variant="secondary" size="xl" className="bg-surface" disabled={steer.isPending || text.trim() === ""}>
            {copy.steerSend}
          </Button>
        </form>
      ) : (
        <p className="m-0 text-base text-ink-muted">{copy.steerClosed}</p>
      )}
      {run.queued.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Eyebrow>{copy.queuedTitle}</Eyebrow>
          <ul className="m-0 list-none border-t border-line p-0">
            {run.queued.map((line, index) => (
              <li key={`${index}-${line}`} className="border-b border-line py-3 text-base text-ink">
                {line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <details className="group pt-2">
        <summary className="cursor-pointer text-base text-ink-muted marker:text-ink-muted">{copy.toolLog(run.toolCalls)}</summary>
        <div className="mt-3 flex flex-col items-start gap-2 ps-4">
          <p className="m-0 text-base text-ink-muted">{copy.toolLogBody}</p>
          <LinkArrow href={href({ name: "activity", view: "all" })}>{copy.toolLogLink}</LinkArrow>
        </div>
      </details>
    </Band>
  );
}

// ---------------------------------------------------------------------------
// Recovery
// ---------------------------------------------------------------------------

function RecoveryView(props: { run: Run; projectName: string | null }) {
  const { run } = props;
  const interruption = run.interruption;
  const act = useRunAction(run.id);
  const version = useWerkwijzeVersion(run);
  if (!interruption) return null;
  const outbound = interruption.outbound;
  const unresolved = outbound !== null && outbound.status === "unknown";

  const resume = () => act.mutate({ action: "resume" }, { onSuccess: () => toast(rc.resumed), onError: (error) => toast(errorText(error), { tone: "error" }) });
  const stop = () => act.mutate({ action: "stop" }, { onSuccess: () => toast(copy.abandoned), onError: (error) => toast(errorText(error), { tone: "error" }) });

  return (
    <>
      <PageHero
        documentTitle={`${run.id} · ${run.title}`}
        eyebrow={<Crumbs run={run} projectName={props.projectName} />}
        title={accentTitle(run.title)}
        meta={
          <>
            <RunStatusBadge status={run.status} className="text-[13px] leading-4" />
            <span>{interruption.cause}</span>
            <span>{agentLine(run, props.projectName, version)}</span>
          </>
        }
      />
      <Band tone="alt" label={rc.awayTitle}>
        <div className="mb-8 flex flex-col gap-2">
          <h2 className="m-0 text-[28px] font-bold leading-[34px] tracking-[-0.01em] text-ink">{rc.awayTitle}</h2>
          <p className="m-0 text-lg text-ink-muted">{rc.awayLead}</p>
        </div>
        <ol className="m-0 list-none p-0">
          <Columns min={220}>
            {interruption.happened.map((item, index) => (
              <li key={item.label} className="min-w-0">
                <Column
                  index={String(index + 1).padStart(2, "0")}
                  rule={item.tone === "external" ? "danger" : "line"}
                  eyebrow={<span className={item.tone === "external" ? "text-danger" : undefined}>{item.label}</span>}
                >
                  <p className={cn("m-0 text-base", item.tone === "external" ? "font-semibold text-ink" : "text-ink")}>{item.text}</p>
                </Column>
              </li>
            ))}
          </Columns>
        </ol>
      </Band>
      <Band inner="flex flex-col gap-10">
        {outbound ? <OutboundCard outbound={outbound} /> : null}
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="secondary" size="xl" disabled={unresolved || act.isPending} aria-describedby="run-resume-why" onClick={resume}>
            {rc.resume}
          </Button>
          <Button variant="secondary" size="xl" disabled={act.isPending} onClick={stop}>
            {rc.stopKeep}
          </Button>
          <p id="run-resume-why" className="m-0 min-w-[16rem] flex-[1_1_320px] text-base text-ink-muted">
            {unresolved && outbound ? rc.resumeWhy(outbound.id) : rc.resumeReady}
          </p>
        </div>
      </Band>
      <Band tone="alt">
        <div className="flex flex-wrap gap-12">
          <section aria-labelledby="run-timeline" className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
            <h2 id="run-timeline" className="m-0 text-[28px] font-bold leading-[34px] tracking-[-0.01em] text-ink">
              {rc.timeline}
            </h2>
            <ol className="m-0 list-none border-t border-line-strong p-0">
              {interruption.timeline.map((entry) => (
                <li key={`${entry.at}-${entry.text}`} className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-1 border-b border-line-strong py-3">
                  <span className="w-14 text-base font-semibold text-ink-muted">{formatClock(entry.at)}</span>
                  <span className="min-w-0 flex-[1_1_240px] text-lg text-ink">{entry.text}</span>
                  {entry.state === "done" ? (
                    <StatusBadge kind="done" plain className="text-sm">
                      {rc.timelineDone}
                    </StatusBadge>
                  ) : entry.state === "unknown" ? (
                    <StatusBadge kind="unknown" plain className="text-sm">
                      {rc.timelineUnknown}
                    </StatusBadge>
                  ) : (
                    <StatusBadge kind="failed" plain className="text-sm">
                      {rc.timelineFailed}
                    </StatusBadge>
                  )}
                </li>
              ))}
            </ol>
          </section>
          <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-5">
            <GrantsCard run={run} />
            <WhiteCard title={rc.whyTitle} id="run-why">
              <p className="m-0 text-base text-ink">{interruption.whyNoRetry}</p>
            </WhiteCard>
          </aside>
        </div>
      </Band>
    </>
  );
}

function OutboundCard(props: { outbound: OutboundEntry }) {
  const { outbound } = props;
  const [confirm, setConfirm] = useState(false);
  const resolve = useCockpitMutation((cockpit, outcome: "sent" | "not_sent" | "later") => cockpit.approvals.resolve(outbound.id, outcome));
  const unknown = outbound.status === "unknown";
  const recipient = outbound.target[0].replace(/^Aan /, "");
  const name = recipient.split(" · ")[0] ?? recipient;
  const approved = outbound.steps[0];
  const sending = outbound.steps.find((step) => step.title === "Versturen") ?? outbound.steps[outbound.steps.length - 1];
  const failTime = formatClock(outbound.at);

  const settle = (outcome: "sent" | "later") =>
    resolve.mutate(outcome, {
      onSuccess: () => {
        setConfirm(false);
        toast(outcome === "sent" ? rc.resolvedSent : rc.resolvedLater);
      },
      onError: (error) => toast(errorText(error), { tone: "error" }),
    });

  const steps: Array<{ label: string; detail: string; tone: "success" | "danger" | "pending" }> = [
    { label: rc.steps.approved, detail: approved ? formatClock(approved.at) : "", tone: "success" },
    { label: rc.steps.held, detail: rc.steps.heldDetail, tone: "success" },
    { label: rc.steps.sending, detail: sending ? formatClock(sending.at) : "", tone: "success" },
    { label: rc.unknown, detail: rc.steps.unknownDetail, tone: "danger" },
    unknown ? { label: rc.steps.verified, detail: rc.steps.pending, tone: "pending" } : { label: rc.steps.verified, detail: outbound.statusText, tone: outbound.status === "sent" ? "success" : "danger" },
  ];

  return (
    <section aria-labelledby="run-outbound" className={cn("flex flex-col gap-6 rounded-[24px] border-2 p-6 sm:p-12", unknown ? "border-danger" : "border-line-strong")}>
      <div className="flex flex-wrap items-center gap-4">
        {unknown ? (
          <StatusBadge kind="unknown" className="text-[13px] leading-4">
            {rc.unknown}
          </StatusBadge>
        ) : (
          <StatusBadge kind={outbound.status === "sent" ? "done" : "declined"} className="text-[13px] leading-4">
            {rc.resolved(outbound.statusText)}
          </StatusBadge>
        )}
        <span className="text-base text-ink-muted">
          <span className="font-mono">{outbound.id}</span> · {rc.sendingStarted(failTime)}
        </span>
      </div>
      <h2 id="run-outbound" className="m-0 text-[28px] font-bold leading-[34px] tracking-[-0.015em] text-ink sm:text-[40px] sm:leading-[46px]">
        {rc.wasItSent(recipient)}
      </h2>
      <p className="m-0 max-w-[68ch] text-lg text-ink">{rc.explanation(name)}</p>
      <ol aria-label={rc.stepsLabel} className="m-0 grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3 lg:grid-cols-5">
        {steps.map((step) => (
          <li
            key={step.label}
            className={cn(
              "flex flex-col gap-2 border-t-[3px] pt-4",
              step.tone === "success" ? "border-success" : step.tone === "danger" ? "border-danger" : "border-dashed border-line-strong",
            )}
          >
            <span className={cn("inline-flex items-center gap-1.5 text-base font-semibold [&_svg]:size-4", step.tone === "danger" ? "text-danger" : step.tone === "pending" ? "text-ink-muted" : "text-ink")}>
              {step.tone === "success" ? <Check className="text-success" aria-hidden="true" /> : step.tone === "danger" ? <CircleAlert aria-hidden="true" /> : null}
              {step.label}
            </span>
            <span className="text-sm text-ink-muted">{step.detail}</span>
          </li>
        ))}
      </ol>
      {unknown ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="xl" disabled={resolve.isPending} onClick={() => setConfirm(true)}>
            {rc.verify}
          </Button>
          <Button variant="secondary" size="xl" disabled={resolve.isPending} onClick={() => settle("sent")}>
            {rc.wasSent}
          </Button>
          <Button variant="secondary" size="xl" disabled={resolve.isPending} onClick={() => settle("later")}>
            {rc.later}
          </Button>
        </div>
      ) : null}
      <p className="m-0 text-base text-ink-muted">{rc.followUp(failTime)}</p>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={rc.verifyTitle} body={rc.verifyBody} confirmLabel={rc.verifyConfirm} tone="primary" busy={resolve.isPending} onConfirm={() => settle("sent")} />
    </section>
  );
}
