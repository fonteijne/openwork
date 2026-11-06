import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";

import type { AwayGroup, CalendarEvent, NeedsYou, Run, WaitingFor } from "~/backend/cockpit";
import { useAway, useCalendar, useCockpit, useNeedsYou, useRuns, useTodos, useWaiting } from "~/backend/cockpit-queries";
import { useProjects } from "~/backend/queries";
import { Accent, Band, Card, Container, DecisionIcon, Eyebrow, HintLine, InversePanel, LinkArrow, LockedNote, PageHero, RowItem, Rows, StatusBadge, dot, type StatusKind } from "~/components/io";
import { PAGE_TITLE_FOCUS, useDocumentTitle } from "~/components/top-bar";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/misc";
import { todayCopy } from "~/copy/today";
import { cn } from "~/lib/cn";
import { href } from "~/lib/router";
import { SEEN_ALL_EVENT } from "~/lib/shortcuts";
import { readLocal } from "~/lib/storage";
import { SMALL_UP, useMediaQuery } from "~/lib/use-media";

import { LAST_SEEN_KEY, writeLastSeen } from "../home/model";
import { useUi } from "../shell/ui-store";
import { dayPart, decisionsLead, formatClock, formatHours, formatLongDate, formatShortDate, formatSince, freeTime, runsInProgress, startOfDay, todaysTodos } from "./model";
import { PillLink, SectionHeading, useNow } from "./parts";
import { TodoList } from "./todo-list";

const c = todayCopy;

/**
 * Vandaag (design v2-Main; v2-Mobile on a phone): the decisions only you can make in an inverse
 * band, today's to-dos and your day, what happened while you were away, and what waits on others
 * or runs. Live permissions and questions arrive through `needsYou` (the live cockpit maps the
 * attention poll), so the old "Voor jou" cards stay reachable here.
 */
