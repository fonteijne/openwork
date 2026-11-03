import { useState, type KeyboardEvent, type ReactNode } from "react";
import { CalendarClock, CircleAlert, GitMerge, HelpCircle, ShieldQuestion, UserRoundPen } from "lucide-react";

import { useBackend } from "~/backend/context";
import { projectHasKey, projectModels, startModel, useRefreshAttention, useStatus } from "~/backend/queries";
import type { AttentionItem, Brain, ChatErrorKind, PermissionRequest, Project, QuestionField, QuestionRequest, Routine } from "~/backend/types";
import { ProjectIcon } from "~/components/project-icon";
import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Input } from "~/components/ui/field";
import { Kbd } from "~/components/ui/misc";
import { RadioCards } from "~/components/ui/radio-cards";
import { Select } from "~/components/ui/select";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { formatTime, relativeTime } from "~/lib/format";
import { href, navigate } from "~/lib/router";
import { isEditable } from "~/lib/shortcuts";
import { fileName } from "~/lib/tools";

import { isBrainRead } from "../brain/brain-permission";
import { lastUserText } from "./model";

const REVERSIBLE = new Set(["edit", "write", "patch"]);

/**
 * The focused card shows its ring on any focus, not only `:focus-visible`: focus lands here by
 * script after an answer (brief §5) and the ring says where ⏎ and esc go (S6, V7: never a missing
 * focus ring). `outline-solid` restores the style that Callout's `outline-none` clears.
 */
const CARD = "focus:outline-solid focus:outline-2 focus:outline-offset-2 focus:outline-ring";

export type AttentionCardProps = {
  item: AttentionItem;
  /** Null only for a proposal (it belongs to the personal brain). */
  project: Project | null;
  brain: Brain | null;
  routine: Routine | null;
  /** The card is answered: it leaves, the page stays, focus moves on (P11, S5). */
  onResolved: () => void;
  cardRef: (element: HTMLElement | null) => void;
};

type Chords = { enter?: () => void; escape?: () => void; digit?: (n: number) => void };

/**
 * Chords belong to the focused card, never to the window (brief §4): inert while a field inside
 * has focus, and a focused button or link keeps its own ⏎. Radios let ⏎ through, so a choice made
 * with ↑↓ can be sent without leaving it.
 */
function cardKeys(chords: Chords) {
  return (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target;
    if (event.metaKey || event.ctrlKey || event.altKey || isEditable(target)) return;
    if (target instanceof Element && target !== event.currentTarget && target.closest('button:not([role="radio"]), a, select, [role="menu"], [role="listbox"]')) return;
    if (event.key === "Enter" && chords.enter) {
      event.preventDefault();
      chords.enter();
    } else if (event.key === "Escape" && chords.escape) {
      event.preventDefault();
      chords.escape();
    } else if (/^[1-9]$/.test(event.key) && chords.digit) {
      event.preventDefault();
      chords.digit(Number(event.key));
    }
  };
}

/** The object the person already knows: project tile · chat title · time, then the risk (brief §5, P9). */
function Context(props: { project: Project | null; title?: string | null; at: number; extra?: ReactNode }) {
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5">
      {props.project ? (
        <span className="inline-flex items-center gap-1.5 text-foreground">
          <ProjectIcon icon={props.project.icon} color={props.project.color} size="sm" className="size-4 [&_svg]:size-2.5" />
          {props.project.name}
        </span>
      ) : null}
      {props.title ? (
        <>
          <span aria-hidden="true">·</span>
          <span className="truncate">{props.title}</span>
        </>
      ) : null}
      <span aria-hidden="true">·</span>
      <span className="whitespace-nowrap">{relativeTime(props.at)}</span>
      {props.extra ? (
        <>
          <span aria-hidden="true">·</span>
          <span>{props.extra}</span>
        </>
      ) : null}
    </span>
  );
}

function ChatLink(props: { projectId: string; chatId: string }) {
  return <a href={href({ name: "project", projectId: props.projectId, chatId: props.chatId })}>{copy.attention.openChat}</a>;
}

/**
 * One busy flag per card. A finished action reports presence for that project (decision A3),
 * confirms in the words of its button (C2), lets the card leave and refreshes "Voor jou".
 */
