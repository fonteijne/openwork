import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ChevronLeft, Clock, Ellipsis, RotateCcw, WifiOff } from "lucide-react";

import { useBackend } from "~/backend/context";
import { projectModels, startModel, useRefreshAttention, useStatus } from "~/backend/queries";
import type { ChatError, Message, Project } from "~/backend/types";
import { PageTitle, TopBar } from "~/components/top-bar";
import { Button } from "~/components/ui/button";
import { StatusChip } from "~/components/ui/chip";
import { EmptyState, Skeleton } from "~/components/ui/misc";
import { toast } from "~/components/ui/toast";
import { Tooltip } from "~/components/ui/tooltip";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { canGoBack, goBack, navigate } from "~/lib/router";
import { chord } from "~/lib/shortcuts";
import { scrollBehavior } from "~/lib/use-media";
import { writeLocal } from "~/lib/storage";

import { useProjectState, useRuntime } from "../project/runtime";
import { isOptimistic } from "../project/store";
import { chatBlocked } from "./blocked";
import { ChatActions } from "./chat-actions";
import { Composer, type ComposerHandle, type ComposerSubmit } from "./composer";
import { useOpenProjectFile } from "./file-link";
import { PermissionCard, QuestionCard } from "./interaction-cards";
import { BrainPermissionCard, isBrainRead } from "~/features/brain/brain-permission";
import { BrainCards } from "~/features/brain/cards";
import { BrainTurnLine } from "~/features/brain/turn-line";
import { useTurnAnnouncement } from "./announce";
import { AssistantTurn, ThinkingLine, UserMessage, type TurnActions } from "./message-view";

// "Maak hier een routine van" (brief §8): the editor is the routines page's chunk, fetched on first use.
const RoutineEditor = lazy(() => import("../routines/routine-editor").then((module) => ({ default: module.RoutineEditor })));

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

const textOf = (message: Message) => message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");

