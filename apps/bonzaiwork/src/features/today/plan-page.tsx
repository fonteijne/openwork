import { useEffect, useId, useState } from "react";
import { Bot, TriangleAlert, Users } from "lucide-react";

import type { DayPlan } from "~/backend/cockpit";
import { useCockpit, useCockpitMutation, useDayPlan } from "~/backend/cockpit-queries";
import { Accent, Band, Eyebrow, LockedNote, PageHero } from "~/components/io";
import { Button } from "~/components/ui/button";
import { Disclosure } from "~/components/ui/disclosure";
import { Skeleton } from "~/components/ui/misc";
import { SegmentedControl } from "~/components/ui/segmented";
import { Select } from "~/components/ui/select";
import { toast } from "~/components/ui/toast";
import { todayCopy } from "~/copy/today";
import { cn } from "~/lib/cn";
import { href, navigate } from "~/lib/router";

import { formatClock, formatShortDate, formatSpan, formatWeekday } from "./model";
import { PillLink, SectionHeading, TickBox } from "./parts";

const p = todayCopy.plan;

type CarryChoice = "today" | "later" | "drop";

const CARRY_ITEMS = [
  { value: "today", label: p.carry.today },
  { value: "later", label: p.carry.later },
  { value: "drop", label: p.carry.drop },
] as const;

/** The design's segmented choice: a grey track, the chosen option a solid ink pill (40px, 15px). */
const SEGMENTED =
  "bg-surface-alt p-1 gap-1 [&>*]:h-10 [&>*]:px-4 [&>*]:text-base [&>*]:text-ink [&_[data-checked]]:bg-ink! [&_[data-checked]]:text-surface! [&_[data-checked]]:shadow-none! max-sm:w-full max-sm:[&>*]:flex-auto max-sm:[&>*]:px-2 max-sm:[&>*]:text-sm";

/**
 * Dagplanning (design v2-DayPlan): what was left yesterday, the proposed order with its changes,
 * one judgement call, the day with proposed focus blocks, and the optional approval to put those
 * blocks in the calendar. Nothing changes until "Plan vastleggen".
 */
export function PlanPage() {
  const cockpit = useCockpit();
  const plan = useDayPlan();
  const locked = cockpit.capabilities.dayPlan;
  const data = plan.data ?? null;
  const [carry, setCarry] = useState<Record<string, CarryChoice>>({});
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [judgement, setJudgement] = useState<"accept" | "keep" | null>(null);

  const commit = useCockpitMutation((backend, input: Parameters<typeof backend.plan.commit>[0]) => backend.plan.commit(input));

  const onCommit = () => {
    if (!data) return;
    commit.mutate(
      {
        carryOver: Object.fromEntries(data.carryOver.map((item) => [item.todoId, carry[item.todoId] ?? item.choice])),
        included: data.order.filter((item) => !excluded.has(item.todoId)).map((item) => item.todoId),
        acceptJudgement: judgement === "accept",
      },
      {
        onSuccess: () => {
          toast(p.committed);
          navigate({ name: "home" });
        },
        onError: () => toast(p.commitFailed, { tone: "error" }),
      },
    );
  };

  const now = Date.now();
  return (
    <>
      <PageHero
        documentTitle={p.documentTitle}
        eyebrow={
          <>
            <a href={href({ name: "home" })} className="text-inherit no-underline hover:text-ink">
              {p.breadcrumb}
            </a>
            {data ? ` · ${p.proposedAt(formatClock(data.proposedAt))}` : null}
          </>
        }
        title={
          <>
            {p.title}
            <Accent>{formatWeekday(now)}</Accent>
          </>
        }
        lead={plan.isLoading ? <Skeleton className="h-7 w-[min(36rem,100%)]" /> : data ? p.lead(formatSpan(data.freeMinutes), formatSpan(data.plannedMinutes)) : null}
        actions={
          <>
            <PillLink href={href({ name: "home" })}>{p.close}</PillLink>
            <Button variant="primary" size="xl" onClick={onCommit} disabled={!data || locked !== null || commit.isPending}>
              {p.commit}
            </Button>
          </>
        }
      />
      <Band tone="alt">
        {locked !== null ? (
          <LockedNote title={p.locked}>{locked}</LockedNote>
        ) : plan.isLoading ? (
          <PlanSkeleton />
        ) : plan.isError ? (
          <div className="flex flex-wrap items-center gap-4">
            <p className="m-0 text-lg text-ink">{p.error}</p>
            <Button variant="secondary" size="xl" onClick={() => void plan.refetch()}>
              {todayCopy.needsYou.retry}
            </Button>
          </div>
        ) : !data ? (
          <div className="flex flex-col items-start gap-3">
            <p className="m-0 text-xl font-semibold text-ink">{p.empty}</p>
            <p className="m-0 text-lg text-ink-muted">{p.emptyBody}</p>
            <PillLink href={href({ name: "home" })}>{p.back}</PillLink>
          </div>
        ) : (
          <div className="flex flex-wrap items-start gap-x-10 gap-y-12">
            <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-10">
              {data.carryOver.length > 0 ? <CarryOver plan={data} carry={carry} onChange={(todoId, choice) => setCarry((current) => ({ ...current, [todoId]: choice }))} /> : null}
              <ProposedOrder plan={data} excluded={excluded} onToggle={(todoId, include) => setExcluded((current) => toggle(current, todoId, !include))} />
              {data.judgement ? <Judgement text={data.judgement.text} choice={judgement} onChoose={setJudgement} /> : null}
              {data.notProposed.length > 0 ? (
                <Disclosure label={<span className="text-base font-semibold text-ink">{p.notProposed(data.notProposed.length)}</span>} className="[&>button]:h-11">
                  <ul className="m-0 flex list-none flex-col gap-2 p-0 pt-2">
                    {data.notProposed.map((item) => (
                      <li key={item.todoId} className="text-base text-ink-muted">
                        <span className="font-semibold text-ink">{item.title}</span>: {item.reason.charAt(0).toLowerCase()}
                        {item.reason.slice(1)}.
                      </li>
                    ))}
                  </ul>
                </Disclosure>
              ) : null}
            </div>
            <aside className="flex min-w-0 flex-[1_1_400px] flex-col gap-6">
              <DayCard plan={data} now={now} />
              {data.blocks ? <BlocksApproval plan={data} locked={cockpit.capabilities.calendar} /> : null}
            </aside>
          </div>
        )}
      </Band>
    </>
  );
}