export function TodayPage() {
  const smallUp = useMediaQuery(SMALL_UP);
  const now = useNow(30_000);
  const cockpit = useCockpit();
  const needs = useNeedsYou();
  const todos = useTodos();
  const projects = useProjects();
  const calendar = useCalendar(now);
  const setCapture = useUi((state) => state.setCapture);
  const hintId = useId();

  const projectNames = useMemo(() => new Map((projects.data ?? []).map((project) => [project.id, project.name])), [projects.data]);
  const list = useMemo(() => todaysTodos(todos.data ?? [], now), [todos.data, now]);
  const items = needs.data ?? [];
  const nextEvent = (calendar.data ?? []).find((event) => event.start > now && !event.proposed) ?? null;

  const capture = (
    <Button variant="primary" size="xl" onClick={() => setCapture(true)}>
      {c.capture}
    </Button>
  );

  return (
    <>
      {smallUp ? (
        <PageHero
          documentTitle={c.title}
          eyebrow={dot(c.title, formatLongDate(now), formatClock(now))}
          title={<HeroTitle count={needs.isLoading ? null : items.length} now={now} />}
          lead={needs.isLoading ? <Skeleton className="h-7 w-[min(36rem,100%)]" /> : decisionsLead(items)}
          actions={capture}
          className="lg:pb-12"
        />
      ) : (
        <PhoneHero count={needs.isLoading ? null : items.length} now={now} next={nextEvent} />
      )}

      <div className="bg-surface pb-12 lg:pb-16">
        <Container>
          <NeedsYouPanel items={items} loading={needs.isLoading} error={needs.isError} onRetry={() => void needs.refetch()} compact={!smallUp} />
        </Container>
      </div>

      <Band tone="alt" label={c.todos.title}>
        <div className="flex flex-wrap gap-x-16 gap-y-12">
          <section aria-labelledby={`${hintId}-todos`} className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <SectionHeading id={`${hintId}-todos`} count={todos.isLoading ? undefined : c.todos.count(list.length)} className="flex-1">
                {c.todos.title}
              </SectionHeading>
              <LinkArrow href={href({ name: "plan" })}>{c.todos.plan}</LinkArrow>
            </div>
            {cockpit.capabilities.todos !== null ? (
              <LockedNote title={c.todos.title}>{cockpit.capabilities.todos}</LockedNote>
            ) : todos.isLoading ? (
              <TodoSkeleton />
            ) : todos.isError ? (
              <ErrorLine text={c.todos.error} onRetry={() => void todos.refetch()} />
            ) : list.length === 0 ? (
              <div className="flex flex-col items-start gap-3 border-t border-line-strong pt-6">
                <p className="m-0 text-lg font-semibold text-ink">{c.todos.empty}</p>
                <p className="m-0 text-base text-ink-muted">{c.todos.emptyBody}</p>
                <LinkArrow href={href({ name: "inbox" })}>{c.todos.openInbox}</LinkArrow>
              </div>
            ) : (
              <>
                <TodoList todos={list} projectNames={projectNames} now={now} compact={!smallUp} hintId={`${hintId}-hint`} />
                {smallUp ? (
                  <HintLine className="mt-0">
                    <span id={`${hintId}-hint`}>{c.todos.hint}</span>
                  </HintLine>
                ) : null}
              </>
            )}
          </section>
          <DayAside now={now} events={calendar.data ?? []} loading={calendar.isLoading} locked={cockpit.capabilities.calendar} />
        </div>
      </Band>

      <AwayBand now={now} />

      <Band tone="alt">
        <div className="grid gap-x-16 gap-y-12 md:grid-cols-2">
          <WaitingSection />
          <WorkingSection now={now} projectNames={projectNames} />
        </div>
      </Band>
    </>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function HeroTitle(props: { count: number | null; now: number }) {
  const greeting = c.greeting[dayPart(props.now)];
  if (props.count === null) return <>{greeting}</>;
  if (props.count === 0)
    return (
      <>
        {greeting} {c.heroCalm}
        <Accent>{c.heroCalmAccent}</Accent>
        {c.heroCalmTail}
      </>
    );
  return (
    <>
      {greeting} {c.heroCount(props.count)}
      <Accent>{c.heroAccent(props.count)}</Accent>
      {c.heroTail}
    </>
  );
}

/** The phone's compact hero (design v2-Mobile): no greeting, the next meeting under the title. */
function PhoneHero(props: { count: number | null; now: number; next: CalendarEvent | null }) {
  useDocumentTitle(c.title);
  return (
    <header className="bg-surface pb-6 pt-6">
      <Container className="flex flex-col gap-2">
        <Eyebrow>{dot(c.title, formatShortDate(props.now))}</Eyebrow>
        <h1 tabIndex={-1} data-page-title="" className={cn("m-0 text-[34px] font-bold leading-[38px] tracking-[-0.02em] text-ink", PAGE_TITLE_FOCUS)}>
          {props.count === null ? (
            c.greeting[dayPart(props.now)]
          ) : props.count === 0 ? (
            <>
              {c.heroCalm}
              <Accent>{c.heroCalmAccent}</Accent>.
            </>
          ) : (
            <>
              {c.heroCount(props.count)}
              <Accent>{c.heroAccent(props.count)}</Accent>.
            </>
          )}
        </h1>
        <p className="m-0 text-base text-ink-muted">{props.next ? c.day.next(formatClock(props.next.start), props.next.title) : c.day.nextNone}</p>
      </Container>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Heeft jou nodig
// ---------------------------------------------------------------------------

const KIND_ICON: Record<NeedsYou["kind"], ReactNode> = { review: DecisionIcon.review, question: DecisionIcon.question, approval: DecisionIcon.approval };

function NeedsYouPanel(props: { items: readonly NeedsYou[]; loading: boolean; error: boolean; onRetry: () => void; compact: boolean }) {
  if (!props.loading && !props.error && props.items.length === 0) return null;
  const index = (position: number) => String(position + 1).padStart(2, "0");
  return (
    <InversePanel label={c.needsYou.title} className={cn("flex flex-col", props.compact ? "gap-4 p-5" : "gap-10 lg:p-12")}>
      {props.compact ? null : (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="m-0 text-[28px] font-bold leading-[34px] tracking-[-0.01em] text-ink-inverse">{c.needsYou.title}</h2>
          {props.loading ? null : <span className="text-lg text-ink-inverse">{c.needsYou.count(props.items.length)}</span>}
        </div>
      )}
      {props.loading ? (
        <div className="grid gap-10 md:grid-cols-3" aria-hidden="true">
          {[0, 1, 2].map((key) => (
            <div key={key} className="flex flex-col gap-4 border-t border-ink-inverse pt-5">
              <Skeleton className="h-4 w-40 bg-inverse-hover" />
              <Skeleton className="h-7 w-full bg-inverse-hover" />
              <Skeleton className="h-12 w-36 rounded-full bg-inverse-hover" />
            </div>
          ))}
        </div>
      ) : props.error ? (
        <div className="flex flex-wrap items-center gap-4">
          <p className="m-0 text-lg text-ink-inverse">{c.needsYou.error}</p>
          <Button variant="inverse" size="xl" onClick={props.onRetry}>
            {c.needsYou.retry}
          </Button>
        </div>
      ) : props.compact ? (
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {props.items.map((item, position) => (
            <li key={item.id} className="flex flex-col gap-1 border-t border-ink-inverse pt-3">
              <span className="text-xs font-semibold uppercase leading-4 tracking-[0.08em] text-ink-inverse">
                {dot(index(position), c.needsYou.kind[item.kind], item.kind === "approval" ? item.context : null)}
              </span>
              <span className="text-lg font-semibold leading-6 text-ink-inverse">{item.title}</span>
              <LinkArrow href={item.href} tone="inverse" className="min-h-11">
                {item.action}
              </LinkArrow>
            </li>
          ))}
        </ol>
      ) : (
        <ol className={cn("m-0 grid list-none gap-10 p-0 md:grid-cols-2", props.items.length !== 2 && props.items.length !== 4 && "lg:grid-cols-3")}>
          {props.items.map((item, position) => (
            <li key={item.id} className="flex min-w-0 flex-col gap-4 border-t border-ink-inverse pt-5">
              <span className="flex items-start gap-2 text-[13px] font-semibold uppercase leading-4 tracking-[0.08em] text-ink-inverse">
                <span className="shrink-0">{index(position)} ·</span>
                <span aria-hidden="true" className="flex shrink-0 [&_svg]:size-4">
                  {KIND_ICON[item.kind]}
                </span>
                <span className="min-w-0">{dot(c.needsYou.kind[item.kind], item.context)}</span>
              </span>
              <h3 className="m-0 text-xl font-semibold leading-[30px] text-ink-inverse">{item.title}</h3>
              <p className="m-0 flex-1 text-base text-ink-inverse">{item.detail}</p>
              <div className="flex">
                <PillLink href={item.href} variant="inverse" arrow>
                  {item.action}
                </PillLink>
              </div>
            </li>
          ))}
        </ol>
      )}
    </InversePanel>
  );
}

// ---------------------------------------------------------------------------
// Je dag
// ---------------------------------------------------------------------------

function DayAside(props: { now: number; events: readonly CalendarEvent[]; loading: boolean; locked: string | null }) {
  const id = useId();
  const meetings = props.events.filter((event) => !event.proposed);
  const rows: Array<{ key: string; time: string; title: string; now: boolean }> = [];
  let placedNow = false;
  for (const event of meetings) {
    if (!placedNow && event.start > props.now) {
      rows.push({ key: "now", time: formatClock(props.now), title: c.day.now, now: true });
      placedNow = true;
    }
    rows.push({ key: event.id, time: formatClock(event.start), title: event.title, now: false });
  }
  if (!placedNow && meetings.length > 0) rows.push({ key: "now", time: formatClock(props.now), title: c.day.now, now: true });
  const free = freeTime(props.events, props.now);

  return (
    <aside aria-labelledby={id} className="flex min-w-0 flex-[1_1_320px] flex-col gap-5">
      <SectionHeading id={id}>{c.day.title}</SectionHeading>
      {props.locked !== null ? (
        <LockedNote title={c.day.locked}>{props.locked}</LockedNote>
      ) : (
        <div className="flex flex-col gap-4 rounded-card bg-surface-raised p-8">
          <p className="m-0 text-sm text-ink-muted">{c.day.source}</p>
          {props.loading ? (
            <div className="flex flex-col gap-3" aria-hidden="true">
              {[0, 1, 2, 3].map((key) => (
                <Skeleton key={key} className="h-6 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="m-0 text-base text-ink">{c.day.empty}</p>
          ) : (
            <ol className="m-0 flex list-none flex-col p-0">
              {rows.map((row, position) => (
                <li key={row.key} className={cn("flex gap-4 py-3 text-base", position < rows.length - 1 && "border-b border-line", row.now ? "font-semibold text-ink" : "text-ink")}>
                  <span className={cn("w-[52px] shrink-0 tabular-nums", row.now ? "text-ink" : "text-ink-muted")}>{row.time}</span>
                  <span>{row.title}</span>
                </li>
              ))}
            </ol>
          )}
          {props.loading || meetings.length === 0 ? null : <p className="m-0 text-base text-ink">{free.meetings === 0 ? c.day.freeNone : c.day.free(formatHours(free.minutes), free.meetings)}</p>}
        </div>
      )}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Terwijl je weg was
// ---------------------------------------------------------------------------

/**
 * Since when "Terwijl je weg was" counts on this device (shared with ⌘⇧U and the old Vandaag). A
 * first visit looks back to the end of yesterday's working day, or a full day when that is longer.
 */
function readSince(now: number): number {
  const stored = Number(readLocal(LAST_SEEN_KEY));
  if (Number.isFinite(stored) && stored > 0) return stored;
  return Math.min(now - 24 * 60 * 60_000, startOfDay(now) - 7 * 60 * 60_000);
}

function AwayBand(props: { now: number }) {
  const [since, setSince] = useState(() => readSince(Date.now()));
  const away = useAway(since);
  const seenAll = useCallback(() => {
    const at = Date.now();
    writeLastSeen(at);
    setSince(at);
  }, []);
  useEffect(() => {
    // ⌘⇧U: the shell fires the event (and comes here first from elsewhere).
    window.addEventListener(SEEN_ALL_EVENT, seenAll);
    return () => window.removeEventListener(SEEN_ALL_EVENT, seenAll);
  }, [seenAll]);
  const groups: readonly AwayGroup[] = away.data ?? [];

  return (
    <Band label={c.away.title}>
      <div className="mb-8 flex flex-wrap items-baseline gap-x-6 gap-y-4">
        <SectionHeading count={c.away.since(formatSince(since, props.now))} className="flex-1">
          {c.away.title}
        </SectionHeading>
        {groups.length > 0 ? (
          <Button variant="secondary" size="xl" onClick={seenAll}>
            {c.away.seenAll}
          </Button>
        ) : null}
      </div>
      {away.isLoading ? (
        <div className="grid gap-6 md:grid-cols-3" aria-hidden="true">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-48 rounded-card" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <p className="m-0 text-lg text-ink-muted">{c.away.empty}</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-3">
          {groups.map((group) => (
            <Card key={`${group.projectId ?? "none"}-${group.label}`} className="gap-4 lg:p-8">
              <Eyebrow>{dot(group.label, String(group.lines.length))}</Eyebrow>
              <ul className="m-0 flex list-none flex-col gap-3 p-0 text-base text-ink">
                {group.lines.map((line, position) => (
                  <li key={position}>{line}</li>
                ))}
              </ul>
              <LinkArrow href={group.link.href}>{group.link.label}</LinkArrow>
            </Card>
          ))}
        </div>
      )}
    </Band>
  );
}

// ---------------------------------------------------------------------------
// Wachten op anderen · Bezig met
// ---------------------------------------------------------------------------

function WaitingSection() {
  const id = useId();
  const waiting = useWaiting();
  const entries: readonly WaitingFor[] = waiting.data ?? [];
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-5">
      <SectionHeading id={id} count={waiting.isLoading ? undefined : entries.length}>
        {c.waiting.title}
      </SectionHeading>
      {waiting.isLoading ? (
        <RowsSkeleton />
      ) : entries.length === 0 ? (
        <p className="m-0 border-t border-line-strong pt-5 text-base text-ink-muted">{c.waiting.empty}</p>
      ) : (
        <Rows>
          {entries.map((entry) => (
            <RowItem key={entry.id} className="py-4" title={<span className="font-semibold">{entry.title}</span>} meta={dot(entry.person.name, entry.person.org, c.waiting.asked(formatShortDate(entry.askedAt)))} />
          ))}
        </Rows>
      )}
    </section>
  );
}

const RUN_BADGE: Partial<Record<Run["status"], StatusKind>> = { working: "working", done: "done", issues: "issues" };

function WorkingSection(props: { now: number; projectNames: ReadonlyMap<string, string> }) {
  const id = useId();
  const runs = useRuns();
  const list = runsInProgress(runs.data ?? [], props.now);
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-5">
      <SectionHeading id={id} count={runs.isLoading ? undefined : c.working.count(list.length)}>
        {c.working.title}
      </SectionHeading>
      {runs.isLoading ? (
        <RowsSkeleton />
      ) : list.length === 0 ? (
        <p className="m-0 border-t border-line-strong pt-5 text-base text-ink-muted">{c.working.empty}</p>
      ) : (
        <Rows>
          {list.map((run) => {
            const status = run.status === "working" || run.status === "done" || run.status === "issues" ? run.status : "working";
            const meta = run.status === "working" ? dot(run.id, run.progress.toLowerCase()) : dot(run.id, c.working.finished(formatClock(run.updatedAt)), run.waitingOn.toLowerCase());
            return (
              <RowItem
                key={run.id}
                href={href({ name: "run", runId: run.id })}
                className="py-4"
                title={<span className="font-semibold">{run.title}</span>}
                meta={meta}
                trailing={<StatusBadge kind={RUN_BADGE[run.status] ?? "neutral"}>{c.working.status[status]}</StatusBadge>}
              />
            );
          })}
        </Rows>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

function TodoSkeleton() {
  return (
    <div className="flex flex-col border-t border-line-strong" aria-hidden="true">
      {[0, 1, 2, 3].map((key) => (
        <div key={key} className="flex min-h-[72px] items-center gap-4 border-b border-line-strong py-3">
          <Skeleton className="size-[22px] rounded-[4px]" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function RowsSkeleton() {
  return (
    <div className="flex flex-col border-t border-line-strong" aria-hidden="true">
      {[0, 1].map((key) => (
        <div key={key} className="flex flex-col gap-2 border-b border-line-strong py-4">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ))}
    </div>
  );
}

function ErrorLine(props: { text: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-4 border-t border-line-strong pt-5">
      <p className="m-0 text-base text-ink">{props.text}</p>
      <Button variant="secondary" size="lg" onClick={props.onRetry}>
        {c.needsYou.retry}
      </Button>
    </div>
  );
}
