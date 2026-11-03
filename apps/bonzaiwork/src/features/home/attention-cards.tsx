import { useState, type ReactNode } from "react";
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
import { cardKeys } from "~/lib/card-keys";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { formatTime, relativeTime } from "~/lib/format";
import { href, navigate } from "~/lib/router";
import { fileName } from "~/lib/tools";

import { isBrainRead } from "../brain/brain-permission";
import { lastUserText } from "./model";

const REVERSIBLE = new Set(["edit", "write", "patch"]);

/**
 * The focused card shows its ring on any focus, not only `:focus-visible`: focus lands here by
 * script after an answer (brief §5) and the ring says where ⏎ and esc go (S6, V7: never a missing
 * focus ring). `outline-solid` restores the style that Callout's `outline-none` clears.
 */
const CARD = "group/card focus:outline-solid focus:outline-2 focus:outline-offset-2 focus:outline-ring";

export type AttentionCardProps = {
  item: AttentionItem;
  /** Null only for a proposal (it belongs to the personal brain). */
  project: Project | null;
  brain: Brain | null;
  routine: Routine | null;
  /** The card is answered: it leaves, the page stays, focus moves on (P11, S5). */
  onResolved: () => void;
  cardRef: (element: HTMLElement | null) => void;
  /**
   * The first card is the screen's focal element (brief §5, P7): only its action is the filled
   * electric primary; the others use the secondary ring until one of them holds focus (V2).
   */
  isFocal: boolean;
};

/** Filled primary on the focal card or on the card that holds focus; the ring button elsewhere. */
function primary(isFocal: boolean): { variant: "primary" | "secondary"; className?: string } {
  return isFocal ? { variant: "primary" } : { variant: "secondary", className: FOCUS_PRIMARY };
}

/** A non-focal card's primary turns filled while focus is inside that card (where ⏎ goes). */
const FOCUS_PRIMARY = "group-focus-within/card:bg-primary group-focus-within/card:text-primary-foreground group-focus-within/card:ring-0 group-focus-within/card:hover:bg-primary-hover";
const LINK_BASE = "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium pointer-coarse:h-11";
const LINK_PRIMARY = "bg-primary text-primary-foreground hover:bg-primary-hover";
const LINK_SECONDARY = `text-foreground ring-1 ring-inset ring-border-strong hover:bg-hover ${FOCUS_PRIMARY}`;
const linkClass = (isFocal: boolean) => cn(LINK_BASE, isFocal ? LINK_PRIMARY : LINK_SECONDARY);

/**
 * The object the person already knows: project tile · chat title · time, then the risk (brief §5, P9).
 * Plain inline text, so a line breaks between words and each separator travels with the item after
 * it (no "·" left dangling at a line end, C7). A long detail (a routine's reason) gets its own line.
 */
