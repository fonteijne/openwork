import { memo, useEffect, useMemo, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, ChevronDown, Ellipsis, FolderPlus, Pencil, Pin, PinOff, Plus, Search, SlidersHorizontal, Trash2 } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys, projectHasKey, useAttention, usePersonalBrain, useProjects, useStatus, useUsage } from "~/backend/queries";
import type { AttentionItem, Project, ProjectSummary } from "~/backend/types";
import { PromptDialog } from "~/components/prompt-dialog";
import { ProjectIcon } from "~/components/project-icon";
import { PageTitle, TopBar } from "~/components/top-bar";
import { Button } from "~/components/ui/button";
import { StatusChip, type ChipStatus } from "~/components/ui/chip";
import { Disclosure } from "~/components/ui/disclosure";
import { Menu, MenuItem, MenuSeparator } from "~/components/ui/menu";
import { EmptyState, Skeleton } from "~/components/ui/misc";
import { ConfirmDialog } from "~/components/ui/overlay";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { formatMoney, relativeTime } from "~/lib/format";
import { href, navigate, type Route } from "~/lib/router";
import { readLocal, writeLocal } from "~/lib/storage";
import { SMALL_UP, useMediaQuery } from "~/lib/use-media";

import { useUi } from "../shell/ui-store";

type Sort = "activity" | "name";

/** Search and sort only earn their row above this many projects (brief: "> 8"). */
const SEARCHABLE_FROM = 8;

/** The first thing in a project that needs the person; the list is already sorted by urgency. */
function needOf(projectId: string, items: readonly AttentionItem[]): AttentionItem | null {
  return items.find((item) => item.kind !== "proposal" && item.kind !== "world" && item.projectId === projectId) ?? null;
}

/** The chats of a project that wait for a decision, for the row's destination. */
function waitingChats(projectId: string, items: readonly AttentionItem[]): string[] {
  const ids = new Set<string>();
  for (const item of items) {
    if ((item.kind === "permission" || item.kind === "question") && item.projectId === projectId) ids.add(item.chatId);
  }
  return [...ids];
}

function projectStatus(hasKey: boolean, summary: ProjectSummary | undefined, need: AttentionItem | null): ChipStatus {
  if (!hasKey) return "locked";
  if (summary?.waitingCount || need?.kind === "permission" || need?.kind === "question") return "waiting";
  if (summary?.failedCount || need?.kind === "chat_failed") return "failed";
  if (summary?.runningCount) return "running";
  return "idle";
}

