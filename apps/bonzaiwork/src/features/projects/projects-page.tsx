import { useMemo, useState, type MouseEvent } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Check, Ellipsis, FolderPlus, Pencil, Pin, PinOff, Search, SlidersHorizontal, Trash2, TriangleAlert } from "lucide-react";

import type { Area, ProjectBrief, ProjectState, Todo } from "~/backend/cockpit";
import { useAreas, useBriefs, useCockpit, useCockpitRefresh, useTodos } from "~/backend/cockpit-queries";
import { useBackend } from "~/backend/context";
import { keys, projectHasKey, usePersonalBrain, useProjects, useStatus } from "~/backend/queries";
import type { Project, ProjectSummary } from "~/backend/types";
import { Accent, Band, DataTable, PageHero, StatusBadge, Tag } from "~/components/io";
import { PromptDialog } from "~/components/prompt-dialog";
import { Button } from "~/components/ui/button";
import { Menu, MenuItem, MenuSeparator } from "~/components/ui/menu";
import { Skeleton } from "~/components/ui/misc";
import { ConfirmDialog } from "~/components/ui/overlay";
import { SegmentedControl } from "~/components/ui/segmented";
import { Select } from "~/components/ui/select";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { projectsCopy } from "~/copy/projects";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { href, navigate } from "~/lib/router";
import { readLocal, writeLocal } from "~/lib/storage";

import { activityLabel, dayLabel } from "../project/dates";

type Sort = "activity" | "deadline" | "name";
const SORTS: readonly Sort[] = ["activity", "deadline", "name"];
const STATES: readonly ProjectState[] = ["active", "on_hold", "completed"];
const C = projectsCopy.index;

function isSort(value: string | null): value is Sort {
  return SORTS.some((sort) => sort === value);
}

/** The state the index files a project under: archived is always "Afgerond". */
export function projectState(project: Project, brief: ProjectBrief | undefined): ProjectState {
  if (project.archivedAt !== null) return "completed";
  return brief?.state ?? "active";
}

/** The earliest date still ahead (today counts): a to-do's due date or the project's target. */
function nextDeadline(projectId: string, brief: ProjectBrief | undefined, todos: readonly Todo[], now: number): number | null {
  const startToday = new Date(now).setHours(0, 0, 0, 0);
  const dates = todos.filter((todo) => todo.projectId === projectId && !todo.done && todo.due).map((todo) => todo.due?.at ?? 0);
  if (brief?.target) dates.push(brief.target);
  const ahead = dates.filter((at) => at >= startToday).sort((a, b) => a - b);
  return ahead[0] ?? null;
}

// ---------------------------------------------------------------------------
// The row menu: rename, pin, settings, archive or restore, remove (kept from the old list)
// ---------------------------------------------------------------------------

function ProjectActions(props: { project: Project; brief: ProjectBrief | undefined }) {
  const backend = useBackend();
  const cockpit = useCockpit();
  const refreshCockpit = useCockpitRefresh();
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
      // Restoring a completed project makes it active again in the cockpit too.
      if (patch.archived === false && props.brief?.state === "completed") await cockpit.projects.updateBrief(project.id, { state: "active" });
      await Promise.all([client.invalidateQueries({ queryKey: keys.projects }), refreshCockpit()]);
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
          <Button variant="quiet" size="icon-xl" aria-label={`${project.name}: ${copy.projects.rowActions}`}>
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

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

type Row = { project: Project; brief: ProjectBrief | undefined; state: ProjectState; todos: number; deadline: number | null; lastActivity: number | null; hasKey: boolean };

function KeyCell(props: { row: Row }) {
  const { brief, hasKey } = props.row;
  if (!hasKey)
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-semibold text-ink">
        <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
        {C.noKey}
      </span>
    );
  const left = brief?.keyLeft ?? null;
  if (left === null) return <span className="text-ink">{C.keyLinked}</span>;
  const low = left < 20;
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-ink", low && "font-semibold")}>
      {low ? <TriangleAlert className="size-4 shrink-0" aria-hidden="true" /> : left < 90 ? <Check className="size-4 shrink-0 text-success" aria-hidden="true" /> : null}
      {C.keyLeft(left)}
    </span>
  );
}

