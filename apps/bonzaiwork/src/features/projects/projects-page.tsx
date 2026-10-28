import { memo, useEffect, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, ChevronDown, Ellipsis, FolderPlus, Pencil, Pin, PinOff, Plus, Search, SlidersHorizontal, Trash2 } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys, projectHasKey, useProjects, useStatus, useUsage } from "~/backend/queries";
import type { Project, ProjectSummary } from "~/backend/types";
import { PromptDialog } from "~/components/prompt-dialog";
import { ProjectIcon } from "~/components/project-icon";
import { PageTitle, TopBar } from "~/components/top-bar";
import { Button } from "~/components/ui/button";
import { Menu, MenuItem, MenuSeparator } from "~/components/ui/menu";
import { EmptyState, Locked, Skeleton } from "~/components/ui/misc";
import { ConfirmDialog } from "~/components/ui/overlay";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { formatMoney, formatWhen, relativeTime } from "~/lib/format";
import { href, navigate } from "~/lib/router";
import { readLocal, writeLocal } from "~/lib/storage";
import { SMALL_UP, useMediaQuery } from "~/lib/use-media";

import { useUi } from "../shell/ui-store";

type Sort = "activity" | "name";

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
        <MenuItem icon={<SlidersHorizontal />} onClick={() => navigate({ name: "project-settings", projectId: project.id, section: "general" })}>
          {copy.projects.settings}
        </MenuItem>
        {project.archivedAt ? (
          <MenuItem icon={<ArchiveRestore />} onClick={() => void update({ archived: false }, copy.projects.restored)}>
            {copy.projects.unarchive}
          </MenuItem>
        ) : (
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

function SpendValue(props: { projectId: string }) {
  const usage = useUsage(props.projectId);
  if (!usage.data || usage.data.spend <= 0) return null;
  const nearBudget = usage.data.maxBudget !== null && usage.data.spend >= usage.data.maxBudget * 0.9;
  return (
    <span className={cn("tabular-nums", nearBudget && "text-warning-foreground")}>
      {copy.projects.spend(formatMoney(usage.data.spend, usage.data.currency))}
    </span>
  );
}

/** Memoized: summaries and usage resolve one project at a time, and each one should repaint only its own row. */
const ProjectRow = memo(function ProjectRow(props: { project: Project; summary: ProjectSummary | undefined; hasKey: boolean; now: number; wide: boolean }) {
  const { project, summary } = props;
  const meta: string[] = [];
  if (summary) {
    meta.push(summary.chatCount ? copy.projects.chats(summary.chatCount) : copy.projects.noChats);
    if (summary.lastActivityAt) meta.push(relativeTime(summary.lastActivityAt, props.now));
    if (summary.nextRoutineAt) meta.push(copy.projects.nextRoutine(formatWhen(summary.nextRoutineAt, props.now)));
  }
  return (
    <li className="group/row relative flex items-center gap-3 border-b border-border py-3 ps-1 pe-1 last:border-b-0 sm:gap-4">
      <ProjectIcon icon={project.icon} color={project.color} size="lg" />
      <div className="min-w-0 flex-1">
        <a href={href({ name: "project", projectId: project.id, chatId: null })} data-testid="workspace-item" className="block truncate text-sm font-semibold text-foreground after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring">
          {project.name}
        </a>
        {project.description ? <p className="truncate text-sm text-muted-foreground">{project.description}</p> : null}
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-subtle-foreground">
          {!props.wide && summary?.waitingCount ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-amber-11">
              <span className="size-1.5 rounded-full bg-amber-9" />
              {copy.projects.waiting(summary.waitingCount)}
            </span>
          ) : null}
          {summary ? meta.map((item) => <span key={item}>{item}</span>) : <Skeleton className="my-0.5 h-3 w-40" />}
          {!props.hasKey ? (
            <Locked>{copy.keys.missing}</Locked>
          ) : null}
        </p>
      </div>
      {props.wide ? (
        <div className="relative z-10 flex shrink-0 flex-col items-end gap-1 text-xs">
          <div className="flex items-center gap-2">
            {summary?.waitingCount ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-3 px-2 py-0.5 font-medium text-amber-11">
                <span className="size-1.5 rounded-full bg-amber-9" />
                {copy.projects.waiting(summary.waitingCount)}
              </span>
            ) : null}
            {summary?.runningCount ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-electric-3 px-2 py-0.5 font-semibold text-electric-11">
                <span className="bw-pulse size-1.5 rounded-full bg-electric-9" />
                {copy.projects.running(summary.runningCount)}
              </span>
            ) : null}
          </div>
          <span className="text-subtle-foreground">
            <SpendValue projectId={project.id} />
          </span>
        </div>
      ) : null}
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
        <li key={index} className="flex items-center gap-3 border-b border-border py-3 ps-1 pe-1 sm:gap-4">
          <Skeleton className="size-10 shrink-0 rounded-lg" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-48 max-w-full" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ProjectsPage() {
  const backend = useBackend();
  const status = useStatus();
  const projects = useProjects();
  const setNewProject = useUi((state) => state.setNewProject);
  // Status and spend sit in a column phones have no room for; there it is not rendered (or fetched) at all.
  const wide = useMediaQuery(SMALL_UP);
  const [query, setQuery] = useState("");
  const [sort, setSortState] = useState<Sort>(() => (readLocal("bonzaiwork.projectSort") === "name" ? "name" : "activity"));
  const [showArchived, setShowArchived] = useState(false);
  // Whole minutes: relative times only change per minute, and a steady value keeps the memoized rows from repainting.
  const now = Math.floor(Date.now() / 60_000) * 60_000;
  const list = projects.data ?? [];

  const summaries = useQueries({
    queries: list.map((project) => ({
      queryKey: keys.summary(project.id),
      queryFn: () => backend.projects.summary(project.id),
      staleTime: 10_000,
      refetchInterval: 20_000,
    })),
  });
  const summaryById = new Map(list.map((project, index) => [project.id, summaries[index]?.data]));
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

  const { pinned, others, archived } = (() => {
    const needle = query.trim().toLowerCase();
    const matching = list.filter((project) => !needle || project.name.toLowerCase().includes(needle) || (project.description ?? "").toLowerCase().includes(needle));
    const activity = (project: Project) => summaryById.get(project.id)?.lastActivityAt ?? 0;
    const sorted = [...matching].sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name, "nl") : activity(b) - activity(a) || a.name.localeCompare(b.name, "nl")));
    const active = sorted.filter((project) => !project.archivedAt);
    return { pinned: active.filter((project) => project.pinned), others: active.filter((project) => !project.pinned), archived: sorted.filter((project) => project.archivedAt) };
  })();

  const readOnly = status.data?.readOnly ?? false;
  const total = list.filter((project) => !project.archivedAt).length;

  const renderList = (items: Project[]) => (
    <ul className="border-t border-border">
      {items.map((project) => (
        <ProjectRow key={project.id} project={project} summary={summaryById.get(project.id)} hasKey={projectHasKey(status.data, project)} now={now} wide={wide} />
      ))}
    </ul>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar
        actions={
          <Button variant="primary" onClick={() => setNewProject(true)} disabled={readOnly} data-testid="new-workspace">
            <Plus />
            <span className="max-sm:sr-only">{copy.projects.new}</span>
          </Button>
        }
      >
        <PageTitle>{copy.projects.title}</PageTitle>
      </TopBar>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-4 pt-5 pb-16 sm:px-6 sm:pt-8">
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
          ) : total === 0 && archived.length === 0 && !query ? (
            <EmptyState
              icon={<FolderPlus />}
              title={copy.projects.emptyTitle}
              body={copy.projects.emptyBody}
              action={
                <Button variant="primary" size="lg" onClick={() => setNewProject(true)} disabled={readOnly}>
                  <Plus />
                  {copy.projects.new}
                </Button>
              }
            />
          ) : (
            <>
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

              {settling ? <SkeletonRows count={Math.min(pinned.length + others.length, 8)} /> : null}
              {pinned.length + others.length === 0 && query ? <p className="py-10 text-center text-sm text-muted-foreground">{copy.projects.noMatches(query)}</p> : null}
              {!settling && pinned.length ? (
                <section className="mb-8" aria-label={copy.nav.pinned}>
                  <h2 className="mb-1 text-xs font-medium text-subtle-foreground">{copy.nav.pinned}</h2>
                  {renderList(pinned)}
                </section>
              ) : null}
              {!settling && others.length ? (
                <section aria-label={copy.nav.projects}>
                  {pinned.length ? <h2 className="mb-1 text-xs font-medium text-subtle-foreground">{copy.nav.projects}</h2> : null}
                  {renderList(others)}
                </section>
              ) : null}
              {archived.length ? (
                <div className="mt-8">
                  <Button variant="quiet" size="sm" onClick={() => setShowArchived((value) => !value)} aria-expanded={showArchived}>
                    <Archive />
                    {showArchived ? copy.projects.hideArchived : `${copy.projects.showArchived} (${archived.length})`}
                  </Button>
                  {showArchived ? <div className="mt-2 opacity-80">{renderList(archived)}</div> : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
