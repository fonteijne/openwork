import { useEffect, useId, useMemo, useState } from "react";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { ArrowRight, Bot, X } from "lucide-react";

import type { ContextItem, DelegateDraft, Werkwijze } from "~/backend/cockpit";
import { useBriefs, useCockpit, useCockpitMutation, useDelegateDraft, useLibraryPages, useTodos, useWerkwijzen } from "~/backend/cockpit-queries";
import { useProjects } from "~/backend/queries";
import { Accent, AgentNote, Card, Eyebrow, LockedNote, PermissionLine, PermissionList, SheetFooter, SheetHeader, SplitWithSheet, dot } from "~/components/io";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input, Textarea } from "~/components/ui/field";
import { EmptyState, Skeleton } from "~/components/ui/misc";
import { Popover } from "~/components/ui/popover";
import { Select } from "~/components/ui/select";
import { toast } from "~/components/ui/toast";
import { PAGE_TITLE_FOCUS, useDocumentTitle } from "~/components/top-bar";
import { runsCopy } from "~/copy/runs";
import { cn } from "~/lib/cn";
import { formatMoney } from "~/lib/format";
import { canGoBack, goBack, navigate } from "~/lib/router";

import { SourceIcon, formatClock, formatDay, formatLongDay, runHref } from "./parts";

const copy = runsCopy.delegate;

/** Written by the palette and the Agent page: a goal to start an empty brief with. */
const GOAL_KEY = "bonzaiwork.delegate.goal";
/** A brief closed or saved as a concept stays on this device, per to-do. */
const draftKey = (todoId: string | null) => `bonzaiwork.delegate.draft.${todoId ?? "nieuw"}`;

