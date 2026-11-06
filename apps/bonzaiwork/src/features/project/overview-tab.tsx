import { useMemo, useState } from "react";
import { ArrowRight, Diamond } from "lucide-react";

import type { ProjectBrief, Run, SourceRef } from "~/backend/cockpit";
import { useRuns, useShelves, useTodos } from "~/backend/cockpit-queries";
import type { Project } from "~/backend/types";
import { Band, Container, Eyebrow, InversePanel, LinkArrow, StatusBadge, Tag } from "~/components/io";
import { Skeleton } from "~/components/ui/misc";
import { projectsCopy } from "~/copy/projects";
import { href } from "~/lib/router";

import { changeLabel, dayTimeLabel } from "./dates";
import { NewChatComposer } from "./new-chat-composer";
import { BandTitle, ButtonLink, runStatusKind } from "./shared";
import { AddTodoForm, TodoRow, useToggleTodo } from "./todo-row";

const C = projectsCopy.overview;

/** "Waar dit staat": klaar als, what waits on you, what changed since the last visit. */
function WhereItStands(props: { brief: ProjectBrief | null | undefined }) {
  const { brief } = props;
  const column = "flex min-w-0 flex-col gap-3 border-t border-ink-inverse pt-5";
  const label = "m-0 flex items-center gap-2 text-[13px] font-semibold uppercase leading-4 tracking-[0.08em] text-ink-inverse";
  return (
    <Container className="pb-16">
      <InversePanel label={C.stands} className="flex flex-col gap-10 lg:p-12">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="m-0 text-[28px] font-bold leading-[34px] text-ink-inverse">{C.stands}</h2>
          <span className="text-base text-ink-inverse">{brief?.lastVisitAt ? C.standsLead(dayTimeLabel(brief.lastVisitAt)) : C.standsLeadFirst}</span>
        </div>
        {brief === undefined ? (
          <div className="grid gap-10 md:grid-cols-3" aria-busy="true">
            <Skeleton className="h-24 w-full opacity-20" />
            <Skeleton className="h-24 w-full opacity-20" />
            <Skeleton className="h-24 w-full opacity-20" />
          </div>
        ) : (
          <div className="grid gap-10 md:grid-cols-3">
            <div className={column}>
              <p className={label}>{C.doneWhen}</p>
              <p className="m-0 text-xl font-semibold leading-7 text-ink-inverse">{brief?.doneWhen ?? <span className="font-normal text-ink-inverse-muted">{C.doneWhenEmpty}</span>}</p>
            </div>
            <div className={column}>
              <p className={label}>
                <Diamond className="size-4" aria-hidden="true" />
                {C.waitingOnYou}
              </p>
              {brief?.waitingOnYou ? (
                <>
                  <p className="m-0 text-xl font-semibold leading-7 text-ink-inverse">{brief.waitingOnYou.title}</p>
                  <div className="flex">
                    <ButtonLink href={brief.waitingOnYou.href} variant="inverse">
                      {brief.waitingOnYou.action}
                      <ArrowRight aria-hidden="true" />
                    </ButtonLink>
                  </div>
                </>
              ) : (
                <p className="m-0 text-lg text-ink-inverse-muted">{C.waitingNone}</p>
              )}
            </div>
            <div className={column}>
              <p className={label}>
                {C.changes}
                {brief?.changes.length ? ` · ${brief.changes.length}` : ""}
              </p>
              {brief?.changes.length ? (
                <ul className="m-0 flex list-none flex-col gap-2 p-0 text-base text-ink-inverse">
                  {brief.changes.map((change) => (
                    <li key={`${change.at}-${change.text}`}>
                      {changeLabel(change.at)} · {change.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-base text-ink-inverse-muted">{C.changesNone}</p>
              )}
            </div>
          </div>
        )}
      </InversePanel>
    </Container>
  );
}

function OpenTodos(props: { project: Project; now: number }) {
  const todos = useTodos();
  const toggle = useToggleTodo();
  const [adding, setAdding] = useState(false);
  const open = useMemo(
    () => (todos.data ?? []).filter((todo) => todo.projectId === props.project.id && !todo.done).sort((a, b) => (a.due?.at ?? Infinity) - (b.due?.at ?? Infinity)),
    [todos.data, props.project.id],
  );
  return (
    <section aria-labelledby="ov-todos" className="flex min-w-0 flex-col gap-5">
      <BandTitle id="ov-todos" title={C.openTodos} count={todos.data ? open.length : undefined} action={adding ? null : <LinkArrow onClick={() => setAdding(true)}>{C.addTodo}</LinkArrow>} />
      <ul className="m-0 list-none border-t border-line-strong p-0">
        {todos.isLoading ? (
          <li className="flex flex-col gap-3 py-5" aria-busy="true">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-6 w-2/3" />
          </li>
        ) : open.length === 0 && !adding ? (
          <li className="border-b border-line-strong py-6 text-base text-ink-muted">{C.todosEmpty}</li>
        ) : (
          open.map((todo) => <TodoRow key={todo.id} todo={todo} onToggle={toggle} now={props.now} />)
        )}
        {adding ? (
          <li>
            <AddTodoForm projectId={props.project.id} onClose={() => setAdding(false)} />
          </li>
        ) : null}
      </ul>
    </section>
  );
}

export function RunRow(props: { run: Run }) {
  const { run } = props;
  return (
    <li className="flex min-h-[72px] flex-wrap items-center gap-3 border-b border-line-strong py-3">
      <span className="flex min-w-0 flex-[1_1_220px] flex-col">
        <a href={href({ name: "run", runId: run.id })} className="text-lg font-semibold text-ink no-underline hover:underline">
          {run.title}
        </a>
        <span className="text-sm text-ink-muted">{C.runMeta(run.id, run.werkwijzeName, run.progress)}</span>
      </span>
      <StatusBadge kind={runStatusKind(run.status)}>{projectsCopy.runStatus[run.status]}</StatusBadge>
    </li>
  );
}

function ProjectRuns(props: { project: Project }) {
  const runs = useRuns();
  const list = useMemo(() => (runs.data ?? []).filter((run) => run.projectId === props.project.id).sort((a, b) => b.updatedAt - a.updatedAt), [runs.data, props.project.id]);
  const active = list.filter((run) => run.status !== "done" && run.status !== "stopped");
  const shown = (active.length ? active : list).slice(0, 4);
  return (
    <section aria-labelledby="ov-runs" className="flex min-w-0 flex-col gap-5">
      <BandTitle id="ov-runs" title={C.runs} count={runs.data ? list.length : undefined} action={<LinkArrow href={href({ name: "project-runs", projectId: props.project.id })}>{C.allRuns}</LinkArrow>} />
      <ul className="m-0 list-none border-t border-line-strong p-0">
        {runs.isLoading ? (
          <li className="flex flex-col gap-3 py-5" aria-busy="true">
            <Skeleton className="h-6 w-3/4" />
          </li>
        ) : shown.length === 0 ? (
          <li className="border-b border-line-strong py-6 text-base text-ink-muted">{C.runsEmpty}</li>
        ) : (
          shown.map((run) => <RunRow key={run.id} run={run} />)
        )}
      </ul>
    </section>
  );
}

function SourceCard(props: { eyebrow: string; title: string; body?: string | null; link?: { label: string; href: string } | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-card bg-surface-alt p-8">
      <Eyebrow>{props.eyebrow}</Eyebrow>
      <h3 className="m-0 text-xl font-semibold leading-7 text-ink">{props.title}</h3>
      {props.body ? <p className="m-0 flex-1 text-base text-ink-muted">{props.body}</p> : <span className="flex-1" />}
      {props.link ? (
        <div className="flex">
          <LinkArrow href={props.link.href}>{props.link.label}</LinkArrow>
        </div>
      ) : null}
    </div>
  );
}

function sourceEyebrow(source: SourceRef): string {
  return source.meta || projectsCopy.sourceKind[source.kind];
}

/** Bronnen en besluiten: the first source, the rest of the sources, the first decision. */
function SourcesAndDecisions(props: { project: Project; brief: ProjectBrief | null | undefined }) {
  const { brief } = props;
  const sources = brief?.sources ?? [];
  const decision = brief?.decisions[0];
  const sourcesHref = href({ name: "project-sources", projectId: props.project.id });
  const [first, ...rest] = sources.filter((source) => source.kind !== "decision");
  const cards = [
    first ? <SourceCard key="first" eyebrow={sourceEyebrow(first)} title={first.title} link={first.href ? { label: C.open, href: first.href } : rest.length === 0 ? { label: C.allSources(sources.length), href: sourcesHref } : null} /> : null,
    rest.length ? <SourceCard key="rest" eyebrow={[...new Set(rest.map((source) => projectsCopy.sourceKind[source.kind]))].join(" · ")} title={rest.map((source) => source.title).join(", ")} body={rest.map((source) => source.meta).filter(Boolean).join(" · ")} link={{ label: C.allSources(sources.length), href: sourcesHref }} /> : null,
    decision ? <SourceCard key="decision" eyebrow={decision.state} title={decision.title} body={decision.body} link={{ label: C.openDecision, href: href({ name: "library-page", pageId: decision.id }) }} /> : null,
  ].filter(Boolean);
  return (
    <Band label={C.sources} inner="flex flex-col gap-6">
      <BandTitle title={C.sources} />
      {brief === undefined ? (
        <div className="grid gap-6 md:grid-cols-3" aria-busy="true">
          <Skeleton className="h-48 w-full rounded-card" />
          <Skeleton className="h-48 w-full rounded-card" />
          <Skeleton className="h-48 w-full rounded-card" />
        </div>
      ) : cards.length ? (
        <div className="grid gap-6 md:grid-cols-3">{cards}</div>
      ) : (
        <p className="m-0 text-lg text-ink-muted">{C.sourcesEmpty}</p>
      )}
    </Band>
  );
}

/** "Vraag iets of geef een taak": the project's tags and its new-chat composer. */
function AskPanel(props: { project: Project; brief: ProjectBrief | null | undefined }) {
  const shelves = useShelves();
  const shelf = (shelves.data ?? []).find((entry) => entry.projectId === props.project.id);
  const sources = props.brief?.sources.length ?? 0;
  return (
    <Band tone="alt" label={C.ask} inner="flex flex-col gap-5">
      <BandTitle title={C.ask} />
      <div className="flex flex-col gap-4 rounded-card bg-surface-raised p-6 lg:p-8">
        <div className="flex flex-wrap gap-2">
          <Tag>{props.brief?.keyAlias ? projectsCopy.keyTag(props.brief.keyAlias) : projectsCopy.noKeyTag}</Tag>
          {shelf ? <Tag>{shelf.name}</Tag> : null}
          {sources ? <Tag>{C.sourcesTag(sources)}</Tag> : null}
        </div>
        <NewChatComposer project={props.project} placeholder={C.placeholder} />
      </div>
    </Band>
  );
}

/** Overzicht (design v2-Project): where it stands, open to-dos and runs, sources, ask. */
export function OverviewTab(props: { project: Project; brief: ProjectBrief | null | undefined }) {
  const now = Math.floor(Date.now() / 60_000) * 60_000;
  return (
    <>
      <div className="bg-surface pt-10">
        <WhereItStands brief={props.brief} />
      </div>
      <Band tone="alt" inner="grid gap-12 lg:grid-cols-2 lg:gap-16">
        <OpenTodos project={props.project} now={now} />
        <ProjectRuns project={props.project} />
      </Band>
      <SourcesAndDecisions project={props.project} brief={props.brief} />
      <AskPanel project={props.project} brief={props.brief} />
    </>
  );
}
