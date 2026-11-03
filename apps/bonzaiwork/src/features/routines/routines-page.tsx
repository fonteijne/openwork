import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, CalendarClock, ChevronLeft, CircleAlert, CircleDashed, Ellipsis, Pause, Pencil, Play, Plus, Trash2, TriangleAlert } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys, modelName, projectHasKey, projectModels, useProjects, useRoutineRuns, useRoutines, useStatus } from "~/backend/queries";
import type { Chat, Project, Routine, RoutineInput, RoutineRun } from "~/backend/types";
import { ProjectIcon } from "~/components/project-icon";
import { PageTitle, TopBar } from "~/components/top-bar";
import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { StatusChip } from "~/components/ui/chip";
import { Disclosure } from "~/components/ui/disclosure";
import { Menu, MenuItem, MenuSeparator } from "~/components/ui/menu";
import { EmptyState, Locked, Row, Skeleton, Spinner } from "~/components/ui/misc";
import { ConfirmDialog } from "~/components/ui/overlay";
import { Select } from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { formatDuration, formatWhen, relativeTime } from "~/lib/format";
import { href, navigate } from "~/lib/router";
import { describeSchedule, nextOccurrences } from "~/lib/schedule";

import { starterRoutines, starterTemplate } from "./starters";
import { groupRoutines, isMissed, lastRunFailed, runAt, runOutcome, whenPhrase, type RoutineGroupKey } from "./grouping";
import { RoutineEditor } from "./routine-editor";

// ---------------------------------------------------------------------------
// Data: the chats behind runs, so a run row reads as a result (contract R2)
// ---------------------------------------------------------------------------

/**
 * The chats a run row can read its result and status from: one project's list on the project
 * tab and the detail, the newest chats across projects on `#/routines` (one call, not one per
 * project). A missing chat only means the row falls back to the run's status word.
 */