function toggle(set: ReadonlySet<string>, id: string, on: boolean): ReadonlySet<string> {
  const next = new Set(set);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}

function CarryOver(props: { plan: DayPlan; carry: Record<string, CarryChoice>; onChange: (todoId: string, choice: CarryChoice) => void }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <SectionHeading id={id} count={props.plan.carryOver.length}>
          {p.carryTitle}
        </SectionHeading>
        <p className="m-0 text-lg text-ink-muted">{p.carryLead}</p>
      </div>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {props.plan.carryOver.map((item) => {
          const choice = props.carry[item.todoId] ?? item.choice;
          return (
            <li key={item.todoId} className="flex flex-wrap items-center gap-4 rounded-card bg-surface-raised px-4 py-5 sm:px-8 sm:py-6">
              <span className="flex min-w-0 flex-[1_1_240px] flex-col">
                <span className="text-lg font-semibold text-ink">{item.title}</span>
                {item.rolledOver > 1 ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
                    <TriangleAlert className="size-4" aria-hidden="true" />
                    {p.rolledOver(item.rolledOver)}
                  </span>
                ) : null}
                {choice === "later" ? <span className="text-sm text-ink-muted">{p.laterNote}</span> : null}
              </span>
              <SegmentedControl value={choice} onValueChange={(value) => props.onChange(item.todoId, value)} items={CARRY_ITEMS} label={p.carryLabel(item.title)} className={SEGMENTED} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ProposedOrder(props: { plan: DayPlan; excluded: ReadonlySet<string>; onToggle: (todoId: string, include: boolean) => void }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <SectionHeading id={id}>{p.orderTitle}</SectionHeading>
        <p className="m-0 text-lg text-ink-muted">{p.orderLead}</p>
      </div>
      <ol className="m-0 list-none border-t border-line-strong p-0">
        {props.plan.order.map((item) => {
          const included = !props.excluded.has(item.todoId);
          return (
            <li key={item.todoId} className="flex min-h-[72px] flex-wrap items-center gap-x-4 gap-y-1 border-b border-line-strong py-3">
              <TickBox checked={included} onCheckedChange={(value) => props.onToggle(item.todoId, value)} label={p.include(item.title)} />
              <span className="min-w-24 text-sm font-semibold text-ink">
                {item.change === "added" ? (
                  <>
                    <span aria-hidden="true">+ </span>
                    {p.added}
                  </>
                ) : item.change === "moved_up" ? (
                  <>
                    <span aria-hidden="true">↑ </span>
                    {p.movedUp}
                  </>
                ) : null}
              </span>
              <span className={cn("min-w-0 flex-[1_1_220px] text-lg font-semibold", included ? "text-ink" : "text-ink-muted line-through")}>{item.title}</span>
              <span className="text-sm text-ink-muted">{item.note}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Judgement(props: { text: string; choice: "accept" | "keep" | null; onChoose: (choice: "accept" | "keep") => void }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 rounded-card border border-dashed border-ink p-6 sm:p-8">
      <Eyebrow className="flex items-center gap-2">
        <Bot className="size-4" aria-hidden="true" />
        {p.judgement}
      </Eyebrow>
      <h2 id={id} className="m-0 text-xl font-semibold leading-[30px] text-ink">
        {props.text}
      </h2>
      <div className="flex flex-wrap gap-3">
        <Button variant={props.choice === "accept" ? "solid" : "secondary"} size="xl" aria-pressed={props.choice === "accept"} onClick={() => props.onChoose("accept")}>
          {p.acceptMove}
        </Button>
        <Button variant={props.choice === "keep" ? "solid" : "secondary"} size="xl" aria-pressed={props.choice === "keep"} onClick={() => props.onChoose("keep")}>
          {p.keepToday}
        </Button>
      </div>
    </section>
  );
}

function DayCard(props: { plan: DayPlan; now: number }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 rounded-card bg-surface-raised p-6 sm:p-8">
      <h2 id={id} className="m-0 text-xl font-semibold leading-[30px] text-ink">
        {formatShortDate(props.now)}
      </h2>
      {props.plan.calendar.length === 0 ? (
        <p className="m-0 text-base text-ink-muted">{p.dayEmpty}</p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {props.plan.calendar.map((event) => (
            <li
              key={event.id}
              className={cn("flex gap-4 rounded-[8px] px-4 py-3 text-base text-ink", event.proposed ? "border border-dashed border-ink" : "bg-surface-alt")}
              style={event.proposed ? { backgroundImage: "repeating-linear-gradient(135deg, transparent 0 8px, var(--surface-alt) 8px 10px)" } : undefined}
            >
              <span className="w-24 shrink-0 tabular-nums text-ink-muted">{event.proposed ? `${formatClock(event.start)}–${formatClock(event.end)}` : formatClock(event.start)}</span>
              <span>
                {event.proposed ? (
                  <>
                    <strong className="font-semibold">{p.proposed}</strong> · {event.title}
                  </>
                ) : (
                  event.title
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="m-0 text-sm text-ink-muted">{p.dayNote}</p>
    </section>
  );
}

/** Proposed focus blocks into the calendar: optional, named consent (who sees it, how to undo). */
function BlocksApproval(props: { plan: DayPlan; locked: string | null }) {
  const blocks = props.plan.blocks;
  const proposed = props.plan.calendar.filter((event) => event.proposed);
  const [showAs, setShowAs] = useState(blocks?.showAs ?? "Vrij");
  const [titleSeen, setTitleSeen] = useState(blocks?.titleSeen === "Focustijd" ? "Focustijd" : "todo");
  const [approved, setApproved] = useState(false);
  useEffect(() => setApproved(false), [props.plan.proposedAt]);
  if (!blocks) return null;
  const count = blocks.count;
  const times = proposed.map((event) => `${formatClock(event.start)}–${formatClock(event.end)}`).join(p.and);
  const titleId = `blocks-${props.plan.proposedAt}`;
  if (props.locked !== null) return <LockedNote title={p.approvalTitle(count)}>{props.locked}</LockedNote>;
  return (
    <section aria-labelledby={titleId} className="flex flex-col overflow-hidden rounded-card border-[1.5px] border-ink bg-surface-raised">
      <Eyebrow tone="ink" className="flex items-center gap-2 bg-surface-alt px-6 py-3 sm:px-5">
        <Users className="size-4 shrink-0" aria-hidden="true" />
        {p.approvalEyebrow}
      </Eyebrow>
      <div className="flex flex-col gap-4 px-6 py-6 sm:px-8">
        <h3 id={titleId} className="m-0 text-xl font-semibold leading-[30px] text-ink">
          {p.approvalTitle(count)}
        </h3>
        <p className="m-0 text-base text-ink-muted">{p.approvalDetail(times)}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2 text-base font-semibold text-ink">
            <span aria-hidden="true">{p.showAs}</span>
            <Select value={showAs} onValueChange={setShowAs} items={Object.entries(p.showAsItems).map(([value, label]) => ({ value, label }))} label={p.showAs} className="h-12 rounded-[6px] text-base font-normal" />
          </div>
          <div className="flex flex-col gap-2 text-base font-semibold text-ink">
            <span aria-hidden="true">{p.titleSeen}</span>
            <Select value={titleSeen} onValueChange={setTitleSeen} items={Object.entries(p.titleSeenItems).map(([value, label]) => ({ value, label }))} label={p.titleSeen} className="h-12 rounded-[6px] text-base font-normal" />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 bg-surface-inverse px-6 py-6 text-ink-inverse sm:px-8">
        <Button
          variant="inverse"
          size="xl"
          disabled={approved}
          onClick={() => {
            // Demo: the calendar write goes through Approvals once the live calendar exists.
            setApproved(true);
            toast(p.approved(count));
          }}
        >
          {p.approve(count)}
        </Button>
        <span className="min-w-40 flex-1 text-sm text-ink-inverse">{p.approveNote}</span>
      </div>
    </section>
  );
}

function PlanSkeleton() {
  return (
    <div className="flex flex-wrap items-start gap-x-10 gap-y-12" aria-hidden="true">
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-24 w-full rounded-card" />
      </div>
      <div className="flex min-w-0 flex-[1_1_400px] flex-col gap-4">
        <Skeleton className="h-80 w-full rounded-card" />
      </div>
    </div>
  );
}