function ProjectTableRow(props: { row: Row; now: number }) {
  const { project, brief, state } = props.row;
  const target = href({ name: "project-overview", projectId: project.id });
  // The whole row opens the project; its own controls (the name link, the menu) keep their job.
  const open = (event: MouseEvent<HTMLTableRowElement>) => {
    if (event.target instanceof Element && event.target.closest("a, button, [role='menu']")) return;
    navigate({ name: "project-overview", projectId: project.id });
  };
  return (
    <tr className="cursor-pointer transition-colors hover:bg-surface-alt/60" onClick={open} data-testid="project-row">
      <th scope="row" className="py-5 pe-6 text-start align-middle font-normal">
        <a href={target} data-testid="workspace-item" className="text-lg font-semibold text-ink no-underline hover:underline">
          {project.name}
        </a>
        <span className="mt-1 block max-w-[44ch] text-base text-ink-muted">{brief?.goal ?? project.description ?? C.noGoal}</span>
      </th>
      <td className="text-base text-ink">{projectsCopy.state[state]}</td>
      <td className={cn("text-base", props.row.deadline ? "text-ink" : "text-ink-muted")}>{props.row.deadline ? dayLabel(props.row.deadline, props.now) : projectsCopy.noDate}</td>
      <td className="text-base tabular-nums text-ink">{props.row.todos}</td>
      <td className="text-base">{brief?.needsYou ? <StatusBadge kind="review">{brief.needsYou}</StatusBadge> : <span className="text-ink-muted">{projectsCopy.nothing}</span>}</td>
      <td className="text-base">
        <KeyCell row={props.row} />
      </td>
      <td className="whitespace-nowrap text-base text-ink-muted">{props.row.lastActivity ? activityLabel(props.row.lastActivity, props.now) : C.noActivity}</td>
      <td className="w-12 py-3.5! text-end">
        <ProjectActions project={project} brief={brief} />
      </td>
    </tr>
  );
}