function useRunChats(projectId: string | null): ReadonlyMap<string, Chat> {
  const backend = useBackend();
  const chats = useQuery({
    queryKey: ["routine-chats", projectId ?? "all"] as const,
    queryFn: () => (projectId ? backend.chats.list(projectId, null).then((page) => page.items) : backend.chats.recent(60)),
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
  return useMemo(() => new Map((chats.data ?? []).map((chat) => [chat.id, chat])), [chats.data]);
}

function useRoutineActions() {
  const backend = useBackend();
  const client = useQueryClient();
  const refresh = async (routine: Routine) => {
    await Promise.all([
      client.invalidateQueries({ queryKey: keys.allRoutines }),
      client.invalidateQueries({ queryKey: keys.attention }),
      client.invalidateQueries({ queryKey: keys.runs(routine.id) }),
      client.invalidateQueries({ queryKey: keys.summary(routine.projectId) }),
      client.invalidateQueries({ queryKey: ["routine-chats"] }),
    ]);
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
    /** "Nu uitvoeren" keeps its promise (C2, S5): "Gestart" with the chat the run made, or the failure with its reason. */
    runNow: async (routine: Routine) => {
      try {
        const run = await backend.routines.run(routine.id);
        await refresh(routine);
        if (run.status === "failed") return toast(run.error ?? copy.routines.runStatus.failed, { tone: "error" });
        const chatId = run.chatId;
        toast(copy.attention.routine.started, chatId ? { action: { label: copy.routines.openChat, onClick: () => navigate({ name: "project", projectId: routine.projectId, chatId }) } } : {});
      } catch (failure) {
        toast(errorText(failure), { tone: "error" });
      }
    },
    setModel: (routine: Routine, model: string) => act(routine, () => backend.routines.update(routine.id, { model }), copy.routines.saved),
    archive: (routine: Routine, archived: boolean) =>
      act(routine, () => backend.routines.update(routine.id, { state: archived ? "archived" : "inactive" }), archived ? copy.routines.archived : copy.projects.restored, archived ? () => backend.routines.update(routine.id, { state: "inactive" }) : undefined),
    remove: (routine: Routine) => act(routine, () => backend.routines.remove(routine.id), copy.routines.removed),
  };
}

// ---------------------------------------------------------------------------
// Pieces shared by the row, the detail and the project tab
// ---------------------------------------------------------------------------

const LINK_BUTTON = "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-medium text-foreground ring-1 ring-inset ring-border-strong hover:bg-hover pointer-coarse:h-9";

function ChatLink(props: { projectId: string; chatId: string; className?: string }) {
  return (
    <a href={href({ name: "project", projectId: props.projectId, chatId: props.chatId })} className={cn("shrink-0 text-xs font-medium text-electric-11 underline-offset-2 hover:underline", props.className)}>
      {copy.routines.openChat}
    </a>
  );
}

/**
 * The fix on the row (brief §8, C6): a routine that cannot run gets the model `Select` (the
 * model its key lost) or "Key koppelen" (no key at all); a missed or failed run gets
 * "Nu uitvoeren". Nothing for a routine that is fine.
 */
export function FixControl(props: { routine: Routine; project: Project | null; busy?: boolean }) {
  const status = useStatus();
  const actions = useRoutineActions();
  const { routine, project } = props;
  if (routine.state === "needs_attention") {
    if (!project) return null;
    const models = projectModels(status.data, project);
    if (!projectHasKey(status.data, project) || models.length === 0) {
      return (
        <a href={href({ name: "project-settings", projectId: project.id, group: "toegang" })} className={LINK_BUTTON} data-testid="routine-fix-key">
          {copy.attention.routine.linkKey}
        </a>
      );
    }
    const known = routine.model !== null && models.some((model) => model.id === routine.model) ? routine.model : null;
    return (
      <span data-testid="routine-fix-model" className="inline-flex min-w-0">
        <Select
          label={copy.routines.model}
          placeholder={copy.routines.chooseModel}
          value={known}
          onValueChange={(model) => void actions.setModel(routine, model)}
          disabled={props.busy}
          items={models.map((model) => ({ value: model.id, label: model.name }))}
          className="h-7 w-auto min-w-40 text-xs pointer-coarse:h-9"
        />
      </span>
    );
  }
  if (isMissed(routine) || lastRunFailed(routine)) {
    return (
      <Button variant="secondary" size="sm" onClick={() => void actions.runNow(routine)} disabled={props.busy} data-testid="routine-run-now">
        <Play />
        {copy.routines.runNow}
      </Button>
    );
  }
  return null;
}

/** The status glyph and word of a run outcome: icon + word, never hue alone (V2, C5). */
function OutcomeChip(props: { status: ReturnType<typeof runOutcome>["status"] }) {
  switch (props.status) {
    case "waiting":
      return <StatusChip status="waiting" />;
    case "running":
      return <StatusChip status="running" label={copy.routines.running} />;
    case "queued":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Spinner className="size-3 text-muted-foreground" />
          {copy.routines.queued}
        </span>
      );
    case "failed":
      return <StatusChip status="failed" />;
    case "missed":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
          <CircleDashed aria-hidden="true" className="size-3.5 text-warning-foreground" />
          {copy.routines.runStatus.skipped}
        </span>
      );
    case "cancelled":
      return <StatusChip status="idle" label={copy.routines.cancelled} />;
    default:
      return <StatusChip status="idle" label={copy.routines.finished} />;
  }
}

/**
 * A run as a result sentence (assessment I-2, contract R2): the chat's preview or title first,
 * then the status word and when; "Wacht op jou" when the run's chat waits on a decision. The
 * missed state is the one place that explains the rule "draait alleen terwijl de app open is" (P1).
 */
function RunLine(props: { run: RoutineRun; chat: Chat | null; routine: Routine; detail?: boolean }) {
  const { run, routine } = props;
  const outcome = runOutcome(run, props.chat);
  const at = runAt(run);
  const when = props.detail ? whenPhrase(at) : relativeTime(at);
  const duration = props.detail && run.startedAt && run.finishedAt ? formatDuration(run.finishedAt - run.startedAt) : null;
  return (
    <div className={cn("flex min-w-0 flex-1 items-center gap-x-2", props.detail ? "text-sm max-sm:flex-wrap max-sm:gap-y-1" : "text-xs")} data-testid="routine-run" data-outcome={outcome.status}>
      <OutcomeChip status={outcome.status} />
      {outcome.status === "missed" ? (
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{copy.routines.missedAt(whenPhrase(run.scheduledAt))}</span>
      ) : outcome.status === "failed" && outcome.error ? (
        <span className="min-w-0 flex-1 truncate text-muted-foreground" title={outcome.error}>
          {outcome.error}
        </span>
      ) : outcome.sentence ? (
        <span className="min-w-0 flex-1 truncate text-foreground" title={outcome.sentence}>
          {outcome.sentence}
        </span>
      ) : (
        <span className="flex-1" />
      )}
      <span className="shrink-0 text-subtle-foreground">
        {when}
        {duration ? ` · ${duration}` : ""}
        {props.detail && run.trigger !== "scheduled" ? ` · ${copy.routines.triggers[run.trigger]}` : ""}
      </span>
      {run.chatId ? <ChatLink projectId={routine.projectId} chatId={run.chatId} /> : null}
    </div>
  );
}

