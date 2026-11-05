import { memo, useState, type ReactNode } from "react";
import { BookOpen, ChevronRight, CircleAlert, Code, FileText, FilePen, GitBranch, GitFork, Globe, Paperclip, Plug, Repeat, Search, Terminal, Undo2, Wrench } from "lucide-react";

import type { ChatError, Message, MessagePart, Model, ReasoningPart, ToolPart } from "~/backend/types";
import { ProseHtml } from "~/components/prose-html";
import { Button } from "~/components/ui/button";
import { Disclosure } from "~/components/ui/disclosure";
import { Tooltip } from "~/components/ui/tooltip";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { formatDuration } from "~/lib/format";
import { closeOpenMarkdown, renderMarkdown } from "~/lib/markdown";
import { href } from "~/lib/router";
import { deliveredFiles, describeTool, isDeclinedStep, isFailedStep, isStoppedStep, isStoppedTurn, isVisibleTool, stepFixKind, toolSentence, unresolvedFailures, type ToolKind } from "~/lib/tools";

import { useOpenLink } from "./file-link";
import { CopyButton, DeliveredRow, TurnActionsRow } from "./turn-result";

const TOOL_ICONS: Record<ToolKind, typeof FileText> = {
  read: FileText,
  write: FilePen,
  edit: FilePen,
  shell: Terminal,
  search: Search,
  list: Search,
  web: Globe,
  websearch: Globe,
  subtask: GitBranch,
  skill: BookOpen,
  connection: Plug,
  other: Wrench,
};

type Step = ToolPart | ReasoningPart;

function isStep(part: MessagePart): part is Step {
  return part.type === "reasoning" ? part.text.length > 0 || part.endedAt === null : part.type === "tool" && isVisibleTool(part);
}

/** A step that reached its end, whichever way: it belongs in the fold, not on the live line. */
function stepDone(step: Step): boolean {
  return step.type === "reasoning" ? step.endedAt !== null : step.status === "completed" || step.status === "error";
}

export const Prose = memo(function Prose(props: { text: string; streaming?: boolean }) {
  const openLink = useOpenLink();
  const html = renderMarkdown(props.streaming ? closeOpenMarkdown(props.text) : props.text);
  // Links to Markdown files in the project open in the side panel, web links in the browser.
  return <ProseHtml className="text-foreground" html={html} onLink={openLink} />;
});

/** The raw input and output of a step, for "Technische details" (P3, T2). */
function RawDetails(props: { step: ToolPart }) {
  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted/70 p-2.5 text-xs">
      <div>
        <p className="mb-1 font-medium text-muted-foreground">{copy.chat.input}</p>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-foreground/80">{JSON.stringify(props.step.input, null, 2)}</pre>
      </div>
      {props.step.output || props.step.error ? (
        <div>
          <p className="mb-1 font-medium text-muted-foreground">{copy.chat.output}</p>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-foreground/80">{props.step.error ?? props.step.output}</pre>
        </div>
      ) : null}
    </div>
  );
}

/** The sentence of a tool step: verb, then the object in mono when it is a file or command (C4). */
function StepLabel(props: { step: ToolPart; className?: string }) {
  const label = describeTool(props.step);
  return (
    <span className={props.className}>
      {label.verb}
      {label.object ? (
        <>
          {" "}
          {label.code ? <code className="rounded bg-muted px-1 py-px font-mono text-[0.8em] text-foreground/80">{label.object}</code> : <span className="text-foreground/80">{label.object}</span>}
        </>
      ) : null}
    </span>
  );
}

