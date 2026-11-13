import { useState } from "react";
import { CalendarClock, Flag, Hourglass, ListChecks, Plus } from "lucide-react";

import { useBackend } from "~/backend/context";
import { projectHasKey, startModel, useBrains, useProjects, useRefreshToday, useStatus } from "~/backend/queries";
import type { CleanupCandidate, DayPlan, Focus, Project, StartHere, TodayChatStart, Todo, TodayView, UpcomingRow } from "~/backend/types";
import { ProjectIcon } from "~/components/project-icon";
import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Checkbox } from "~/components/ui/checkbox";
import { Disclosure } from "~/components/ui/disclosure";
import { Field, Input } from "~/components/ui/field";
import { Kbd } from "~/components/ui/misc";
import { Dialog } from "~/components/ui/overlay";
import { Select } from "~/components/ui/select";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { cardKeys } from "~/lib/card-keys";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { href, navigate } from "~/lib/router";

import { sendFirstMessage } from "../chat/first-message";
import { SectionHeading } from "../home/attention-section";
import { formatDay, groupUpcoming, MAX_UPCOMING_ROWS, meetingTime, startProject } from "./model";

/**
 * The personal agent's own sections on Vandaag (docs/bonzaiwork/persoonlijke-agent-plan.md §4):
 * "Start hier" (the one to-do the agent picked, T4), the line that says what you were doing, the
 * day plan to approve and "Komt eraan". The world's cards live in "Voor jou" (world-cards.tsx).
 */
const ROW = "flex min-h-11 items-center gap-3 border-b border-border py-2 text-sm last:border-b-0";
const PERSONAL = "personal";

/** Starts the chat the server wrote for a to-do or a clean-up, in that project, on its model. */
function useStartChat() {
  const backend = useBackend();
  const status = useStatus();
  const projects = useProjects();
  return async (start: TodayChatStart): Promise<{ project: Project; chatId: string } | null> => {
    const project = startProject(start, projects.data ?? []);
    const model = start.model ?? startModel(status.data, project);
    if (!project || !model || !projectHasKey(status.data, project)) {
      toast(copy.today.noKey, { tone: "error" });
      return null;
    }
    const chat = await backend.chats.create(project.id, { model, title: start.title });
    // The chat is the person's object (P11): it opens with the first step already asked for.
    sendFirstMessage(backend, chat, { text: start.prompt, model, agent: null, attachments: [], command: null, skills: [] });
    if (backend.capabilities.agenda) void backend.agenda.reportPresence({ projectId: project.id, name: project.name });
    return { project, chatId: chat.id };
  };
}

