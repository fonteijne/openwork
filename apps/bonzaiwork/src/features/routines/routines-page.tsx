import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Archive, ArchiveRestore, CalendarClock, ChevronLeft, CircleCheck, CircleDashed, CircleX, Clock, Ellipsis, Pencil, Play, Plus, Trash2 } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys, modelName, useProjects, useRoutineRuns, useRoutines, useStatus } from "~/backend/queries";
import type { Routine, RoutineRun } from "~/backend/types";
import { ProjectIcon } from "~/components/project-icon";
import { PageTitle, TopBar } from "~/components/top-bar";
import { Button } from "~/components/ui/button";
import { Menu, MenuItem, MenuSeparator } from "~/components/ui/menu";
import { EmptyState, Locked, Skeleton, Spinner } from "~/components/ui/misc";
import { ConfirmDialog } from "~/components/ui/overlay";
import { Select } from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { formatDateTime, formatDuration, formatWhen, relativeTime } from "~/lib/format";
import { href, navigate } from "~/lib/router";
import { describeSchedule, nextOccurrences } from "~/lib/schedule";

import { RoutineEditor } from "./routine-editor";

function RunIcon(props: { run: RoutineRun }) {
  const { status } = props.run;
  if (status === "running" || status === "queued") return <Spinner className="size-3.5 text-electric-11" />;
  if (status === "succeeded") return <CircleCheck className="size-4 text-green-11" />;
  if (status === "failed") return <CircleX className="size-4 text-destructive-foreground" />;
  if (status === "skipped") return <CircleDashed className="size-4 text-warning-foreground" />;
  return <CircleDashed className="size-4 text-subtle-foreground" />;
}

function runLabel(run: RoutineRun): string {
  if (run.status === "skipped" && run.skippedReason === "app_closed") return copy.routines.missed;
  return copy.routines.runStatus[run.status];
}

function useRoutineActions() {
  const backend = useBackend();
  const client = useQueryClient();
  const refresh = async (routine: Routine) => {
    await client.invalidateQueries({ queryKey: keys.allRoutines });
    await client.invalidateQueries({ queryKey: keys.runs(routine.id) });
    await client.invalidateQueries({ queryKey: keys.summary(routine.projectId) });
  };
  const act = async (routine: Routine, action: () => Promise<unknown>, message?: string, undo?: () => Promise<unknown>) => {
    try {
      await action();
      await refresh(routine);
      if (message) toast(message, undo ? { action: { label: copy.common.undo, onClick: () => void act(routine, undo) } } : {});
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
    }
  };
  return {
    setActive: (routine: Routine, active: boolean) =>
      act(routine, () => backend.routines.update(routine.id, { state: active ? "active" : "inactive" }), active ? copy.routines.resumed : copy.routines.pausedToast),
    runNow: (routine: Routine) => act(routine, () => backend.routines.run(routine.id), copy.routines.ran),
    archive: (routine: Routine, archived: boolean) =>
      act(routine, () => backend.routines.update(routine.id, { state: archived ? "archived" : "inactive" }), archived ? copy.routines.archived : copy.projects.restored, archived ? () => backend.routines.update(routine.id, { state: "inactive" }) : undefined),
    remove: (routine: Routine) => act(routine, () => backend.routines.remove(routine.id), copy.routines.removed),
  };
}