export function ChatView(props: { project: Project; chatId: string }) {
  const backend = useBackend();
  const runtime = useRuntime();
  const status = useStatus();
  // A reply drops the chat's card from Vandaag at once instead of on the next poll (brief §9).
  const refreshAttention = useRefreshAttention();
  const chat = useProjectState((state) => state.chats[props.chatId]);
  const chatsState = useProjectState((state) => state.chatsState);
  const entry = useProjectState((state) => state.messages[props.chatId]);
  const permissions = useProjectState((state) => state.permissions[props.chatId]);
  const questions = useProjectState((state) => state.questions[props.chatId]);
  const connection = useProjectState((state) => state.connection);
  const composer = useRef<ComposerHandle>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [routineFrom, setRoutineFrom] = useState<Message | null>(null);
  const [agent, setAgent] = useState<string | null>(null);
  const [modelOverride, setModelOverride] = useState<string | null>(null);
  /** The scroll area ends where the composer dock begins (brief §7). */
  const [dockHeight, setDockHeight] = useState(0);
  /** A message typed with ⌘⏎ while the agent ran: sent when the turn ends (T5). */
  const [queued, setQueued] = useState<ComposerSubmit | null>(null);
  /**
   * Turns the person stopped here. The engine marks a cut-short step, but a stop while the
   * words stream leaves no trace: this remembers it, so the turn says "Gestopt door jou" (C5).
   */
  const [stoppedTurns, setStoppedTurns] = useState<readonly string[]>([]);
  const { project } = props;
  const openFile = useOpenProjectFile(project, props.chatId);

  useEffect(() => {
    stick.current = true;
    setModelOverride(null);
    setQueued(null);
    setStoppedTurns([]);
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
  const blocked = chatBlocked(status.data, project);
  const model = modelOverride ?? chat?.model ?? startModel(status.data, project);
  const models = useMemo(() => projectModels(status.data, project), [status.data, project]);
  const hasChat = Boolean(chat);

  // The dock (cards + composer) floats over the end of the scroll area; the area pads for it.
  useLayoutEffect(() => {
    const element = dock.current;
    if (!element) return;
    const measure = () => setDockHeight(element.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasChat]);

  // Follow the answer while it streams, unless the person scrolled up to read.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element && stick.current) element.scrollTop = element.scrollHeight;
  }, [visible, permissions, questions, dockHeight]);

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

  // ⌘⏎ while running: the message goes out the moment the turn ends.
  useEffect(() => {
    if (!queued || running) return;
    setQueued(null);
    void send(queued);
  }, [queued, running, send]);

  const stop = useCallback(() => {
    if (liveTurn) setStoppedTurns((current) => (current.includes(liveTurn) ? current : [...current, liveTurn]));
    // The sidebar's project chip and Vandaag's Bezig read the summaries: refresh them so "Bezig" leaves with the turn.
    void backend.chats
      .abort(project.id, props.chatId)
      .then(refreshAttention)
      .catch((failure: unknown) => toast(errorText(failure), { tone: "error" }));
  }, [backend, project.id, props.chatId, liveTurn, refreshAttention]);

  /** The person's message that started a turn, for retry and rerun. */
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

  /** "Opnieuw": the turn runs again (revert to its question, then send) instead of a second copy of the question (brief §7). */
  const retryTurn = useCallback(
    async (turnId: string) => {
      const user = userBefore(turnId);
      if (!user || !chat) return;
      try {
        runtime.upsertChat({ ...chat, revertMessageId: user.id });
        await backend.chats.revert(project.id, props.chatId, user.id);
        const sent = await send({ text: textOf(user), attachments: [], command: null, skills: [] });
        if (sent) toast(copy.chat.turn.retried);
      } catch (failure) {
        runtime.upsertChat({ ...chat, revertMessageId: chat.revertMessageId });
        toast(errorText(failure), { tone: "error" });
      }
    },
    [userBefore, chat, runtime, backend, project.id, props.chatId, send],
  );

  /** "Nogmaals met ander model": a copy of the chat up to the question, sent again there with that model. */
  const rerunTurn = useCallback(
    async (turnId: string, chosen: string) => {
      const user = userBefore(turnId);
      if (!user) return;
      try {
        const created = await backend.chats.fork(project.id, props.chatId, user.id);
        runtime.upsertChat(created);
        await backend.chats.send(project.id, created.id, { text: textOf(user), model: chosen, agent, attachments: [], command: null, skills: [] });
        toast(copy.chat.turn.rerunStarted);
        navigate({ name: "project", projectId: project.id, chatId: created.id });
      } catch (failure) {
        toast(errorText(failure), { tone: "error" });
      }
    },
    [userBefore, backend, project.id, props.chatId, runtime, agent],
  );

  const turnActions = useMemo<TurnActions>(
    () => ({
      models,
      onErrorAction: (kind: ChatError["kind"], turnId: string) => {
        if (kind === "model_unavailable") composer.current?.focus();
        else void retryTurn(turnId);
      },
      onContinue: () => void send({ text: copy.chat.turn.continuePrompt, attachments: [], command: null, skills: [] }),
      onRerun: (turnId, chosen) => void rerunTurn(turnId, chosen),
      onOpenFile: openFile,
    }),
    [models, retryTurn, send, rerunTurn, openFile],
  );

  const fork = async (message: Message) => {
    try {
      const created = await backend.chats.fork(project.id, props.chatId, message.id);
      runtime.upsertChat(created);
      writeLocal(`bonzaiwork.draft.${project.id}.${created.id}`, textOf(message));
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

  const announcement = useTurnAnnouncement({ status: chat?.status ?? "idle", decision: permissions?.length ? "permission" : questions?.length ? "question" : false }, messages);

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
  const decisionPending = permission ? "permission" : question ? "question" : false;

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
      {/* Brief §7: back chevron (⌘[, the in-app route stack), title 16px/600, StatusChip with a word, ⋯, Details. */}
      <TopBar
        details
        leading={
          <Tooltip label={copy.chat.header.back} shortcut={chord("back")} side="bottom">
            <Button
              variant="quiet"
              size="icon"
              className="-ms-1"
              aria-label={copy.chat.header.back}
              data-testid="chat-back"
              onClick={() => (canGoBack() ? goBack() : navigate({ name: "project", projectId: project.id, chatId: null }))}
            >
              <ChevronLeft />
            </Button>
          </Tooltip>
        }
        actions={<ChatActions chat={chat} trigger={<Button variant="quiet" size="icon" aria-label={copy.chat.actions}><Ellipsis /></Button>} />}
      >
        <div className="min-w-0">
          <PageTitle>{chat.untitled ? copy.chat.untitled : chat.title}</PageTitle>
          <p className="truncate text-xs text-subtle-foreground lg:hidden">{project.name}</p>
        </div>
        <StatusChip status={chat.status} pill className="shrink-0 max-sm:sr-only" />
      </TopBar>

      {connection === "reconnecting" ? (
        <div className="flex items-center justify-center gap-2 border-b border-border bg-amber-3 px-3 py-1.5 text-xs text-amber-11" role="status">
          <WifiOff className="size-3.5" />
          {copy.chat.reconnecting}
        </div>
      ) : null}

      <main className="relative flex min-h-0 flex-1 flex-col">
        {/* The turn's state, spoken: step changes at most every 5 s, end states at once (WCAG 4.1.3). */}
        <p role="status" aria-live="polite" className="sr-only" data-testid="chat-announce">
          {announcement}
        </p>
        <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid="chat-scroller">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pt-6 sm:px-6" style={{ paddingBottom: dockHeight + 16 }} data-testid="chat-messages">
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
                    onRoutine={backend.capabilities.routines ? () => setRoutineFrom(item.message) : undefined}
                  />
                ) : (
                  <AssistantTurn key={item.key} messages={item.messages} live={item.key === liveTurn} stopped={stoppedTurns.includes(item.key)} projectId={project.id} actions={turnActions} />
                ),
              )
            )}
            {awaitingFirstStep ? <ThinkingLine /> : null}
            {!running && items.length ? <BrainTurnLine projectId={project.id} chatId={props.chatId} /> : null}
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

        {/* The dock: decision cards, brain cards and the composer, over the end of the scroll area; solid, so nothing shows through in the dark theme. */}
        <div ref={dock} className="absolute inset-x-0 bottom-0 bg-background px-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-6" data-testid="composer-dock">
          {showJump ? (
            <div className="pointer-events-none absolute inset-x-0 -top-12 flex justify-center">
              <Button
                variant="secondary"
                size="sm"
                className="pointer-events-auto rounded-full bg-background shadow-card"
                onClick={() => {
                  stick.current = true;
                  scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: scrollBehavior() });
                }}
              >
                <ArrowDown />
                {copy.chat.jumpToLatest}
              </Button>
            </div>
          ) : null}
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
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
            ) : (
              <BrainCards projectId={project.id} chatTitle={chat?.title ?? null} />
            )}
            {queued ? (
              <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground" role="status" data-testid="composer-queued">
                <Clock className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  {copy.chat.composer.queued}
                  {queued.text ? <span className="text-foreground"> · {queued.text}</span> : null}
                </span>
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={() => {
                    composer.current?.setText(queued.text);
                    setQueued(null);
                  }}
                >
                  {copy.chat.composer.cancelQueued}
                </Button>
              </div>
            ) : null}
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
              onQueue={setQueued}
              onStop={stop}
              blocked={blocked}
              decisionPending={decisionPending}
              autoFocus
            />
          </div>
        </div>
      </main>

      {dragging ? (
        <div className={cn("pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-window border-2 border-dashed border-ring bg-background/85 text-sm font-medium text-foreground")}>
          {copy.chat.dropHere}
        </div>
      ) : null}
      {routineFrom ? (
        <Suspense fallback={null}>
          <RoutineEditor
            open
            onOpenChange={(open) => {
              if (!open) setRoutineFrom(null);
            }}
            routine={null}
            projectId={project.id}
            template={{ prompt: textOf(routineFrom), model: chat?.model ?? null }}
          />
        </Suspense>
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
      <div className="mx-auto mb-4 w-full max-w-3xl px-6">
        <Skeleton className="h-24 w-full rounded-shell" />
      </div>
    </div>
  );
}
