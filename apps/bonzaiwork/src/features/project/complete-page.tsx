import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";

import type { ProjectBrief, ProjectReview, ProjectReviewCommit } from "~/backend/cockpit";
import { useCockpit, useCockpitRefresh, useProjectReview } from "~/backend/cockpit-queries";
import { useBackend } from "~/backend/context";
import { keys, useStatus } from "~/backend/queries";
import type { Project } from "~/backend/types";
import { Band, Eyebrow, InversePanel, LinkArrow, PageHero, Tag } from "~/components/io";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Skeleton } from "~/components/ui/misc";
import { toast } from "~/components/ui/toast";
import { projectsCopy } from "~/copy/projects";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { href, navigate } from "~/lib/router";
import { readLocalJson, writeLocalJson } from "~/lib/storage";

import { dayLabel } from "./dates";
import { AccentTitle, areaTagText, BandTitle, ChoiceGroup, ChoicePill, ButtonLink } from "./shared";

const P = projectsCopy.complete;

type OpenChoice = "done" | "move" | "cancel" | "keep";
type DecisionChoice = "personal" | "shelf" | "skip";
type Choices = {
  open: Record<string, OpenChoice | null>;
  decisions: Record<string, DecisionChoice | null>;
  learnings: Record<string, boolean>;
  final: "completed" | "cancelled";
  superseded: string[];
};

const draftKey = (projectId: string) => `bonzaiwork.projectReview.${projectId}`;

function isOpenChoice(value: unknown): value is OpenChoice {
  return value === "done" || value === "move" || value === "cancel" || value === "keep";
}
function isDecisionChoice(value: unknown): value is DecisionChoice {
  return value === "personal" || value === "shelf" || value === "skip";
}

/** The review's own suggestions, then whatever the person saved with "Bewaren en later afmaken". */
function initialChoices(projectId: string, review: ProjectReview): Choices {
  const choices: Choices = {
    open: Object.fromEntries(review.open.map((item) => [item.id, item.choice])),
    decisions: Object.fromEntries(review.decisions.map((item) => [item.id, item.choice])),
    learnings: Object.fromEntries(review.learnings.map((item) => [item.id, item.include])),
    final: "completed",
    superseded: [],
  };
  const saved = readLocalJson(draftKey(projectId));
  if (saved && typeof saved === "object") {
    const record: Record<string, unknown> = { ...saved };
    const savedOpen = record.open;
    if (savedOpen && typeof savedOpen === "object") for (const [id, value] of Object.entries(savedOpen)) if (id in choices.open && isOpenChoice(value)) choices.open[id] = value;
    const savedDecisions = record.decisions;
    if (savedDecisions && typeof savedDecisions === "object") for (const [id, value] of Object.entries(savedDecisions)) if (id in choices.decisions && isDecisionChoice(value)) choices.decisions[id] = value;
    const savedLearnings = record.learnings;
    if (savedLearnings && typeof savedLearnings === "object") for (const [id, value] of Object.entries(savedLearnings)) if (id in choices.learnings && typeof value === "boolean") choices.learnings[id] = value;
    if (record.final === "completed" || record.final === "cancelled") choices.final = record.final;
  }
  return choices;
}