function RoutineMenu(props: { routine: Routine; onEdit: () => void; onRemoved?: () => void; withPause?: boolean }) {
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
        {props.withPause && routine.state !== "archived" ? (
          routine.state === "inactive" ? (
            <MenuItem icon={<Play />} onClick={() => void actions.setActive(routine, true)}>
              {copy.routines.resume}
            </MenuItem>
          ) : (
            <MenuItem icon={<Pause />} onClick={() => void actions.setActive(routine, false)}>
              {copy.routines.pause}
            </MenuItem>
          )
        ) : null}
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

/** The on/off switch: only for a routine that can be on or off; one that needs a fix has the fix instead (assessment P-5). */
function ActiveSwitch(props: { routine: Routine }) {
  const actions = useRoutineActions();
  const { routine } = props;
  if (routine.state !== "active" && routine.state !== "inactive") return null;
  return <Switch checked={routine.state === "active"} onCheckedChange={(checked) => void actions.setActive(routine, checked)} label={`${routine.name}: ${routine.state === "active" ? copy.routines.pause : copy.routines.resume}`} />;
}

// ---------------------------------------------------------------------------
// The list: one row object for #/routines and the project tab
// ---------------------------------------------------------------------------

function RoutineRow(props: { routine: Routine; project: Project | null; showProject: boolean; chats: ReadonlyMap<string, Chat>; onEdit: (routine: Routine) => void; baseProjectId: string | null }) {
  const { routine, project } = props;
  const detailHref = props.baseProjectId ? href({ name: "project-routines", projectId: props.baseProjectId, routineId: routine.id }) : href({ name: "routines", routineId: routine.id });
  const last = routine.lastRun;
  const chat = last?.chatId ? (props.chats.get(last.chatId) ?? null) : null;
  const needsFix = routine.state === "needs_attention";
  const missed = isMissed(routine);

  return (
    <li className="relative flex items-start gap-3 border-b border-border py-3 last:border-b-0" data-testid={`routine-row-${routine.id}`} data-state={routine.state}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <a href={detailHref} className="block truncate text-sm font-semibold text-foreground after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring">
          {routine.name}
        </a>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {props.showProject && project ? (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <ProjectIcon icon={project.icon} color={project.color} size="sm" className="size-4 [&_svg]:size-2.5" />
              <span className="truncate">{project.name}</span>
            </span>
          ) : null}
          <span>{describeSchedule(routine.schedule)}</span>
          {routine.state === "active" && routine.nextRunAt !== null ? <span className="text-subtle-foreground">{copy.routines.next(formatWhen(routine.nextRunAt))}</span> : null}
        </p>
        {/* The state line with the fix on it; controls sit above the row's link overlay. */}
        <div className="relative z-10 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 [&>[data-testid=routine-run]]:basis-0">
          {needsFix ? (
            <>
              <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-foreground">
                <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0 text-warning-foreground" />
                <span className="min-w-0">{routine.needsAttentionReason ?? copy.routines.needsAttention}</span>
              </span>
              <FixControl routine={routine} project={project} />
            </>
          ) : missed && last ? (
            <>
              <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
                <CircleDashed aria-hidden="true" className="size-3.5 shrink-0 text-warning-foreground" />
                <span className="text-foreground">{copy.routines.missedAt(whenPhrase(last.scheduledAt))}</span>
                {/* The rule on its own line, not behind a dangling "·" (C7). */}
                <span className="basis-full ps-5 text-subtle-foreground">{copy.routines.missedRule}</span>
              </span>
              <FixControl routine={routine} project={project} />
            </>
          ) : last ? (
            <>
              <RunLine run={last} chat={chat} routine={routine} />
              {lastRunFailed(routine) ? <FixControl routine={routine} project={project} /> : null}
            </>
          ) : (
            <span className="text-xs text-subtle-foreground">{copy.routines.never}</span>
          )}
        </div>
      </div>
      <div className="relative z-10 flex shrink-0 items-center gap-1">
        <ActiveSwitch routine={routine} />
        <RoutineMenu routine={routine} onEdit={() => props.onEdit(routine)} withPause={needsFix} />
      </div>
    </li>
  );
}

function GroupHeading(props: { title: string; count: number }) {
  return (
    <div className="mb-1 flex min-h-7 items-center gap-2">
      <h2 className="text-sm font-semibold text-foreground">{props.title}</h2>
      <span className="text-xs text-muted-foreground">{props.count}</span>
    </div>
  );
}

function StartersEmpty(props: { onPick: (template: Partial<RoutineInput>) => void; onOwn: () => void }) {
  const starters = useMemo(starterRoutines, []);
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center pt-8" data-testid="routines-empty">
      <EmptyState icon={<CalendarClock />} title={copy.routines.empty.title} body={copy.routines.empty.pick} className="py-0 pb-6" />
      <ul className="w-full border-t border-border">
        {starters.map((starter) => (
          <li key={starter.id} className="border-b border-border">
            <button type="button" className="flex min-h-14 w-full items-center gap-3 rounded-lg px-2 py-2.5 text-start hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => props.onPick(starterTemplate(starter))} data-testid={`routine-starter-${starter.id}`}>
              <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-4">
                <CalendarClock />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{starter.name}</span>
                <span className="block text-xs text-muted-foreground">{describeSchedule(starter.schedule)}</span>
              </span>
              <Plus aria-hidden="true" className="size-4 shrink-0 text-subtle-foreground" />
            </button>
          </li>
        ))}
      </ul>
      <Button variant="quiet" size="sm" className="mt-4" onClick={props.onOwn}>
        {copy.routines.empty.own}
      </Button>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4" aria-busy="true">
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-3 w-72" />
      <Skeleton className="mt-3 h-4 w-48" />
      <Skeleton className="h-3 w-64" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The detail: one focal line, rows, the opdracht, results
// ---------------------------------------------------------------------------

function RoutineDetail(props: { routine: Routine; project: Project | null; backHref: string; onEdit: () => void; onRemoved: () => void }) {
  const status = useStatus();
  const runs = useRoutineRuns(props.routine.id);
  const chats = useRunChats(props.routine.projectId);
  const actions = useRoutineActions();
  const { routine, project } = props;
  const upcoming = routine.state === "active" ? nextOccurrences(routine.schedule, Date.now(), 3) : [];
  const last = routine.lastRun;
  const lastChat = last?.chatId ? (chats.get(last.chatId) ?? null) : null;
  const lastOutcome = last ? runOutcome(last, lastChat) : null;
  const model = routine.model === null ? copy.routines.modelDefault : status.data?.models.some((entry) => entry.id === routine.model) ? modelName(status.data, routine.model) : copy.routines.modelGone;

  // The focal card carries "Nu uitvoeren" for a missed or failed run; the header then does not repeat it (S6).
  const focalRuns = isMissed(routine) || lastRunFailed(routine);
  // The focal element (P7): what needs the person, else the next run.
  const focal: { title: string; state: ReactNode; tone: "neutral" | "failure"; decision: boolean; icon: ReactNode } | null =
    routine.state === "needs_attention"
      ? { title: copy.routines.needsAttention, state: routine.needsAttentionReason, tone: "neutral", decision: true, icon: <TriangleAlert /> }
      : last && lastOutcome?.status === "waiting"
        ? { title: lastOutcome.sentence ?? routine.name, state: <StatusChip status="waiting" />, tone: "neutral", decision: true, icon: <CalendarClock /> }
        : last && isMissed(routine)
          ? { title: copy.routines.missedAt(whenPhrase(last.scheduledAt)), state: copy.routines.missedRule, tone: "neutral", decision: true, icon: <CircleDashed /> }
          : last && lastRunFailed(routine)
            ? { title: copy.routines.runStatus.failed, state: last.error, tone: "failure", decision: false, icon: <CircleAlert /> }
            : null;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="routine-detail">
      <TopBar
        leading={
          <a href={props.backHref} className="-ms-1 flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-hover" aria-label={copy.nav.back}>
            <ChevronLeft className="size-5" />
          </a>
        }
        actions={
          <>
            {!focalRuns ? (
              <Button variant="secondary" onClick={() => void actions.runNow(routine)} disabled={routine.state === "archived"} data-testid="routine-run-now-header">
                <Play />
                <span className="max-sm:sr-only">{copy.routines.runNow}</span>
              </Button>
            ) : null}
            <RoutineMenu routine={routine} onEdit={props.onEdit} onRemoved={props.onRemoved} withPause />
          </>
        }
      >
        <PageTitle>{routine.name}</PageTitle>
      </TopBar>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pt-6 pb-16 sm:px-6">
          {focal ? (
            <Callout
              label={routine.name}
              icon={focal.icon}
              title={focal.title}
              state={focal.state}
              tone={focal.tone}
              decision={focal.decision}
              actions={<FixControl routine={routine} project={project} />}
              link={last?.chatId ? <ChatLink projectId={routine.projectId} chatId={last.chatId} className="text-sm" /> : undefined}
            />
          ) : (
            <p className="text-base font-semibold text-foreground">
              {routine.state === "inactive" ? copy.routines.pausedFocal : routine.state === "archived" ? copy.routines.archivedFocal : upcoming[0] !== undefined ? copy.routines.nextFocal(formatWhen(upcoming[0])) : copy.routines.noNext}
            </p>
          )}

          <section aria-label={copy.common.details}>
            <div className="border-t border-border">
              <Row
                label={copy.routines.schedule}
                value={
                  <span className="flex flex-col items-end">
                    <span className="text-foreground">{describeSchedule(routine.schedule)}</span>
                    {upcoming.length ? <span className="text-xs tabular-nums">{upcoming.map((at) => formatWhen(at)).join(" · ")}</span> : null}
                  </span>
                }
              />
              <Row
                label={copy.routines.project}
                value={
                  project ? (
                    <a className="inline-flex items-center gap-1.5 text-foreground underline-offset-2 hover:underline" href={href({ name: "project", projectId: project.id, chatId: null })}>
                      <ProjectIcon icon={project.icon} color={project.color} size="sm" className="size-4 [&_svg]:size-2.5" />
                      {project.name}
                    </a>
                  ) : (
                    "—"
                  )
                }
              />
              <Row label={copy.routines.model} value={model} />
              {routine.state === "active" || routine.state === "inactive" ? <Row label={copy.routines.active} action={<ActiveSwitch routine={routine} />} /> : null}
            </div>
          </section>

          <section aria-labelledby="routine-prompt">
            <div className="mb-1 flex items-center justify-between gap-3">
              <h2 id="routine-prompt" className="text-sm font-semibold text-foreground">
                {copy.routines.prompt}
              </h2>
              <Button variant="quiet" size="sm" onClick={props.onEdit}>
                <Pencil />
                {copy.routines.edit}
              </Button>
            </div>
            <blockquote className="rounded-2xl bg-muted/60 px-3.5 py-3 text-sm whitespace-pre-wrap text-foreground">{routine.prompt}</blockquote>
          </section>

          <section aria-labelledby="routine-results">
            <h2 id="routine-results" className="mb-1 text-sm font-semibold text-foreground">
              {copy.routines.results}
            </h2>
            {runs.isLoading ? (
              <div className="flex flex-col gap-2 border-t border-border pt-3" aria-busy="true">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : runs.data?.length ? (
              <ul className="border-t border-border">
                {runs.data.map((run) => (
                  <li key={run.id} className="flex min-h-12 items-center border-b border-border py-2.5">
                    <RunLine run={run} chat={run.chatId ? (chats.get(run.chatId) ?? null) : null} routine={routine} detail />
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

function DetailSkeleton(props: { backHref: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar
        leading={
          <a href={props.backHref} className="-ms-1 flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-hover" aria-label={copy.nav.back}>
            <ChevronLeft className="size-5" />
          </a>
        }
      >
        <Skeleton className="h-4 w-48" />
      </TopBar>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-6 sm:px-6" aria-busy="true">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The page: #/routines and the project's Routines tab (same props, same rows)
// ---------------------------------------------------------------------------

export function RoutinesPage(props: { projectId: string | null; routineId: string | null }) {
  const backend = useBackend();
  const projects = useProjects();
  const routines = useRoutines(props.projectId);
  const chats = useRunChats(props.projectId);
  const [editing, setEditing] = useState<Routine | null>(null);
  const [creating, setCreating] = useState<Partial<RoutineInput> | null>(null);
  const project = props.projectId ? (projects.data?.find((entry) => entry.id === props.projectId) ?? null) : null;
  const title = project ? copy.routines.projectTitle(project.name) : copy.routines.title;
  const listRoute = props.projectId ? { name: "project-routines" as const, projectId: props.projectId, routineId: null } : { name: "routines" as const, routineId: null };
  const listHref = href(listRoute);
  const projectMap = useMemo(() => new Map((projects.data ?? []).map((entry) => [entry.id, entry])), [projects.data]);

  const editor = (
    <RoutineEditor
      open={creating !== null || editing !== null}
      onOpenChange={(open) => {
        if (!open) {
          setCreating(null);
          setEditing(null);
        }
      }}
      routine={editing}
      projectId={props.projectId}
      template={creating ?? undefined}
    />
  );

  if (props.routineId) {
    const selected = routines.data?.find((routine) => routine.id === props.routineId) ?? null;
    if (selected) {
      return (
        <>
          <RoutineDetail routine={selected} project={projectMap.get(selected.projectId) ?? null} backHref={listHref} onEdit={() => setEditing(selected)} onRemoved={() => navigate(listRoute)} />
          {editor}
        </>
      );
    }
    if (routines.isLoading) return <DetailSkeleton backHref={listHref} />;
    // Unknown id: the page says so and keeps its shell (C6, brief §3); the list is one link away.
    return (
      <div className="flex h-full min-h-0 flex-col">
        <TopBar
          leading={
            <a href={listHref} className="-ms-1 flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-hover" aria-label={copy.nav.back}>
              <ChevronLeft className="size-5" />
            </a>
          }
        >
          <PageTitle>{title}</PageTitle>
        </TopBar>
        <EmptyState
          icon={<CalendarClock />}
          title={copy.routines.notFound}
          action={
            <a href={listHref} className={LINK_BUTTON}>
              {copy.routines.allRoutines}
            </a>
          }
        />
      </div>
    );
  }

  const all = routines.data ?? [];
  const groups = groupRoutines(all);
  const archived = all.filter((routine) => routine.state === "archived");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar
        actions={
          backend.capabilities.routines && all.length > 0 ? (
            <Button variant="primary" onClick={() => setCreating({})} data-testid="routine-new">
              <Plus />
              <span className="max-sm:sr-only">{copy.routines.new}</span>
            </Button>
          ) : null
        }
      >
        <PageTitle>{title}</PageTitle>
      </TopBar>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 pt-5 pb-16 sm:px-6 sm:pt-6">
          {!backend.capabilities.routines ? (
            <EmptyState icon={<CalendarClock />} title={copy.routines.title} body={<Locked className="text-sm">{copy.routines.locked}</Locked>} />
          ) : routines.isLoading ? (
            <ListSkeleton />
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
            <StartersEmpty onPick={setCreating} onOwn={() => setCreating({})} />
          ) : (
            <div className="flex flex-col gap-7" data-testid="routines-list">
              {groups.map((group) => (
                <section key={group.key} aria-labelledby={`routines-${group.key}`} data-testid={`routines-group-${group.key}`}>
                  <GroupHeading title={groupTitle(group.key)} count={group.routines.length} />
                  <ul className="border-t border-border">
                    {group.routines.map((routine) => (
                      <RoutineRow key={routine.id} routine={routine} project={projectMap.get(routine.projectId) ?? null} showProject={!props.projectId} chats={chats} onEdit={setEditing} baseProjectId={props.projectId} />
                    ))}
                  </ul>
                </section>
              ))}
              {archived.length ? (
                <Disclosure label={`${copy.routines.groups.archived} (${archived.length})`} panelClassName="ps-0" className="-mx-1">
                  <ul className="border-t border-border">
                    {archived.map((routine) => (
                      <RoutineRow key={routine.id} routine={routine} project={projectMap.get(routine.projectId) ?? null} showProject={!props.projectId} chats={chats} onEdit={setEditing} baseProjectId={props.projectId} />
                    ))}
                  </ul>
                </Disclosure>
              ) : null}
            </div>
          )}
        </div>
      </main>
      {editor}
    </div>
  );
}

function groupTitle(key: RoutineGroupKey): string {
  return copy.routines.groups[key];
}
