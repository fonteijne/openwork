import { useMemo, useState, type ReactNode } from "react";

import type { Run, Werkwijze } from "~/backend/cockpit";
import { useCockpit, useRuns, useWerkwijzen } from "~/backend/cockpit-queries";
import { useProjects, useRecentChats } from "~/backend/queries";
import type { Chat, ChatStatus } from "~/backend/types";
import { Accent, Band, DataTable, FilterChip, LinkArrow, LockedNote, PageHero, Panel, PermissionLine, PermissionList, StatusBadge, Tag, dot, type StatusKind } from "~/components/io";
import { Button } from "~/components/ui/button";
import { EmptyState, Skeleton } from "~/components/ui/misc";
import { runsCopy } from "~/copy/runs";
import { relativeTime } from "~/lib/format";
import { href, navigate } from "~/lib/router";

import { InkSegmented, RunStatusBadge, formatDay, formatUpdated, matchesFilter, runHref, sortRuns, type RunFilter } from "./parts";

const copy = runsCopy.overview;

type View = "runs" | "chats" | "werkwijzen";
const FILTERS: RunFilter[] = ["all", "needsYou", "working", "done", "failed"];

/** Runs overview (design: v2-Runs): every run across chats, to-dos and projects, what needs you first. */
export function RunsPage() {
  const [view, setView] = useState<View>("runs");
  const [filter, setFilter] = useState<RunFilter>("all");
  const cockpit = useCockpit();
  const runs = useRuns();
  const sorted = useMemo(() => sortRuns(runs.data ?? []), [runs.data]);
  const visible = sorted.filter((run) => matchesFilter(run, filter));

  return (
    <>
      <PageHero
        documentTitle={copy.documentTitle}
        eyebrow={copy.eyebrow}
        title={
          <>
            {copy.titleBefore}
            <Accent>{copy.titleAccent}</Accent>
            {copy.titleAfter}
          </>
        }
        lead={copy.lead}
        actions={
          <Button variant="primary" size="xl" onClick={() => navigate({ name: "delegate", todoId: null })}>
            {copy.delegate}
          </Button>
        }
      />
      <Band tone="alt" className="lg:pt-12" inner="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
          <InkSegmented
            value={view}
            onValueChange={setView}
            label={copy.views.label}
            items={[
              { value: "runs", label: copy.views.runs },
              { value: "chats", label: copy.views.chats },
              { value: "werkwijzen", label: copy.views.werkwijzen },
            ]}
          />
          {view === "runs" ? (
            <>
              <div role="group" aria-label={copy.filters.label} className="flex flex-wrap gap-2">
                {FILTERS.map((key) => (
                  <FilterChip key={key} active={filter === key} onClick={() => setFilter(key)} className="bg-surface-alt">
                    {copy.filters[key]} · {sorted.filter((run) => matchesFilter(run, key)).length}
                  </FilterChip>
                ))}
              </div>
              <span className="text-sm text-ink-muted lg:ms-auto">{copy.sorted}</span>
            </>
          ) : null}
        </div>

        {cockpit.capabilities.runs ? (
          <LockedNote title={copy.empty}>{cockpit.capabilities.runs}</LockedNote>
        ) : view === "runs" ? (
          <RunsTable runs={visible} loading={runs.isLoading} error={runs.isError} onRetry={() => void runs.refetch()} filtered={filter !== "all"} onClearFilter={() => setFilter("all")} />
        ) : view === "chats" ? (
          <ChatsTable />
        ) : (
          <WerkwijzenGrid />
        )}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="m-0 text-sm text-ink-muted">{copy.footer}</p>
          <span className="flex flex-wrap items-center gap-3 text-sm text-ink-muted">
            {copy.routinesHint}
            <LinkArrow href={href({ name: "routines", routineId: null })}>{copy.routines}</LinkArrow>
          </span>
        </div>
      </Band>
    </>
  );
}

function useProjectNames(): Map<string, string> {
  const projects = useProjects();
  return useMemo(() => new Map((projects.data ?? []).map((project) => [project.id, project.name])), [projects.data]);
}