function ReviewForm(props: { project: Project; brief: ProjectBrief | null | undefined; review: ProjectReview }) {
  const backend = useBackend();
  const cockpit = useCockpit();
  const refresh = useCockpitRefresh();
  const client = useQueryClient();
  const status = useStatus();
  const { project, review, brief } = props;
  const [choices, setChoices] = useState<Choices>(() => initialChoices(project.id, review));
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const readOnly = status.data?.readOnly ?? false;
  const areaName = brief?.area.name ?? null;

  const missing = review.open.filter((item) => !choices.open[item.id]).length;
  const todoCount = review.open.filter((item) => item.kind === "todo").length;
  const waitingCount = review.open.length - todoCount;
  const toShelf = review.decisions.filter((item) => choices.decisions[item.id] === "shelf").length;
  const toTeam = review.learnings.filter((item) => choices.learnings[item.id]).length;

  const setOpen = (id: string, value: OpenChoice) => setChoices((current) => ({ ...current, open: { ...current.open, [id]: value } }));
  const setDecision = (id: string, value: DecisionChoice) => setChoices((current) => ({ ...current, decisions: { ...current.decisions, [id]: value } }));

  const submit = async () => {
    if (missing > 0) return;
    setBusy(true);
    const commit: ProjectReviewCommit = {
      open: Object.fromEntries(review.open.map((item) => [item.id, choices.open[item.id] ?? "keep"])),
      decisions: Object.fromEntries(review.decisions.map((item) => [item.id, choices.decisions[item.id] ?? "skip"])),
      learnings: review.learnings.filter((item) => choices.learnings[item.id]).map((item) => item.id),
      final: choices.final,
    };
    try {
      await cockpit.projects.complete(project.id, commit);
      if (choices.final === "completed" && project.archivedAt === null) await backend.projects.update(project.id, { archived: true });
      writeLocalJson(draftKey(project.id), null);
      await Promise.all([client.invalidateQueries({ queryKey: keys.projects }), refresh()]);
      const undo = async () => {
        try {
          if (choices.final === "completed") await backend.projects.update(project.id, { archived: false });
          await cockpit.projects.updateBrief(project.id, { state: "active" });
          await Promise.all([client.invalidateQueries({ queryKey: keys.projects }), refresh()]);
        } catch (failure) {
          toast(errorText(failure), { tone: "error" });
        }
      };
      toast(choices.final === "completed" ? P.doneToast(project.name) : P.stoppedToast(project.name), { action: { label: P.undo, onClick: () => void undo() } });
      navigate({ name: "projects" });
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const saveForLater = () => {
    writeLocalJson(draftKey(project.id), { open: choices.open, decisions: choices.decisions, learnings: choices.learnings, final: choices.final });
    toast(P.laterSaved);
    navigate({ name: "project-overview", projectId: project.id });
  };

  return (
    <>
      <Band tone="alt" label={P.open} inner="flex flex-col gap-5">
        <BandTitle index="01" title={P.open} count={P.openCount(todoCount, waitingCount)} />
        {review.open.length === 0 ? (
          <p className="m-0 rounded-card bg-surface-raised p-8 text-lg text-ink-muted">{P.openEmpty}</p>
        ) : (
          <ul className="m-0 list-none rounded-card bg-surface-raised px-6 py-2 lg:px-8">
            {review.open.map((item) => {
              const choice = choices.open[item.id] ?? null;
              const needs = choice === null;
              return (
                <li key={item.id} className={cn("flex flex-wrap items-center gap-4 border-b border-line py-5 last:border-b-0", needs && "-mx-3 my-2 rounded-card border-b-0 px-3 ring-2 ring-inset ring-ink lg:-mx-5 lg:px-5")}>
                  <span className="flex min-w-0 flex-[1_1_280px] flex-col">
                    <span className="text-lg font-semibold text-ink">{item.title}</span>
                    {needs ? (
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
                        <TriangleAlert className="size-4" aria-hidden="true" />
                        {P.choose}
                      </span>
                    ) : item.detail ? (
                      <span className="text-sm text-ink-muted">{item.detail}</span>
                    ) : null}
                  </span>
                  <ChoiceGroup label={item.title}>
                    {item.kind === "todo" ? (
                      <>
                        <ChoicePill selected={choice === "done"} onSelect={() => setOpen(item.id, "done")}>
                          {P.done}
                        </ChoicePill>
                        <ChoicePill selected={choice === "move"} onSelect={() => setOpen(item.id, "move")}>
                          {choice === "move" && areaName ? P.moveTo(areaName) : P.move}
                        </ChoicePill>
                      </>
                    ) : (
                      <ChoicePill selected={choice === "keep"} onSelect={() => setOpen(item.id, "keep")}>
                        {P.keep}
                      </ChoicePill>
                    )}
                    <ChoicePill selected={choice === "cancel"} onSelect={() => setOpen(item.id, "cancel")}>
                      {P.cancelIt}
                    </ChoicePill>
                  </ChoiceGroup>
                </li>
              );
            })}
          </ul>
        )}
      </Band>

      <Band inner="grid gap-12 lg:grid-cols-2 lg:gap-10">
        <section aria-labelledby="cp-agent" className="flex min-w-0 flex-col gap-5">
          <BandTitle id="cp-agent" index="02" title={P.agentWork} />
          <p className="m-0 text-lg text-ink">{review.agentWork.summary}</p>
          {review.agentWork.unreviewed.length ? (
            <div className="flex flex-col gap-4 rounded-card bg-surface-alt p-6 lg:p-8">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
                <TriangleAlert className="size-4" aria-hidden="true" />
                {P.notReviewed(review.agentWork.unreviewed.filter((item) => !choices.superseded.includes(item.id)).length)}
              </span>
              {review.agentWork.unreviewed.map((item) => {
                const superseded = choices.superseded.includes(item.id);
                return (
                  <div key={item.id} className="flex flex-col gap-3">
                    <h3 className={cn("m-0 text-xl font-semibold text-ink", superseded && "text-ink-muted line-through")}>{item.title}</h3>
                    <p className="m-0 text-base text-ink-muted">{superseded ? P.supersededDone : item.meta}</p>
                    {superseded ? null : (
                      <div className="flex flex-wrap gap-3">
                        <ButtonLink href={href({ name: "run", runId: item.id })}>{P.reviewNow}</ButtonLink>
                        <Button variant="secondary" size="xl" onClick={() => setChoices((current) => ({ ...current, superseded: [...current.superseded, item.id] }))}>
                          {P.superseded}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>
        <section aria-labelledby="cp-decisions" className="flex min-w-0 flex-col gap-5">
          <BandTitle id="cp-decisions" index="03" title={P.decisions} />
          <p className="m-0 text-lg text-ink">{review.decisions.length ? P.decisionsLead : P.decisionsEmpty}</p>
          {review.decisions.map((item) => {
            const choice = choices.decisions[item.id] ?? null;
            return (
              <div key={item.id} className="flex flex-col gap-4 rounded-card border-[1.5px] border-dashed border-ink p-6 lg:p-8">
                <Eyebrow>{P.suggested}</Eyebrow>
                <h3 className="m-0 text-xl font-semibold leading-7 text-ink">{item.title}</h3>
                <p className="m-0 text-base text-ink-muted">{item.body}</p>
                <ChoiceGroup label={item.title}>
                  <ChoicePill selected={choice === "personal"} onSelect={() => setDecision(item.id, "personal")}>
                    {P.personal}
                  </ChoicePill>
                  <ChoicePill selected={choice === "shelf"} onSelect={() => setDecision(item.id, "shelf")}>
                    {P.shelf}
                  </ChoicePill>
                  <ChoicePill selected={choice === "skip"} onSelect={() => setDecision(item.id, "skip")}>
                    {P.skip}
                  </ChoicePill>
                </ChoiceGroup>
              </div>
            );
          })}
        </section>
      </Band>

      <Band tone="alt" inner="grid gap-12 lg:grid-cols-2 lg:gap-10">
        <section aria-labelledby="cp-learnings" className="flex min-w-0 flex-col gap-5">
          <BandTitle id="cp-learnings" index="04" title={P.learnings} />
          {review.learnings.length === 0 ? <p className="m-0 text-lg text-ink">{P.learningsEmpty}</p> : null}
          {review.learnings.map((item) => {
            const expanded = showAll[item.id] ?? false;
            const ops = expanded ? item.diff : item.diff.slice(0, 3);
            return (
              <div key={item.id} className="flex flex-col gap-4 rounded-card border-[1.5px] border-dashed border-ink bg-surface-raised p-6 lg:p-8">
                <Eyebrow>{P.learningsEyebrow}</Eyebrow>
                <h3 className="m-0 text-xl font-semibold leading-7 text-ink">{item.title}</h3>
                <p className="m-0 text-base leading-7 text-ink">
                  {ops.map((op, index) =>
                    op.op === "remove" ? (
                      <del key={index} className="me-1 rounded-[4px] bg-surface-alt px-1 text-ink-muted">
                        <span aria-hidden="true">− </span>
                        {op.text}
                        <span className="sr-only"> {P.removed}</span>
                      </del>
                    ) : op.op === "add" ? (
                      <ins key={index} className="me-1 px-1 underline decoration-2 underline-offset-4">
                        <span aria-hidden="true">+ </span>
                        {op.text}
                        <span className="sr-only"> {P.added}</span>
                      </ins>
                    ) : (
                      <span key={index}>{op.text} </span>
                    ),
                  )}
                </p>
                {item.diff.length > 3 ? (
                  <div className="flex">
                    <LinkArrow onClick={() => setShowAll((current) => ({ ...current, [item.id]: !expanded }))}>{expanded ? P.hideRemovals : P.showRemovals(item.removed)}</LinkArrow>
                  </div>
                ) : null}
                <Checkbox checked={choices.learnings[item.id] ?? false} onCheckedChange={(checked) => setChoices((current) => ({ ...current, learnings: { ...current.learnings, [item.id]: checked } }))} className="font-semibold">
                  {P.include}
                </Checkbox>
              </div>
            );
          })}
        </section>
        <InversePanel label={P.shared} className="flex flex-col gap-5 self-start lg:p-12">
          <Eyebrow tone="inverse">{P.shared}</Eyebrow>
          <h2 className="m-0 text-[28px] font-bold leading-[34px] text-ink-inverse">{P.sharedTitle(toShelf + toTeam)}</h2>
          <p className="m-0 text-lg text-ink-inverse">{P.sharedBody(toShelf, toTeam)}</p>
        </InversePanel>
      </Band>

      <Band inner="grid gap-12 lg:grid-cols-2 lg:gap-10">
        <section aria-labelledby="cp-outside" className="flex min-w-0 flex-col gap-4">
          <BandTitle id="cp-outside" index="05" title={P.outside} />
          <p className="m-0 text-lg text-ink">{review.outside ?? P.outsideNone}</p>
        </section>
        <section aria-labelledby="cp-final" className="flex min-w-0 flex-col gap-4">
          <BandTitle id="cp-final" index="06" title={P.final} />
          <fieldset className="m-0 flex flex-wrap gap-3 border-0 p-0">
            <legend className="sr-only">{P.final}</legend>
            {(["completed", "cancelled"] as const).map((final) => (
              <label key={final} className={cn("flex min-h-14 cursor-pointer items-center gap-3 rounded-card bg-surface-alt px-5 py-3 text-lg font-semibold text-ink", choices.final === final && "ring-2 ring-inset ring-ink")}>
                <input type="radio" name="final-state" checked={choices.final === final} onChange={() => setChoices((current) => ({ ...current, final }))} className="size-4 accent-[var(--accent)]" />
                {final === "completed" ? P.completed : P.cancelled}
              </label>
            ))}
          </fieldset>
          <p className="m-0 text-base text-ink-muted">{choices.final === "completed" ? P.finalHint : P.finalHintCancelled}</p>
        </section>
      </Band>

      <Band tone="alt" className="py-10! lg:py-10!" inner="flex flex-wrap items-center gap-4">
        <Button variant="primary" size="xl" disabled={missing > 0 || busy || readOnly} aria-describedby={missing > 0 ? "complete-why" : undefined} onClick={() => void submit()}>
          {busy ? P.submitting : P.submit}
        </Button>
        <Button variant="secondary" size="xl" onClick={saveForLater} disabled={busy}>
          {P.later}
        </Button>
        {missing > 0 ? (
          <p id="complete-why" className="m-0 inline-flex items-center gap-2 text-base font-semibold text-ink">
            <TriangleAlert className="size-4" aria-hidden="true" />
            {P.missing(missing)}
          </p>
        ) : null}
      </Band>
    </>
  );
}

/**
 * Afronden (design v2-ProjectReview): decide what happens to everything still open, what to keep
 * or share, and the final state. Nothing is cleared or archived without a choice; completing
 * archives the project (undo from the toast).
 */
export function CompletePage(props: { project: Project; brief: ProjectBrief | null | undefined }) {
  const { project, brief } = props;
  const review = useProjectReview(project.id);
  const now = Date.now();
  const reached = brief?.target !== null && brief?.target !== undefined && brief.target <= now;
  return (
    <div className="flex flex-col">
      <PageHero
        documentTitle={P.documentTitle(project.name)}
        tag={brief ? <Tag>{areaTagText(brief.area)}</Tag> : undefined}
        eyebrow={P.eyebrow(dayLabel(now), reached)}
        title={<AccentTitle text={P.title(project.name)} />}
        lead={P.lead}
      />
      {review.isLoading ? (
        <Band tone="alt" inner="flex flex-col gap-4">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-40 w-full rounded-card" />
        </Band>
      ) : review.isError || !review.data ? (
        <Band tone="alt" inner="flex flex-col items-start gap-4">
          <p className="m-0 text-lg text-ink">{projectsCopy.loadFailed}</p>
          <Button variant="secondary" size="lg" onClick={() => void review.refetch()}>
            {projectsCopy.retry}
          </Button>
        </Band>
      ) : (
        <ReviewForm project={project} brief={brief} review={review.data} />
      )}
    </div>
  );
}
