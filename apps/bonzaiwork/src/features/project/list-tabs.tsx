import { useMemo, useState, type ReactNode } from "react";
import { Bot, Building2, FileText, Mail, Ticket, User, Users } from "lucide-react";

import type { ActivityActor, ProjectBrief, SourceKind } from "~/backend/cockpit";
import { useActivity, useRuns, useTodos, useWaiting } from "~/backend/cockpit-queries";
import type { Project } from "~/backend/types";
import { Band, LinkArrow, StatusBadge } from "~/components/io";
import { Disclosure } from "~/components/ui/disclosure";
import { Skeleton } from "~/components/ui/misc";
import { projectsCopy } from "~/copy/projects";
import { href } from "~/lib/router";

import { activityLabel, dayLabel, timeLabel } from "./dates";
import { RunRow } from "./overview-tab";
import { BandTitle } from "./shared";
import { AddTodoForm, TodoRow, useToggleTodo } from "./todo-row";

const L = projectsCopy.lists;

/** One list tab: a grey band, the title and a lead, then the rows on a white panel. */
function TabPage(props: { title: string; lead: string; count?: number; action?: ReactNode; children: ReactNode }) {
  return (
    <Band tone="alt" className="flex-1" inner="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BandTitle title={props.title} count={props.count} action={props.action} />
        <p className="m-0 max-w-[68ch] text-lg text-ink-muted">{props.lead}</p>
      </div>
      {props.children}
    </Band>
  );
}

function ListPanel(props: { children: ReactNode; label?: string }) {
  return (
    <ul aria-label={props.label} className="m-0 list-none rounded-card bg-surface-raised px-6 py-2 lg:px-8 [&>li:last-child]:border-b-0">
      {props.children}
    </ul>
  );
}

function Empty(props: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-card bg-surface-raised p-8">
      <p className="m-0 text-xl font-semibold text-ink">{props.title}</p>
      {props.body ? <p className="m-0 max-w-[60ch] text-base text-ink-muted">{props.body}</p> : null}
      {props.action}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex flex-col gap-4 rounded-card bg-surface-raised p-8" aria-busy="true">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-6 w-3/5" />
    </div>
  );
}

/** A plain hairline row: title (a link when it goes somewhere), meta, something on the right. */
function Line(props: { title: ReactNode; href?: string | null; meta?: ReactNode; body?: ReactNode; leading?: ReactNode; trailing?: ReactNode }) {
  return (
    <li className="flex min-h-[72px] flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-4">
      {props.leading ? <span className="flex shrink-0 items-center text-ink">{props.leading}</span> : null}
      <span className="flex min-w-0 flex-[1_1_260px] flex-col gap-0.5">
        {props.href ? (
          <a href={props.href} className="text-lg font-semibold text-ink no-underline hover:underline">
            {props.title}
          </a>
        ) : (
          <span className="text-lg font-semibold text-ink">{props.title}</span>
        )}
        {props.meta ? <span className="text-sm text-ink-muted">{props.meta}</span> : null}
        {props.body ? <span className="mt-1 text-base text-ink-muted">{props.body}</span> : null}
      </span>
      {props.trailing ? <span className="ms-auto flex shrink-0 items-center gap-3">{props.trailing}</span> : null}
    </li>
  );
}

// ---------------------------------------------------------------------------