function TableShell(props: { children: ReactNode }) {
  return <div className="rounded-[24px] bg-surface-raised px-6 pt-6 lg:px-8">{props.children}</div>;
}

function RunsTable(props: { runs: Run[]; loading: boolean; error: boolean; onRetry: () => void; filtered: boolean; onClearFilter: () => void }) {
  const names = useProjectNames();
  if (props.loading) return <TableSkeleton />;
  if (props.error)
    return (
      <Panel>
        <EmptyState title={copy.error} action={<Button variant="secondary" size="lg" onClick={props.onRetry}>{copy.retry}</Button>} />
      </Panel>
    );
  if (props.runs.length === 0)
    return (
      <Panel>
        {props.filtered ? (
          <EmptyState title={copy.emptyFilter} body={copy.emptyFilterBody} action={<Button variant="secondary" size="lg" onClick={props.onClearFilter}>{copy.filters.all}</Button>} />
        ) : (
          <EmptyState title={copy.empty} body={copy.emptyBody} action={<Button variant="primary" size="lg" onClick={() => navigate({ name: "delegate", todoId: null })}>{copy.delegate}</Button>} />
        )}
      </Panel>
    );
  return (
    <TableShell>
      <DataTable
        label={copy.tableLabel(props.runs.length)}
        className="[&_table]:min-w-[1040px]"
        head={[copy.head.status, copy.head.run, copy.head.progress, copy.head.waitingOn, copy.head.due, copy.head.updated]}
        align={["start", "start", "start", "start", "start", "end"]}
      >
        {props.runs.map((run) => {
          const [progress, progressDetail] = splitProgress(run.progress);
          const forYou = run.waitingOn.startsWith("Jij");
          const nothing = run.waitingOn === "Niets";
          return (
            <tr key={run.id}>
              <td className="w-[210px]">
                <RunStatusBadge status={run.status} className="text-[13px] leading-4" />
              </td>
              <td className="min-w-[280px]">
                <a href={runHref(run)} className="block text-lg font-semibold text-ink no-underline hover:underline">
                  {run.title}
                </a>
                <span className="text-sm text-ink-muted">{dot(run.id, run.werkwijzeName, run.projectId ? (names.get(run.projectId) ?? null) : runsCopy.run.noProject)}</span>
              </td>
              <td className="w-[150px] text-base text-ink">
                {progress}
                {progressDetail ? <span className="block text-ink-muted">{progressDetail}</span> : null}
              </td>
              <td className="min-w-[220px] text-base">
                <span className={forYou ? "font-semibold text-ink" : nothing ? "text-ink-muted" : "text-ink"}>{run.waitingOn}</span>
                {run.waitingDetail ? <span className="block text-ink-muted">{run.waitingDetail}</span> : null}
              </td>
              <td className={run.due ? "whitespace-nowrap text-base text-ink" : "whitespace-nowrap text-base text-ink-muted"}>{run.due ? formatDay(run.due) : runsCopy.noDate}</td>
              <td className="whitespace-nowrap text-end text-base text-ink-muted">{formatUpdated(run.updatedAt)}</td>
            </tr>
          );
        })}
      </DataTable>
    </TableShell>
  );
}

/** "Stap 3 van 5 · leest 4 bronnen" → ["Stap 3 van 5", "Leest 4 bronnen"]. */
function splitProgress(progress: string): [string, string | null] {
  const [first, ...rest] = progress.split(" · ");
  const detail = rest.join(" · ");
  return [first ?? progress, detail ? detail.charAt(0).toUpperCase() + detail.slice(1) : null];
}

function TableSkeleton() {
  return (
    <TableShell>
      <div className="flex flex-col gap-0 pb-6" aria-hidden="true">
        <Skeleton className="mb-4 h-4 w-2/3" />
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="flex items-start gap-6 border-t border-line py-5">
            <Skeleton className="h-6 w-40 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <Skeleton className="h-5 w-24" />
          </div>
        ))}
      </div>
    </TableShell>
  );
}

const CHAT_KIND: Record<ChatStatus, StatusKind> = { running: "working", waiting: "answer", failed: "failed", idle: "done" };