function StepRow(props: { step: Step; projectId: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  const { step } = props;

  if (step.type === "reasoning") {
    const thinking = step.endedAt === null;
    return (
      <li>
        <button
          type="button"
          className="group/step flex min-h-7 w-full items-center gap-2.5 rounded-md px-1.5 text-start text-sm text-muted-foreground hover:bg-hover disabled:hover:bg-transparent"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          disabled={!step.text}
        >
          <span className="flex size-4 shrink-0 items-center justify-center">
            <span className={cn("size-1.5 rounded-full bg-subtle-foreground", thinking && "bw-pulse")} />
          </span>
          <span className={cn("min-w-0 flex-1 truncate", thinking && props.live && "bw-shimmer")}>{thinking ? copy.chat.thinking : copy.chat.thought}</span>
          {step.text ? (
            <span className="flex size-6 shrink-0 items-center justify-center text-subtle-foreground">
              <ChevronRight className={cn("size-3.5 transition-transform duration-150 ease-soft", open && "rotate-90")} />
            </span>
          ) : null}
        </button>
        {open && step.text ? <p className="mt-1 mb-2 ms-8 border-s border-border ps-3 text-sm italic text-muted-foreground">{step.text}</p> : null}
      </li>
    );
  }

  const label = describeTool(step);
  const Icon = TOOL_ICONS[label.kind];
  const failed = isFailedStep(step);
  // Stopped and declined are the person's own decisions: neutral ink, a word, no red (C5).
  const ended = isStoppedStep(step) ? copy.chat.turn.stopped : isDeclinedStep(step) ? copy.chat.turn.declined : null;
  const running = step.status === "running" || step.status === "pending";
  const duration = step.startedAt && step.endedAt && step.endedAt - step.startedAt >= 1000 ? formatDuration(step.endedAt - step.startedAt) : null;
  const hasDetails = Object.keys(step.input).length > 0 || Boolean(step.output) || Boolean(step.error);

  return (
    <li className="group/step">
      <div className="flex min-h-7 items-center gap-2.5 rounded-md px-1.5 text-sm">
        <Icon className={cn("size-4 shrink-0", failed ? "text-red-11" : "text-subtle-foreground")} strokeWidth={1.75} />
        <StepLabel step={step} className={cn("min-w-0 flex-1 truncate text-muted-foreground", running && props.live && "bw-shimmer")} />
        {step.childChatId ? (
          <a href={href({ name: "project", projectId: props.projectId, chatId: step.childChatId })} className="shrink-0 text-xs font-medium text-foreground underline-offset-2 hover:underline">
            {copy.chat.openSubtask}
          </a>
        ) : null}
        {ended ? <span className="shrink-0 text-xs text-subtle-foreground">{ended}</span> : null}
        {failed ? <span className="shrink-0 text-xs text-red-11">{copy.chat.turn.failed}</span> : null}
        {duration ? <span className="shrink-0 text-xs text-subtle-foreground tabular-nums">{duration}</span> : null}
        {hasDetails ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={`${copy.chat.technicalDetails}: ${toolSentence(step)}`}
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded text-subtle-foreground opacity-0 transition-opacity duration-100 hover:bg-hover hover:text-foreground focus-visible:opacity-100 group-hover/step:opacity-100 pointer-coarse:opacity-100",
              (failed || open) && "opacity-100",
            )}
          >
            <Code className="size-3.5" />
          </button>
        ) : (
          <span className="size-6 shrink-0" />
        )}
      </div>
      {open ? (
        <div className="mb-2 ms-8">
          <RawDetails step={step} />
        </div>
      ) : null}
    </li>
  );
}

function StepRail(props: { steps: readonly Step[]; projectId: string; live: boolean }) {
  return (
    <ul className="-mx-1.5 flex flex-col">
      {props.steps.map((step) => (
        <StepRow key={step.id} step={step} projectId={props.projectId} live={props.live} />
      ))}
    </ul>
  );
}

/**
 * One run of steps while the turn is live (brief §7, T1): what is finished folds into
 * "n stappen", the step that runs now is the one shimmering sentence (V6).
 */
function LiveRun(props: { steps: readonly Step[]; projectId: string }) {
  const done = props.steps.filter(stepDone);
  const active = props.steps.filter((step) => !stepDone(step));
  return (
    <div className="my-1 flex flex-col">
      {done.length ? (
        <Disclosure size="sm" label={copy.chat.turn.stepsDone(done.length)} className="-mx-1" panelClassName="ps-0">
          <StepRail steps={done} projectId={props.projectId} live={false} />
        </Disclosure>
      ) : null}
      {active.length ? <StepRail steps={active} projectId={props.projectId} live /> : null}
    </div>
  );
}

/** A failed step stays out of the fold, with its fix; the engine's words sit under "Technische details" (T2). */
function FailedStepRow(props: { step: ToolPart; service: string | null }) {
  const kind = stepFixKind(props.step);
  const fix = kind === "signIn" ? copy.chat.stepFix.signIn(props.service) : kind ? copy.chat.stepFix[kind] : null;
  return (
    <div className="my-1 flex flex-col gap-0.5 rounded-lg bg-red-3/60 px-2.5 py-1.5 text-sm" data-testid="turn-failed-step">
      <div className="flex min-h-6 items-center gap-2.5">
        <CircleAlert className="size-4 shrink-0 text-red-11" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 text-foreground">
          <StepLabel step={props.step} />
          <span className="text-red-11"> · {copy.chat.turn.failed}</span>
          {fix ? <span className="text-muted-foreground"> · {fix}</span> : null}
        </span>
      </div>
      <Disclosure size="sm" label={copy.chat.turn.technicalDetails} className="ms-4">
        <RawDetails step={props.step} />
      </Disclosure>
    </div>
  );
}

