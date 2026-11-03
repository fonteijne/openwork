import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, CircleAlert, HelpCircle, Repeat, ShieldQuestion } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys, startModel, useAttention, useComposerEntries, useRefreshAttention, useStatus } from "~/backend/queries";
import type { AttentionItem, Chat, Message, Project } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { StatusChip } from "~/components/ui/chip";
import { Disclosure } from "~/components/ui/disclosure";
import { Kbd, Skeleton } from "~/components/ui/misc";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { errorText } from "~/lib/errors";
import { folderOf } from "~/lib/file-links";
import { formatTime, relativeTime } from "~/lib/format";
import { href, navigate } from "~/lib/router";
import { FOCUS_COMPOSER_EVENT } from "~/lib/shortcuts";
import { fileName } from "~/lib/tools";
import { SMALL_UP, useMediaQuery } from "~/lib/use-media";

import { projectCopy } from "../project/copy";
import { DocumentRow } from "../project/details";
import { useProjectState, useRuntime } from "../project/runtime";
import { isOptimistic } from "../project/store";
import { chatBlocked } from "./blocked";
import { Composer, type ComposerHandle, type ComposerSubmit } from "./composer";
import { useOpenProjectFile } from "./file-link";
import { absoluteFilePath } from "./sidecar";

const EMPTY: Message[] = [];
const MAX_CARDS = 5;