export function TodosTab(props: { project: Project }) {
  const todos = useTodos();
  const waiting = useWaiting();
  const toggle = useToggleTodo();
  const [adding, setAdding] = useState(false);
  const now = Math.floor(Date.now() / 60_000) * 60_000;
  const mine = useMemo(() => (todos.data ?? []).filter((todo) => todo.projectId === props.project.id), [todos.data, props.project.id]);
  const open = mine.filter((todo) => !todo.done).sort((a, b) => (a.due?.at ?? Infinity) - (b.due?.at ?? Infinity));
  const done = mine.filter((todo) => todo.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
  const waits = (waiting.data ?? []).filter((entry) => entry.projectId === props.project.id);
  return (
    <TabPage title={L.todos.title} lead={L.todos.lead} count={todos.data ? open.length : undefined} action={adding ? null : <LinkArrow onClick={() => setAdding(true)}>{projectsCopy.overview.addTodo}</LinkArrow>}>
      {todos.isLoading ? (
        <Loading />
      ) : (
        <ul className="m-0 list-none rounded-card bg-surface-raised px-6 py-2 lg:px-8 [&>li:last-child]:border-b-0">
          {open.length === 0 && !adding ? <li className="py-6 text-base text-ink-muted">{projectsCopy.overview.todosEmpty}</li> : null}
          {open.map((todo) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              onToggle={toggle}
              now={now}
              meta={todo.origin}
              trailing={
                todo.runId ? (
                  <a href={href({ name: "run", runId: todo.runId })} className="text-sm font-semibold text-accent no-underline hover:underline">
                    {L.todos.delegated(todo.runId)}
                  </a>
                ) : (
                  <LinkArrow href={href({ name: "delegate", todoId: todo.id })} className="text-sm">
                    {L.todos.delegate}
                  </LinkArrow>
                )
              }
            />
          ))}
          {adding ? (
            <li>
              <AddTodoForm projectId={props.project.id} onClose={() => setAdding(false)} />
            </li>
          ) : null}
        </ul>
      )}
      {waits.length ? (
        <section aria-labelledby="tab-waiting" className="flex flex-col gap-4">
          <h3 id="tab-waiting" className="m-0 text-xl font-semibold text-ink">
            {L.todos.waiting} <span className="font-normal text-ink-muted">· {waits.length}</span>
          </h3>
          <ListPanel>
            {waits.map((entry) => (
              <Line key={entry.id} title={entry.title} meta={L.todos.waitingMeta(entry.person.name, entry.person.org)} trailing={<span className="text-sm text-ink-muted">{dayLabel(entry.askedAt, now)}</span>} />
            ))}
          </ListPanel>
        </section>
      ) : null}
      {done.length ? (
        <Disclosure label={L.todos.done(done.length)} size="md" panelClassName="ps-0 pt-3">
          <ul className="m-0 list-none rounded-card bg-surface-raised px-6 py-2 lg:px-8 [&>li:last-child]:border-b-0">
            {done.map((todo) => (
              <TodoRow key={todo.id} todo={todo} onToggle={toggle} now={now} />
            ))}
          </ul>
        </Disclosure>
      ) : null}
    </TabPage>
  );
}

export function RunsTab(props: { project: Project }) {
  const runs = useRuns();
  const list = useMemo(() => (runs.data ?? []).filter((run) => run.projectId === props.project.id).sort((a, b) => b.updatedAt - a.updatedAt), [runs.data, props.project.id]);
  return (
    <TabPage title={L.runs.title} lead={L.runs.lead} count={runs.data ? list.length : undefined} action={<LinkArrow href={href({ name: "runs" })}>{projectsCopy.overview.allRuns}</LinkArrow>}>
      {runs.isLoading ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty title={L.runs.empty} body={L.runs.emptyBody} action={<LinkArrow href={href({ name: "delegate", todoId: null })}>{projectsCopy.header.delegate}</LinkArrow>} />
      ) : (
        <ul className="m-0 list-none rounded-card bg-surface-raised px-6 py-2 lg:px-8 [&>li:last-child]:border-b-0 [&>li]:border-line">
          {list.map((run) => (
            <RunRow key={run.id} run={run} />
          ))}
        </ul>
      )}
    </TabPage>
  );
}

export function OutputsTab(props: { project: Project; brief: ProjectBrief | null | undefined }) {
  const outputs = props.brief?.outputs ?? [];
  return (
    <TabPage title={L.outputs.title} lead={L.outputs.lead} count={props.brief ? outputs.length : undefined}>
      {props.brief === undefined ? (
        <Loading />
      ) : outputs.length === 0 ? (
        <Empty title={L.outputs.empty} body={L.outputs.emptyBody} />
      ) : (
        <ListPanel>
          {outputs.map((output) => (
            <Line
              key={output.id}
              leading={<FileText className="size-5" aria-hidden="true" />}
              title={output.title}
              meta={output.meta}
              trailing={output.runId ? <LinkArrow href={href({ name: "run", runId: output.runId })} className="text-sm">{L.outputs.fromRun(output.runId)}</LinkArrow> : null}
            />
          ))}
        </ListPanel>
      )}
    </TabPage>
  );
}