/** One busy flag; a failure is a toast in the server's own sentence. */
function useAction() {
  const refresh = useRefreshToday();
  const [busy, setBusy] = useState(false);
  const act = async (task: () => Promise<unknown>, done?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await task();
      if (done) toast(done);
      await refresh();
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  return { busy, act };
}

function BrainName(props: { todo: Todo; projects: ReadonlyMap<string, Project> }) {
  const project = props.projects.get(props.todo.brainId);
  return (
    <span className="text-foreground">
      {project ? <ProjectIcon icon={project.icon} color={project.color} size="sm" className="me-1.5 inline-flex size-4 align-[-3px] [&_svg]:size-2.5" /> : null}
      {project?.name ?? props.todo.brainName}
    </span>
  );
}

// ---------------------------------------------------------------------------
// "Je was bezig met …": the way back after a distraction
// ---------------------------------------------------------------------------

export function FocusLine(props: { focus: Focus; projects: ReadonlyMap<string, Project> }) {
  const backend = useBackend();
  const { busy, act } = useAction();
  const { focus } = props;
  const project = focus.brainId ? props.projects.get(focus.brainId) : undefined;
  return (
    <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-window bg-muted px-4 py-2 text-sm" data-testid="today-focus">
      {project ? <ProjectIcon icon={project.icon} color={project.color} size="sm" /> : null}
      <span className="min-w-0 flex-1 truncate font-medium text-foreground">{copy.today.focus(focus.title)}</span>
      {project && focus.chatId ? (
        <a href={href({ name: "project", projectId: project.id, chatId: focus.chatId })} className="font-medium text-foreground underline underline-offset-2">
          {copy.attention.openChat}
        </a>
      ) : null}
      {focus.todoId ? (
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void act(() => backend.today.setDone(focus.todoId ?? "", true), copy.today.doneToast)}>
          {copy.today.done}
        </Button>
      ) : null}
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => void act(() => backend.today.stopFocus(), copy.today.focusStopped)}>
        {copy.today.focusStop}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Start hier (T4)
// ---------------------------------------------------------------------------

function AddTodoDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; projects: ReadonlyMap<string, Project> }) {
  const backend = useBackend();
  const brains = useBrains();
  const refresh = useRefreshToday();
  const [text, setText] = useState("");
  const [brainId, setBrainId] = useState(PERSONAL);
  const [due, setDue] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const shared = (brains.data ?? []).filter((brain) => brain.status.kind === "project" && props.projects.has(brain.projectId));
  const items = [{ value: PERSONAL, label: copy.today.add.personalBrain }, ...shared.map((brain) => ({ value: brain.projectId, label: props.projects.get(brain.projectId)?.name ?? brain.projectId }))];

  const save = async () => {
    setTried(true);
    if (!text.trim()) return;
    setBusy(true);
    setFailure(null);
    try {
      await backend.today.addTodo({ text: text.trim(), brainId: brainId === PERSONAL ? null : brainId, due: due || null });
      toast(copy.today.added);
      setText("");
      setDue("");
      setTried(false);
      props.onOpenChange(false);
      await refresh();
    } catch (error) {
      setFailure(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={copy.today.addTodo}
      footer={
        <>
          <Button variant="secondary" onClick={() => props.onOpenChange(false)} disabled={busy}>
            {copy.common.cancel}
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy} data-testid="today-add-save">
            {copy.today.add.save}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Field label={copy.today.add.what} error={failure ?? (tried && !text.trim() ? copy.today.add.required : null)}>
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={text} onChange={(event) => setText(event.target.value)} autoFocus data-testid="today-add-text" />}
        </Field>
        <Field label={copy.today.add.brain} hint={brainId === PERSONAL ? undefined : copy.today.add.shared}>
          {() => <Select label={copy.today.add.brain} value={brainId} onValueChange={(value) => setBrainId(value ?? PERSONAL)} items={items} />}
        </Field>
        <Field label={copy.today.add.date} optional>
          {(id) => <Input id={id} type="date" value={due} onChange={(event) => setDue(event.target.value)} />}
        </Field>
      </form>
    </Dialog>
  );
}

function PlanBlockList(props: { plan: DayPlan }) {
  const backend = useBackend();
  const { busy, act } = useAction();
  const { plan } = props;
  return (
    // Open while it waits for a decision: then the blocks are the answer (S3).
    <Disclosure key={String(plan.approved)} label={copy.today.plan.title(plan.blocks.length)} defaultOpen={!plan.approved} testId="today-plan" panelClassName="ps-6 pt-1">
      <ul>
        {plan.blocks.map((block) => (
          <li key={`${block.start}-${block.label}`} className="flex min-h-8 items-baseline gap-3 text-sm">
            <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{copy.today.plan.block(block.start, block.end)}</span>
            <span className="min-w-0 truncate text-foreground">{block.label}</span>
          </li>
        ))}
      </ul>
      {plan.approved ? null : (
        <div className="mt-2 flex gap-2">
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void act(() => backend.today.decidePlan("approve"), copy.today.plan.approved)}>
            {copy.today.plan.approve}
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void act(() => backend.today.decidePlan("drop"), copy.today.plan.dropped)}>
            {copy.today.plan.drop}
          </Button>
        </div>
      )}
    </Disclosure>
  );
}