function peekGoal(): string | null {
  try {
    const value = window.sessionStorage.getItem(GOAL_KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

function isDraft(value: unknown): value is DelegateDraft {
  if (typeof value !== "object" || value === null) return false;
  return (
    typeof Reflect.get(value, "title") === "string" &&
    typeof Reflect.get(value, "goal") === "string" &&
    typeof Reflect.get(value, "output") === "string" &&
    Array.isArray(Reflect.get(value, "context")) &&
    Array.isArray(Reflect.get(value, "constraints")) &&
    typeof Reflect.get(value, "caps") === "object"
  );
}

function readSaved(todoId: string | null): DelegateDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(todoId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeSaved(todoId: string | null, draft: DelegateDraft | null) {
  try {
    if (draft) window.localStorage.setItem(draftKey(todoId), JSON.stringify(draft));
    else window.localStorage.removeItem(draftKey(todoId));
  } catch {
    // Without storage the brief is not kept; the to-do itself stays.
  }
}

/** "2026-11-06T12:00" for a datetime-local input, in local time. */
function toLocalInput(at: number | null): string {
  if (at === null) return "";
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): number | null {
  if (!value) return null;
  const at = new Date(value).getTime();
  return Number.isFinite(at) ? at : null;
}

/** Delegeren (design: v2-Delegate): today's to-dos on the left, the brief for a run in the sheet. */
export function DelegatePage(props: { todoId: string | null }) {
  useDocumentTitle(copy.documentTitle);
  const cockpit = useCockpit();
  // Read in the initializer (twice under StrictMode, so read only) and cleared after mount.
  const [goal] = useState(() => (props.todoId === null ? peekGoal() : null));
  useEffect(() => {
    try {
      window.sessionStorage.removeItem(GOAL_KEY);
    } catch {
      // Nothing to clear.
    }
  }, []);
  const draft = useDelegateDraft(props.todoId, goal);

  const close = () => {
    if (canGoBack()) goBack();
    else navigate({ name: "home" });
  };

  return (
    <SplitWithSheet
      className="bg-surface"
      page={<TodayColumn todoId={props.todoId} />}
      sheet={
        cockpit.capabilities.runs ? (
          <div className="p-8 lg:p-12">
            <LockedNote title={copy.sheetTitle}>{cockpit.capabilities.runs}</LockedNote>
          </div>
        ) : draft.isLoading ? (
          <SheetSkeleton />
        ) : draft.isError || !draft.data ? (
          <div className="p-8 lg:p-12">
            <EmptyState title={copy.error} action={<Button variant="secondary" size="lg" onClick={() => void draft.refetch()}>{runsCopy.overview.retry}</Button>} />
          </div>
        ) : (
          <BriefSheet key={`${props.todoId ?? "nieuw"}-${goal ?? ""}`} initial={readSaved(props.todoId) ?? draft.data} todoId={props.todoId} onClose={close} />
        )
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Left: today
// ---------------------------------------------------------------------------

function TodayColumn(props: { todoId: string | null }) {
  const todos = useTodos();
  const projects = useProjects();
  const complete = useCockpitMutation((cockpit, input: { id: string; done: boolean }) => cockpit.todos.update(input.id, { done: input.done }));
  const [now] = useState(() => Date.now());
  const names = useMemo(() => new Map((projects.data ?? []).map((project) => [project.id, project.name])), [projects.data]);
  const list = (todos.data ?? []).filter((todo) => !todo.done && (todo.today || todo.id === props.todoId));

  return (
    <div className="flex flex-col gap-10 px-6 pt-10 lg:px-12 lg:pt-14">
      <div className="flex flex-col gap-3">
        <Eyebrow>{dot(copy.today, formatLongDay(now), formatClock(now))}</Eyebrow>
        <h1 tabIndex={-1} data-page-title="" className={cn("m-0 max-w-[16ch] text-[40px] font-bold leading-[44px] tracking-[-0.02em] text-ink sm:text-[56px] sm:leading-[60px]", PAGE_TITLE_FOCUS)}>
          {copy.titleBefore}
          <Accent>{copy.titleAccent}</Accent>
          {copy.titleAfter}
        </h1>
      </div>
      <section aria-labelledby="delegate-today" className="flex flex-col gap-4">
        <h2 id="delegate-today" className="m-0 text-[28px] font-bold leading-[34px] tracking-[-0.01em] text-ink">
          {copy.today} <span className="font-normal text-ink-muted">· {copy.todoCount(list.length)}</span>
        </h2>
        {todos.isLoading ? (
          <div className="flex flex-col gap-3" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-14" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <p className="m-0 border-t border-line-strong pt-4 text-base text-ink-muted">{copy.noTodos}</p>
        ) : (
          <ul className="m-0 list-none border-t border-line-strong p-0">
            {list.map((todo) => {
              const current = todo.id === props.todoId;
              return (
                <li
                  key={todo.id}
                  aria-current={current ? "true" : undefined}
                  className={cn("flex min-h-[72px] items-center border-b border-line-strong", current && "my-1 rounded-card border-b-0 bg-surface-alt px-4 py-3 ring-2 ring-accent")}
                >
                  <Checkbox
                    checked={todo.done}
                    label={copy.completeTodo(todo.title)}
                    onCheckedChange={(done) =>
                      complete.mutate(
                        { id: todo.id, done },
                        { onSuccess: () => toast(todo.title, { action: { label: copy.undo, onClick: () => complete.mutate({ id: todo.id, done: false }) } }) },
                      )
                    }
                    className="w-full gap-4 [&>span]:whitespace-normal"
                  >
                    <span className="flex flex-col">
                      <span className="text-lg font-semibold text-ink">{todo.title}</span>
                      {current ? (
                        <span className="text-sm text-ink-muted">{dot(todo.projectId ? (names.get(todo.projectId) ?? null) : null, todo.due ? runsCopy.run.due(formatDay(todo.due.at)) : null, copy.delegating)}</span>
                      ) : null}
                    </span>
                  </Checkbox>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <Card className="p-8! lg:p-8!">
        <h2 className="m-0 text-xl font-semibold text-ink">{copy.whatTitle}</h2>
        <p className="m-0 text-lg text-ink">{copy.whatBody}</p>
      </Card>
    </div>
  );
}

function SheetSkeleton() {
  return (
    <div className="flex flex-col gap-8 p-8 lg:p-12" aria-hidden="true">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-32" />
      <Skeleton className="h-24" />
      <Skeleton className="h-40" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right: the brief
// ---------------------------------------------------------------------------

function BriefSheet(props: { initial: DelegateDraft; todoId: string | null; onClose: () => void }) {
  const [draft, setDraft] = useState<DelegateDraft>(props.initial);
  const [ownConstraint, setOwnConstraint] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const projects = useProjects();
  const briefs = useBriefs();
  const werkwijzen = useWerkwijzen(draft.projectId);
  const start = useCockpitMutation((cockpit, input: DelegateDraft) => cockpit.runs.start(input));
  const ids = { project: useId(), due: useId(), goal: useId(), constraint: useId() };

  const patch = (next: Partial<DelegateDraft>) => setDraft((current) => ({ ...current, ...next }));
  const brief = (briefs.data ?? []).find((entry) => entry.projectId === draft.projectId) ?? null;
  const project = (projects.data ?? []).find((entry) => entry.id === draft.projectId) ?? null;
  const available: Werkwijze[] = werkwijzen.data ?? [];
  const werkwijze = available.find((entry) => entry.id === draft.werkwijzeId) ?? null;

  const projectItems = (projects.data ?? [])
    .filter((entry) => entry.archivedAt === null)
    .map((entry) => {
      const alias = (briefs.data ?? []).find((candidate) => candidate.projectId === entry.id)?.keyAlias ?? null;
      return { value: entry.id, label: copy.projectOption(entry.name, entry.key.hasKey ? (alias ?? entry.key.keyHint) : null), disabled: !entry.key.hasKey };
    });

  const save = () => {
    writeSaved(props.todoId, draft);
  };

  const removeContext = (item: ContextItem) => {
    const before = draft.context;
    patch({ context: before.filter((entry) => entry.id !== item.id) });
    toast(copy.contextRemoved(item.title), { action: { label: copy.undo, onClick: () => setDraft((current) => ({ ...current, context: before })) } });
  };

  const submit = () => {
    if (!draft.projectId) return setProblem(copy.needProject);
    if (!draft.goal.trim()) return setProblem(copy.needGoal);
    setProblem(null);
    start.mutate(draft, {
      onSuccess: (run) => {
        writeSaved(props.todoId, null);
        toast(copy.started(run.id));
        window.location.hash = runHref(run);
      },
      onError: (error) => setProblem(error instanceof Error && error.message ? error.message : runsCopy.run.failedAction),
    });
  };

  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <SheetHeader
        eyebrow={copy.sheetEyebrow}
        title={copy.sheetTitle}
        lead={props.todoId ? copy.fromTodo(draft.title) : copy.fromNothing}
        closeLabel={copy.close}
        onClose={() => {
          save();
          props.onClose();
        }}
      />
      <div className="flex flex-col gap-10 px-6 py-10 sm:px-8 lg:px-12">
        <div className="flex flex-col gap-2 rounded-card border-[1.5px] border-ink p-6">
          <label htmlFor={ids.project} className="text-base font-semibold text-ink">
            {copy.project} <span className="font-normal text-ink-muted">· {copy.required}</span>
          </label>
          <Select
            id={ids.project}
            value={draft.projectId}
            onValueChange={(projectId) => patch({ projectId, werkwijzeId: null })}
            items={projectItems}
            label={copy.project}
            placeholder={copy.projectPlaceholder}
            className="h-12! rounded-[6px]! px-4! text-lg!"
          />
          <p className="m-0 text-sm text-ink-muted">{copy.projectHelp}</p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <span className="text-base font-semibold text-ink">{copy.permissions}</span>
            {werkwijze ? (
              <>
                <p className="m-0 text-base text-ink-muted">{copy.permissionsFrom(werkwijze.name)}</p>
                <PermissionList className="gap-1 [&_li]:text-sm [&_li]:text-ink-muted">
                  {werkwijze.grants.map((grant) => (
                    <PermissionLine key={grant.text} kind={grant.kind}>
                      {grant.text}
                    </PermissionLine>
                  ))}
                </PermissionList>
              </>
            ) : (
              <p className="m-0 text-base text-ink-muted">{copy.permissionsSafe}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={ids.due} className="text-base font-semibold text-ink">
              {copy.due}
            </label>
            <Input
              id={ids.due}
              type="datetime-local"
              value={toLocalInput(draft.due)}
              onChange={(event) => patch({ due: fromLocalInput(event.target.value) })}
              className="h-12 border border-dashed border-ink ring-0"
            />
            {props.todoId && props.initial.due !== null ? <span className="text-sm text-ink-muted">{copy.dueSuggested}</span> : null}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={ids.goal} className="text-base font-semibold text-ink">
            {copy.goal}
          </label>
          <Textarea id={ids.goal} rows={3} value={draft.goal} onChange={(event) => patch({ goal: event.target.value, goalSuggested: false })} className="border border-dashed border-ink text-lg ring-0" />
          {props.initial.goalSuggested ? <AgentNote>{copy.goalSuggested}</AgentNote> : null}
        </div>

        <WorkModes draft={draft} werkwijzen={available} werkwijze={werkwijze} onChange={(werkwijzeId) => patch({ werkwijzeId })} />

        <section aria-labelledby="delegate-context" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 id="delegate-context" className="m-0 text-xl font-semibold text-ink">
              {copy.contextTitle}
            </h3>
            <span className="text-sm text-ink-muted">{copy.contextLead}</span>
          </div>
          {draft.context.length > 0 ? (
            <ul className="m-0 list-none border-t border-line-strong p-0">
              {draft.context.map((item) => (
                <li key={item.id} className="flex min-h-16 items-center gap-3 border-b border-line-strong py-2">
                  <SourceIcon kind={item.kind} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-base font-semibold text-ink">{item.title}</span>
                    <span className="text-sm text-ink-muted">{item.meta}</span>
                  </span>
                  <Button variant="ghost" size="icon-xl" aria-label={copy.contextRemove(item.title)} onClick={() => removeContext(item)}>
                    <X aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 border-t border-line-strong pt-4 text-base text-ink-muted">{copy.contextEmpty}</p>
          )}
          <LibraryPicker context={draft.context} onAdd={(item) => patch({ context: [...draft.context, item] })} />
        </section>

        <section aria-labelledby="delegate-constraints" className="flex flex-col gap-4">
          <h3 id="delegate-constraints" className="m-0 text-xl font-semibold text-ink">
            {copy.constraintsTitle}
          </h3>
          {draft.constraints.length > 0 ? (
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
              {draft.constraints.map((constraint, index) => (
                <li
                  key={`${index}-${constraint.text}`}
                  className={cn(
                    "inline-flex min-h-10 items-center gap-1.5 rounded-full ps-4 pe-1 text-base text-ink",
                    constraint.by === "agent" && "border border-dashed border-ink",
                    constraint.by === "werkwijze" && "border border-line-strong",
                    constraint.by === "you" && "border border-ink font-semibold",
                  )}
                >
                  {constraint.by === "agent" ? <Bot className="size-4 shrink-0" aria-hidden="true" /> : null}
                  <span>{constraint.by === "agent" ? copy.constraintAgent(constraint.text) : constraint.by === "werkwijze" ? copy.constraintWerkwijze(constraint.text) : copy.constraintYou(constraint.text)}</span>
                  <button
                    type="button"
                    aria-label={copy.constraintRemove(constraint.text)}
                    onClick={() => patch({ constraints: draft.constraints.filter((_, at) => at !== index) })}
                    className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-hover hover:text-ink pointer-coarse:size-11"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={ids.constraint} className="sr-only">
              {copy.constraintAddLabel}
            </label>
            <Input
              id={ids.constraint}
              value={ownConstraint}
              onChange={(event) => setOwnConstraint(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (ownConstraint.trim()) {
                    patch({ constraints: [...draft.constraints, { text: ownConstraint.trim(), by: "you" }] });
                    setOwnConstraint("");
                  }
                }
              }}
              placeholder={copy.constraintAddPlaceholder}
              className="h-11 min-w-0 flex-[1_1_240px] rounded-full"
            />
            <Button
              variant="secondary"
              size="lg"
              className="h-11"
              disabled={!ownConstraint.trim()}
              onClick={() => {
                patch({ constraints: [...draft.constraints, { text: ownConstraint.trim(), by: "you" }] });
                setOwnConstraint("");
              }}
            >
              {copy.constraintAdd}
            </Button>
          </div>
        </section>

        <div className="grid gap-6 sm:grid-cols-2">
          <Card className="p-8! lg:p-8!">
            <h3 className="m-0 text-xl font-semibold text-ink">{copy.outputTitle}</h3>
            <p className="m-0 text-base text-ink">{draft.output}</p>
            <Checkbox checked={draft.offerToShelf} onCheckedChange={(offerToShelf) => patch({ offerToShelf })} className="items-start [&>span]:whitespace-normal">
              {copy.offerToShelf(project?.name ?? copy.project.toLowerCase())}
            </Checkbox>
          </Card>
          <Card className="p-8! lg:p-8!">
            <h3 className="m-0 text-xl font-semibold text-ink">{copy.budgetTitle}</h3>
            {brief?.keyAlias ? (
              <p className="m-0 text-base text-ink">
                {copy.budgetKey} <span className="whitespace-nowrap font-mono">{brief.keyAlias}</span>
                {brief.keyLeft !== null ? copy.budgetKeyLeft(brief.keyLeft) : null}
              </p>
            ) : (
              <p className="m-0 text-base text-ink">{copy.budgetNoKey}</p>
            )}
            <p className="m-0 text-base text-ink-muted">
              {copy.budgetCaps(formatMoney(draft.caps.money, draft.caps.currency), draft.caps.toolCalls, draft.caps.minutes)}
              {draft.typicalCost ? ` ${draft.typicalCost}.` : null}
            </p>
          </Card>
        </div>
      </div>
      <div className="mt-auto">
        {problem ? (
          <p role="alert" className="m-0 bg-surface-alt px-8 pt-6 text-base font-semibold text-danger lg:px-12">
            {problem}
          </p>
        ) : null}
        <SheetFooter tone="alt" note={copy.footer}>
          <Button type="submit" variant="primary" size="xl" disabled={start.isPending}>
            {copy.start}
            <ArrowRight aria-hidden="true" />
          </Button>
          <Button
            variant="secondary"
            size="xl"
            onClick={() => {
              save();
              toast(copy.draftSaved);
            }}
          >
            {copy.saveDraft}
          </Button>
        </SheetFooter>
      </div>
    </form>
  );
}

type Mode = "safe" | "werkwijze";

function WorkModes(props: { draft: DelegateDraft; werkwijzen: Werkwijze[]; werkwijze: Werkwijze | null; onChange: (werkwijzeId: string | null) => void }) {
  const [switching, setSwitching] = useState(false);
  const mode: Mode = props.werkwijze ? "werkwijze" : "safe";
  const fallback = props.werkwijzen.find((entry) => entry.projectId === props.draft.projectId) ?? props.werkwijzen[0] ?? null;
  const shown = props.werkwijze ?? fallback;
  const origin = (entry: Werkwijze) => (entry.origin === "project" ? copy.originProject : entry.origin === "personal" ? copy.originPersonal : copy.originApp);
  const pill =
    "flex min-h-12 cursor-pointer items-center gap-2.5 rounded-full border border-line-strong px-5 text-base text-ink outline-none transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[checked]:border-ink data-[checked]:bg-ink data-[checked]:font-semibold data-[checked]:text-surface data-[disabled]:cursor-default data-[disabled]:opacity-45";
  const dotClass = "flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px] border-current";

  return (
    <section aria-labelledby="delegate-how" className="flex flex-col gap-5">
      <h3 id="delegate-how" className="m-0 text-xl font-semibold text-ink">
        {copy.howTitle}
      </h3>
      <RadioGroup
        value={mode}
        aria-labelledby="delegate-how"
        onValueChange={(value) => {
          if (value === "safe") props.onChange(null);
          else if (value === "werkwijze" && fallback) props.onChange(fallback.id);
        }}
        className="flex flex-wrap gap-3"
      >
        <Radio.Root value="safe" className={pill}>
          <span className={dotClass}>
            <Radio.Indicator className="size-2 rounded-full bg-current" />
          </span>
          {copy.safeDefault}
        </Radio.Root>
        <Radio.Root value="werkwijze" disabled={!shown} className={pill}>
          <span className={dotClass}>
            <Radio.Indicator className="size-2 rounded-full bg-current" />
          </span>
          {shown ? copy.withWerkwijze(shown.name, shown.stages.length) : copy.noWerkwijzen}
        </Radio.Root>
      </RadioGroup>
      {props.werkwijze ? (
        <>
          <ol className="m-0 grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-4">
            {props.werkwijze.stages.map((stage, index) => (
              <li key={stage} className="flex flex-col gap-2 border-t border-ink pt-4">
                <Eyebrow>{String(index + 1).padStart(2, "0")}</Eyebrow>
                <span className="text-base font-semibold text-ink">{stage}</span>
              </li>
            ))}
          </ol>
          <p className="m-0 text-base text-ink-muted">
            {copy.howBody(origin(props.werkwijze), props.werkwijze.version)}{" "}
            <Popover
              open={switching}
              onOpenChange={setSwitching}
              label={copy.switchTitle}
              trigger={
                <button type="button" className="cursor-pointer bg-transparent p-0 text-base font-semibold text-accent underline underline-offset-2 hover:text-accent-hover">
                  {copy.switch}
                </button>
              }
            >
              <p className="m-0 px-2 pb-1 pt-1 text-sm font-semibold text-ink-muted">{copy.switchTitle}</p>
              {props.werkwijzen.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={entry.id === props.werkwijze?.id}
                  onClick={() => {
                    props.onChange(entry.id);
                    setSwitching(false);
                  }}
                  className={cn("flex min-h-11 w-full flex-col items-start rounded-lg px-2 py-1.5 text-start hover:bg-hover", entry.id === props.werkwijze?.id && "bg-hover")}
                >
                  <span className="text-sm font-semibold text-ink">{entry.name}</span>
                  <span className="text-xs text-ink-muted">{dot(`v${entry.version}`, runsCopy.overview.werkwijzeStages(entry.stages.length), entry.label)}</span>
                </button>
              ))}
            </Popover>
          </p>
        </>
      ) : (
        <p className="m-0 text-base text-ink-muted">{copy.howSafe}</p>
      )}
    </section>
  );
}

function LibraryPicker(props: { context: ContextItem[]; onAdd: (item: ContextItem) => void }) {
  const [open, setOpen] = useState(false);
  const pages = useLibraryPages(null);
  const taken = new Set(props.context.map((item) => item.id));
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label={copy.contextPick}
      className="max-w-[min(var(--available-width),26rem)]"
      trigger={
        <button type="button" className="group inline-flex w-fit cursor-pointer items-center gap-2 bg-transparent p-0 text-base font-semibold text-accent hover:text-accent-hover">
          {copy.contextAdd}
          <ArrowRight className="size-4 transition-transform duration-200 ease-io group-hover:translate-x-1" aria-hidden="true" />
        </button>
      }
    >
      <p className="m-0 px-2 pb-1 pt-1 text-sm font-semibold text-ink-muted">{copy.contextPick}</p>
      {pages.isLoading ? (
        <Skeleton className="m-2 h-24" />
      ) : (pages.data ?? []).length === 0 ? (
        <p className="m-0 px-2 py-2 text-sm text-ink-muted">{copy.contextNoPages}</p>
      ) : (
        (pages.data ?? []).map((page) => {
          const id = `lib-${page.id}`;
          const added = taken.has(id);
          return (
            <button
              key={page.id}
              type="button"
              disabled={added}
              onClick={() => {
                props.onAdd({ id, kind: page.kind === "decision" ? "decision" : "library", title: page.title, meta: [page.owner, page.verified ? copy.contextVerified(formatDay(page.verified.at)) : null].filter(Boolean).join(" · ") });
                setOpen(false);
              }}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-start hover:bg-hover disabled:opacity-45"
            >
              <SourceIcon kind={page.kind === "decision" ? "decision" : "library"} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-ink">{page.title}</span>
                <span className="truncate text-xs text-ink-muted">{added ? copy.contextAdded : page.owner}</span>
              </span>
            </button>
          );
        })
      )}
    </Popover>
  );
}
