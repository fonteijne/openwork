import { memo, useState, type ReactNode } from "react";
import {
  BookOpen,
  Check,
  ChevronRight,
  Code,
  Copy,
  FileText,
  FilePen,
  GitBranch,
  GitFork,
  Globe,
  Paperclip,
  Plug,
  Search,
  Terminal,
  Undo2,
  Wrench,
  CircleAlert,
} from "lucide-react";

import type { ChatError, Message, MessagePart, ReasoningPart, ToolPart } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Tooltip } from "~/components/ui/tooltip";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { formatDuration } from "~/lib/format";
import { closeOpenMarkdown, renderMarkdown } from "~/lib/markdown";
import { href } from "~/lib/router";
import { describeTool, isVisibleTool, toolSentence, type ToolKind } from "~/lib/tools";

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

function CopyButton(props: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Tooltip label={done ? copy.chat.copied : (props.label ?? copy.chat.copy)}>
      <Button
        variant="quiet"
        size="icon-sm"
        aria-label={props.label ?? copy.chat.copy}
        onClick={() => {
          void navigator.clipboard?.writeText(props.text).then(() => {
            setDone(true);
            window.setTimeout(() => setDone(false), 1_500);
          });
        }}
      >
        {done ? <Check /> : <Copy />}
      </Button>
    </Tooltip>
  );
}

