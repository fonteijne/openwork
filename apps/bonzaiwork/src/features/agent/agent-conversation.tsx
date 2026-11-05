import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useBackend } from "~/backend/context";
import { projectModels, startModel, useRefreshAttention, useStatus } from "~/backend/queries";
import type { ChatError, Message, Project } from "~/backend/types";
import { Speaker } from "~/components/io";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/misc";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { agentCopy } from "~/copy/agent";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { formatDateTime, formatTime } from "~/lib/format";
import { navigate } from "~/lib/router";

import { BrainPermissionCard, isBrainRead } from "../brain/brain-permission";
import { chatBlocked } from "../chat/blocked";
import { Composer, type ComposerHandle, type ComposerSubmit } from "../chat/composer";
import { useOpenProjectFile } from "../chat/file-link";
import { sendFirstMessage } from "../chat/first-message";
import { PermissionCard, QuestionCard } from "../chat/interaction-cards";
import { AssistantTurn, ThinkingLine, UserMessage, type TurnActions } from "../chat/message-view";
import { useProjectState, useRuntime } from "../project/runtime";
import { isOptimistic } from "../project/store";

/*
 * The Agent's conversation (design v2-Assistant and v2-Conversation): the project runtime, the
 * message views, the interaction cards and the composer of the chat page, laid out as the iO
 * transcript inside a white panel. The page scrolls; there is no inner scroll area or dock.
 */

type Item = { kind: "user"; message: Message } | { kind: "turn"; key: string; messages: Message[] };

const EMPTY: Message[] = [];

function toItems(messages: readonly Message[]): Item[] {
  const items: Item[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      items.push({ kind: "user", message });
      continue;
    }
    const last = items.at(-1);
    if (last?.kind === "turn") last.messages.push(message);
    else items.push({ kind: "turn", key: message.id, messages: [message] });
  }
  return items;
}