function Context(props: { project: Project | null; title?: string | null; at: number; extra?: ReactNode; extraOwnLine?: boolean }) {
  return (
    <>
      {props.project ? (
        <span className="text-foreground">
          <ProjectIcon icon={props.project.icon} color={props.project.color} size="sm" className="me-1.5 inline-flex size-4 align-[-3px] [&_svg]:size-2.5" />
          {props.project.name}
        </span>
      ) : null}
      {props.title ? <span>{props.project ? " · " : null}{props.title}</span> : null}
      {" "}
      <span className="whitespace-nowrap">
        {props.project || props.title ? "· " : null}
        {relativeTime(props.at)}
      </span>
      {props.extra ? (props.extraOwnLine ? <span className="block">{props.extra}</span> : <span> · {props.extra}</span>) : null}
    </>
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

function PermissionCard(props: { isFocal: boolean; item: Extract<AttentionItem, { kind: "permission" }>; project: Project; onResolved: () => void; cardRef: AttentionCardProps["cardRef"] }) {
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
      keyShortcuts="Enter Escape"
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
          <Button {...primary(props.isFocal)} disabled={busy} onClick={() => void reply("once")}>
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

function QuestionCard(props: { isFocal: boolean; item: Extract<AttentionItem, { kind: "question" }>; project: Project; onResolved: () => void; cardRef: AttentionCardProps["cardRef"] }) {
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
      keyShortcuts="Enter Escape"
      testId="attention-question"
      label={copy.question.title}
      decision
      icon={<HelpCircle />}
      title={firstField?.description || firstField?.title || copy.question.title}
      state={<Context project={project} title={item.chatTitle} at={item.at} />}
      actions={
        <>
          <Button {...primary(props.isFocal)} disabled={!complete || busy} onClick={answer}>
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
                        <Kbd className="text-muted-foreground">{index + 1}</Kbd>
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

/** Causes that pass by themselves: trying again is the next action. */
const TRANSIENT: ReadonlySet<ChatErrorKind> = new Set<ChatErrorKind>(["rate_limited", "litellm_unreachable", "unknown"]);

function FailedChatCard(props: { isFocal: boolean; item: Extract<AttentionItem, { kind: "chat_failed" }>; project: Project; onResolved: () => void; cardRef: AttentionCardProps["cardRef"] }) {
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

  // A cause that another try cannot fix (the budget is used up, the key is refused, the model is
  // gone) makes the fix the ⏎ primary and "Opnieuw" the secondary (T2, C6); a passing cause
  // (rate limit, the server unreachable, unknown) keeps "Opnieuw" first.
  const fixFirst = Boolean(fix && fixLink) && !TRANSIENT.has(kind);
  const retryButton = (filled: boolean) => (
    <Button {...(filled ? primary(props.isFocal) : { variant: "secondary" as const })} disabled={busy} onClick={retry}>
      {copy.attention.chatFailed.retry}
      {filled ? <Kbd>⏎</Kbd> : null}
    </Button>
  );
  const fixAnchor = (filled: boolean) =>
    fix && fixLink ? (
      <a href={fixLink} className={filled ? linkClass(props.isFocal) : cn(LINK_BASE, "text-foreground ring-1 ring-inset ring-border-strong hover:bg-hover")}>
        {fix}
        {filled ? <Kbd>⏎</Kbd> : null}
      </a>
    ) : null;

  return (
    <Callout
      ref={props.cardRef}
      className={CARD}
      tabIndex={0}
      onKeyDown={cardKeys({ enter: fixFirst && fixLink ? () => window.location.assign(fixLink) : retry })}
      keyShortcuts="Enter"
      testId="attention-failed"
      label={copy.attention.chatFailed.title(copy.attention.chatFailed.reason[kind])}
      tone="failure"
      icon={<CircleAlert />}
      title={copy.attention.chatFailed.title(copy.attention.chatFailed.reason[kind])}
      state={<Context project={project} title={item.chatTitle} at={item.at} />}
      actions={
        fixFirst ? (
          <>
            {fixAnchor(true)}
            {retryButton(false)}
          </>
        ) : (
          <>
            {retryButton(true)}
            {fixAnchor(false)}
          </>
        )
      }
      link={<ChatLink projectId={project.id} chatId={item.chatId} />}
    />
  );
}

// ---------------------------------------------------------------------------
// Routine: the fix on the row; a missed or failed run gets "Nu uitvoeren"
// ---------------------------------------------------------------------------

function RoutineCard(props: { isFocal: boolean; item: Extract<AttentionItem, { kind: "routine" }>; project: Project; routine: Routine | null; onResolved: () => void; cardRef: AttentionCardProps["cardRef"] }) {
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
      keyShortcuts={needsFix ? undefined : "Enter"}
      testId={`attention-routine-${item.reason}`}
      label={item.name}
      tone={item.reason === "failed" ? "failure" : "neutral"}
      icon={<CalendarClock />}
      title={item.name}
      state={<Context project={project} at={item.at} extra={state} extraOwnLine={state.length > 48} />}
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
            <a href={href({ name: "project-settings", projectId: project.id, group: "toegang" })} className={linkClass(props.isFocal)}>
              {copy.attention.routine.linkKey}
            </a>
          )
        ) : (
          <Button {...primary(props.isFocal)} disabled={busy} onClick={runNow}>
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

function BrainCard(props: { isFocal: boolean; item: Extract<AttentionItem, { kind: "brain" }>; project: Project; brain: Brain | null; cardRef: AttentionCardProps["cardRef"] }) {
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
      keyShortcuts="Enter"
      testId={`attention-brain-${item.state}`}
      label={title}
      decision={item.state !== "error"}
      tone={item.state === "error" ? "failure" : "neutral"}
      icon={icon}
      title={title}
      state={<Context project={project} at={item.at} extra={sentence} />}
      actions={
        <a href={target} className={linkClass(props.isFocal)}>
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

function ProposalCard(props: { isFocal: boolean; item: Extract<AttentionItem, { kind: "proposal" }>; onResolved: () => void; cardRef: AttentionCardProps["cardRef"] }) {
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
      keyShortcuts="Enter Escape"
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
          <Button {...primary(props.isFocal)} disabled={busy} onClick={() => decide("accept")}>
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
      return project ? <PermissionCard isFocal={props.isFocal} item={item} project={project} onResolved={props.onResolved} cardRef={props.cardRef} /> : null;
    case "question":
      return project ? <QuestionCard isFocal={props.isFocal} item={item} project={project} onResolved={props.onResolved} cardRef={props.cardRef} /> : null;
    case "chat_failed":
      return project ? <FailedChatCard isFocal={props.isFocal} item={item} project={project} onResolved={props.onResolved} cardRef={props.cardRef} /> : null;
    case "routine":
      return project ? <RoutineCard isFocal={props.isFocal} item={item} project={project} routine={props.routine} onResolved={props.onResolved} cardRef={props.cardRef} /> : null;
    case "brain":
      return project ? <BrainCard isFocal={props.isFocal} item={item} project={project} brain={props.brain} cardRef={props.cardRef} /> : null;
    case "proposal":
      return <ProposalCard isFocal={props.isFocal} item={item} onResolved={props.onResolved} cardRef={props.cardRef} />;
  }
}