function CleanupRow(props: { candidate: CleanupCandidate }) {
  const backend = useBackend();
  const startChat = useStartChat();
  const { busy, act } = useAction();
  const { candidate } = props;
  const start = () =>
    void act(async () => {
      const started = await startChat(await backend.today.cleanup(candidate.brainId));
      if (started) navigate({ name: "project", projectId: started.project.id, chatId: started.chatId });
    });
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground" data-testid="today-cleanup">
      <ListChecks className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">{copy.today.cleanup.line(candidate.lines, candidate.brainName)}</span>
      <Button variant="quiet" size="sm" disabled={busy} onClick={start}>
        {copy.today.cleanup.start}
      </Button>
    </div>
  );
}

function StartCard(props: { start: StartHere; projects: ReadonlyMap<string, Project>; isFocal: boolean }) {
  const backend = useBackend();
  const startChat = useStartChat();
  const { busy, act } = useAction();
  const { todo } = props.start;

  const begin = () =>
    void act(async () => {
      const { chat } = await backend.today.focus(todo.id, null);
      const started = await startChat(chat);
      if (!started) return;
      await backend.today.focus(todo.id, started.chatId);
      toast(copy.today.started);
      navigate({ name: "project", projectId: started.project.id, chatId: started.chatId });
    });
  const done = () => void act(() => backend.today.setDone(todo.id, true), copy.today.doneToast);
  const skip = props.start.skipsLeft > 0 ? () => void act(() => backend.today.skip(todo.id)) : undefined;

  return (
    <Callout
      className="group/card focus:outline-solid focus:outline-2 focus:outline-offset-2 focus:outline-ring"
      tabIndex={0}
      onKeyDown={cardKeys({ enter: begin, escape: skip })}
      keyShortcuts={skip ? "Enter Escape" : "Enter"}
      testId="today-start"
      label={copy.today.startHere}
      icon={todo.dueKind === "waiting" ? <Hourglass /> : <Flag />}
      title={todo.text}
      state={
        <>
          <BrainName todo={todo} projects={props.projects} /> · {props.start.why ?? copy.today.reasons[props.start.reason]}
          {todo.due ? <span className="whitespace-nowrap"> · {todo.dueKind === "waiting" ? copy.today.waitingUntil(formatDay(todo.due)) : copy.today.due(formatDay(todo.due))}</span> : null}
          {props.start.firstStep ? <span className="mt-1 block text-foreground">{copy.today.firstStep(props.start.firstStep)}</span> : null}
        </>
      }
      actions={
        <>
          <Button variant={props.isFocal ? "primary" : "secondary"} disabled={busy} onClick={begin} data-testid="today-start-button">
            {copy.today.start}
            <Kbd>⏎</Kbd>
          </Button>
          <Button variant="secondary" disabled={busy} onClick={done}>
            {copy.today.done}
          </Button>
          {skip ? (
            <Button variant="ghost" disabled={busy} onClick={skip} data-testid="today-skip">
              {copy.today.notNow}
              <Kbd>esc</Kbd>
            </Button>
          ) : null}
        </>
      }
    />
  );
}

/**
 * "Start hier": one to-do, why, the first step. `isFocal` is false when a decision card in
 * "Voor jou" is the focal element (an agent stands still: that goes first, P7).
 */