export type TurnActions = {
  /** The models this project can use, for "Nogmaals met ander model". */
  models: readonly Model[];
  /** The fix for a failed turn: a key link opens settings, "Opnieuw" runs the turn again (revert + send). */
  onErrorAction: (kind: ChatError["kind"], turnId: string) => void;
  /** After a stop: "Ga verder". */
  onContinue: () => void;
  onRerun: (turnId: string, model: string) => void;
  onOpenFile: (path: string) => void;
};

/** The turn's failure, inline with its fix (T2, C6); never a routing name (C3). */
function ErrorRow(props: { error: ChatError; projectId: string; turnId: string; onAction: TurnActions["onErrorAction"] }) {
  const { kind } = props.error;
  const entry = copy.errors.chat[kind];
  // The key and its budget live in the project's "Toegang" group (brief §6).
  const settingsLink = kind === "key_missing" || kind === "key_rejected" || kind === "budget_exceeded" ? href({ name: "project-settings", projectId: props.projectId, group: "toegang" }) : null;
  return (
    <div className="my-2 flex flex-col gap-1 rounded-lg bg-red-3 px-3 py-2 text-sm" role="alert" data-testid="turn-error">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <CircleAlert className="size-4 shrink-0 text-red-11" />
        <span className="min-w-0 flex-1 text-foreground">{entry.text}</span>
        {settingsLink ? (
          <a href={settingsLink} className="shrink-0 font-medium text-foreground underline underline-offset-2">
            {entry.action}
          </a>
        ) : (
          <button type="button" className="shrink-0 font-medium text-foreground underline underline-offset-2" onClick={() => props.onAction(kind, props.turnId)}>
            {entry.action}
          </button>
        )}
      </div>
      {props.error.detail ? (
        <Disclosure size="sm" label={copy.chat.turn.technicalDetails} className="ms-4">
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/70 p-2.5 font-mono text-[11px] text-foreground/80">{props.error.detail}</pre>
        </Disclosure>
      ) : null}
    </div>
  );
}

/** The one pulsing line before the first step arrives. */
export function ThinkingLine() {
  return (
    <div className="flex min-h-7 items-center gap-2.5 text-sm">
      <span className="flex size-4 items-center justify-center">
        <span className="bw-pulse size-1.5 rounded-full bg-subtle-foreground" />
      </span>
      <span className="bw-shimmer">{copy.chat.thinking}</span>
    </div>
  );
}

/**
 * One assistant turn (DESIGN.md T1, T2; brief §7). Live: the steps fold as they finish and the
 * current one shimmers, words stream in the order they happen (P11). Finished: one row
 * "Gewerkt 7 s · 2 stappen" that opens the rail; stopped by the person: the same row in neutral
 * ink with "Ga verder" (C5). Failures stay inline with their fix. Then what the turn delivered.
 */
