import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Repeat } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys, startModel, useAttention, useBrains, useComposerEntries, useRoutines, useStatus } from "~/backend/queries";
import type { AttentionItem, Chat, Message, Project } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { StatusChip } from "~/components/ui/chip";
import { Disclosure } from "~/components/ui/disclosure";
import { Skeleton } from "~/components/ui/misc";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { focusCard } from "~/lib/card-keys";
import { errorText } from "~/lib/errors";
import { folderOf } from "~/lib/file-links";
import { relativeTime } from "~/lib/format";
import { href, navigate } from "~/lib/router";
import { FOCUS_COMPOSER_EVENT, focusComposer } from "~/lib/shortcuts";
import { fileName } from "~/lib/tools";
import { SMALL_UP, useMediaQuery } from "~/lib/use-media";

import { trustDismissed } from "../brain/model";
import { AttentionCard } from "../home/attention-cards";
import { attentionKey } from "../home/model";
import { DocumentRow } from "../project/details";
import { useProjectState, useRuntime } from "../project/runtime";
import { chatBlocked } from "./blocked";
import { Composer, type ComposerHandle, type ComposerSubmit } from "./composer";
import { sendFirstMessage } from "./first-message";
import { useOpenProjectFile } from "./file-link";
import { absoluteFilePath } from "./sidecar";

const EMPTY: Message[] = [];
const MAX_CARDS = 5;

/** A section of the Werk tab: a quiet heading, content under one hairline (S1); nothing renders for an empty one. */
function WorkSection(props: { title: string; count?: number; children: ReactNode; testId?: string }) {
  return (
    <section className="mt-8 first:mt-0" aria-label={props.title} data-testid={props.testId}>
      <h2 className="mb-1 flex items-baseline gap-2 text-sm font-semibold text-foreground">
        {props.title}
        {props.count ? <span className="text-xs font-medium text-subtle-foreground tabular-nums">{props.count}</span> : null}
      </h2>
      <div className="border-t border-border">{props.children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Voor jou, for this project (brief §5, §6): the same card objects as Vandaag
// ---------------------------------------------------------------------------

/**
 * The project's share of "Voor jou" (brief §6), rendered with Vandaag's cards (one object per
 * decision, P5/S6). After an answer the card leaves, the page stays and focus moves to the card
 * that took its place, else to the composer (S5, P11).
 */
function ProjectAttention(props: { project: Project }) {
  const attention = useAttention();
  const runtime = useRuntime();
  const brains = useBrains();
  const routines = useRoutines(props.project.id);
  const refs = useRef(new Map<string, HTMLElement>());
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [advanceTo, setAdvanceTo] = useState<number | null>(null);
  const brain = useMemo(() => (brains.data ?? []).find((entry) => entry.projectId === props.project.id) ?? null, [brains.data, props.project.id]);
  const items = useMemo(
    () =>
      (attention.data ?? []).filter((item) => {
        if (item.kind === "proposal" || item.projectId !== props.project.id || hidden.has(attentionKey(item))) return false;
        // A remembered "Nu niet" keeps the trust card away (brief §8).
        return !(item.kind === "brain" && item.state === "needs_trust" && brain && trustDismissed(props.project.id, brain.status));
      }),
    [attention.data, props.project.id, hidden, brain],
  );
  const routineMap = useMemo(() => new Map((routines.data ?? []).map((routine) => [routine.id, routine])), [routines.data]);

  // A hidden key the poll no longer carries can be forgotten.
  useEffect(() => {
    if (!hidden.size || !attention.data) return;
    const present = new Set(attention.data.map(attentionKey));
    const next = new Set([...hidden].filter((key) => present.has(key)));
    if (next.size !== hidden.size) setHidden(next);
  }, [attention.data, hidden]);

  useEffect(() => {
    if (advanceTo === null) return;
    const target = items[Math.min(advanceTo, items.length - 1)];
    const element = target ? refs.current.get(attentionKey(target)) : undefined;
    if (element) focusCard(element);
    else focusComposer(0);
    setAdvanceTo(null);
  }, [advanceTo, items]);

  if (!items.length) return null;
  const shown = items.slice(0, MAX_CARDS);
  const rest = items.slice(MAX_CARDS);
  const card = (item: AttentionItem, index: number) => {
    const key = attentionKey(item);
    return (
      <AttentionCard
        key={key}
        isFocal={index === 0}
        item={item}
        project={props.project}
        brain={brain}
        routine={item.kind === "routine" ? (routineMap.get(item.routineId) ?? null) : null}
        onResolved={() => {
          // The open chat's store drops the card at once instead of on the next poll.
          if (item.kind === "permission") runtime.dropPermission(item.chatId, item.request.id);
          if (item.kind === "question") runtime.dropQuestion(item.chatId, item.request.id);
          setAdvanceTo(items.findIndex((entry) => attentionKey(entry) === key));
          setHidden((current) => new Set(current).add(key));
        }}
        cardRef={(element) => {
          if (element) refs.current.set(key, element);
          else refs.current.delete(key);
        }}
      />
    );
  };
  return (
    <section className="mt-8 first:mt-0" aria-label={copy.project.forYou} data-testid="work-attention">
      <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-foreground">
        {copy.project.forYou}
        <span className="text-xs font-medium text-subtle-foreground tabular-nums">{items.length}</span>
      </h2>
      <div className="flex flex-col gap-3">
        {shown.map(card)}
        {rest.length ? (
          <Disclosure label={copy.attention.more(rest.length)} panelClassName="flex flex-col gap-3 ps-0 pt-2">
            {rest.map((item) => card(item, MAX_CARDS))}
          </Disclosure>
        ) : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Verder gaan and Gemaakt in dit project
// ---------------------------------------------------------------------------

/** One chat to continue: title and preview, status and time; also the chats on Jouw brein. */
export function ChatRow(props: { project: Project; chat: Chat }) {
  const { chat } = props;
  return (
    <li className="border-b border-border last:border-b-0">
      <a href={href({ name: "project", projectId: props.project.id, chatId: chat.id })} className="-mx-1.5 flex min-h-12 items-center gap-2.5 rounded-lg px-1.5 py-2 text-sm transition-colors duration-100 hover:bg-hover">
        {chat.routineId ? <Repeat className="size-4 shrink-0 text-subtle-foreground" aria-label={copy.project.work.routineChat} /> : null}
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

function messageText(message: Message): string {
  return message.parts.map((part) => (part.type === "text" ? part.text : "")).join("").trim();
}

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
    <div className="mt-3 flex flex-wrap gap-2" aria-label={copy.project.work.suggestions} data-testid="work-suggestions">
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
      // The chat is the object the person asked for: it opens with the message already sent (P11);
      // a send that fails keeps the words in that chat's composer.
      sendFirstMessage(backend, chat, { text: input.text, model: effectiveModel, agent, attachments: input.attachments, command: input.command, skills: input.skills });
      navigate({ name: "project", projectId: project.id, chatId: chat.id });
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
    <div className="flex h-full min-h-0 flex-col" aria-label={copy.project.work.label}>
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