export function StartSection(props: { view: TodayView; projects: ReadonlyMap<string, Project>; isFocal: boolean }) {
  const [adding, setAdding] = useState(false);
  const { view } = props;
  const cleanup = view.cleanup[0];
  return (
    <section aria-labelledby="home-start" data-testid="home-start">
      <SectionHeading
        id="home-start"
        title={copy.today.startHere}
        count={view.counts.mine || undefined}
        trailing={
          <>
            {view.counts.inbox ? <span className="text-xs text-muted-foreground">{copy.today.parked(view.counts.inbox)}</span> : null}
            <Button variant="quiet" size="sm" onClick={() => setAdding(true)} data-testid="today-add">
              <Plus />
              {copy.today.addTodo}
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-2">
        {view.start ? (
          <StartCard key={view.start.todo.id} start={view.start} projects={props.projects} isFocal={props.isFocal} />
        ) : (
          // One line, no explanation (C6, P1); "Taak toevoegen" stands in the heading.
          <p className="text-sm text-muted-foreground">{copy.today.nothingOpen}</p>
        )}
        {view.plan && view.plan.blocks.length ? <PlanBlockList plan={view.plan} /> : null}
        {cleanup ? <CleanupRow candidate={cleanup} /> : null}
      </div>
      <AddTodoDialog open={adding} onOpenChange={setAdding} projects={props.projects} />
    </section>
  );
}

/** The feature is on but cannot run yet (no personal brain): what is true, and where to fix it (C6). */
export function TodayBlocked(props: { reason: string }) {
  return (
    <p className="text-sm text-muted-foreground" data-testid="today-blocked">
      {props.reason}{" "}
      <a className="font-medium text-foreground underline underline-offset-2" href={href({ name: "brain" })}>
        {copy.today.blockedOpenBrain}
      </a>
    </p>
  );
}

// ---------------------------------------------------------------------------
// Komt eraan
// ---------------------------------------------------------------------------

function UpcomingItem(props: { row: UpcomingRow; projects: ReadonlyMap<string, Project> }) {
  const backend = useBackend();
  const { busy, act } = useAction();
  const { row } = props;
  const late = row.bucket === "late";
  const when = (text: string) => <span className={cn("shrink-0 text-xs", late ? "font-medium text-amber-11" : "text-subtle-foreground")}>{late ? `${text} · ${copy.today.late}` : text}</span>;
  if (row.kind === "meeting") {
    return (
      <li className={ROW} data-testid="today-upcoming-row">
        <CalendarClock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-foreground">{row.meeting.title}</span>
          {row.meeting.location ? <span className="truncate text-xs text-muted-foreground">{row.meeting.location}</span> : null}
        </span>
        {when(row.bucket === "today" ? (meetingTime(row.meeting) ?? copy.today.allDay) : `${formatDay(row.date)}${meetingTime(row.meeting) ? ` ${meetingTime(row.meeting)}` : ""}`)}
      </li>
    );
  }
  const { todo } = row;
  return (
    <li className={ROW} data-testid="today-upcoming-row">
      <Checkbox checked={false} disabled={busy} onCheckedChange={() => void act(() => backend.today.setDone(todo.id, true), copy.today.doneToast)} label={copy.today.checkOff(todo.text)} className="min-w-0 flex-1 px-0">
        <span className="flex min-w-0 flex-col">
          <span className="truncate">{todo.text}</span>
          <span className="truncate text-xs text-muted-foreground">
            <BrainName todo={todo} projects={props.projects} />
          </span>
        </span>
      </Checkbox>
      {todo.dueKind === "waiting" ? <Hourglass className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
      {when(todo.dueKind === "waiting" ? copy.today.waitingUntil(formatDay(row.date)) : formatDay(row.date))}
    </li>
  );
}

/** Deadlines, promises and appointments for the coming days, soonest first; late in amber. */
export function UpcomingSection(props: { rows: readonly UpcomingRow[]; projects: ReadonlyMap<string, Project> }) {
  if (!props.rows.length) return null;
  const shown = groupUpcoming(props.rows.slice(0, MAX_UPCOMING_ROWS));
  const more = props.rows.slice(MAX_UPCOMING_ROWS);
  const group = (rows: readonly UpcomingRow[]) => (
    <ul>
      {rows.map((row) => (
        <UpcomingItem key={row.key} row={row} projects={props.projects} />
      ))}
    </ul>
  );
  return (
    <section aria-labelledby="home-upcoming" data-testid="home-upcoming">
      <SectionHeading id="home-upcoming" title={copy.today.upcoming} count={props.rows.length} />
      <div className="flex flex-col gap-3">
        {shown.map((entry) => (
          <div key={entry.bucket}>
            <h3 className={cn("text-xs font-medium", entry.bucket === "late" ? "text-amber-11" : "text-muted-foreground")}>{copy.today.buckets[entry.bucket]}</h3>
            {group(entry.rows)}
          </div>
        ))}
        {more.length ? (
          <Disclosure label={copy.home.more(more.length)} panelClassName="ps-0 pt-1">
            {group(more)}
          </Disclosure>
        ) : null}
      </div>
    </section>
  );
}