function ChatsTable() {
  const projects = useProjects();
  const chats = useRecentChats();
  const names = useProjectNames();
  if (projects.data && projects.data.length === 0) return <LockedNote title={copy.chatsEmpty}>{copy.chatsLocked}</LockedNote>;
  if (chats.isLoading || projects.isLoading) return <TableSkeleton />;
  if (chats.isError)
    return (
      <Panel>
        <EmptyState title={copy.error} action={<Button variant="secondary" size="lg" onClick={() => void chats.refetch()}>{copy.retry}</Button>} />
      </Panel>
    );
  const rows: Chat[] = (chats.data ?? []).filter((chat) => !chat.archived && !chat.parentId);
  if (rows.length === 0)
    return (
      <Panel>
        <EmptyState title={copy.chatsEmpty} body={copy.chatsEmptyBody} />
      </Panel>
    );
  return (
    <TableShell>
      <DataTable label={copy.chatsLabel} head={[copy.chatsHead.status, copy.chatsHead.chat, copy.chatsHead.updated]} align={["start", "start", "end"]} className="[&_table]:min-w-[560px]">
        {rows.map((chat) => (
          <tr key={`${chat.projectId}/${chat.id}`}>
            <td className="w-[210px]">
              <StatusBadge kind={CHAT_KIND[chat.status]} className="text-[13px] leading-4">
                {runsCopy.chatStatus[chat.status]}
              </StatusBadge>
            </td>
            <td>
              <a href={href({ name: "project", projectId: chat.projectId, chatId: chat.id })} className="block text-lg font-semibold text-ink no-underline hover:underline">
                {chat.title}
              </a>
              <span className="text-sm text-ink-muted">{dot(names.get(chat.projectId) ?? null, chat.preview)}</span>
            </td>
            <td className="whitespace-nowrap text-end text-base text-ink-muted">{relativeTime(chat.updatedAt)}</td>
          </tr>
        ))}
      </DataTable>
    </TableShell>
  );
}

function WerkwijzenGrid() {
  const werkwijzen = useWerkwijzen(null);
  const names = useProjectNames();
  if (werkwijzen.isLoading)
    return (
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-72 rounded-[24px]" />
        ))}
      </div>
    );
  const list: Werkwijze[] = werkwijzen.data ?? [];
  if (list.length === 0)
    return (
      <Panel>
        <EmptyState title={copy.werkwijzenEmpty} body={copy.werkwijzenEmptyBody} action={<LinkArrow href={href({ name: "settings", group: "werkwijzen" })}>{copy.werkwijzenManage}</LinkArrow>} />
      </Panel>
    );
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {list.map((werkwijze) => (
          <Panel key={werkwijze.id} as="article" className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <Tag>{werkwijze.projectId ? (names.get(werkwijze.projectId) ?? copy.origin.project) : copy.origin[werkwijze.origin]}</Tag>
              <span className="text-sm text-ink-muted">{dot(copy.werkwijzeVersion(werkwijze.version), copy.werkwijzeStages(werkwijze.stages.length))}</span>
            </div>
            <h3 className="m-0 text-xl font-semibold text-ink">{werkwijze.name}</h3>
            <ol className="m-0 flex list-none flex-col gap-1.5 border-t border-line p-0 pt-4">
              {werkwijze.stages.map((stage, index) => (
                <li key={stage} className="flex gap-3 text-base text-ink">
                  <span className="w-6 shrink-0 text-ink-muted">{String(index + 1).padStart(2, "0")}</span>
                  {stage}
                </li>
              ))}
            </ol>
            <PermissionList className="border-t border-line pt-4">
              {werkwijze.grants.map((grant) => (
                <PermissionLine key={grant.text} kind={grant.kind}>
                  {grant.text}
                </PermissionLine>
              ))}
            </PermissionList>
            <p className="m-0 mt-auto text-sm text-ink-muted">{werkwijze.label}</p>
          </Panel>
        ))}
      </div>
      <LinkArrow href={href({ name: "settings", group: "werkwijzen" })}>{copy.werkwijzenManage}</LinkArrow>
    </div>
  );
}
