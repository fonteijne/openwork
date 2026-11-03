import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { dateOf, datesBetween, dutchDuration, QUARTER_MINUTES, weekOf } from "@bonzaiwork/agenda/model";
import { Check, Circle, CircleDot, FilePen, FileText, FolderOpen, GitBranch, MessageSquare, Play, Repeat, RotateCcw, X } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys, modelName, projectHasKey, useAgendaSettings, useBrain, useRefreshAttention, useRoutines, useStatus, useSummary, useUsage, useWorkflows } from "~/backend/queries";
import type { Chat, Message, Project, Routine, Workflow, WorkflowStage } from "~/backend/types";
import { PromptDialog } from "~/components/prompt-dialog";
import { Button } from "~/components/ui/button";
import { StatusChip } from "~/components/ui/chip";
import { Disclosure } from "~/components/ui/disclosure";
import { Textarea } from "~/components/ui/field";
import { Locked, Skeleton } from "~/components/ui/misc";
import { Progress } from "~/components/ui/progress";
import { Select } from "~/components/ui/select";
import { toast } from "~/components/ui/toast";
import { Tooltip } from "~/components/ui/tooltip";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { projectRelativePath } from "~/lib/file-links";
import { formatDateTime, formatMoney, formatTokens, formatWhen, relativeTime } from "~/lib/format";
import { href, navigate, type ProjectTab } from "~/lib/router";
import { describeSchedule } from "~/lib/schedule";
import { insertComposerText } from "~/lib/shortcuts";
import { touchedFiles } from "~/lib/tools";

import { postText } from "../agenda/format";
import { BrainLine } from "../brain/brain-line";
import { deliverableOf, stageName } from "../brain/model";
import { useStartChat } from "../brain/start-chat";
import { useOpenProjectFile, useOpenedFile } from "../chat/file-link";
import { absoluteFilePath, FileView } from "../chat/sidecar";
import { useProjectState, useRuntime } from "./runtime";

const EMPTY: Message[] = [];

// ---------------------------------------------------------------------------
// Pieces shared with the Werk and Bestanden tabs
// ---------------------------------------------------------------------------

/** One group of the column: a quiet heading, content below, one hairline between groups (S1). */
function Group(props: { title: string; children: ReactNode; action?: ReactNode; testId?: string }) {
  return (
    <section className="border-b border-border px-4 py-3.5 last:border-b-0" aria-label={props.title} data-testid={props.testId}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-subtle-foreground">{props.title}</h3>
        {props.action}
      </div>
      {props.children}
    </section>
  );
}

/** Label left, state right (S2), inside a `<dl>`. */
function Fact(props: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-7 items-baseline justify-between gap-3 text-sm">
      <dt className="shrink-0 text-muted-foreground">{props.label}</dt>
      <dd className="min-w-0 truncate text-end text-foreground">{props.children}</dd>
    </div>
  );
}

/**
 * A document as a row (brief §6): icon, name, one meta line; the row opens the reader, the one
 * trailing action shows the file in its folder (S2). Names are plain text, not mono: a document is
 * the person's object, its path is a technical detail (C3).
 */