function useCardAction(project: Project | null, onResolved: () => void) {
  const backend = useBackend();
  const refreshAttention = useRefreshAttention();
  const [busy, setBusy] = useState(false);
  const act = async (task: () => Promise<void>, done?: { title: string; action?: { label: string; onClick: () => void } }) => {
    if (busy) return;
    setBusy(true);
    try {
      await task();
      if (project && backend.capabilities.agenda) void backend.agenda.reportPresence({ projectId: project.id, name: project.name });
      if (done) toast(done.title, done.action ? { action: done.action } : {});
      onResolved();
      void refreshAttention();
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  return { busy, act };
}

const openChatAction = (projectId: string, chatId: string) => ({ label: copy.attention.openChat, onClick: () => navigate({ name: "project", projectId, chatId }) });

// ---------------------------------------------------------------------------
// Permission (T4, P9)
// ---------------------------------------------------------------------------

function PermissionCard(props: { item: Extract<AttentionItem, { kind: "permission" }>; project: Project; onResolved: () => void; cardRef: AttentionCardProps["cardRef"] }) {
  const backend = useBackend();
  const { busy, act } = useCardAction(props.project, props.onResolved);
  const { item, project } = props;
  const request: PermissionRequest = item.request;
  const action = isBrainRead(request) ? copy.home.brainRead : (copy.permission.actions[request.action] ?? copy.permission.fallbackAction);
  const resources = request.resources.map((resource) => (resource.includes("/") || resource.includes(".") ? fileName(resource) : resource));
  const [first, ...rest] = resources;
  const reply = (value: "once" | "always" | "reject") =>
    act(() => backend.interactions.replyPermission(project.id, item.chatId, request.id, value), {
      title: value === "reject" ? copy.attention.permission.denied : copy.attention.permission.allowed,
      action: openChatAction(project.id, item.chatId),
    });
  return (
    <Callout
      ref={props.cardRef}
      className={CARD}
      tabIndex={0}
      onKeyDown={cardKeys({ enter: () => void reply("once"), escape: () => void reply("reject") })}
      testId="attention-permission"
      label={copy.permission.title}
      decision
      icon={<ShieldQuestion />}
      title={action}
      chip={first}
      state={
        <Context
          project={project}
          title={item.chatTitle}
          at={item.at}
          extra={
            <>
              {rest.length ? `${copy.permission.more(rest.length)} · ` : null}
              {request.message ?? (REVERSIBLE.has(request.action) ? copy.attention.permission.reversible : copy.attention.permission.notReversible)}
            </>
          }
        />
      }
      actions={
        <>
          <Button variant="primary" disabled={busy} onClick={() => void reply("once")}>
            {copy.attention.permission.allow}
            <Kbd>⏎</Kbd>
          </Button>
          {/* "Altijd in dit project" only when the engine names what that would allow (brief §7, P9). */}
          {request.canAlways && request.scope ? (
            <Button variant="secondary" disabled={busy} onClick={() => void reply("always")} title={request.scope}>
              {copy.attention.permission.always}
            </Button>
          ) : null}
          <Button variant="ghost" disabled={busy} onClick={() => void reply("reject")}>
            {copy.attention.permission.deny}
            <Kbd>esc</Kbd>
          </Button>
        </>
      }
      link={<ChatLink projectId={project.id} chatId={item.chatId} />}
    />
  );
}

// ---------------------------------------------------------------------------
// Question: options as RadioCards, no card-in-card (S1); 1–9 pick, ⏎ answers once complete
// ---------------------------------------------------------------------------

function MultiField(props: { request: QuestionRequest; field: QuestionField; picked: string[]; onToggle: (label: string) => void }) {
  return (
    <div role="group" aria-label={props.field.title} className="flex flex-col">
      {props.field.options.map((option) => {
        const checked = props.picked.includes(option.label);
        return (
          <label key={option.value} className={cn("flex min-h-11 cursor-default items-center gap-3 border-b border-border px-1.5 py-2 last:border-b-0 hover:bg-hover", checked && "font-semibold")}>
            <input type="checkbox" name={`${props.request.id}-${props.field.key}`} checked={checked} onChange={() => props.onToggle(option.label)} className="size-4 shrink-0" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm text-foreground">{option.label}</span>
              {option.description ? <span className="text-xs font-normal text-muted-foreground">{option.description}</span> : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function QuestionCard(props: { item: Extract<AttentionItem, { kind: "question" }>; project: Project; onResolved: () => void; cardRef: AttentionCardProps["cardRef"] }) {
  const backend = useBackend();
  const { busy, act } = useCardAction(props.project, props.onResolved);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});
  const { item, project } = props;
  const request: QuestionRequest = item.request;
  const [firstField] = request.fields;

  const answers = request.fields.map((field) => {
    const own = custom[field.key]?.trim();
    const picked = selected[field.key] ?? [];
    return own ? [...picked, own] : picked;
  });
  const complete = answers.every((answer) => answer.length > 0);

  const pick = (field: QuestionField, label: string) =>
    setSelected((current) => {
      const list = current[field.key] ?? [];
      if (field.multiple) return { ...current, [field.key]: list.includes(label) ? list.filter((value) => value !== label) : [...list, label] };
      return { ...current, [field.key]: [label] };
    });
  const answer = () => {
    if (!complete) return;
    void act(() => backend.interactions.replyQuestion(project.id, item.chatId, request.id, answers), { title: copy.attention.question.answered, action: openChatAction(project.id, item.chatId) });
  };
  const skip = () => void act(() => backend.interactions.rejectQuestion(project.id, item.chatId, request.id));

  return (
    <Callout
      ref={props.cardRef}
      className={CARD}
      tabIndex={0}
      onKeyDown={cardKeys({
        enter: answer,
        escape: skip,
        digit: (n) => {
          const option = firstField?.options[n - 1];
          if (firstField && option) pick(firstField, option.label);
        },
      })}
      testId="attention-question"
      label={copy.question.title}
      decision
      icon={<HelpCircle />}
      title={firstField?.description || firstField?.title || copy.question.title}
      state={<Context project={project} title={item.chatTitle} at={item.at} />}
      actions={
        <>
          <Button variant="primary" disabled={!complete || busy} onClick={answer}>
            {copy.attention.question.answer}
            <Kbd>⏎</Kbd>
          </Button>
          <Button variant="ghost" disabled={busy} onClick={skip}>
            {copy.question.skip}
            <Kbd>esc</Kbd>
          </Button>
        </>
      }
      link={<ChatLink projectId={project.id} chatId={item.chatId} />}
    >
      <div className="flex flex-col gap-4">
        {request.fields.map((field, fieldIndex) => (
          <div key={field.key} className="min-w-0">
            {fieldIndex > 0 ? <p className="mb-1 text-sm font-semibold text-foreground">{field.description || field.title}</p> : null}
            {field.multiple ? (
              <MultiField request={request} field={field} picked={selected[field.key] ?? []} onToggle={(label) => pick(field, label)} />
            ) : (
              <RadioCards
                label={field.title}
                value={selected[field.key]?.[0] ?? null}
                onValueChange={(label) => pick(field, label)}
                items={field.options.map((option, index) => ({
                  value: option.label,
                  label:
                    fieldIndex === 0 && index < 9 ? (
                      <span className="inline-flex items-center gap-2">
                        <Kbd className="text-subtle-foreground">{index + 1}</Kbd>
                        {option.label}
                      </span>
                    ) : (
                      option.label
                    ),
                  hint: option.description || undefined,
                }))}
              />
            )}
            {field.custom ? (
              <Input
                aria-label={`${field.title}: ${copy.attention.question.other}`}
                placeholder={copy.question.otherPlaceholder}
                value={custom[field.key] ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setCustom((current) => ({ ...current, [field.key]: value }));
                  if (!field.multiple && value.trim()) setSelected((current) => ({ ...current, [field.key]: [] }));
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && complete) {
                    event.preventDefault();
                    answer();
                  }
                }}
                className="mt-2"
              />
            ) : null}
          </div>
        ))}
      </div>
    </Callout>
  );
}

// ---------------------------------------------------------------------------
// Failed chat: the failure with its fix, inline (T2, C6); "Opnieuw" = revert + send
// ---------------------------------------------------------------------------

function fixHref(kind: ChatErrorKind, projectId: string): string | null {
  switch (kind) {
    case "key_missing":
    case "key_rejected":
    case "budget_exceeded":
      return href({ name: "project-settings", projectId, group: "toegang" });
    case "model_unavailable":
      return href({ name: "project-settings", projectId, group: "agent" });
    default:
      return null;
  }
}

function FailedChatCard(props: { item: Extract<AttentionItem, { kind: "chat_failed" }>; project: Project; onResolved: () => void; cardRef: AttentionCardProps["cardRef"] }) {
  const backend = useBackend();
  const status = useStatus();
  const { busy, act } = useCardAction(props.project, props.onResolved);
  const { item, project } = props;
  const kind = item.error.kind;
  const fix = copy.attention.chatFailed.fix[kind];
  const fixLink = fixHref(kind, project.id);

  const retry = () =>
    void act(
      async () => {
        const messages = await backend.chats.messages(project.id, item.chatId);
        const last = lastUserText(messages);
        if (!last) throw new Error(copy.errors.not_found);
        // The model that failed is not worth a second try when it is the model that is missing.
        const used = kind === "model_unavailable" ? null : [...messages].reverse().find((message) => message.model)?.model ?? null;
        const model = used ?? startModel(status.data, project);
        if (!model) throw new Error(copy.chat.modelsMissing);
        await backend.chats.revert(project.id, item.chatId, last.id);
        void backend.chats
          .send(project.id, item.chatId, { text: last.text, model, agent: null, attachments: [], command: null, skills: [] })
          .catch((failure: unknown) => toast(`${copy.chat.sendFailed} ${errorText(failure)}`, { tone: "error" }));
      },
      { title: copy.home.retried, action: openChatAction(project.id, item.chatId) },
    );

  return (
    <Callout
      ref={props.cardRef}
      className={CARD}
      tabIndex={0}
      onKeyDown={cardKeys({ enter: retry })}
      testId="attention-failed"
      label={copy.attention.chatFailed.title(copy.attention.chatFailed.reason[kind])}
      tone="failure"
      icon={<CircleAlert />}
      title={copy.attention.chatFailed.title(copy.attention.chatFailed.reason[kind])}
      state={<Context project={project} title={item.chatTitle} at={item.at} />}
      actions={
        <>
          <Button variant="primary" disabled={busy} onClick={retry}>
            {copy.attention.chatFailed.retry}
            <Kbd>⏎</Kbd>
          </Button>
          {fix && fixLink ? (
            <a href={fixLink} className="inline-flex h-8 items-center rounded-full px-3.5 text-sm font-medium text-foreground ring-1 ring-inset ring-border-strong hover:bg-hover pointer-coarse:h-10">
              {fix}
            </a>
          ) : null}
        </>
      }
      link={<ChatLink projectId={project.id} chatId={item.chatId} />}
    />
  );
}

// ---------------------------------------------------------------------------
// Routine: the fix on the row; a missed or failed run gets "Nu uitvoeren"
// ---------------------------------------------------------------------------

function RoutineCard(props: { item: Extract<AttentionItem, { kind: "routine" }>; project: Project; routine: Routine | null; onResolved: () => void; cardRef: AttentionCardProps["cardRef"] }) {
  const backend = useBackend();
  const status = useStatus();
  const { busy, act } = useCardAction(props.project, props.onResolved);
  const { item, project } = props;
  const routineHref = href({ name: "project-routines", projectId: project.id, routineId: item.routineId });
  const models = projectModels(status.data, project);
  const hasKey = projectHasKey(status.data, project);

  const runNow = () =>
    void act(
      async () => {
        const run = await backend.routines.run(item.routineId);
        toast(copy.home.routineStarted, {
          action: {
            label: copy.attention.openChat,
            onClick: () => (run.chatId ? navigate({ name: "project", projectId: project.id, chatId: run.chatId }) : navigate({ name: "project-routines", projectId: project.id, routineId: item.routineId })),
          },
        });
      },
    );
  const setModel = (model: string) => void act(() => backend.routines.update(item.routineId, { model }).then(() => undefined), { title: copy.routines.saved });

  const needsFix = item.reason === "needs_attention";
  const current = props.routine?.model ?? item.model;
  const state = needsFix
    ? (item.detail ?? copy.attention.routine.attention)
    : item.reason === "missed"
      ? copy.attention.routine.missed(formatTime(item.at))
      : (item.detail ?? copy.attention.routine.failed);

  return (
    <Callout
      ref={props.cardRef}
      className={CARD}
      tabIndex={0}
      onKeyDown={cardKeys(needsFix ? {} : { enter: runNow })}
      testId={`attention-routine-${item.reason}`}
      label={item.name}
      tone={item.reason === "failed" ? "failure" : "neutral"}
      icon={<CalendarClock />}
      title={item.name}
      state={<Context project={project} at={item.at} extra={state} />}
      actions={
        needsFix ? (
          hasKey && models.length ? (
            <Select
              label={copy.routines.model}
              placeholder={copy.attention.routine.chooseModel}
              value={current && models.some((model) => model.id === current) ? current : null}
              onValueChange={setModel}
              disabled={busy}
              items={models.map((model) => ({ value: model.id, label: model.name }))}
              className="w-auto min-w-48"
            />
          ) : (
            <a href={href({ name: "project-settings", projectId: project.id, group: "toegang" })} className="inline-flex h-8 items-center rounded-full bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover pointer-coarse:h-10">
              {copy.attention.routine.linkKey}
            </a>
          )
        ) : (
          <Button variant="primary" disabled={busy} onClick={runNow}>
            {copy.attention.routine.runNow}
            <Kbd>⏎</Kbd>
          </Button>
        )
      }
      link={<a href={routineHref}>{copy.home.openRoutine}</a>}
    />
  );
}

// ---------------------------------------------------------------------------
// Brain: the state sentence and the way to the Brein tab (brief §8)
// ---------------------------------------------------------------------------

function BrainCard(props: { item: Extract<AttentionItem, { kind: "brain" }>; project: Project; brain: Brain | null; cardRef: AttentionCardProps["cardRef"] }) {
  const { item, project } = props;
  const status = props.brain?.status ?? null;
  const target = href({ name: "project-brain", projectId: project.id });
  const title =
    item.state === "conflict" ? copy.attention.brain.conflict(status?.conflictBy ?? null) : item.state === "needs_trust" ? copy.attention.brain.needsTrust : copy.attention.brain.error;
  const sentence =
    item.state === "conflict"
      ? copy.home.conflictFiles(status?.conflictFiles.length ?? 0)
      : item.state === "needs_trust"
        ? copy.home.trustCount(status?.pendingTrust.length ?? 0)
        : (status?.error ?? copy.brain.states.error);
  const icon = item.state === "conflict" ? <GitMerge /> : item.state === "needs_trust" ? <ShieldQuestion /> : <CircleAlert />;
  return (
    <Callout
      ref={props.cardRef}
      className={CARD}
      tabIndex={0}
      onKeyDown={cardKeys({ enter: () => navigate({ name: "project-brain", projectId: project.id }) })}
      testId={`attention-brain-${item.state}`}
      label={title}
      decision={item.state !== "error"}
      tone={item.state === "error" ? "failure" : "neutral"}
      icon={icon}
      title={title}
      state={<Context project={project} at={item.at} extra={sentence} />}
      actions={
        <a href={target} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover pointer-coarse:h-10">
          {copy.home.openBrain}
          <Kbd>⏎</Kbd>
        </a>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Preference proposal (brains plan §7.3)
// ---------------------------------------------------------------------------

function ProposalCard(props: { item: Extract<AttentionItem, { kind: "proposal" }>; onResolved: () => void; cardRef: AttentionCardProps["cardRef"] }) {
  const backend = useBackend();
  const { busy, act } = useCardAction(null, props.onResolved);
  const { proposal } = props.item;
  const decide = (decision: "accept" | "reject") =>
    void act(() => backend.brains.decide(proposal.id, decision, null), decision === "accept" ? { title: copy.attention.proposal.added } : undefined);
  return (
    <Callout
      ref={props.cardRef}
      className={CARD}
      tabIndex={0}
      onKeyDown={cardKeys({ enter: () => decide("accept"), escape: () => decide("reject") })}
      testId="attention-proposal"
      label={copy.attention.proposal.title}
      decision
      icon={<UserRoundPen />}
      title={proposal.preference}
      state={
        <>
          {copy.attention.proposal.title}
          {proposal.reason ? ` · ${proposal.reason}` : null}
          {" · "}
          {relativeTime(proposal.at)}
        </>
      }
      actions={
        <>
          <Button variant="primary" disabled={busy} onClick={() => decide("accept")}>
            {copy.attention.proposal.add}
            <Kbd>⏎</Kbd>
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => decide("reject")}>
            {copy.attention.proposal.reject}
            <Kbd>esc</Kbd>
          </Button>
        </>
      }
      link={<a href={href({ name: "brain" })}>{copy.home.yourBrain}</a>}
    />
  );
}

/** One card per kind of attention item (brief §5), all on the same Callout shell (brief §12). */
export function AttentionCard(props: AttentionCardProps) {
  const { item, project } = props;
  switch (item.kind) {
    case "permission":
      return project ? <PermissionCard item={item} project={project} onResolved={props.onResolved} cardRef={props.cardRef} /> : null;
    case "question":
      return project ? <QuestionCard item={item} project={project} onResolved={props.onResolved} cardRef={props.cardRef} /> : null;
    case "chat_failed":
      return project ? <FailedChatCard item={item} project={project} onResolved={props.onResolved} cardRef={props.cardRef} /> : null;
    case "routine":
      return project ? <RoutineCard item={item} project={project} routine={props.routine} onResolved={props.onResolved} cardRef={props.cardRef} /> : null;
    case "brain":
      return project ? <BrainCard item={item} project={project} brain={props.brain} cardRef={props.cardRef} /> : null;
    case "proposal":
      return <ProposalCard item={item} onResolved={props.onResolved} cardRef={props.cardRef} />;
  }
}