export const AssistantTurn = memo(function AssistantTurn(props: { messages: Message[]; live: boolean; /** The person pressed Stop on this turn in this session. */ stopped?: boolean; projectId: string; actions: TurnActions }) {
  const parts = props.messages.flatMap((message) => message.parts);
  const steps = parts.filter(isStep);
  const texts = parts.filter((part): part is Extract<MessagePart, { type: "text" }> => part.type === "text" && part.text.length > 0);
  const error = props.messages.find((message) => message.error)?.error ?? null;
  const first = props.messages[0];
  const last = props.messages.at(-1);
  const turnId = first?.id ?? "";
  const answer = texts.map((part) => part.text).join("\n\n");
  const model = [...props.messages].reverse().find((message) => message.model)?.model ?? null;

  let body: ReactNode;
  if (props.live) {
    const blocks: ReactNode[] = [];
    let run: Step[] = [];
    const flush = (key: string) => {
      if (run.length) blocks.push(<LiveRun key={key} steps={run} projectId={props.projectId} />);
      run = [];
    };
    parts.forEach((part, index) => {
      if (isStep(part)) run.push(part);
      else if (part.type === "text" && part.text) {
        flush(`run-${index}`);
        blocks.push(<Prose key={part.id} text={part.text} streaming />);
      }
    });
    flush("run-end");
    if (!steps.length && !texts.length) blocks.push(<ThinkingLine key="thinking" />);
    body = blocks;
  } else {
    const elapsed = first && last?.completedAt ? last.completedAt - first.createdAt : 0;
    const duration = elapsed >= 1000 ? formatDuration(elapsed) : null;
    const stopped = Boolean(props.stopped) || isStoppedTurn(props.messages);
    // A failed change the agent redid with success stays in the fold, not as the outcome (T2).
    const failedSteps = unresolvedFailures(steps);
    const services = steps.flatMap((step) => (step.type === "tool" ? [describeTool(step).service] : []));
    const summary = stopped ? copy.chat.turn.stoppedByYou(duration, steps.length) : copy.chat.turn.worked(duration, steps.length);
    body = (
      <>
        {steps.length || stopped ? (
          <div className="mb-1 flex flex-wrap items-start gap-2">
            {steps.length ? (
              // Next to "Ga verder" the row is as wide as its label; alone it takes the column so long steps truncate.
              <Disclosure size="sm" label={summary} className={cn("-mx-1 min-w-0", stopped ? "w-fit max-w-full" : "flex-1")} panelClassName="ps-0" testId="turn-steps">
                <StepRail steps={steps} projectId={props.projectId} live={false} />
              </Disclosure>
            ) : (
              <span className="flex h-7 items-center text-xs text-muted-foreground">{summary}</span>
            )}
            {stopped ? (
              <Button variant="secondary" size="sm" onClick={props.actions.onContinue} data-testid="turn-continue">
                {copy.chat.turn.continue}
              </Button>
            ) : null}
          </div>
        ) : null}
        {failedSteps.map((step) => (
          <FailedStepRow key={step.id} step={step} service={services.find((service) => service !== null) ?? null} />
        ))}
        {texts.map((part) => (
          <Prose key={part.id} text={part.text} />
        ))}
      </>
    );
  }

  const delivered = props.live ? [] : deliveredFiles(props.messages);

  return (
    <article className="group/turn" aria-label={copy.chat.turn.label} data-role="assistant">
      {body}
      {error ? <ErrorRow error={error} projectId={props.projectId} turnId={turnId} onAction={props.actions.onErrorAction} /> : null}
      {delivered.length ? <DeliveredRow files={delivered} onOpen={props.actions.onOpenFile} className="mt-3" /> : null}
      {!props.live && (answer || props.actions.models.length) ? (
        <TurnActionsRow answer={answer} models={props.actions.models} currentModel={model} onRerun={(chosen) => props.actions.onRerun(turnId, chosen)} className="mt-1" />
      ) : null}
    </article>
  );
});

export const UserMessage = memo(function UserMessage(props: {
  message: Message;
  pending: boolean;
  optimistic?: boolean;
  onFork?: () => void;
  onRevert?: () => void;
  onRoutine?: () => void;
  /** A line above the bubble ("Jij · 08:30" on the Agent page). */
  label?: ReactNode;
  /** Restyles the bubble (the Agent page's grey box). */
  bubbleClassName?: string;
}) {
  const text = props.message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
  const files = props.message.parts.filter((part): part is Extract<MessagePart, { type: "file" }> => part.type === "file");
  return (
    <div className="group/user flex flex-col items-end" data-role="user">
      {props.label ? <div className="mb-2">{props.label}</div> : null}
      <div className={cn("max-w-[min(85%,36rem)] rounded-[20px] rounded-br-md bg-user-bubble px-3.5 py-2 text-base leading-relaxed whitespace-pre-wrap text-foreground", props.bubbleClassName, props.pending && "opacity-70")}>
        {text}
        {files.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {files.map((file) => (
              <span key={file.id} className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-background/70 px-2 py-1 font-mono text-xs text-muted-foreground">
                <Paperclip className="size-3 shrink-0" />
                <span className="truncate">{file.filename}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {!props.optimistic ? (
        <div className="mt-1 flex h-8 items-center gap-0.5 opacity-0 transition-opacity duration-100 group-hover/user:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
          <CopyButton text={text} />
          {props.onFork ? (
            <Tooltip label={copy.chat.forkFromHere}>
              <Button variant="quiet" size="icon-sm" aria-label={copy.chat.forkFromHere} onClick={props.onFork}>
                <GitFork />
              </Button>
            </Tooltip>
          ) : null}
          {props.onRevert ? (
            <Tooltip label={copy.chat.revertToHere}>
              <Button variant="quiet" size="icon-sm" aria-label={copy.chat.revertToHere} onClick={props.onRevert}>
                <Undo2 />
              </Button>
            </Tooltip>
          ) : null}
          {props.onRoutine && text.trim() ? (
            <Tooltip label={copy.chat.message.routineFromHere}>
              <Button variant="quiet" size="icon-sm" aria-label={copy.chat.message.routineFromHere} onClick={props.onRoutine}>
                <Repeat />
              </Button>
            </Tooltip>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});