function RoutineMenu(props: { routine: Routine; onEdit: () => void; onRemoved?: () => void }) {
  const actions = useRoutineActions();
  const [removing, setRemoving] = useState(false);
  const { routine } = props;
  return (
    <>
      <Menu
        align="end"
        trigger={
          <Button variant="quiet" size="icon-sm" aria-label={`${routine.name}: ${copy.common.more}`}>
            <Ellipsis />
          </Button>
        }
      >
        <MenuItem icon={<Play />} onClick={() => void actions.runNow(routine)} disabled={routine.state === "archived"}>
          {copy.routines.runNow}
        </MenuItem>
        <MenuItem icon={<Pencil />} onClick={props.onEdit}>
          {copy.routines.edit}
        </MenuItem>
        {routine.state === "archived" ? (
          <MenuItem icon={<ArchiveRestore />} onClick={() => void actions.archive(routine, false)}>
            {copy.routines.unarchive}
          </MenuItem>
        ) : (
          <MenuItem icon={<Archive />} onClick={() => void actions.archive(routine, true)}>
            {copy.routines.archive}
          </MenuItem>
        )}
        <MenuSeparator />
        <MenuItem icon={<Trash2 />} danger onClick={() => setRemoving(true)}>
          {copy.routines.remove}
        </MenuItem>
      </Menu>
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={copy.routines.removeTitle(routine.name)}
        body={copy.routines.removeBody}
        confirmLabel={copy.routines.remove}
        onConfirm={() => {
          setRemoving(false);
          void actions.remove(routine).then(() => props.onRemoved?.());
        }}
      />
    </>
  );
}

function RoutineRow(props: { routine: Routine; showProject: boolean; onEdit: (routine: Routine) => void; baseProjectId: string | null }) {
  const projects = useProjects();
  const actions = useRoutineActions();
  const { routine } = props;
  const project = projects.data?.find((entry) => entry.id === routine.projectId);
  const last = routine.lastRun;
  const detailHref = props.baseProjectId ? href({ name: "project-routines", projectId: props.baseProjectId, routineId: routine.id }) : href({ name: "routines", routineId: routine.id });
  return (
    <li className="relative flex items-center gap-3 border-b border-border py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <a href={detailHref} className="block truncate text-sm font-semibold text-foreground after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring">
          {routine.name}
        </a>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {props.showProject && project ? (
            <span className="inline-flex items-center gap-1.5">
              <ProjectIcon icon={project.icon} color={project.color} size="sm" className="size-4 [&_svg]:size-2.5" />
              {project.name}
            </span>
          ) : null}
          <span>{describeSchedule(routine.schedule)}</span>
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          {routine.state === "needs_attention" ? (
            <span className="inline-flex items-center gap-1 font-medium text-warning-foreground">
              <AlertTriangle className="size-3.5" />
              {copy.routines.needsAttention}
            </span>
          ) : routine.state === "active" && routine.nextRunAt ? (
            <span className="text-subtle-foreground">
              {copy.routines.nextRun} {formatWhen(routine.nextRunAt)}
            </span>
          ) : routine.state === "inactive" ? (
            <span className="text-subtle-foreground">{copy.routines.paused}</span>
          ) : null}
          {last ? (
            <span className="inline-flex items-center gap-1 text-subtle-foreground">
              <RunIcon run={last} />
              {runLabel(last)} · {relativeTime(last.finishedAt ?? last.startedAt ?? last.scheduledAt)}
            </span>
          ) : (
            <span className="text-subtle-foreground">{copy.routines.never}</span>
          )}
        </p>
      </div>
      <div className="relative z-10 flex shrink-0 items-center gap-1">
        {routine.state !== "archived" ? (
          <Switch checked={routine.state === "active" || routine.state === "needs_attention"} onCheckedChange={(checked) => void actions.setActive(routine, checked)} label={`${routine.name}: ${routine.state === "active" ? copy.routines.pause : copy.routines.resume}`} />
        ) : null}
        <RoutineMenu routine={routine} onEdit={() => props.onEdit(routine)} />
      </div>
    </li>
  );
}

