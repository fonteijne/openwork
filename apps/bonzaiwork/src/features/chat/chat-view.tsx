import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ChevronLeft, Ellipsis, PanelRight, RotateCcw, WifiOff } from "lucide-react";

import { useBackend } from "~/backend/context";
import { projectHasKey, startModel, useStatus } from "~/backend/queries";
import type { ChatError, Message, Project } from "~/backend/types";
import { PageTitle, TopBar } from "~/components/top-bar";
import { Button } from "~/components/ui/button";
import { EmptyState, Skeleton, StatusDot } from "~/components/ui/misc";
import { Tooltip } from "~/components/ui/tooltip";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { href, navigate } from "~/lib/router";
import { writeLocal } from "~/lib/storage";
import { useMediaQuery, WIDE } from "~/lib/use-media";

import { useProjectState, useRuntime } from "../project/runtime";
import { isOptimistic } from "../project/store";
import { useUi } from "../shell/ui-store";
import { ChatActions } from "./chat-actions";
import { Composer, type ComposerHandle, type ComposerSubmit } from "./composer";
import { PermissionCard, QuestionCard } from "./interaction-cards";
import { BrainCards } from "~/features/brain/cards";
import { BrainPill } from "~/features/brain/status-pill";
import { BrainTurnLine } from "~/features/brain/turn-line";
import { AssistantTurn, UserMessage, type TurnActions } from "./message-view";
import { KeyBlocked } from "./project-home";

type Item = { kind: "user"; message: Message } | { kind: "turn"; key: string; messages: Message[] };