/** A section of the Werk tab: a quiet heading, content under one hairline (S1); nothing renders for an empty one. */
function WorkSection(props: { title: string; count?: number; children: ReactNode; testId?: string }) {
  return (
    <section className="mt-8" aria-label={props.title} data-testid={props.testId}>
      <h2 className="mb-1 flex items-baseline gap-2 text-sm font-semibold text-foreground">
        {props.title}
        {props.count ? <span className="text-xs font-medium text-subtle-foreground tabular-nums">{props.count}</span> : null}
      </h2>
      <div className="border-t border-border">{props.children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Voor jou, for this project (brief §5, §6): one Callout per open decision
// ---------------------------------------------------------------------------

function messageText(message: Message): string {
  return message.parts.map((part) => (part.type === "text" ? part.text : "")).join("").trim();
}

function AttentionCard(props: { project: Project; item: AttentionItem; onDone: () => void }) {
  const backend = useBackend();
  const runtime = useRuntime();
  const status = useStatus();
  const refreshAttention = useRefreshAttention();
  const [busy, setBusy] = useState(false);
  const { item, project } = props;
  const chatLink = (chatId: string) => href({ name: "project", projectId: project.id, chatId });

  const act = async (task: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await task();
      await refreshAttention();
      props.onDone();
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  switch (item.kind) {
    case "permission": {
      const { request } = item;
      const action = copy.permission.actions[request.action] ?? copy.permission.fallbackAction;
      const resource = request.resources[0] ? fileName(request.resources[0]) : null;
      const reversible = ["edit", "write", "patch"].includes(request.action);
      const reply = (value: "once" | "always" | "reject") =>
        act(async () => {
          await backend.interactions.replyPermission(project.id, item.chatId, request.id, value);
          runtime.dropPermission(item.chatId, request.id);
          toast(value === "reject" ? copy.attention.permission.denied : copy.attention.permission.allowed);
        });
      // Chords belong to the focused card, never to the window (brief §4).
      const onKey = (event: KeyboardEvent<HTMLElement>) => {
        if (event.target !== event.currentTarget || busy) return;
        if (event.key === "Enter") {
          event.preventDefault();
          void reply("once");
        } else if (event.key === "Escape") {
          event.preventDefault();
          void reply("reject");
        }
      };
      return (
        <Callout
          icon={<ShieldQuestion />}
          label={projectCopy.work.attention.permission}
          decision
          tabIndex={0}
          onKeyDown={onKey}
          data-attention=""
          testId="work-attention-permission"
          title={action}
          chip={resource}
          state={`${projectCopy.work.attention.inChat(item.chatTitle, relativeTime(item.at))} · ${reversible ? copy.attention.permission.reversible : copy.attention.permission.notReversible}`}
          actions={
            <>
              <Button variant="primary" size="sm" disabled={busy} onClick={() => void reply("once")}>
                {copy.attention.permission.allow}
                <Kbd>⏎</Kbd>
              </Button>
              {request.canAlways && request.scope ? (
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => void reply("always")} title={request.scope}>
                  {copy.attention.permission.always}
                </Button>
              ) : null}
              <Button variant="quiet" size="sm" disabled={busy} onClick={() => void reply("reject")}>
                {copy.attention.permission.deny}
                <Kbd>esc</Kbd>
              </Button>
            </>
          }
          link={<a href={chatLink(item.chatId)}>{projectCopy.work.attention.openChat}</a>}
        />
      );
    }
    case "question": {
      const field = item.request.fields[0];
      return (
        <Callout
          icon={<HelpCircle />}
          label={projectCopy.work.attention.question}
          decision
          data-attention=""
          tabIndex={0}
          testId="work-attention-question"
          title={field?.title ?? projectCopy.work.attention.question}
          state={projectCopy.work.attention.inChat(item.chatTitle, relativeTime(item.at))}
          actions={
            <Button variant="primary" size="sm" onClick={() => navigate({ name: "project", projectId: project.id, chatId: item.chatId })}>
              {projectCopy.work.attention.answer}
            </Button>
          }
        />
      );
    }
    case "chat_failed": {
      const reason = copy.errors.chat[item.error.kind]?.text ?? copy.errors.chat.unknown.text;
      // "Opnieuw" runs the turn again: revert to the last message and send it once more (brief §5, §7).
      const retry = () =>
        act(async () => {
          await runtime.ensureMessages(item.chatId);
          const list = runtime.store.getState().messages[item.chatId]?.list ?? EMPTY;
          const last = [...list].reverse().find((message) => message.role === "user" && !isOptimistic(message));
          const text = last ? messageText(last) : "";
          const chat = runtime.store.getState().chats[item.chatId];
          const model = chat?.model ?? startModel(status.data, project);
          if (!last || !text || !model) {
            navigate({ name: "project", projectId: project.id, chatId: item.chatId });
            return;
          }
          await backend.chats.revert(project.id, item.chatId, last.id);
          await backend.chats.send(project.id, item.chatId, { text, model, agent: null, attachments: [], command: null, skills: [] });
          toast(copy.attention.chatFailed.retried, { action: { label: projectCopy.work.attention.openChat, onClick: () => navigate({ name: "project", projectId: project.id, chatId: item.chatId }) } });
        });
      return (
        <Callout
          icon={<CircleAlert />}
          label={projectCopy.work.attention.failed}
          tone="failure"
          data-attention=""
          tabIndex={0}
          testId="work-attention-failed"
          title={copy.attention.chatFailed.title(reason.replace(/\.$/, ""))}
          state={projectCopy.work.attention.inChat(item.chatTitle, relativeTime(item.at))}
          actions={
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => void retry()}>
              {copy.attention.chatFailed.retry}
            </Button>
          }
          link={<a href={chatLink(item.chatId)}>{projectCopy.work.attention.openChat}</a>}
        />
      );
    }
    case "routine": {
      const state =
        item.reason === "missed" ? projectCopy.work.attention.missedAt(formatTime(item.at)) : (item.detail ?? (item.reason === "failed" ? projectCopy.work.attention.lastRunFailed : copy.attention.routine.attention));
      const routineLink = href({ name: "project-routines", projectId: project.id, routineId: item.routineId });
      const runNow = () =>
        act(async () => {
          const run = await backend.routines.run(item.routineId);
          const chatId = run.chatId;
          toast(copy.attention.routine.started, chatId ? { action: { label: projectCopy.work.attention.openChat, onClick: () => navigate({ name: "project", projectId: project.id, chatId }) } } : {});
        });
      return (
        <Callout
          icon={<Repeat />}
          label={projectCopy.work.attention.routine}
          decision={item.reason === "needs_attention"}
          tone={item.reason === "failed" ? "failure" : "neutral"}
          data-attention=""
          tabIndex={0}
          testId="work-attention-routine"
          title={item.name}
          state={state}
          actions={
            item.reason === "needs_attention" ? (
              <Button variant="secondary" size="sm" onClick={() => navigate({ name: "project-routines", projectId: project.id, routineId: item.routineId })}>
                {projectCopy.work.attention.openRoutine}
              </Button>
            ) : (
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => void runNow()}>
                {copy.attention.routine.runNow}
              </Button>
            )
          }
          link={item.reason === "needs_attention" ? null : <a href={routineLink}>{projectCopy.work.attention.openRoutine}</a>}
        />
      );
    }
    case "brain": {
      const title = item.state === "conflict" ? copy.attention.brain.conflict(null) : item.state === "needs_trust" ? copy.attention.brain.needsTrust : copy.attention.brain.error;
      return (
        <Callout
          icon={<BookOpen />}
          label={projectCopy.work.attention.brain}
          decision
          data-attention=""
          tabIndex={0}
          testId="work-attention-brain"
          title={title}
          state={relativeTime(item.at)}
          actions={
            <Button variant="secondary" size="sm" onClick={() => navigate({ name: "project-brain", projectId: project.id })}>
              {projectCopy.work.attention.openBrain}
            </Button>
          }
        />
      );
    }
    case "proposal":
      return null;
  }
}

/** The project's share of "Voor jou" (brief §6). After an answer the card leaves and focus moves on (S5, P11). */
function ProjectAttention(props: { project: Project }) {
  const attention = useAttention();
  const list = useRef<HTMLDivElement>(null);
  const [moveFocus, setMoveFocus] = useState(false);
  const items = useMemo(() => (attention.data ?? []).filter((item) => item.kind !== "proposal" && item.projectId === props.project.id), [attention.data, props.project.id]);

  useEffect(() => {
    if (!moveFocus) return;
    setMoveFocus(false);
    list.current?.querySelector<HTMLElement>("[data-attention]")?.focus();
  }, [moveFocus, items.length]);

  if (!items.length) return null;
  const shown = items.slice(0, MAX_CARDS);
  const rest = items.slice(MAX_CARDS);
  const keyOf = (item: AttentionItem): string => {
    switch (item.kind) {
      case "permission":
      case "question":
        return `${item.kind}:${item.request.id}`;
      case "chat_failed":
        return `failed:${item.chatId}`;
      case "routine":
        return `routine:${item.routineId}`;
      case "brain":
        return `brain:${item.projectId}`;
      case "proposal":
        return `proposal:${item.proposal.id}`;
    }
  };
  const card = (item: AttentionItem) => <AttentionCard key={keyOf(item)} project={props.project} item={item} onDone={() => setMoveFocus(true)} />;
  return (
    <section className="mt-8" aria-label={copy.project.forYou} data-testid="work-attention">
      <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-foreground">
        {copy.project.forYou}
        <span className="text-xs font-medium text-subtle-foreground tabular-nums">{items.length}</span>
      </h2>
      <div ref={list} className="flex flex-col gap-3">
        {shown.map(card)}
        {rest.length ? (
          <Disclosure label={copy.attention.more(rest.length)}>
            <div className="flex flex-col gap-3">{rest.map(card)}</div>
          </Disclosure>
        ) : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Verder gaan and Gemaakt in dit project
// ---------------------------------------------------------------------------

function ChatRow(props: { project: Project; chat: Chat }) {
  const { chat } = props;
  return (
    <li className="border-b border-border last:border-b-0">
      <a href={href({ name: "project", projectId: props.project.id, chatId: chat.id })} className="-mx-1.5 flex min-h-12 items-center gap-2.5 rounded-lg px-1.5 py-2 text-sm transition-colors duration-100 hover:bg-hover">
        {chat.routineId ? <Repeat className="size-4 shrink-0 text-subtle-foreground" aria-label={projectCopy.work.routineChat} /> : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-foreground">{chat.untitled ? copy.chat.untitled : chat.title}</span>
          {chat.preview ? <span className="block truncate text-xs text-muted-foreground">{chat.preview}</span> : null}
        </span>
        <StatusChip status={chat.status} className="shrink-0" />
        <span className="shrink-0 text-xs text-subtle-foreground">{relativeTime(chat.updatedAt)}</span>
      </a>
    </li>
  );
}

/** The newest documents, with the chat that changed them when its messages are loaded. */
function MadeHere(props: { project: Project }) {
  const backend = useBackend();
  const files = useQuery({ queryKey: keys.files(props.project.id), queryFn: () => backend.config.files(props.project.id), staleTime: 15_000 });
  const openFile = useOpenProjectFile(props.project, null);
  const newest = useMemo(
    () =>
      (files.data ?? [])
        .filter((file) => !/^AGENTS\.md$/i.test(file.path))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 5),
    [files.data],
  );
  if (files.isLoading) {
    return (
      <WorkSection title={copy.project.made}>
        <div className="flex flex-col gap-3 pt-3" aria-busy="true">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-52" />
        </div>
      </WorkSection>
    );
  }
  if (!newest.length) return null;
  return (
    <WorkSection title={copy.project.made} testId="work-made">
      <ul className="flex flex-col">
        {newest.map((file) => {
          const folder = folderOf(file.path);
          return (
            <DocumentRow
              key={file.path}
              name={fileName(file.path)}
              meta={`${copy.project.changed(relativeTime(file.updatedAt))}${folder ? ` · ${folder}` : ""}`}
              onOpen={() => openFile(file.path)}
              revealPath={absoluteFilePath(props.project, file.path)}
            />
          );
        })}
      </ul>
    </WorkSection>
  );
}

// ---------------------------------------------------------------------------
// Suggestions: the project's commands and the trailing question of the newest chat
// ---------------------------------------------------------------------------

/** The last question the agent asked in a chat, as a sentence to answer, or null. */
function trailingQuestion(messages: readonly Message[]): string | null {
  const last = [...messages].reverse().find((message) => message.role === "assistant" && messageText(message));
  if (!last) return null;
  const plain = messageText(last)
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const sentences = plain.match(/[^.!?]+[.!?]/g) ?? [];
  const question = sentences.map((sentence) => sentence.trim()).filter((sentence) => sentence.endsWith("?")).at(-1);
  return question && question.length <= 120 ? question : null;
}

function Suggestions(props: { project: Project; newest: Chat | null; onPick: (text: string) => void }) {
  const runtime = useRuntime();
  const entries = useComposerEntries(props.project.id);
  const messages = useProjectState((state) => (props.newest ? (state.messages[props.newest.id]?.list ?? EMPTY) : EMPTY));
  const newestId = props.newest?.id ?? null;
  useEffect(() => {
    if (newestId) void runtime.ensureMessages(newestId);
  }, [newestId, runtime]);
  const commands = (entries.data ?? []).filter((entry) => entry.kind === "command").slice(0, 3);
  const question = useMemo(() => trailingQuestion(messages), [messages]);
  if (!commands.length && !question) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2" aria-label={projectCopy.work.suggestions} data-testid="work-suggestions">
      {commands.map((command) => (
        <Button key={command.name} variant="secondary" size="sm" title={command.description ?? undefined} onClick={() => props.onPick(`/${command.name} `)}>
          /{command.name}
        </Button>
      ))}
      {question && props.newest ? (
        <Button variant="secondary" size="sm" className="h-auto min-h-7 max-w-full py-1 text-start whitespace-normal" onClick={() => navigate({ name: "project", projectId: props.project.id, chatId: props.newest?.id ?? null })}>
          {question}
        </Button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Werk tab
// ---------------------------------------------------------------------------

/**
 * Werk (brief §6): the composer is the focal element (P7), no title above it (V1); then Voor jou
 * of this project, Verder gaan and Gemaakt in dit project. Workflows live in the Details column.
 * On phones the composer sticks to the bottom (brief §4).
 */
export function ProjectHome(props: { project: Project }) {
  const backend = useBackend();
  const runtime = useRuntime();
  const status = useStatus();
  const chats = useProjectState((state) => state.chats);
  const chatsState = useProjectState((state) => state.chatsState);
  const composer = useRef<ComposerHandle>(null);
  const [model, setModel] = useState<string | null>(null);
  const [agent, setAgent] = useState<string | null>(null);
  const smallUp = useMediaQuery(SMALL_UP);
  const { project } = props;
  const blocked = chatBlocked(status.data, project);
  const effectiveModel = model ?? startModel(status.data, project);

  useEffect(() => {
    const focus = () => composer.current?.focus();
    window.addEventListener(FOCUS_COMPOSER_EVENT, focus);
    return () => window.removeEventListener(FOCUS_COMPOSER_EVENT, focus);
  }, []);

  const recent = useMemo(
    () =>
      Object.values(chats)
        .filter((chat) => !chat.parentId && !chat.archived)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 3),
    [chats],
  );

  const submit = async (input: ComposerSubmit): Promise<boolean> => {
    if (!effectiveModel) return false;
    try {
      const chat = await backend.chats.create(project.id, { model: effectiveModel });
      runtime.upsertChat(chat);
      runtime.addLocalMessage(chat.id, input.command ? `/${input.command} ${input.text}`.trim() : input.text, input.attachments);
      // The chat is the object the person asked for: it opens with the message already sent (P11).
      navigate({ name: "project", projectId: project.id, chatId: chat.id });
      void backend.chats
        .send(project.id, chat.id, { text: input.text, model: effectiveModel, agent, attachments: input.attachments, command: input.command, skills: input.skills })
        .catch((failure: unknown) => toast(`${copy.chat.sendFailed} ${errorText(failure)}`, { tone: "error" }));
      return true;
    } catch (failure) {
      toast(`${copy.chat.newChatFailed} ${errorText(failure)}`, { tone: "error" });
      return false;
    }
  };

  const composerNode = (
    <Composer
      ref={composer}
      project={project}
      chatId={null}
      running={false}
      model={effectiveModel}
      onModelChange={setModel}
      agent={agent}
      onAgentChange={setAgent}
      onSubmit={submit}
      onStop={() => {}}
      blocked={blocked}
      autoFocus={smallUp}
      placeholder={copy.project.composerPlaceholder(project.name)}
      size={smallUp ? "large" : "default"}
      keepUntilSent
    />
  );
  const suggestions = !blocked ? <Suggestions project={project} newest={recent[0] ?? null} onPick={(text) => composer.current?.setText(text)} /> : null;

  return (
    <div className="flex h-full min-h-0 flex-col" aria-label={projectCopy.work.label}>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 pt-6 pb-10 sm:px-6 sm:pt-[8vh]">
          {smallUp ? (
            <>
              {composerNode}
              {suggestions}
            </>
          ) : null}
          <ProjectAttention project={project} />
          {chatsState === "loading" && !recent.length ? (
            <WorkSection title={copy.project.continue}>
              <div className="flex flex-col gap-3 pt-3" aria-busy="true">
                <Skeleton className="h-4 w-72" />
                <Skeleton className="h-4 w-56" />
              </div>
            </WorkSection>
          ) : recent.length ? (
            <WorkSection title={copy.project.continue} testId="work-continue">
              <ul className="flex flex-col">
                {recent.map((chat) => (
                  <ChatRow key={chat.id} project={project} chat={chat} />
                ))}
              </ul>
            </WorkSection>
          ) : null}
          <MadeHere project={project} />
        </div>
      </main>
      {!smallUp ? (
        // Thumb reach (brief §4): the composer sits at the bottom; suggestions as one scrolling strip above it.
        <div className="shrink-0 border-t border-border bg-background px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {suggestions ? <div className="-mx-3 -mt-2 mb-1 overflow-x-auto px-3 [scrollbar-width:none] [&>div]:mt-2 [&>div]:flex-nowrap [&>div]:pb-1 [&>div_button]:whitespace-nowrap [&::-webkit-scrollbar]:hidden">{suggestions}</div> : null}
          {composerNode}
        </div>
      ) : null}
    </div>
  );
}