function RoutineDetail(props: { routine: Routine; backHref: string; onEdit: () => void }) {
  const status = useStatus();
  const projects = useProjects();
  const runs = useRoutineRuns(props.routine.id);
  const actions = useRoutineActions();
  const { routine } = props;
  const project = projects.data?.find((entry) => entry.id === routine.projectId);
  const upcoming = routine.state === "active" ? nextOccurrences(routine.schedule, Date.now(), 3) : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar
        leading={
          <a href={props.backHref} className="-ms-1 flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-hover" aria-label={copy.nav.back}>
            <ChevronLeft className="size-5" />
          </a>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => void actions.runNow(routine)} disabled={routine.state === "archived"}>
              <Play />
              <span className="max-sm:sr-only">{copy.routines.runNow}</span>
            </Button>
            <RoutineMenu routine={routine} onEdit={props.onEdit} onRemoved={() => navigate({ name: "routines", routineId: null })} />
          </>
        }
      >
        <PageTitle>{routine.name}</PageTitle>
      </TopBar>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pt-6 pb-16 sm:px-6">
          {routine.state === "needs_attention" ? (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg bg-amber-3 px-3.5 py-2.5 text-sm text-amber-11">
              <AlertTriangle className="size-4 shrink-0" />
              <span className="min-w-0 flex-1">{routine.needsAttentionReason ?? copy.routines.needsAttention}</span>
              <Button variant="secondary" size="sm" onClick={props.onEdit}>
                {copy.routines.edit}
              </Button>
            </div>
          ) : null}

          <section>
            <dl className="border-t border-border text-sm">
              {[
                [copy.routines.project, project ? <a className="hover:underline" href={href({ name: "project", projectId: project.id, chatId: null })}>{project.name}</a> : "—"],
                [copy.routines.schedule, describeSchedule(routine.schedule)],
                [copy.routines.nextRun, upcoming.length ? upcoming.map((at) => formatWhen(at)).join(" · ") : routine.state === "inactive" ? copy.routines.paused : "—"],
                [copy.routines.model, routine.model ? modelName(status.data, routine.model) : copy.routines.modelDefault],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 border-b border-border py-2">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="min-w-0 text-end text-foreground">{value}</dd>
                </div>
              ))}
              <div className="flex min-h-11 items-center justify-between gap-4 border-b border-border py-2">
                <dt className="text-muted-foreground">{routine.state === "active" ? copy.common.on : copy.routines.paused}</dt>
                <dd>
                  {routine.state !== "archived" ? (
                    <Switch checked={routine.state === "active" || routine.state === "needs_attention"} onCheckedChange={(checked) => void actions.setActive(routine, checked)} label={copy.routines.pause} />
                  ) : null}
                </dd>
              </div>
            </dl>
            <blockquote className="mt-4 rounded-lg bg-muted/60 px-3.5 py-3 text-sm whitespace-pre-wrap text-foreground">{routine.prompt}</blockquote>
          </section>

          <section>
            <h2 className="mb-1 text-sm font-semibold">{copy.routines.history}</h2>
            {runs.isLoading ? (
              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : runs.data?.length ? (
              <ul className="border-t border-border">
                {runs.data.map((run) => (
                  <li key={run.id} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border py-2 text-sm">
                    <RunIcon run={run} />
                    <span className="min-w-0 flex-1">
                      <span className={cn("font-medium", run.status === "failed" && "text-destructive-foreground", run.status === "skipped" && "text-warning-foreground")}>{runLabel(run)}</span>
                      <span className="text-muted-foreground">
                        {" · "}
                        {formatDateTime(run.startedAt ?? run.scheduledAt)}
                        {" · "}
                        {copy.routines.triggers[run.trigger]}
                        {run.startedAt && run.finishedAt ? ` · ${formatDuration(run.finishedAt - run.startedAt)}` : ""}
                      </span>
                      {run.error ? <span className="block text-xs text-destructive-foreground">{run.error}</span> : null}
                    </span>
                    {run.chatId ? (
                      <a href={href({ name: "project", projectId: routine.projectId, chatId: run.chatId })} className="text-sm font-medium text-foreground underline-offset-2 hover:underline">
                        {copy.routines.openChat}
                      </a>
                    ) : run.status === "skipped" ? (
                      <Button variant="secondary" size="sm" onClick={() => void actions.runNow(routine)}>
                        {copy.routines.runNow}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="border-t border-border pt-3 text-sm text-muted-foreground">{copy.routines.historyEmpty}</p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

export function RoutinesPage(props: { projectId: string | null; routineId: string | null }) {
  const backend = useBackend();
  const projects = useProjects();
  const routines = useRoutines(props.projectId);
  const [editing, setEditing] = useState<Routine | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const project = props.projectId ? projects.data?.find((entry) => entry.id === props.projectId) ?? null : null;
  const title = project ? copy.routines.projectTitle(project.name) : copy.routines.title;
  const listHref = props.projectId ? href({ name: "project-routines", projectId: props.projectId, routineId: null }) : href({ name: "routines", routineId: null });

  const editor = (
    <RoutineEditor
      open={creating || editing !== null}
      onOpenChange={(open) => {
        if (!open) {
          setCreating(false);
          setEditing(null);
        }
      }}
      routine={editing}
      projectId={props.projectId}
    />
  );

  const selected = props.routineId ? routines.data?.find((routine) => routine.id === props.routineId) : null;
  if (props.routineId && selected) {
    return (
      <>
        <RoutineDetail routine={selected} backHref={listHref} onEdit={() => setEditing(selected)} />
        {editor}
      </>
    );
  }

  const all = routines.data ?? [];
  const visible = all.filter((routine) => (filter === "all" || routine.projectId === filter) && (showArchived || routine.state !== "archived"));
  const archivedCount = all.filter((routine) => routine.state === "archived").length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar
        actions={
          backend.capabilities.routines ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus />
              <span className="max-sm:sr-only">{copy.routines.new}</span>
            </Button>
          ) : null
        }
      >
        <PageTitle>{title}</PageTitle>
      </TopBar>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-4 pt-5 pb-16 sm:px-6 sm:pt-8">
          {!backend.capabilities.routines ? (
            <EmptyState icon={<CalendarClock />} title={copy.routines.title} body={<Locked className="text-sm">{copy.routines.locked}</Locked>} />
          ) : routines.isLoading ? (
            <div className="flex flex-col gap-3 border-t border-border pt-4" aria-busy="true">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-3 w-72" />
              <Skeleton className="mt-3 h-4 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
          ) : routines.isError ? (
            <EmptyState
              title={errorText(routines.error)}
              action={
                <Button variant="secondary" onClick={() => void routines.refetch()}>
                  {copy.boot.retry}
                </Button>
              }
            />
          ) : all.length === 0 ? (
            <EmptyState
              icon={<CalendarClock />}
              title={copy.routines.emptyTitle}
              body={copy.routines.emptyBody}
              action={
                <Button variant="primary" size="lg" onClick={() => setCreating(true)}>
                  <Plus />
                  {copy.routines.new}
                </Button>
              }
            />
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="size-3.5" />
                  {copy.routines.appOpenNotice}
                </p>
                {!props.projectId ? (
                  <Select
                    label={copy.routines.project}
                    value={filter}
                    onValueChange={setFilter}
                    items={[{ value: "all", label: copy.routines.filterAll }, ...(projects.data ?? []).filter((entry) => all.some((routine) => routine.projectId === entry.id)).map((entry) => ({ value: entry.id, label: entry.name }))]}
                    className="w-auto min-w-40"
                  />
                ) : null}
              </div>
              <ul className="border-t border-border">
                {visible.map((routine) => (
                  <RoutineRow key={routine.id} routine={routine} showProject={!props.projectId} onEdit={setEditing} baseProjectId={props.projectId} />
                ))}
              </ul>
              {archivedCount ? (
                <Button variant="quiet" size="sm" className="mt-4" onClick={() => setShowArchived((value) => !value)} aria-expanded={showArchived}>
                  <Archive />
                  {showArchived ? copy.routines.hideArchived : `${copy.routines.showArchived} (${archivedCount})`}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </main>
      {editor}
    </div>
  );
}