export const Prose = memo(function Prose(props: { text: string; streaming?: boolean }) {
  // Sanitized in renderMarkdown (DOMPurify): model output is untrusted.
  const html = renderMarkdown(props.streaming ? closeOpenMarkdown(props.text) : props.text);
  return <div className="bw-prose text-foreground" dangerouslySetInnerHTML={{ __html: html }} />;
});

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
          {step.text ? <ChevronRight className={cn("size-3.5 shrink-0 text-subtle-foreground transition-transform duration-150", open && "rotate-90")} /> : null}
        </button>
        {open && step.text ? <p className="mt-1 mb-2 ms-8 border-s border-border ps-3 text-sm italic text-muted-foreground">{step.text}</p> : null}
      </li>
    );
  }

  const label = describeTool(step);
  const Icon = TOOL_ICONS[label.kind];
  const failed = step.status === "error";
  const running = step.status === "running" || step.status === "pending";
  const duration = step.startedAt && step.endedAt ? formatDuration(step.endedAt - step.startedAt) : null;
  const hasDetails = Object.keys(step.input).length > 0 || Boolean(step.output) || Boolean(step.error);

  return (
    <li className="group/step">
      <div className="flex min-h-7 items-center gap-2.5 rounded-md px-1.5 text-sm">
        <Icon className={cn("size-4 shrink-0", failed ? "text-destructive-foreground" : "text-subtle-foreground")} strokeWidth={1.75} />
        <span className={cn("min-w-0 flex-1 truncate text-muted-foreground", running && props.live && "bw-shimmer")}>
          {label.verb}
          {label.object ? (
            <>
              {" "}
              {label.code ? <code className="rounded bg-muted px-1 py-px font-mono text-[0.8em] text-foreground/80">{label.object}</code> : <span className="text-foreground/80">{label.object}</span>}
            </>
          ) : null}
        </span>
        {step.childChatId ? (
          <a href={href({ name: "project", projectId: props.projectId, chatId: step.childChatId })} className="shrink-0 text-xs font-medium text-foreground underline-offset-2 hover:underline">
            {copy.chat.openSubtask}
          </a>
        ) : null}
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
      {failed && step.error ? <p className="ms-8 mb-1 text-xs text-destructive-foreground">{step.error}</p> : null}
      {open ? (
        <div className="mb-2 ms-8 flex flex-col gap-2 rounded-md bg-muted/70 p-2.5 text-xs">
          <div>
            <p className="mb-1 font-medium text-muted-foreground">{copy.chat.input}</p>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-foreground/80">{JSON.stringify(step.input, null, 2)}</pre>
          </div>
          {step.output || step.error ? (
            <div>
              <p className="mb-1 font-medium text-muted-foreground">{copy.chat.output}</p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-foreground/80">{step.error ?? step.output}</pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function StepRail(props: { steps: Step[]; projectId: string; live: boolean }) {
  return (
    <ul className="-mx-1.5 my-1 flex flex-col">
      {props.steps.map((step) => (
        <StepRow key={step.id} step={step} projectId={props.projectId} live={props.live} />
      ))}
    </ul>
  );
}

function ErrorRow(props: { error: ChatError; onAction: (kind: ChatError["kind"]) => void }) {
  const entry = copy.errors.chat[props.error.kind];
  const actionable = props.error.kind !== "budget_exceeded";
  return (
    <div role="alert" className="my-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-red-3 px-3 py-2 text-sm text-red-11">
      <CircleAlert className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">{entry.text}</span>
      {actionable ? (
        <button type="button" className="shrink-0 font-medium underline underline-offset-2" onClick={() => props.onAction(props.error.kind)}>
          {entry.action}
        </button>
      ) : (
        <span className="shrink-0 text-red-11/80">{entry.action}</span>
      )}
    </div>
  );
}

export type TurnActions = {
  onErrorAction: (kind: ChatError["kind"]) => void;
};

/** One assistant turn: the steps as a rail, the answer as prose (DESIGN.md T1, T2). */
export const AssistantTurn = memo(function AssistantTurn(props: { messages: Message[]; live: boolean; projectId: string; actions: TurnActions }) {
  const [expanded, setExpanded] = useState(false);
  const parts = props.messages.flatMap((message) => message.parts);
  const steps = parts.filter(isStep);
  const texts = parts.filter((part): part is Extract<MessagePart, { type: "text" }> => part.type === "text" && part.text.length > 0);
  const error = props.messages.find((message) => message.error)?.error ?? null;
  const first = props.messages[0];
  const last = props.messages.at(-1);
  const answer = texts.map((part) => part.text).join("\n\n");

  let body: ReactNode;
  if (props.live) {
    // While working: the steps and the words in the order they happen.
    const blocks: ReactNode[] = [];
    let run: Step[] = [];
    const flush = (key: string) => {
      if (run.length) blocks.push(<StepRail key={key} steps={run} projectId={props.projectId} live />);
      run = [];
    };
    parts.forEach((part, index) => {
      if (isStep(part)) run.push(part);
      else if (part.type === "text" && part.text) {
        flush(`rail-${index}`);
        blocks.push(<Prose key={part.id} text={part.text} streaming />);
      }
    });
    flush("rail-end");
    if (!steps.length && !texts.length) {
      blocks.push(
        <div key="thinking" className="flex min-h-7 items-center gap-2.5 px-0 text-sm">
          <span className="flex size-4 items-center justify-center">
            <span className="bw-pulse size-1.5 rounded-full bg-subtle-foreground" />
          </span>
          <span className="bw-shimmer">{copy.chat.thinking}</span>
        </div>,
      );
    }
    body = blocks;
  } else {
    const duration = first && last?.completedAt ? formatDuration(last.completedAt - first.createdAt) : null;
    const failedSteps = steps.filter((step) => step.type === "tool" && step.status === "error").length;
    body = (
      <>
        {steps.length ? (
          <div className="-mx-1.5 mb-1">
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              className="flex min-h-7 items-center gap-2 rounded-md px-1.5 text-sm text-muted-foreground hover:bg-hover hover:text-foreground"
            >
              <ChevronRight className={cn("size-3.5 transition-transform duration-150", expanded && "rotate-90")} />
              {duration ? copy.chat.worked(duration, steps.length) : copy.chat.steps(steps.length)}
              {failedSteps ? <span className="text-destructive-foreground">· {copy.chat.failedSteps(failedSteps)}</span> : null}
            </button>
            {expanded ? <StepRail steps={steps} projectId={props.projectId} live={false} /> : null}
          </div>
        ) : null}
        {texts.map((part) => (
          <Prose key={part.id} text={part.text} />
        ))}
      </>
    );
  }

  return (
    <article className="group/turn" aria-label="Antwoord" data-role="assistant">
      {body}
      {error ? <ErrorRow error={error} onAction={props.actions.onErrorAction} /> : null}
      {!props.live && answer ? (
        <div className="mt-1 flex h-8 items-center gap-0.5 opacity-0 transition-opacity duration-100 group-hover/turn:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
          <CopyButton text={answer} />
        </div>
      ) : null}
    </article>
  );
});

export const UserMessage = memo(function UserMessage(props: { message: Message; pending: boolean; optimistic?: boolean; onFork?: () => void; onRevert?: () => void }) {
  const text = props.message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
  const files = props.message.parts.filter((part): part is Extract<MessagePart, { type: "file" }> => part.type === "file");
  return (
    <div className="group/user flex flex-col items-end" data-role="user">
      <div className={cn("max-w-[min(85%,36rem)] rounded-[20px] rounded-br-md bg-user-bubble px-3.5 py-2 text-base leading-relaxed whitespace-pre-wrap text-foreground", props.pending && "opacity-70")}>
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
        </div>
      ) : null}
    </div>
  );
});