function AreaSection(props: { area: Area | null; rows: Row[]; now: number }) {
  const name = props.area?.name ?? C.otherArea;
  const id = `area-${props.area?.id ?? "none"}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-4">
        <h2 id={id} className="m-0 text-[28px] font-bold leading-[34px] tracking-[-0.01em] text-ink">
          {name}
        </h2>
        {props.area?.client ? <Tag>{projectsCopy.clientTag(props.area.client)}</Tag> : null}
      </div>
      <div className="rounded-[16px] bg-surface-raised px-5 pb-3 pt-6 lg:px-8">
        <DataTable label={C.tableLabel(name)} head={[...C.head]} align={["start", "start", "start", "start", "start", "start", "start", "end"]} className="[&_table]:min-w-[980px] [&_table]:table-fixed [&_td]:align-middle! [&_th:nth-child(1)]:w-[31%] [&_th:nth-child(2)]:w-[9%] [&_th:nth-child(3)]:w-[13%] [&_th:nth-child(4)]:w-[8%] [&_th:nth-child(5)]:w-[13%] [&_th:nth-child(6)]:w-[12%] [&_th:nth-child(8)]:w-14">
          {props.rows.map((row) => (
            <ProjectTableRow key={row.project.id} row={row} now={props.now} />
          ))}
        </DataTable>
      </div>
    </section>
  );
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label={copy.common.loading}>
      <Skeleton className="h-8 w-64" />
      <div className="flex flex-col gap-5 rounded-[16px] bg-surface-raised p-8">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}

/**
 * Projecten (design v2-ProjectsIndex): the hero with counts, Actief / In de wacht / Afgerond, sort
 * and filter; then per area a white panel with a table (goal, status, next deadline, to-dos,
 * what needs you, the model key, last activity). A row opens the project's Overzicht; the ⋯ menu
 * keeps rename, pin, archive and remove. "Mijn brein" is the Agent, never a row here (decision B1).
 */
export function ProjectsPage() {
  const backend = useBackend();
  const status = useStatus();
  const projects = useProjects();
  const briefs = useBriefs();
  const areas = useAreas();
  const todos = useTodos();
  const personalId = usePersonalBrain()?.projectId ?? "p-mijn-brein";
  const [show, setShow] = useState<ProjectState>("active");
  const [sort, setSortState] = useState<Sort>(() => {
    const stored = readLocal("bonzaiwork.projectsSort");
    return isSort(stored) ? stored : "activity";
  });
  const [query, setQuery] = useState("");
  const now = Math.floor(Date.now() / 60_000) * 60_000;
  const readOnly = status.data?.readOnly ?? false;

  const listed = useMemo(() => (projects.data ?? []).filter((project) => project.id !== personalId), [projects.data, personalId]);
  const summaries = useQueries({
    queries: listed.map((project) => ({
      queryKey: keys.summary(project.id),
      queryFn: () => backend.projects.summary(project.id),
      staleTime: 10_000,
      refetchInterval: 20_000,
    })),
  });
  const summaryById = new Map<string, ProjectSummary | undefined>(listed.map((project, index) => [project.id, summaries[index]?.data]));
  const briefById = useMemo(() => new Map((briefs.data ?? []).map((brief) => [brief.projectId, brief])), [briefs.data]);
  const openTodos = useMemo(() => (todos.data ?? []).filter((todo) => !todo.done), [todos.data]);

  const rows: Row[] = listed.map((project) => {
    const brief = briefById.get(project.id);
    return {
      project,
      brief,
      state: projectState(project, brief),
      todos: openTodos.filter((todo) => todo.projectId === project.id).length,
      deadline: nextDeadline(project.id, brief, openTodos, now),
      lastActivity: summaryById.get(project.id)?.lastActivityAt ?? null,
      hasKey: projectHasKey(status.data, project),
    };
  });

  const setSort = (value: string) => {
    if (!isSort(value)) return;
    setSortState(value);
    writeLocal("bonzaiwork.projectsSort", value === "activity" ? null : value);
  };

  const needle = query.trim().toLowerCase();
  const matches = (row: Row) => !needle || row.project.name.toLowerCase().includes(needle) || (row.brief?.goal ?? row.project.description ?? "").toLowerCase().includes(needle);
  const byName = (a: Row, b: Row) => a.project.name.localeCompare(b.project.name, "nl");
  const order = (a: Row, b: Row) => {
    if (sort === "name") return byName(a, b);
    if (sort === "deadline") return (a.deadline ?? Infinity) - (b.deadline ?? Infinity) || byName(a, b);
    if (a.project.pinned !== b.project.pinned) return a.project.pinned ? -1 : 1;
    return (b.lastActivity ?? 0) - (a.lastActivity ?? 0) || byName(a, b);
  };
  const shown = rows.filter((row) => row.state === show && matches(row)).sort(order);
  const active = rows.filter((row) => row.state === "active");
  const activeAreas = new Set(active.map((row) => row.brief?.area.id ?? "none")).size;

  // Areas in their own order; projects without a brief (still loading, or a new device) at the end.
  const areaList = areas.data ?? [];
  const groups: Array<{ area: Area | null; rows: Row[] }> = [
    ...areaList.map((area) => ({ area, rows: shown.filter((row) => row.brief?.area.id === area.id) })),
    { area: null, rows: shown.filter((row) => !row.brief || !areaList.some((area) => area.id === row.brief?.area.id)) },
  ].filter((group) => group.rows.length > 0);

  const loading = projects.isLoading || (briefs.isLoading && !briefs.data);
  const failed = projects.isError;

  return (
    <div className="flex flex-col">
      <PageHero
        documentTitle={C.documentTitle}
        eyebrow={C.eyebrow}
        title={
          <>
            {C.title}
            <Accent>{C.titleAccent}</Accent>
          </>
        }
        lead={loading ? undefined : active.length ? C.lead(active.length, Math.max(activeAreas, 1)) : C.leadEmpty}
        actions={
          <Button variant="primary" size="xl" onClick={() => navigate({ name: "project-new", fromProjectId: null, fromChatId: null })} disabled={readOnly} data-testid="new-workspace">
            {C.new}
          </Button>
        }
        below={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-4">
            <SegmentedControl
              value={show}
              onValueChange={setShow}
              items={STATES.map((state) => ({ value: state, label: projectsCopy.state[state] }))}
              label={C.show}
              scroll
              className="max-w-full bg-surface-alt p-1 [&>*]:h-11! [&>*]:px-6! [&>*]:text-base! [&>[data-checked]]:bg-ink! [&>[data-checked]]:text-surface! [&>[data-checked]]:shadow-none!"
            />
            <div className="ms-auto flex w-full flex-wrap items-center gap-3 sm:w-auto">
              <span className="text-base text-ink-muted" id="projects-sort-label">
                {C.sortLabel}
              </span>
              <Select
                value={sort}
                onValueChange={setSort}
                label={C.sortLabel}
                items={SORTS.map((value) => ({ value, label: C.sort[value] }))}
                className="h-11! w-auto min-w-[11rem] px-4! text-base! ring-line-strong!"
              />
              <label className="relative w-full min-w-0 sm:w-[280px] sm:flex-none">
                <span className="sr-only">{C.filter}</span>
                <Search className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={C.filter}
                  className="h-11 w-full rounded-full border border-line-strong bg-surface-raised ps-10 pe-4 text-base text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-sm:text-[16px]"
                />
              </label>
            </div>
          </div>
        }
      />
      <Band tone="alt" className="flex-1" inner="flex flex-col gap-14">
        {loading ? (
          <TableSkeleton />
        ) : failed ? (
          <div className="flex flex-col items-start gap-4">
            <p className="m-0 text-lg text-ink">{projectsCopy.loadFailed}</p>
            <Button variant="secondary" size="lg" onClick={() => void projects.refetch()}>
              {projectsCopy.retry}
            </Button>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-start gap-4 rounded-[16px] bg-surface-raised p-8 lg:p-10">
            <FolderPlus className="size-6 text-ink" aria-hidden="true" />
            <h2 className="m-0 text-xl font-semibold text-ink">{needle ? C.noMatches(query) : C.empty[show]}</h2>
            {needle ? null : <p className="m-0 max-w-[60ch] text-base text-ink-muted">{C.emptyBody[show]}</p>}
            {show === "active" && !needle ? (
              <Button variant="primary" size="xl" onClick={() => navigate({ name: "project-new", fromProjectId: null, fromChatId: null })} disabled={readOnly}>
                {C.new}
              </Button>
            ) : null}
          </div>
        ) : (
          groups.map((group) => <AreaSection key={group.area?.id ?? "none"} area={group.area} rows={group.rows} now={now} />)
        )}
        {!loading && !failed ? <p className="m-0 text-base text-ink-muted">{C.footer}</p> : null}
      </Band>
    </div>
  );
}