function toItems(messages: Message[]): Item[] {
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

const EMPTY: Message[] = [];

export function ChatView(props: { project: Project; chatId: string }) {
  const backend = useBackend();
  const runtime = useRuntime();
  const status = useStatus();
  const wide = useMediaQuery(WIDE);
  const toggleSidecar = useUi((state) => state.toggleSidecar);
  const setSidecarSheet = useUi((state) => state.setSidecarSheet);
  const sidecarPinned = useUi((state) => state.sidecarPinned);
  const chat = useProjectState((state) => state.chats[props.chatId]);
  const chatsState = useProjectState((state) => state.chatsState);
  const entry = useProjectState((state) => state.messages[props.chatId]);
  const permissions = useProjectState((state) => state.permissions[props.chatId]);
  const questions = useProjectState((state) => state.questions[props.chatId]);
  const connection = useProjectState((state) => state.connection);
  const composer = useRef<ComposerHandle>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [agent, setAgent] = useState<string | null>(null);
  const [modelOverride, setModelOverride] = useState<string | null>(null);
  const { project } = props;

  useEffect(() => {
    stick.current = true;
    setModelOverride(null);
    void runtime.ensureMessages(props.chatId);
  }, [runtime, props.chatId]);

  const messages = entry?.list ?? EMPTY;
  const revertAt = chat?.revertMessageId ? messages.findIndex((message) => message.id === chat.revertMessageId) : -1;
  const visible = revertAt >= 0 ? messages.slice(0, revertAt) : messages;
  const items = useMemo(() => toItems(visible), [visible]);
  const running = chat?.status === "running" || chat?.status === "waiting";
  const lastItem = items.at(-1);
  const liveTurn = running && lastItem?.kind === "turn" ? lastItem.key : null;
  const awaitingFirstStep = running && lastItem?.kind === "user";
  const hasKey = projectHasKey(status.data, project);
  const model = modelOverride ?? chat?.model ?? startModel(status.data, project);

  // Follow the answer while it streams, unless the person scrolled up to read.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element && stick.current) element.scrollTop = element.scrollHeight;
  }, [visible, permissions, questions]);

  const onScroll = () => {
    const element = scroller.current;
    if (!element) return;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
    stick.current = atBottom;
    setShowJump(!atBottom);
  };

  const send = useCallback(
    async (input: ComposerSubmit): Promise<boolean> => {
      if (!model) return false;
      const local = runtime.addLocalMessage(props.chatId, input.command ? `/${input.command} ${input.text}`.trim() : input.text, input.attachments);
      stick.current = true;
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
    void backend.chats.abort(project.id, props.chatId).catch((failure: unknown) => toast(errorText(failure), { tone: "error" }));
  }, [backend, project.id, props.chatId]);

  const lastUserText = [...visible].reverse().find((message) => message.role === "user")?.parts.map((part) => (part.type === "text" ? part.text : "")).join("") ?? "";
  const turnActions = useMemo<TurnActions>(
    () => ({
      onErrorAction: (kind: ChatError["kind"]) => {
        if (kind === "key_missing" || kind === "key_rejected") navigate({ name: "project-settings", projectId: project.id, section: "key" });
        else if (kind === "model_unavailable") composer.current?.focus();
        else if (lastUserText && model) void send({ text: lastUserText, attachments: [], command: null, skills: [] });
      },
    }),
    [project.id, lastUserText, model, send],
  );

  const fork = async (message: Message) => {
    try {
      const created = await backend.chats.fork(project.id, props.chatId, message.id);
      runtime.upsertChat(created);
      const text = message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
      writeLocal(`bonzaiwork.draft.${project.id}.${created.id}`, text);
      toast(copy.chat.forked);
      navigate({ name: "project", projectId: project.id, chatId: created.id });
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
    }
  };

  const revert = async (message: Message) => {
    if (!chat) return;
    try {
      runtime.upsertChat({ ...chat, revertMessageId: message.id });
      await backend.chats.revert(project.id, props.chatId, message.id);
      toast(copy.chat.reverted, { action: { label: copy.chat.restore, onClick: () => void unrevert() } });
    } catch (failure) {
      runtime.upsertChat({ ...chat, revertMessageId: chat.revertMessageId });
      toast(errorText(failure), { tone: "error" });
    }
  };

  const unrevert = async () => {
    if (!chat) return;
    try {
      runtime.upsertChat({ ...chat, revertMessageId: null });
      await backend.chats.unrevert(project.id, props.chatId);
      toast(copy.chat.restored2);
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
    }
  };

  if (!chat) {
    if (chatsState === "loading") return <ChatSkeleton project={project} />;
    return (
      <div className="flex h-full flex-col">
        <TopBar>
          <PageTitle>{project.name}</PageTitle>
        </TopBar>
        <EmptyState
          title={copy.errors.not_found}
          action={
            <Button variant="secondary" onClick={() => navigate({ name: "project", projectId: project.id, chatId: null })}>
              {copy.chatList.newChat}
            </Button>
          }
        />
      </div>
    );
  }

  const permission = permissions?.[0];
  const question = questions?.[0];
  const statusLabel = copy.sidecar.statuses[chat.status];

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget instanceof Node ? event.relatedTarget : null)) return;
        setDragging(false);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault();
        setDragging(false);
        composer.current?.addFiles(event.dataTransfer.files);
      }}
    >
      <TopBar
        leading={
          <a href={href({ name: "project", projectId: project.id, chatId: null })} className="-ms-1 flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-hover lg:hidden" aria-label={copy.nav.back}>
            <ChevronLeft className="size-5" />
          </a>
        }
        actions={
          <>
            <BrainPill projectId={project.id} className="max-sm:hidden" />
            <ChatActions chat={chat} trigger={<Button variant="quiet" size="icon" aria-label={copy.chat.actions}><Ellipsis /></Button>} />
            <Tooltip label={wide && sidecarPinned ? copy.chat.sidecarHide : copy.chat.sidecarShow}>
              <Button
                variant="quiet"
                size="icon"
                aria-label={wide && sidecarPinned ? copy.chat.sidecarHide : copy.chat.sidecarShow}
                aria-pressed={wide ? sidecarPinned : undefined}
                onClick={() => (wide ? toggleSidecar() : setSidecarSheet(true))}
              >
                <PanelRight />
              </Button>
            </Tooltip>
          </>
        }
      >
        <div className="min-w-0">
          <PageTitle>{chat.untitled ? copy.chat.untitled : chat.title}</PageTitle>
          <p className="flex items-center gap-1.5 text-xs text-subtle-foreground lg:hidden">
            <span className="truncate">{project.name}</span>
          </p>
        </div>
        {chat.status !== "idle" ? (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <StatusDot status={chat.status} />
            <span className="max-sm:hidden">{statusLabel}</span>
          </span>
        ) : null}
      </TopBar>

      {connection === "reconnecting" ? (
        <div className="flex items-center justify-center gap-2 border-b border-border bg-amber-3 px-3 py-1.5 text-xs text-amber-11" role="status">
          <WifiOff className="size-3.5" />
          {copy.chat.reconnecting}
        </div>
      ) : null}

      <main className="flex min-h-0 flex-1 flex-col">
        <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid="chat-scroller">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pt-6 pb-8 sm:px-6" data-testid="chat-messages">
            {entry?.state === "loading" && !messages.length ? (
              <div className="flex flex-col gap-6" aria-busy="true">
                <Skeleton className="ms-auto h-14 w-2/3 rounded-2xl" />
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-11/12" />
                  <Skeleton className="h-4 w-10/12" />
                  <Skeleton className="h-4 w-7/12" />
                </div>
              </div>
            ) : entry?.state === "error" ? (
              <EmptyState
                title={copy.chat.loadFailed}
                action={
                  <Button variant="secondary" onClick={() => void runtime.ensureMessages(props.chatId, true)}>
                    {copy.chat.retry}
                  </Button>
                }
              />
            ) : (
              items.map((item) =>
                item.kind === "user" ? (
                  <UserMessage
                    key={item.message.id}
                    message={item.message}
                    pending={item.message.id.startsWith("local-")}
                    optimistic={isOptimistic(item.message)}
                    onFork={() => void fork(item.message)}
                    onRevert={running ? undefined : () => void revert(item.message)}
                  />
                ) : (
                  <AssistantTurn key={item.key} messages={item.messages} live={item.key === liveTurn} projectId={project.id} actions={turnActions} />
                ),
              )
            )}
            {awaitingFirstStep ? (
              <div className="flex min-h-7 items-center gap-2.5 text-sm">
                <span className="flex size-4 items-center justify-center">
                  <span className="bw-pulse size-1.5 rounded-full bg-subtle-foreground" />
                </span>
                <span className="bw-shimmer">{copy.chat.thinking}</span>
              </div>
            ) : null}
            {!running && items.length ? <BrainTurnLine projectId={project.id} /> : null}
            {revertAt >= 0 ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                <RotateCcw className="size-4 shrink-0" />
                <span className="min-w-0 flex-1">{copy.chat.revertedBanner}</span>
                <Button variant="secondary" size="sm" onClick={() => void unrevert()}>
                  {copy.chat.restore}
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="relative shrink-0 px-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-6">
          {showJump ? (
            <div className="pointer-events-none absolute inset-x-0 -top-12 flex justify-center">
              <Button
                variant="secondary"
                size="sm"
                className="pointer-events-auto rounded-full shadow-card"
                onClick={() => {
                  stick.current = true;
                  scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
                }}
              >
                <ArrowDown />
                {copy.chat.jumpToLatest}
              </Button>
            </div>
          ) : null}
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
            {permission ? (
              <PermissionCard
                key={permission.id}
                request={permission}
                onReply={async (reply) => {
                  try {
                    await backend.interactions.replyPermission(project.id, props.chatId, permission.id, reply);
                    runtime.dropPermission(props.chatId, permission.id);
                  } catch (failure) {
                    toast(errorText(failure), { tone: "error" });
                  }
                }}
              />
            ) : question ? (
              <QuestionCard
                key={question.id}
                request={question}
                onAnswer={async (answers) => {
                  try {
                    await backend.interactions.replyQuestion(project.id, props.chatId, question.id, answers);
                    runtime.dropQuestion(props.chatId, question.id);
                  } catch (failure) {
                    toast(errorText(failure), { tone: "error" });
                  }
                }}
                onSkip={async () => {
                  try {
                    await backend.interactions.rejectQuestion(project.id, props.chatId, question.id);
                    runtime.dropQuestion(props.chatId, question.id);
                  } catch (failure) {
                    toast(errorText(failure), { tone: "error" });
                  }
                }}
              />
            ) : (
              <BrainCards projectId={project.id} />
            )}
            <Composer
              ref={composer}
              project={project}
              chatId={props.chatId}
              running={running}
              model={model}
              onModelChange={setModelOverride}
              agent={agent}
              onAgentChange={setAgent}
              onSubmit={send}
              onStop={stop}
              blocked={hasKey ? undefined : <KeyBlocked projectId={project.id} />}
              decisionPending={Boolean(permission ?? question)}
              autoFocus
            />
          </div>
        </div>
      </main>

      {dragging ? (
        <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-window border-2 border-dashed border-ring bg-background/85 text-sm font-medium text-foreground">
          {copy.chat.dropHere}
        </div>
      ) : null}
    </div>
  );
}

function ChatSkeleton(props: { project: Project }) {
  return (
    <div className="flex h-full flex-col">
      <TopBar>
        <Skeleton className="h-4 w-48" />
      </TopBar>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 pt-6" aria-busy="true" aria-label={props.project.name}>
        <Skeleton className="ms-auto h-14 w-2/3 rounded-2xl" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-8/12" />
      </div>
      <div className={cn("mx-auto mb-4 w-full max-w-3xl px-6")}>
        <Skeleton className="h-24 w-full rounded-shell" />
      </div>
    </div>
  );
}