const SOURCE_ICON: Record<SourceKind, ReactNode> = {
  email: <Mail className="size-5" aria-hidden="true" />,
  ticket: <Ticket className="size-5" aria-hidden="true" />,
  calendar: <FileText className="size-5" aria-hidden="true" />,
  library: <FileText className="size-5" aria-hidden="true" />,
  decision: <FileText className="size-5" aria-hidden="true" />,
  file: <FileText className="size-5" aria-hidden="true" />,
  chat: <FileText className="size-5" aria-hidden="true" />,
  web: <FileText className="size-5" aria-hidden="true" />,
  link: <FileText className="size-5" aria-hidden="true" />,
};

export function SourcesTab(props: { project: Project; brief: ProjectBrief | null | undefined }) {
  const sources = props.brief?.sources ?? [];
  return (
    <TabPage title={L.sources.title} lead={L.sources.lead} count={props.brief ? sources.length : undefined}>
      {props.brief === undefined ? (
        <Loading />
      ) : sources.length === 0 ? (
        <Empty title={L.sources.empty} body={L.sources.emptyBody} />
      ) : (
        <ListPanel>
          {sources.map((source) => (
            <Line
              key={source.id}
              leading={SOURCE_ICON[source.kind]}
              title={source.title}
              href={source.href}
              meta={`${projectsCopy.sourceKind[source.kind]}${source.meta ? ` · ${source.meta}` : ""}`}
            />
          ))}
        </ListPanel>
      )}
    </TabPage>
  );
}

export function DecisionsTab(props: { project: Project; brief: ProjectBrief | null | undefined }) {
  const decisions = props.brief?.decisions ?? [];
  return (
    <TabPage title={L.decisions.title} lead={L.decisions.lead} count={props.brief ? decisions.length : undefined}>
      {props.brief === undefined ? (
        <Loading />
      ) : decisions.length === 0 ? (
        <Empty title={L.decisions.empty} body={L.decisions.emptyBody} />
      ) : (
        <ListPanel>
          {decisions.map((decision) => (
            <Line
              key={decision.id}
              title={decision.title}
              href={href({ name: "library-page", pageId: decision.id })}
              body={decision.body}
              trailing={<StatusBadge kind="done">{decision.state}</StatusBadge>}
            />
          ))}
        </ListPanel>
      )}
    </TabPage>
  );
}

const ACTOR_ICON: Record<ActivityActor, ReactNode> = {
  you: <User className="size-4" aria-hidden="true" />,
  agent: <Bot className="size-4" aria-hidden="true" />,
  colleague: <Users className="size-4" aria-hidden="true" />,
  app: <Building2 className="size-4" aria-hidden="true" />,
};

export function ActivityTab(props: { project: Project }) {
  const activity = useActivity();
  const now = Math.floor(Date.now() / 60_000) * 60_000;
  const entries = useMemo(() => (activity.data ?? []).filter((entry) => entry.projectId === props.project.id).sort((a, b) => b.at - a.at), [activity.data, props.project.id]);
  return (
    <TabPage title={L.activity.title} lead={L.activity.lead} action={<LinkArrow href={href({ name: "activity", view: "all" })}>{L.activity.all}</LinkArrow>}>
      {activity.isLoading ? (
        <Loading />
      ) : entries.length === 0 ? (
        <Empty title={L.activity.empty} />
      ) : (
        <ListPanel>
          {entries.map((entry) => (
            <li key={entry.id} className="grid gap-x-6 gap-y-1 border-b border-line py-4 sm:grid-cols-[9rem_1fr_auto] sm:items-baseline">
              <time dateTime={new Date(entry.at).toISOString()} className="text-sm tabular-nums text-ink-muted">
                {activityLabel(entry.at, now)}
                {activityLabel(entry.at, now).startsWith(projectsCopy.today("")) ? "" : ` ${timeLabel(entry.at)}`}
              </time>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-lg text-ink">{entry.text}</span>
                <span className="flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
                  {ACTOR_ICON[entry.actor]}
                  {entry.actorName}
                  {entry.basis ? ` · ${L.activity.basis(entry.basis)}` : ""}
                </span>
              </span>
              {entry.runId ? (
                <LinkArrow href={href({ name: "run", runId: entry.runId })} className="text-sm">
                  {entry.runId}
                </LinkArrow>
              ) : (
                <span />
              )}
            </li>
          ))}
        </ListPanel>
      )}
    </TabPage>
  );
}