export function DocumentRow(props: {
  name: string;
  meta: ReactNode;
  onOpen: () => void;
  /** The absolute path for "Tonen in map"; null hides the action (no desktop, P4 does not apply: it is the shell's feature). */
  revealPath: string | null;
  /** "Vraag hierover": puts the document's name in the open composer (brief §6). */
  onAsk?: () => void;
  changed?: boolean;
  dense?: boolean;
  testId?: string;
}) {
  const backend = useBackend();
  return (
    <li className="flex min-w-0 items-center gap-1 border-b border-border last:border-b-0" data-testid={props.testId}>
      <button
        type="button"
        onClick={props.onOpen}
        title={copy.project.details.open}
        className={cn(
          "-ms-1.5 flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 text-start outline-none transition-colors duration-100 hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring",
          props.dense ? "min-h-10 py-1.5" : "min-h-12 py-2",
        )}
      >
        {props.changed ? <FilePen className="size-4 shrink-0 text-electric-11" aria-hidden="true" /> : <FileText className="size-4 shrink-0 text-subtle-foreground" aria-hidden="true" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{props.name}</span>
          {props.meta ? <span className="block truncate text-xs text-muted-foreground">{props.meta}</span> : null}
        </span>
      </button>
      {props.onAsk ? (
        <Tooltip label={copy.project.askAbout}>
          <Button variant="quiet" size="icon-sm" aria-label={copy.project.askAbout} onClick={props.onAsk}>
            <MessageSquare />
          </Button>
        </Tooltip>
      ) : null}
      {props.revealPath && backend.capabilities.revealPath ? (
        <Tooltip label={copy.project.details.reveal}>
          <Button variant="quiet" size="icon-sm" aria-label={copy.project.details.reveal} onClick={() => void backend.desktop.revealPath(props.revealPath ?? "")}>
            <FolderOpen />
          </Button>
        </Tooltip>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Werkwijze: an ICM workflow as a stage bar with the one thing to do (plan §6.5), moved here
// from the start page so the composer stays the only primary there (brief §6, P7).
// ---------------------------------------------------------------------------

function StageMark(props: { stage: WorkflowStage }) {
  const { state } = props.stage;
  const icon = state === "done" ? <Check /> : state === "failed" ? <X /> : state === "check" ? <CircleDot /> : <Circle />;
  return (
    <li
      className={cn(
        "flex min-w-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs ring-1 ring-inset [&_svg]:size-3 [&_svg]:shrink-0",
        state === "done" ? "text-foreground ring-border" : state === "check" || state === "failed" ? "text-foreground ring-amber-9/60" : state === "ready" ? "text-foreground ring-primary/60" : "text-subtle-foreground ring-border",
      )}
      title={`${stageName(props.stage)}: ${copy.brain.stageStates[state]}`}
    >
      {icon}
      <span className="truncate">{stageName(props.stage)}</span>
      <span className="sr-only">{copy.brain.stageStates[state]}</span>
    </li>
  );
}

function WorkflowBar(props: { project: Project; workflow: Workflow }) {
  const backend = useBackend();
  const client = useQueryClient();
  const startChat = useStartChat(props.project.id);
  const openFile = useOpenProjectFile(props.project, null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const { workflow } = props;
  const current = workflow.stages.find((stage) => stage.state !== "done") ?? null;
  const output = current?.outputs[0] ? `workflows/${workflow.name}/${current.id}/${current.outputs[0]}` : null;

  const act = async (task: () => Promise<void>, done?: string) => {
    setBusy(true);
    try {
      await task();
      if (done) toast(done);
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
    } finally {
      setBusy(false);
      await client.invalidateQueries({ queryKey: keys.workflows(props.project.id) });
    }
  };
  const start = (stage: WorkflowStage) => act(async () => startChat(await backend.brains.startStage(props.project.id, workflow.name, stage.id)));

  let note: string | null = null;
  let actions: ReactNode = null;
  if (!current) {
    note = copy.brain.runDone;
  } else if (current.state === "ready") {
    actions = (
      <Button variant="secondary" size="sm" disabled={busy} onClick={() => void start(current)}>
        <Play />
        {copy.brain.stageStart(stageName(current))}
      </Button>
    );
  } else if (current.state === "failed") {
    note = current.failure;
    actions = (
      <Button variant="secondary" size="sm" disabled={busy} onClick={() => void start(current)}>
        <RotateCcw />
        {copy.brain.stageAgain}
      </Button>
    );
  } else if (current.state === "check") {
    // The question names the deliverable, not the folder id (assessment P-3).
    note = copy.brain.workflow.question(deliverableOf(current));
    actions =
      current.check.kind === "script" ? (
        <Locked>{copy.brain.stageScriptLocked}</Locked>
      ) : current.check.kind === "model" ? (
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void act(async () => startChat(await backend.brains.modelCheck(props.project.id, workflow.name, current.id)))}>
          {copy.brain.stageModelCheck}
        </Button>
      ) : (
        <>
          {/* Secondary: the page keeps its one primary (brief §6, P7); the check card above the chat's composer is where the decision is focal. */}
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void act(() => backend.brains.checkStage(props.project.id, workflow.name, current.id, "pass", null), copy.brain.stageStates.done)}>
            {copy.brain.stageApprove}
          </Button>
          {output ? (
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => openFile(output)}>
              {copy.brain.stageOpen}
            </Button>
          ) : null}
          <Button variant="quiet" size="sm" disabled={busy} onClick={() => setRejecting(true)}>
            {copy.brain.stageReject}
          </Button>
        </>
      );
  } else if (current.missing.length) {
    note = copy.brain.stageMissing(current.missing.map((path) => path.split("/").at(-1) ?? path).join(", "));
  }

  return (
    <div className="flex flex-col gap-2 py-1" data-testid="workflow">
      <p className="text-sm font-medium text-foreground">{workflow.title}</p>
      <ol className="flex flex-wrap gap-1" aria-label={workflow.title}>
        {workflow.stages.map((stage) => (
          <StageMark key={stage.id} stage={stage} />
        ))}
      </ol>
      {note ? (
        <p className="text-sm text-muted-foreground" role="status">
          {note}
        </p>
      ) : null}
      {actions ? <div className="flex flex-wrap items-center gap-1.5">{actions}</div> : null}
      <PromptDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title={copy.brain.stageReject}
        label={copy.brain.stageRejectReason}
        submitLabel={copy.brain.stageReject}
        onSubmit={async (reason) => {
          if (current) await act(() => backend.brains.checkStage(props.project.id, workflow.name, current.id, "fail", reason.trim() || null));
          setRejecting(false);
        }}
      />
    </div>
  );
}

function WorkflowsGroup(props: { project: Project }) {
  const workflows = useWorkflows(props.project.id);
  const list = workflows.data ?? [];
  if (!list.length) return null;
  return (
    <Group title={copy.project.details.workflow} testId="details-workflows">
      <div className="flex flex-col divide-y divide-border">
        {list.map((workflow) => (
          <WorkflowBar key={workflow.name} project={props.project} workflow={workflow} />
        ))}
      </div>
    </Group>
  );
}

// ---------------------------------------------------------------------------
// Routine: the next run of this project, or where a chat came from
// ---------------------------------------------------------------------------

function useRunRoutine(projectId: string) {
  const backend = useBackend();
  const refreshAttention = useRefreshAttention();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = async (routine: Routine) => {
    setBusy(true);
    try {
      const started = await backend.routines.run(routine.id);
      const chatId = started.chatId;
      toast(copy.project.details.started, chatId ? { action: { label: copy.project.work.attention.openChat, onClick: () => navigate({ name: "project", projectId, chatId }) } } : {});
      await Promise.all([client.invalidateQueries({ queryKey: keys.allRoutines }), refreshAttention()]);
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

/** The soonest active routine of the project, with "Nu uitvoeren" (brief §6). Nothing when none is planned. */
function NextRoutineGroup(props: { project: Project }) {
  const backend = useBackend();
  const routines = useRoutines(props.project.id);
  const { busy, run } = useRunRoutine(props.project.id);
  const next = useMemo(
    () =>
      (routines.data ?? [])
        .filter((routine) => routine.state === "active" && routine.nextRunAt !== null)
        .sort((a, b) => (a.nextRunAt ?? 0) - (b.nextRunAt ?? 0))[0] ?? null,
    [routines.data],
  );
  if (!backend.capabilities.routines || !next || next.nextRunAt === null) return null;
  return (
    <Group title={copy.project.details.routine} testId="details-routine">
      <a href={href({ name: "project-routines", projectId: props.project.id, routineId: next.id })} className="block min-w-0 text-sm font-medium text-foreground hover:underline underline-offset-2">
        <span className="flex items-center gap-2">
          <Repeat className="size-4 shrink-0 text-subtle-foreground" aria-hidden="true" />
          <span className="truncate">{next.name}</span>
        </span>
      </a>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{copy.project.details.routineNext(formatWhen(next.nextRunAt))}</p>
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void run(next)}>
          <Play />
          {copy.project.details.runNow}
        </Button>
      </div>
    </Group>
  );
}

/** Where a chat came from: the routine, its schedule, and "Pauzeren" (brief §6). */
function ChatRoutineGroup(props: { project: Project; chat: Chat }) {
  const backend = useBackend();
  const client = useQueryClient();
  const routines = useRoutines(props.project.id);
  const [busy, setBusy] = useState(false);
  const routine = props.chat.routineId ? (routines.data?.find((entry) => entry.id === props.chat.routineId) ?? null) : null;
  if (!props.chat.routineId) return null;
  const pause = async () => {
    if (!routine) return;
    setBusy(true);
    try {
      await backend.routines.update(routine.id, { state: "inactive" });
      await client.invalidateQueries({ queryKey: keys.allRoutines });
      toast(copy.project.details.paused);
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Group title={copy.project.details.routine} testId="details-chat-routine">
      <a href={href({ name: "project-routines", projectId: props.project.id, routineId: props.chat.routineId })} className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground hover:underline underline-offset-2">
        <Repeat className="size-4 shrink-0 text-subtle-foreground" aria-hidden="true" />
        <span className="truncate">{copy.project.details.routineFrom(routine?.name ?? copy.chatList.routineChat)}</span>
      </a>
      {routine ? (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm text-muted-foreground">{describeSchedule(routine.schedule)}</p>
          {routine.state === "active" ? (
            <Button variant="quiet" size="sm" disabled={busy} onClick={() => void pause()}>
              {copy.project.details.pause}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">{copy.routines.paused}</span>
          )}
        </div>
      ) : null}
    </Group>
  );
}

// ---------------------------------------------------------------------------
// Project: key, usage, the agenda week, technical details
// ---------------------------------------------------------------------------

/** Minutes this project got this week (Monday up to today), from the day views the agenda already caches. */
function useWeekMinutes(projectId: string, enabled: boolean): number | null {
  const backend = useBackend();
  const today = dateOf(Date.now());
  const dates = datesBetween(weekOf(today).from, today);
  const results = useQueries({
    queries: dates.map((date) => ({
      queryKey: keys.agendaDay(date),
      queryFn: () => backend.agenda.day(date),
      enabled: enabled && backend.capabilities.agenda,
      staleTime: 60_000,
    })),
  });
  if (!enabled || results.some((result) => result.data === undefined)) return null;
  let minutes = 0;
  for (const result of results) {
    for (const quarter of result.data?.quarters ?? []) {
      if (quarter.kind === "project" && quarter.workspaceId === projectId) minutes += QUARTER_MINUTES;
    }
  }
  return minutes;
}

/** "Deze week 6u 15m · post X · Wijzigen": the agenda row of the project (brief §6); "Wijzigen" opens the Project settings group. */
function AgendaRow(props: { project: Project }) {
  const backend = useBackend();
  const settings = useAgendaSettings();
  const enabled = settings.data?.enabled ?? false;
  const minutes = useWeekMinutes(props.project.id, enabled);
  const post = settings.data?.projects.find((entry) => entry.workspaceId === props.project.id)?.bridgePost ?? null;
  const settingsLink = href({ name: "project-settings", projectId: props.project.id, group: "project" });
  if (!backend.capabilities.agenda) return <Locked>{copy.agenda.unavailable}</Locked>;
  if (settings.isLoading) return <Skeleton className="h-4 w-48" />;
  if (!enabled) return <span className="text-sm text-muted-foreground">{copy.agenda.off}</span>;
  // One line in a 320px column: the week total, the post (label when it has one) truncating, "Wijzigen" always visible.
  const postLabel = post ? (post.label ?? postText(post)) : null;
  return (
    <p className="flex min-w-0 items-center gap-x-1.5 text-sm" data-testid="details-agenda-row" title={post ? postText(post) : undefined}>
      <span className="shrink-0 text-foreground">{minutes === null ? <Skeleton className="inline-block h-3.5 w-24 align-middle" /> : copy.project.details.weekLine(dutchDuration(minutes))}</span>
      <span aria-hidden="true" className="shrink-0 text-subtle-foreground">
        ·
      </span>
      {/* Amber only on the missing post: the one thing that needs attention (V2). */}
      <span className={cn("min-w-0 flex-1 truncate", postLabel ? "text-muted-foreground" : "font-medium text-warning-foreground")}>{postLabel ? copy.project.details.post(postLabel) : copy.project.details.noPost}</span>
      <span aria-hidden="true" className="shrink-0 text-subtle-foreground">
        ·
      </span>
      <a href={settingsLink} className="shrink-0 font-medium text-electric-11 underline-offset-2 hover:underline">
        {copy.project.details.change}
      </a>
    </p>
  );
}

function UsageLine(props: { project: Project }) {
  const backend = useBackend();
  const summary = useSummary(props.project.id);
  const usage = useUsage(props.project.id);
  if (backend.capabilities.usage) {
    if (!usage.data) return usage.isLoading ? <Skeleton className="h-4 w-32" /> : <Locked>{copy.settings.usageLocked}</Locked>;
    const { spend, maxBudget, currency } = usage.data;
    if (maxBudget === null) return <span className="text-sm text-foreground">{formatMoney(spend, currency)}</span>;
    const ratio = spend / maxBudget;
    return (
      <Progress
        value={Math.min(spend, maxBudget)}
        max={maxBudget}
        label={copy.project.details.usage}
        caption={copy.project.details.usageCaption}
        valueText={copy.project.details.usageOf(formatMoney(spend, currency), formatMoney(maxBudget, currency))}
        tone={ratio >= 1 ? "exceeded" : ratio >= 0.9 ? "warning" : "neutral"}
      />
    );
  }
  if (summary.data?.tokens) return <span className="text-sm text-foreground">{copy.project.details.usageTokens(formatTokens(summary.data.tokens.input), formatTokens(summary.data.tokens.output))}</span>;
  if (summary.data) return <Locked>{copy.settings.usageLocked}</Locked>;
  return <Skeleton className="h-4 w-32" />;
}

function ProjectGroup(props: { project: Project }) {
  const backend = useBackend();
  const status = useStatus();
  const { project } = props;
  const key = status.data?.keyMode === "user" ? status.data.user : project.key;
  return (
    <Group title={copy.project.details.project} testId="details-project">
      <dl className="flex flex-col gap-1">
        <Fact label={copy.project.details.key}>{projectHasKey(status.data, project) ? copy.keys.linked(key.keyHint ?? "") : <Locked>{copy.keys.missing}</Locked>}</Fact>
      </dl>
      <div className="mt-2">
        <UsageLine project={project} />
      </div>
      <div className="mt-2.5">
        <AgendaRow project={project} />
      </div>
      {/* Path and shell actions stay behind a labelled row (P3). */}
      <Disclosure label={copy.project.details.technical} size="sm" className="-mx-1 mt-2" panelClassName="ps-6 pt-1 pb-1">
        <p className="break-all font-mono text-xs text-muted-foreground">{project.path}</p>
        {backend.capabilities.revealPath ? (
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => void backend.desktop.revealPath(project.path)}>
            <FolderOpen />
            {copy.project.details.reveal}
          </Button>
        ) : null}
      </Disclosure>
    </Group>
  );
}

/**
 * Details on a project tab (brief §6): Brein · Werkwijze · Routine · Project. Never repeats the
 * page's own rows: the Brein tab drops the brain line, Routines the routine, Instellingen the
 * project facts (key, usage, agenda).
 */
function WorkDetails(props: { project: Project; tab: ProjectTab }) {
  return (
    <>
      {props.tab === "brain" ? null : (
        <Group title={copy.project.details.brain} testId="details-brain">
          <BrainLine projectId={props.project.id} />
        </Group>
      )}
      <WorkflowsGroup project={props.project} />
      {props.tab === "routines" ? null : <NextRoutineGroup project={props.project} />}
      {props.tab === "settings" ? null : <ProjectGroup project={props.project} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Chat: Resultaat first, then where it came from, then everything else behind "Details"
// ---------------------------------------------------------------------------

function ResultGroup(props: { project: Project; chat: Chat }) {
  const messages = useProjectState((state) => state.messages[props.chat.id]?.list ?? EMPTY);
  const files = useMemo(() => touchedFiles(messages), [messages]);
  const openFile = useOpenProjectFile(props.project, props.chat.id);
  return (
    <Group title={copy.project.details.result} testId="details-result">
      {files.length ? (
        <ul className="-mt-1 flex flex-col">
          {files.map((file) => {
            const path = projectRelativePath(file.path, props.project.path);
            return (
              <DocumentRow
                key={file.path}
                name={file.name}
                meta={file.changed ? copy.project.details.changed : copy.project.details.read}
                changed={file.changed}
                dense
                onOpen={() => (path ? openFile(path) : toast(copy.errors.not_found, { tone: "error" }))}
                onAsk={() => insertComposerText(copy.project.details.askAboutText(file.name))}
                revealPath={path ? absoluteFilePath(props.project, path) : null}
              />
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{copy.project.details.resultEmpty}</p>
      )}
    </Group>
  );
}

function ChatBrainGroup(props: { project: Project }) {
  const brain = useBrain(props.project.id);
  if (!brain) return null;
  return (
    <Group title={copy.project.details.brain} testId="details-chat-brain">
      <BrainLine projectId={props.project.id} />
    </Group>
  );
}

/** Sub-tasks and the chat a sub-task belongs to: the one way back and forth between them. */
function RelatedGroup(props: { project: Project; chat: Chat }) {
  const chats = useProjectState((state) => state.chats);
  const subtasks = useMemo(() => Object.values(chats).filter((entry) => entry.parentId === props.chat.id), [chats, props.chat.id]);
  const parent = props.chat.parentId ? chats[props.chat.parentId] : null;
  if (!parent && !subtasks.length) return null;
  const link = (chat: Chat) => href({ name: "project", projectId: props.project.id, chatId: chat.id });
  return (
    <Group title={parent ? copy.project.details.partOf : copy.project.details.subtasks}>
      <ul className="-mx-1.5 flex flex-col">
        {[...(parent ? [parent] : []), ...subtasks].map((chat) => (
          <li key={chat.id}>
            <a href={link(chat)} className="flex min-h-8 items-center gap-2 rounded-md px-1.5 text-sm hover:bg-hover">
              <GitBranch className="size-4 shrink-0 text-subtle-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{chat.untitled ? copy.chat.untitled : chat.title}</span>
              <StatusChip status={chat.status} />
            </a>
          </li>
        ))}
      </ul>
    </Group>
  );
}

/** Status, model, times, tokens, group and note: facts, behind one labelled row (P3). */
function ChatFacts(props: { project: Project; chat: Chat }) {
  const backend = useBackend();
  const runtime = useRuntime();
  const status = useStatus();
  const messages = useProjectState((state) => state.messages[props.chat.id]?.list ?? EMPTY);
  const groups = useProjectState((state) => state.groups);
  const [note, setNote] = useState(props.chat.note ?? "");
  const { chat } = props;

  useEffect(() => setNote(chat.note ?? ""), [chat.id, chat.note]);

  const tokens = useMemo(() => {
    let input = 0;
    let output = 0;
    for (const message of messages) {
      input += message.tokens?.input ?? 0;
      output += message.tokens?.output ?? 0;
    }
    return { input, output };
  }, [messages]);

  const saveNote = async () => {
    if ((chat.note ?? "") === note.trim()) return;
    try {
      await backend.chats.setNote(props.project.id, chat.id, note.trim() || null);
      runtime.upsertChat({ ...chat, note: note.trim() || null });
      toast(copy.project.details.noteSaved);
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
    }
  };

  return (
    <div className="px-4 py-2">
      <Disclosure label={copy.project.details.more} className="-mx-1" panelClassName="ps-1 pt-1 pb-2" testId="details-chat-more">
        <dl className="flex flex-col gap-0.5">
          <Fact label={copy.project.details.status}>
            <StatusChip status={chat.status} label={chat.status === "idle" ? copy.shell.status.idle : undefined} />
          </Fact>
          <Fact label={copy.project.details.model}>{modelName(status.data, chat.model) ?? "—"}</Fact>
          <Fact label={copy.project.details.started2}>{formatDateTime(chat.createdAt)}</Fact>
          <Fact label={copy.project.details.updated}>{relativeTime(chat.updatedAt)}</Fact>
          <Fact label={copy.project.details.tokens}>{tokens.input + tokens.output ? copy.project.details.usageTokens(formatTokens(tokens.input), formatTokens(tokens.output)) : "—"}</Fact>
        </dl>
        {!chat.parentId ? (
          <div className="mt-2">
            <Select
              label={copy.project.details.group}
              value={chat.groupId ?? "__none"}
              items={[{ value: "__none", label: copy.project.details.noGroup }, ...groups.map((group) => ({ value: group.id, label: group.label }))]}
              onValueChange={(value) => {
                const groupId = value === "__none" ? null : value;
                runtime.upsertChat({ ...chat, groupId });
                void backend.groups
                  .assign(props.project.id, chat.id, groupId)
                  .then(() => runtime.reloadGroups())
                  .catch((failure: unknown) => toast(errorText(failure), { tone: "error" }));
              }}
            />
          </div>
        ) : null}
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => void saveNote()}
          placeholder={copy.project.details.notePlaceholder}
          aria-label={copy.project.details.note}
          rows={2}
          className="mt-2 min-h-12 text-sm"
        />
      </Disclosure>
    </div>
  );
}

function ChatDetails(props: { project: Project; chat: Chat }) {
  return (
    <>
      <ResultGroup project={props.project} chat={props.chat} />
      <ChatRoutineGroup project={props.project} chat={props.chat} />
      <RelatedGroup project={props.project} chat={props.chat} />
      <ChatBrainGroup project={props.project} />
      <ChatFacts project={props.project} chat={props.chat} />
    </>
  );
}

// ---------------------------------------------------------------------------
// The column itself
// ---------------------------------------------------------------------------

/**
 * The Details column, overlay or sheet (brief §4, §6). With a file in the hash it is the reader;
 * on a chat it shows Resultaat first; on the Werk tab Brein · Werkwijze · Routine · Project.
 */
export function Details(props: { project: Project; chatId: string | null; tab?: ProjectTab; onClose?: () => void }) {
  const chat = useProjectState((state) => (props.chatId ? state.chats[props.chatId] : undefined));
  const file = useOpenedFile(props.project.id);
  if (file) return <FileView project={props.project} path={file} chatId={props.chatId} onClose={props.onClose} />;
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="details">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4" data-titlebar="sidecar">
        <h2 className="text-sm font-semibold">{copy.project.details.title}</h2>
        {props.onClose ? (
          <Button variant="quiet" size="icon-sm" aria-label={copy.project.details.close} onClick={props.onClose}>
            <X />
          </Button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{chat ? <ChatDetails project={props.project} chat={chat} /> : <WorkDetails project={props.project} tab={props.tab ?? "work"} />}</div>
    </div>
  );
}