function ProjectActions(props: { project: Project }) {
  const backend = useBackend();
  const client = useQueryClient();
  const status = useStatus();
  const [renaming, setRenaming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const { project } = props;
  const readOnly = status.data?.readOnly ?? false;

  const update = async (patch: Parameters<typeof backend.projects.update>[1], message?: string, undo?: Parameters<typeof backend.projects.update>[1]) => {
    try {
      await backend.projects.update(project.id, patch);
      await client.invalidateQueries({ queryKey: keys.projects });
      if (message) toast(message, undo ? { action: { label: copy.common.undo, onClick: () => void update(undo) } } : {});
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await backend.projects.remove(project.id);
      await client.invalidateQueries({ queryKey: keys.projects });
      setRemoving(false);
      toast(copy.projects.removed);
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Menu
        align="end"
        trigger={
          <Button variant="quiet" size="icon-sm" aria-label={`${project.name}: ${copy.projects.rowActions}`}>
            <Ellipsis />
          </Button>
        }
      >
        <MenuItem icon={<Pencil />} onClick={() => setRenaming(true)} disabled={readOnly}>
          {copy.projects.rename}
        </MenuItem>
        <MenuItem icon={project.pinned ? <PinOff /> : <Pin />} onClick={() => void update({ pinned: !project.pinned })}>
          {project.pinned ? copy.projects.unpin : copy.projects.pin}
        </MenuItem>
        <MenuItem icon={<SlidersHorizontal />} onClick={() => navigate({ name: "project-settings", projectId: project.id, group: "project" })}>
          {copy.projects.settings}
        </MenuItem>
        {project.archivedAt ? (
          <MenuItem icon={<ArchiveRestore />} onClick={() => void update({ archived: false }, copy.projects.restored)}>
            {copy.projects.unarchive}
          </MenuItem>
        ) : (
          // Undo over confirm (P8): archiving is reversible from the toast.
          <MenuItem icon={<Archive />} onClick={() => void update({ archived: true }, copy.projects.archived, { archived: false })}>
            {copy.projects.archive}
          </MenuItem>
        )}
        <MenuSeparator />
        <MenuItem icon={<Trash2 />} danger onClick={() => setRemoving(true)} disabled={readOnly}>
          {copy.projects.remove}
        </MenuItem>
      </Menu>
      <PromptDialog
        open={renaming}
        onOpenChange={setRenaming}
        title={copy.projects.rename}
        label={copy.newProject.name}
        initialValue={project.name}
        submitLabel={copy.settings.save}
        onSubmit={async (name) => {
          await backend.projects.update(project.id, { name });
          await client.invalidateQueries({ queryKey: keys.projects });
          toast(copy.settings.saved);
        }}
      />
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={copy.projects.removeTitle(project.name)}
        body={copy.projects.removeBody}
        confirmLabel={copy.projects.removeConfirm}
        onConfirm={() => void remove()}
        busy={busy}
      />
    </>
  );
}

/** Real spend, only where it exists: `capabilities.usage` and a key per project (brief). */
function SpendValue(props: { projectId: string }) {
  const usage = useUsage(props.projectId);
  if (!usage.data || usage.data.spend <= 0) return null;
  const nearBudget = usage.data.maxBudget !== null && usage.data.spend >= usage.data.maxBudget * 0.9;
  return <span className={cn("shrink-0 text-xs tabular-nums text-subtle-foreground", nearBudget && "font-medium text-warning-foreground")}>{formatMoney(usage.data.spend, usage.data.currency)}</span>;
}

const SECOND_LINK = "relative z-10 truncate text-xs text-electric-11 underline-offset-2 hover:underline";

/** The second line: the thing that needs the person as a real link, else chats · last activity. */
function SecondLine(props: { project: Project; summary: ProjectSummary | undefined; need: AttentionItem | null; now: number }) {
  const { project, summary, need } = props;
  if (need?.kind === "permission" || need?.kind === "question" || need?.kind === "chat_failed") {
    return (
      <a href={href({ name: "project", projectId: project.id, chatId: need.chatId })} className={SECOND_LINK} data-testid="project-need">
        {need.chatTitle}
      </a>
    );
  }
  if (need?.kind === "routine") {
    return (
      <a href={href({ name: "project-routines", projectId: project.id, routineId: need.routineId })} className={SECOND_LINK} data-testid="project-need">
        {need.name} · {copy.projects.routineReason[need.reason]}
      </a>
    );
  }
  if (need?.kind === "brain") {
    return (
      <a href={href({ name: "project-brain", projectId: project.id })} className={SECOND_LINK} data-testid="project-need">
        {copy.project.tabs.brain} · {copy.brain.states[need.state]}
      </a>
    );
  }
  if (project.archivedAt) return <span className="truncate text-xs text-muted-foreground">{copy.projects.archivedAt(relativeTime(project.archivedAt, props.now))}</span>;
  if (!summary) return <Skeleton className="my-1 h-3 w-32" />;
  const chats = summary.chatCount ? copy.projects.chats(summary.chatCount) : copy.projects.noChats;
  return <span className="truncate text-xs text-muted-foreground">{summary.lastActivityAt ? copy.projects.activity(chats, relativeTime(summary.lastActivityAt, props.now)) : chats}</span>;
}

/**
 * One compact row (S2, 44–48px): tile · name · second line; StatusChip (icon + word, V2/C5), spend
 * and the ⋯ menu on the right. The row's own link opens the one waiting chat when exactly one
 * waits (assessment I-3), otherwise the project. Memoized: summaries and spend arrive one project
 * at a time and should repaint only their own row.
 */
const ProjectRow = memo(function ProjectRow(props: { project: Project; summary: ProjectSummary | undefined; need: AttentionItem | null; waiting: readonly string[]; hasKey: boolean; showSpend: boolean; now: number }) {
  const { project, summary, need } = props;
  const chip = projectStatus(props.hasKey, summary, need);
  const target: Route = props.waiting.length === 1 && props.waiting[0] ? { name: "project", projectId: project.id, chatId: props.waiting[0] } : { name: "project", projectId: project.id, chatId: null };
  return (
    <li className="group/row relative flex min-h-11 items-center gap-3 border-b border-border py-1.5 last:border-b-0" data-testid="project-row">
      <ProjectIcon icon={project.icon} color={project.color} size="md" />
      <div className="flex min-w-0 flex-1 flex-col">
        <a
          href={href(target)}
          data-testid="workspace-item"
          className="truncate text-sm font-medium text-foreground after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          {project.name}
        </a>
        <SecondLine project={project} summary={summary} need={need} now={props.now} />
      </div>
      {project.pinned ? <Pin role="img" aria-label={copy.projects.pinned} className="size-3.5 shrink-0 text-subtle-foreground" /> : null}
      <StatusChip status={chip} label={chip === "locked" ? copy.shell.status.locked : undefined} className="shrink-0" />
      {props.showSpend ? <SpendValue projectId={project.id} /> : null}
      <div className="relative z-10 shrink-0">
        <ProjectActions project={project} />
      </div>
    </li>
  );
});

function SkeletonRows(props: { count: number }) {
  return (
    <ul className="border-t border-border" aria-busy="true" aria-label={copy.common.loading}>
      {Array.from({ length: props.count }, (_, index) => (
        <li key={index} className="flex min-h-11 items-center gap-3 border-b border-border py-1.5">
          <Skeleton className="size-7 shrink-0 rounded-md" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-40 max-w-full" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Alle projecten (brief §3, §5): compact rows, pinned first then by activity (the sidebar's
 * order; assessment P-5), the second line is what needs the person (useAttention). Archived
 * projects are a collapsed tail; "Mijn brein" lives at #/brein and is not a row here (decision B1).
 */
export function ProjectsPage() {
  const backend = useBackend();
  const status = useStatus();
  const projects = useProjects();
  const attention = useAttention();
  const personalId = usePersonalBrain()?.projectId ?? null;
  const setNewProject = useUi((state) => state.setNewProject);
  const wide = useMediaQuery(SMALL_UP);
  const [query, setQuery] = useState("");
  const [sort, setSortState] = useState<Sort>(() => (readLocal("bonzaiwork.projectSort") === "name" ? "name" : "activity"));
  // Whole minutes: relative times only change per minute, and a steady value keeps the memoized rows from repainting.
  const now = Math.floor(Date.now() / 60_000) * 60_000;
  const listed = useMemo(() => (projects.data ?? []).filter((project) => project.id !== personalId), [projects.data, personalId]);
  const active = useMemo(() => listed.filter((project) => !project.archivedAt), [listed]);
  const items = attention.data ?? [];

  const summaries = useQueries({
    queries: active.map((project) => ({
      queryKey: keys.summary(project.id),
      queryFn: () => backend.projects.summary(project.id),
      staleTime: 10_000,
      refetchInterval: 20_000,
    })),
  });
  const summaryById = new Map(active.map((project, index) => [project.id, summaries[index]?.data]));
  // Sorting by activity needs every summary; until then the order would jump.
  // A slow summary (an engine still starting) never holds the list for long.
  const [settleExpired, setSettleExpired] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettleExpired(true), 1_200);
    return () => window.clearTimeout(timer);
  }, []);
  const settling = sort === "activity" && !settleExpired && summaries.some((entry) => entry.isPending);

  const setSort = (value: Sort) => {
    setSortState(value);
    writeLocal("bonzaiwork.projectSort", value === "name" ? "name" : null);
  };

  const searchable = active.length > SEARCHABLE_FROM;
  const needle = searchable ? query.trim().toLowerCase() : "";
  const matches = (project: Project) => !needle || project.name.toLowerCase().includes(needle) || (project.description ?? "").toLowerCase().includes(needle);
  const activity = (project: Project) => summaryById.get(project.id)?.lastActivityAt ?? 0;
  const byName = (a: Project, b: Project) => a.name.localeCompare(b.name, "nl");
  const order = (a: Project, b: Project) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (sort === "name" || a.pinned) return byName(a, b);
    return activity(b) - activity(a) || byName(a, b);
  };
  const rows = active.filter(matches).sort(order);
  const archived = listed.filter((project) => project.archivedAt && matches(project)).sort(byName);

  const readOnly = status.data?.readOnly ?? false;
  const showSpend = wide && backend.capabilities.usage && status.data?.keyMode === "workspace";

  const renderList = (list: Project[]) => (
    <ul className="border-t border-border">
      {list.map((project) => (
        <ProjectRow
          key={project.id}
          project={project}
          summary={summaryById.get(project.id)}
          need={needOf(project.id, items)}
          waiting={waitingChats(project.id, items)}
          hasKey={projectHasKey(status.data, project)}
          showSpend={showSpend}
          now={now}
        />
      ))}
    </ul>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar
        actions={
          <Button variant="primary" size="sm" onClick={() => setNewProject(true)} disabled={readOnly} data-testid="new-workspace">
            <Plus />
            <span className="max-sm:sr-only">{copy.projects.new}</span>
          </Button>
        }
      >
        <PageTitle>{copy.projects.title}</PageTitle>
      </TopBar>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 pt-4 pb-16 sm:px-6 sm:pt-6">
          {projects.isLoading ? (
            <SkeletonRows count={4} />
          ) : projects.isError ? (
            <EmptyState
              title={copy.errors.network}
              action={
                <Button variant="secondary" onClick={() => void projects.refetch()}>
                  {copy.boot.retry}
                </Button>
              }
            />
          ) : active.length === 0 && archived.length === 0 ? (
            // One invitation, no explanation (C6, P2).
            <EmptyState
              icon={<FolderPlus />}
              title={copy.projects.emptyTitle}
              action={
                <Button variant="primary" size="lg" onClick={() => setNewProject(true)} disabled={readOnly}>
                  <Plus />
                  {copy.projects.new}
                </Button>
              }
            />
          ) : (
            <>
              {searchable ? (
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <div className="relative min-w-0 flex-1 basis-56">
                    <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
                    <input
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={copy.projects.searchPlaceholder}
                      aria-label={copy.projects.searchPlaceholder}
                      className="h-8 w-full rounded-full bg-background ps-8 pe-3.5 text-sm ring-1 ring-inset ring-input placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:text-[16px] pointer-coarse:h-10"
                    />
                  </div>
                  {/* Native: two options need no popup, and phones get their own picker. */}
                  <div className="relative shrink-0">
                    <select
                      value={sort}
                      onChange={(event) => setSort(event.target.value === "name" ? "name" : "activity")}
                      aria-label={copy.projects.sortLabel}
                      className="h-8 min-w-36 appearance-none rounded-full bg-background ps-3.5 pe-8 text-sm text-foreground ring-1 ring-inset ring-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:text-[16px] pointer-coarse:h-10"
                    >
                      <option value="activity">{copy.projects.sortActivity}</option>
                      <option value="name">{copy.projects.sortName}</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute end-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle-foreground" />
                  </div>
                </div>
              ) : null}

              {settling ? <SkeletonRows count={Math.min(rows.length, 8)} /> : null}
              {!settling && rows.length === 0 && needle ? <p className="py-10 text-center text-sm text-muted-foreground">{copy.projects.noMatches(query)}</p> : null}
              {!settling && rows.length ? <section aria-label={copy.nav.projects}>{renderList(rows)}</section> : null}
              {archived.length ? (
                // The archive as a collapsed tail (S3): label only, rows below when opened.
                <Disclosure label={copy.projects.archivedCount(archived.length)} size="sm" className="mt-6" panelClassName="ps-0 pt-2 opacity-80" testId="projects-archived">
                  {renderList(archived)}
                </Disclosure>
              ) : null}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