const textOf = (message: Message) => message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** "08:30" today, "di 3 nov 10:14" on another day (the design's speaker lines). */
export function speakerTime(timestamp: number, now = Date.now()): string {
  return startOfDay(timestamp) === startOfDay(now) ? formatTime(timestamp) : formatDateTime(timestamp);
}

/**
 * The iO transcript type: 17px prose, the Markdown table full width with dashed suggestion rows.
 * `.bw-prose` is unlayered CSS, so these overrides need the important modifier to win.
 */
const PROSE =
  "text-lg! [&_.bw-prose]:text-[17px]! [&_.bw-prose]:leading-7! [&_.bw-prose>p]:max-w-[62ch]! [&_.bw-prose_table]:text-base! md:[&_.bw-prose_table]:table! md:[&_.bw-prose_table]:w-full! [&_.bw-prose_th]:border-line-strong! [&_.bw-prose_th]:py-3! [&_.bw-prose_th]:font-semibold! [&_.bw-prose_th]:text-ink-muted! [&_.bw-prose_td]:border-dashed! [&_.bw-prose_td]:border-line-strong! [&_.bw-prose_td]:py-3! [&_.bw-prose_td:first-child]:font-semibold! [&_.bw-prose_td:nth-child(2)]:text-ink-muted! [&_.bw-prose_td:last-child]:pe-0! [&_.bw-prose_td:last-child]:text-end! [&_.bw-prose_th:last-child]:pe-0! [&_.bw-prose_th:last-child]:text-end!";

const USER_BUBBLE = "max-w-full rounded-card rounded-br-card bg-surface-alt px-5 py-4 text-lg leading-7 text-ink";

export function AgentSpeaker(props: { who: "agent" | "you"; at: number | null }) {
  const time = props.at ? speakerTime(props.at) : null;
  return props.who === "you" ? (
    <Speaker who="you">
      {agentCopy.panel.you}
      {time ? <> · {time}</> : null}
    </Speaker>
  ) : (
    <Speaker who="agent">
      <strong className="font-semibold text-ink">{agentCopy.panel.agent}</strong>
      {time ? <span>· {time}</span> : null}
    </Speaker>
  );
}

/** An open chat of the personal project: transcript, cards, the pill composer. */
export function AgentConversation(props: {
  project: Project;
  chatId: string;
  /** Under the last answer: the "make it a project" suggestion and the "Omzetten in" row. */
  afterLastAnswer?: ReactNode;
  /** Gets the messages, so the page can decide on the suggestion. */
  onMessages?: (messages: readonly Message[]) => void;
  placeholder?: string;
}) {
  const backend = useBackend();
  const runtime = useRuntime();
  const status = useStatus();
  const refreshAttention = useRefreshAttention();
  const chat = useProjectState((state) => state.chats[props.chatId]);
  const entry = useProjectState((state) => state.messages[props.chatId]);
  const permissions = useProjectState((state) => state.permissions[props.chatId]);
  const questions = useProjectState((state) => state.questions[props.chatId]);
  const composer = useRef<ComposerHandle>(null);
  const [modelOverride, setModelOverride] = useState<string | null>(null);
  const [agent, setAgent] = useState<string | null>(null);
  const [stoppedTurns, setStoppedTurns] = useState<readonly string[]>([]);
  const { project, onMessages } = props;
  const openFile = useOpenProjectFile(project, props.chatId);

  useEffect(() => {
    setModelOverride(null);
    setStoppedTurns([]);
    void runtime.ensureMessages(props.chatId);
  }, [runtime, props.chatId]);

  const messages = entry?.list ?? EMPTY;
  useEffect(() => onMessages?.(messages), [messages, onMessages]);
  const revertAt = chat?.revertMessageId ? messages.findIndex((message) => message.id === chat.revertMessageId) : -1;
  const visible = revertAt >= 0 ? messages.slice(0, revertAt) : messages;
  const items = useMemo(() => toItems(visible), [visible]);
  const running = chat?.status === "running" || chat?.status === "waiting";
  const lastItem = items.at(-1);
  const liveTurn = running && lastItem?.kind === "turn" ? lastItem.key : null;
  const awaitingFirstStep = running && lastItem?.kind === "user";
  const lastTurn = [...items].reverse().find((item) => item.kind === "turn");
  const blocked = chatBlocked(status.data, project);
  const model = modelOverride ?? chat?.model ?? startModel(status.data, project);
  const models = useMemo(() => projectModels(status.data, project), [status.data, project]);

  const send = useCallback(
    async (input: ComposerSubmit): Promise<boolean> => {
      if (!model) return false;
      const local = runtime.addLocalMessage(props.chatId, input.command ? `/${input.command} ${input.text}`.trim() : input.text, input.attachments);
      try {
        await backend.chats.send(project.id, props.chatId, { text: input.text, model, agent, attachments: input.attachments, command: input.command, skills: input.skills });
        if (chat?.revertMessageId) runtime.upsertChat({ ...chat, revertMessageId: null });
        return true;
      } catch (failure) {
        runtime.removeLocalMessage(props.chatId, local);
        toast(`${copy.chat.sendFailed} ${errorText(failure)}`, { tone: "error" });
        return false;
      }
    },
    [backend, runtime, project.id, props.chatId, model, agent, chat],
  );

  const stop = useCallback(() => {
    if (liveTurn) setStoppedTurns((current) => (current.includes(liveTurn) ? current : [...current, liveTurn]));
    void backend.chats
      .abort(project.id, props.chatId)
      .then(refreshAttention)
      .catch((failure: unknown) => toast(errorText(failure), { tone: "error" }));
  }, [backend, project.id, props.chatId, liveTurn, refreshAttention]);

  const userBefore = useCallback(
    (turnId: string): Message | null => {
      const index = visible.findIndex((message) => message.id === turnId);
      for (let position = index - 1; position >= 0; position -= 1) {
        const candidate = visible[position];
        if (candidate?.role === "user") return candidate;
      }
      return null;
    },
    [visible],
  );

  const turnActions = useMemo<TurnActions>(
    () => ({
      models,
      onErrorAction: (kind: ChatError["kind"], turnId: string) => {
        if (kind === "model_unavailable") {
          composer.current?.focus();
          return;
        }
        // "Opnieuw": back to the question, then send it again (as on the chat page).
        const user = userBefore(turnId);
        if (!user || !chat) return;
        runtime.upsertChat({ ...chat, revertMessageId: user.id });
        void backend.chats
          .revert(project.id, props.chatId, user.id)
          .then(() => send({ text: textOf(user), attachments: [], command: null, skills: [] }))
          .catch((failure: unknown) => toast(errorText(failure), { tone: "error" }));
      },
      onContinue: () => void send({ text: copy.chat.turn.continuePrompt, attachments: [], command: null, skills: [] }),
      onRerun: (turnId, chosen) => {
        const user = userBefore(turnId);
        if (!user) return;
        void backend.chats
          .fork(project.id, props.chatId, user.id)
          .then(async (created) => {
            runtime.upsertChat(created);
            await backend.chats.send(project.id, created.id, { text: textOf(user), model: chosen, agent, attachments: [], command: null, skills: [] });
            toast(copy.chat.turn.rerunStarted);
            navigate({ name: "agent", chatId: created.id });
          })
          .catch((failure: unknown) => toast(errorText(failure), { tone: "error" }));
      },
      onOpenFile: openFile,
    }),
    [models, userBefore, chat, runtime, backend, project.id, props.chatId, send, agent, openFile],
  );

  const permission = permissions?.[0];
  const question = questions?.[0];
  const decisionPending = permission ? "permission" : question ? "question" : false;

  return (
    <>
      {entry?.state === "error" ? (
        <div className="flex flex-col items-start gap-4" role="alert">
          <p className="m-0 text-lg text-ink">{agentCopy.panel.loadFailed}</p>
          <Button variant="secondary" size="xl" onClick={() => void runtime.ensureMessages(props.chatId, true)}>
            {agentCopy.panel.retry}
          </Button>
        </div>
      ) : !entry || (entry.state === "loading" && !messages.length) ? (
        <div className="flex flex-col gap-8" aria-busy="true" aria-label={agentCopy.panel.messages}>
          <Skeleton className="ms-auto h-16 w-2/3 rounded-card" />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-8/12" />
          </div>
        </div>
      ) : (
        <ol aria-label={agentCopy.panel.messages} className="m-0 flex list-none flex-col gap-8 p-0">
          {items.map((item) =>
            item.kind === "user" ? (
              <li key={item.message.id} className="flex flex-col items-end">
                <UserMessage
                  message={item.message}
                  pending={item.message.id.startsWith("local-")}
                  optimistic={isOptimistic(item.message)}
                  label={<AgentSpeaker who="you" at={item.message.createdAt} />}
                  bubbleClassName={USER_BUBBLE}
                />
              </li>
            ) : (
              <li key={item.key} className="flex min-w-0 flex-col gap-4">
                <AgentSpeaker who="agent" at={item.messages[0]?.createdAt ?? null} />
                <div className={PROSE}>
                  <AssistantTurn messages={item.messages} live={item.key === liveTurn} stopped={stoppedTurns.includes(item.key)} projectId={project.id} actions={turnActions} />
                </div>
                {!running && item === lastTurn && props.afterLastAnswer ? props.afterLastAnswer : null}
              </li>
            ),
          )}
          {awaitingFirstStep ? (
            <li className="flex flex-col gap-4">
              <AgentSpeaker who="agent" at={null} />
              <ThinkingLine />
            </li>
          ) : null}
        </ol>
      )}

      <section aria-label={agentCopy.panel.followUp} className="flex flex-col gap-3">
        {permission && isBrainRead(permission) ? (
          <BrainPermissionCard
            key={permission.id}
            projectId={project.id}
            request={permission}
            messages={messages}
            onReply={async (reply) => {
              try {
                await backend.interactions.replyPermission(project.id, props.chatId, permission.id, reply);
                runtime.dropPermission(props.chatId, permission.id);
                void refreshAttention();
              } catch (failure) {
                toast(errorText(failure), { tone: "error" });
              }
            }}
          />
        ) : permission ? (
          <PermissionCard
            key={permission.id}
            projectId={project.id}
            request={permission}
            autoFocus
            onDone={() => {
              runtime.dropPermission(props.chatId, permission.id);
              void refreshAttention();
              composer.current?.focus();
            }}
          />
        ) : question ? (
          <QuestionCard
            key={question.id}
            projectId={project.id}
            request={question}
            autoFocus
            onDone={() => {
              runtime.dropQuestion(props.chatId, question.id);
              void refreshAttention();
              composer.current?.focus();
            }}
          />
        ) : null}
        <Composer
          ref={composer}
          variant="pill"
          sendLabel={copy.chat.send}
          project={project}
          chatId={props.chatId}
          running={running}
          model={model}
          onModelChange={setModelOverride}
          agent={agent}
          onAgentChange={setAgent}
          onSubmit={send}
          onStop={stop}
          blocked={blocked}
          decisionPending={decisionPending}
          placeholder={running || decisionPending ? undefined : (props.placeholder ?? agentCopy.panel.placeholder)}
        />
      </section>
    </>
  );
}

/** "Nieuwe chat": the composer alone; the first message makes the chat and opens it. */
export function AgentNewChat(props: { project: Project }) {
  const backend = useBackend();
  const status = useStatus();
  const [model, setModel] = useState<string | null>(null);
  const [agent, setAgent] = useState<string | null>(null);
  const { project } = props;
  const effectiveModel = model ?? startModel(status.data, project);

  const submit = async (input: ComposerSubmit): Promise<boolean> => {
    if (!effectiveModel) return false;
    try {
      const chat = await backend.chats.create(project.id, { model: effectiveModel });
      sendFirstMessage(backend, chat, { text: input.text, model: effectiveModel, agent, attachments: input.attachments, command: input.command, skills: input.skills });
      navigate({ name: "agent", chatId: chat.id });
      return true;
    } catch (failure) {
      toast(`${agentCopy.newChatFailed} ${errorText(failure)}`, { tone: "error" });
      return false;
    }
  };

  return (
    <>
      <p className={cn("m-0 max-w-[60ch] text-lg text-ink-muted")}>{agentCopy.panel.newLead}</p>
      <Composer
        variant="pill"
        sendLabel={copy.chat.send}
        project={project}
        chatId={null}
        running={false}
        model={effectiveModel}
        onModelChange={setModel}
        agent={agent}
        onAgentChange={setAgent}
        onSubmit={submit}
        onStop={() => {}}
        blocked={chatBlocked(status.data, project)}
        placeholder={agentCopy.panel.placeholder}
        autoFocus
        keepUntilSent
      />
    </>
  );
}
