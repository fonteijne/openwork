import { useCallback, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, KeyRound, Plus, Search } from "lucide-react";

import { useBackend } from "~/backend/context";
import { useCockpitMutation } from "~/backend/cockpit-queries";
import { useBrains, usePersonalBrain, useProject } from "~/backend/queries";
import type { Chat, Message, Project } from "~/backend/types";
import { Accent, Band, LinkArrow, PageHero, Panel, PermissionLine, PermissionList, Suggestion, Tag } from "~/components/io";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/misc";
import { toast } from "~/components/ui/toast";
import { agentCopy } from "~/copy/agent";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { formatTime } from "~/lib/format";
import { href, navigate } from "~/lib/router";

import { usePersonalSetup } from "../brain/personal-setup";
import { ProjectRuntimeProvider, useProjectState } from "../project/runtime";
import { AgentConversation, AgentNewChat } from "./agent-conversation";
import { looksLikeProjectWork, useDismissedHints } from "./project-hint";

/** `#/agent/c/nieuw`: the panel with only a composer; the first message makes the chat. */
export const NEW_CHAT_ID = "nieuw";

/** The sessionStorage key the delegate page reads its goal from (also written by the palette). */
const DELEGATE_GOAL_KEY = "bonzaiwork.delegate.goal";

const dayLabel = new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short" });
const startedLabel = new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short" });

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function chatTitle(chat: Pick<Chat, "title" | "untitled">): string {
  return chat.untitled ? agentCopy.panel.newTitle : chat.title;
}

/** Title with its last word in the serif accent ("Onderhoud voor een *bakkerij*"). */
function accentTitle(title: string): ReactNode {
  const index = title.trimEnd().lastIndexOf(" ");
  if (index <= 0) return <Accent>{title}</Accent>;
  return (
    <>
      {title.slice(0, index + 1)}
      <Accent>{title.slice(index + 1)}</Accent>
    </>
  );
}

/**
 * Agent (design v2-Assistant): the person's own chats. They are the chats of the personal brain
 * project ("Mijn brein"), so the project runtime, the chat views and the composer of a project
 * chat do the work; this page lays them out as the iO list and panel.
 */
export function AgentPage(props: { chatId: string | null }) {
  const brains = useBrains();
  const brain = usePersonalBrain();
  const { project, isLoading } = useProject(brain?.projectId ?? "");

  if (brains.isLoading || (brain && isLoading)) return <AgentSkeleton />;
  if (!brain || !project) return <NoPersonalBrain />;
  return (
    <ProjectRuntimeProvider projectId={project.id}>
      <AgentWorkspace project={project} chatId={props.chatId} />
    </ProjectRuntimeProvider>
  );
}

function AgentHero() {
  return (
    <PageHero
      documentTitle={agentCopy.documentTitle}
      eyebrow={agentCopy.eyebrow}
      title={
        <>
          {agentCopy.titleBefore}
          <Accent>{agentCopy.titleAccent}</Accent>
          {agentCopy.titleAfter}
        </>
      }
      lead={agentCopy.lead}
      actions={
        <Button variant="secondary" size="xl" onClick={() => navigate({ name: "agent", chatId: NEW_CHAT_ID })}>
          <Plus aria-hidden="true" />
          {agentCopy.newChat}
        </Button>
      }
    />
  );
}

function AgentSkeleton() {
  return (
    <>
      <AgentHero />
      <Band tone="alt">
        <div className="flex flex-wrap items-start gap-10" aria-busy="true" aria-label={agentCopy.loading}>
          <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4 lg:max-w-[340px]">
            <Skeleton className="h-12 w-full rounded-full" />
            <Skeleton className="h-20 w-full rounded-card" />
            <Skeleton className="h-20 w-full rounded-card" />
          </div>
          <div className="min-w-0 flex-[999_1_560px]">
            <Skeleton className="h-[480px] w-full rounded-panel" />
          </div>
        </div>
      </Band>
    </>
  );
}

/** Live without a personal brain: an invitation to make the folder, and the way to the brain page. */
function NoPersonalBrain() {
  const setup = usePersonalSetup();
  return (
    <>
      <AgentHero />
      <Band tone="alt">
        <Panel className="flex max-w-[760px] flex-col items-start gap-5 lg:p-12">
          <h2 className="m-0 text-[28px] font-bold leading-[34px] tracking-[-0.01em] text-ink">{agentCopy.noBrain.title}</h2>
          <p className="m-0 max-w-[60ch] text-lg text-ink-muted">{agentCopy.noBrain.lead}</p>
          <div className="flex flex-wrap items-center gap-6">
            <Button
              variant="primary"
              size="xl"
              disabled={setup.busy !== null}
              onClick={() =>
                void setup.createNew().then((created) => {
                  if (created) navigate({ name: "agent", chatId: NEW_CHAT_ID });
                })
              }
            >
              {agentCopy.noBrain.create}
            </Button>
            <LinkArrow href={href({ name: "brain" })}>{agentCopy.noBrain.more}</LinkArrow>
          </div>
        </Panel>
      </Band>
    </>
  );
}

function AgentWorkspace(props: { project: Project; chatId: string | null }) {
  const chats = useProjectState((state) => state.chats);
  const chatsState = useProjectState((state) => state.chatsState);
  const { isDismissed, dismiss } = useDismissedHints();
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const { project } = props;

  const ordered = useMemo(
    () =>
      Object.values(chats)
        .filter((chat) => !chat.parentId)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [chats],
  );
  const creating = props.chatId === NEW_CHAT_ID;
  // Without a chat in the route the newest open chat is shown, as in the design.
  const selectedId = creating ? null : (props.chatId ?? ordered.find((chat) => !chat.archived)?.id ?? null);
  const selected = selectedId ? (chats[selectedId] ?? null) : null;

  const onMessages = useCallback(
    (messages: readonly Message[]) => {
      if (!selected) return;
      const value = looksLikeProjectWork(selected, messages);
      setFlagged((current) => (current[selected.id] === value ? current : { ...current, [selected.id]: value }));
    },
    [selected],
  );

  const suggest = selected !== null && flagged[selected.id] === true && !isDismissed(selected.id);

  if (selected && suggest) {
    return <ProjectWorkConversation project={project} chat={selected} onMessages={onMessages} onDismiss={() => dismiss(selected.id)} />;
  }

  return (
    <>
      <AgentHero />
      <Band tone="alt">
        <div className="flex flex-wrap items-start gap-x-10 gap-y-10">
          <AgentChatList chats={ordered} activeId={selectedId} loading={chatsState === "loading" && ordered.length === 0} />
          <section aria-labelledby="agent-chat-title" className="flex min-w-0 flex-[999_1_560px] flex-col gap-8 rounded-panel bg-surface-raised p-6 sm:p-12">
            {creating ? (
              <>
                <PanelHeader title={agentCopy.panel.newTitle} />
                <AgentNewChat project={project} />
              </>
            ) : selected ? (
              <>
                <PanelHeader title={chatTitle(selected)} />
                {selected.archived ? <p className="m-0 text-base text-ink-muted">{agentCopy.panel.archivedNote}</p> : null}
                <AgentConversation key={selected.id} project={project} chatId={selected.id} onMessages={onMessages} />
              </>
            ) : chatsState === "loading" ? (
              <div className="flex flex-col gap-6" aria-busy="true">
                <Skeleton className="h-9 w-64" />
                <Skeleton className="ms-auto h-16 w-2/3 rounded-card" />
                <Skeleton className="h-4 w-11/12" />
              </div>
            ) : props.chatId ? (
              <div className="flex flex-col items-start gap-4">
                <PanelHeader title={agentCopy.panel.notFound} />
                <LinkArrow href={href({ name: "agent", chatId: null })}>{agentCopy.panel.backToList}</LinkArrow>
              </div>
            ) : (
              <>
                <PanelHeader title={agentCopy.panel.newTitle} />
                <AgentNewChat project={project} />
              </>
            )}
          </section>
        </div>
      </Band>
    </>
  );
}

/** Chat title, the dark "personal key" pill and what the chat can reach. */
function PanelHeader(props: { title: string }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <h2 id="agent-chat-title" className="m-0 min-w-0 flex-[1_1_auto] text-[28px] font-bold leading-[34px] tracking-[-0.01em] text-ink">
          {props.title}
        </h2>
        <Tag tone="solid" icon={<KeyRound aria-hidden="true" />}>
          {agentCopy.panel.personalKey}
        </Tag>
      </div>
      <div role="group" aria-label={agentCopy.panel.reachLabel} className="flex flex-wrap gap-2">
        {agentCopy.panel.reach.map((entry) => (
          <Tag key={entry}>{entry}</Tag>
        ))}
      </div>
    </div>
  );
}

function rowMeta(chat: Chat, now: number): ReactNode {
  if (chat.archived) {
    return chat.note ? (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{chat.note}</span>
      </span>
    ) : (
      dayLabel.format(chat.updatedAt)
    );
  }
  if (chat.status === "running") return agentCopy.list.today;
  return startOfDay(chat.updatedAt) === startOfDay(now) ? formatTime(chat.updatedAt) : dayLabel.format(chat.updatedAt);
}

/** The left column: "Zoek chats" and the chats grouped Vandaag · Eerder · Verplaatst naar een project. */
function AgentChatList(props: { chats: readonly Chat[]; activeId: string | null; loading: boolean }) {
  const [query, setQuery] = useState("");
  const now = Date.now();
  const needle = query.trim().toLowerCase();
  const matching = needle ? props.chats.filter((chat) => `${chatTitle(chat)} ${chat.preview ?? ""} ${chat.note ?? ""}`.toLowerCase().includes(needle)) : props.chats;
  const today = startOfDay(now);
  const groups = [
    { id: "today", label: agentCopy.list.today, chats: matching.filter((chat) => !chat.archived && chat.updatedAt >= today) },
    { id: "earlier", label: agentCopy.list.earlier, chats: matching.filter((chat) => !chat.archived && chat.updatedAt < today) },
    { id: "moved", label: agentCopy.list.moved, chats: matching.filter((chat) => chat.archived) },
  ].filter((group) => group.chats.length > 0);

  return (
    <nav aria-label={agentCopy.list.label} className="flex min-w-0 flex-[1_1_300px] flex-col gap-8 lg:max-w-[340px]">
      <label className="relative block">
        <span className="sr-only">{agentCopy.list.search}</span>
        <Search className="pointer-events-none absolute start-5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={agentCopy.list.search}
          className="h-12 w-full rounded-full border border-line-strong bg-surface-raised ps-11 pe-5 text-base text-ink outline-none placeholder:text-ink-muted focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-accent max-sm:text-[16px]"
        />
      </label>
      {props.loading ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-20 w-full rounded-card" />
          <Skeleton className="h-20 w-full rounded-card" />
        </div>
      ) : groups.length === 0 ? (
        <p className="m-0 text-base text-ink-muted">{needle ? agentCopy.list.noMatch(query.trim()) : agentCopy.list.empty}</p>
      ) : (
        groups.map((group) => (
          <div key={group.id} className="flex flex-col gap-2">
            <h2 className="m-0 mb-2 text-[13px] font-semibold uppercase leading-4 tracking-[0.08em] text-ink-muted">{group.label}</h2>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {group.chats.map((chat) => {
                const active = chat.id === props.activeId;
                return (
                  <li key={chat.id}>
                    <a
                      href={href({ name: "agent", chatId: chat.id })}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "flex min-h-11 flex-col gap-0.5 rounded-card px-5 py-4 text-ink no-underline transition-colors duration-200 hover:bg-surface-raised/70",
                        active && "bg-surface ring-2 ring-inset ring-ink hover:bg-surface",
                      )}
                    >
                      <span className="text-lg font-semibold leading-7">{chatTitle(chat)}</span>
                      <span className="text-sm text-ink-muted">{rowMeta(chat, now)}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </nav>
  );
}

/**
 * The same chat once it reads like project work (design v2-Conversation): the chat is the page,
 * the suggestion to make a project sits under the last answer, and the side column says what the
 * agent can do here and what the chat turned into.
 */
function ProjectWorkConversation(props: { project: Project; chat: Chat; onMessages: (messages: readonly Message[]) => void; onDismiss: () => void }) {
  const backend = useBackend();
  const { project, chat } = props;
  const makeTodo = useCockpitMutation((cockpit, title: string) => cockpit.todos.create({ title, projectId: null, due: null, origin: agentCopy.conversation.todoOrigin(chat.title), today: true }));
  const capturesTodos = backend.cockpit.capabilities.todos === null;

  const afterLastAnswer = (
    <>
      <Suggestion agent eyebrow={agentCopy.suggestion.eyebrow} className="flex flex-col gap-4 border-ink p-6 sm:p-8">
        <p className="m-0 text-xl font-semibold text-ink">{agentCopy.suggestion.title}</p>
        <p className="m-0 text-base text-ink-muted">{agentCopy.suggestion.body}</p>
        <div className="mt-2 flex flex-wrap gap-3">
          <Button variant="secondary" size="xl" onClick={() => navigate({ name: "project-new", fromProjectId: project.id, fromChatId: chat.id })}>
            {agentCopy.suggestion.make}
            <ArrowRight aria-hidden="true" />
          </Button>
          <Button variant="secondary" size="xl" onClick={props.onDismiss}>
            {agentCopy.suggestion.notNow}
          </Button>
        </div>
      </Suggestion>
      <div role="group" aria-label={agentCopy.conversation.turnIntoLabel} className="flex flex-wrap items-center gap-x-6 gap-y-2 text-base">
        <span className="text-ink-muted">{agentCopy.conversation.turnInto}</span>
        {capturesTodos ? (
          <LinkArrow
            onClick={() =>
              makeTodo.mutate(chat.title, {
                onSuccess: () => toast(agentCopy.conversation.todoMade),
                onError: (failure) => toast(`${agentCopy.conversation.todoFailed} ${errorText(failure)}`, { tone: "error" }),
              })
            }
          >
            {agentCopy.conversation.todo}
          </LinkArrow>
        ) : null}
        <LinkArrow
          href={href({ name: "delegate", todoId: null })}
          onClick={() => {
            try {
              window.sessionStorage.setItem(DELEGATE_GOAL_KEY, chat.title);
            } catch {
              // Without storage the delegate page starts empty.
            }
          }}
        >
          {agentCopy.conversation.run}
        </LinkArrow>
        <LinkArrow href={href({ name: "library" })}>{agentCopy.conversation.page}</LinkArrow>
      </div>
    </>
  );

  return (
    <>
      <PageHero
        documentTitle={chat.title}
        eyebrow={
          <>
            <a href={href({ name: "agent", chatId: null })} className="text-inherit no-underline hover:text-ink">
              {agentCopy.documentTitle}
            </a>
            {" · "}
            {agentCopy.conversation.started(startedLabel.format(chat.createdAt))}
          </>
        }
        title={accentTitle(chat.title)}
        meta={
          <div role="group" aria-label={agentCopy.conversation.reachLabel} className="flex flex-wrap gap-2">
            <Tag tone="solid" icon={<KeyRound aria-hidden="true" />}>
              {agentCopy.panel.personalKey}
            </Tag>
            {agentCopy.conversation.reach.map((entry) => (
              <Tag key={entry}>{entry}</Tag>
            ))}
          </div>
        }
      />
      <Band tone="alt">
        <div className="flex flex-wrap items-start gap-10">
          <section aria-label={agentCopy.panel.messages} className="flex min-w-0 flex-[999_1_560px] flex-col gap-10 rounded-panel bg-surface-raised p-6 sm:p-12">
            <AgentConversation key={chat.id} project={project} chatId={chat.id} onMessages={props.onMessages} afterLastAnswer={afterLastAnswer} placeholder={agentCopy.panel.followUp} />
          </section>
          <aside aria-label={chat.title} className="flex min-w-0 flex-[1_1_320px] flex-col gap-6">
            <section aria-labelledby="agent-can" className="flex flex-col gap-4 rounded-card bg-surface-raised p-8">
              <h2 id="agent-can" className="m-0 text-xl font-semibold text-ink">
                {agentCopy.conversation.canTitle}
              </h2>
              <PermissionList>
                {agentCopy.conversation.can.allow.map((line) => (
                  <PermissionLine key={line} kind="allow">
                    {line}
                  </PermissionLine>
                ))}
                {agentCopy.conversation.can.deny.map((line) => (
                  <PermissionLine key={line} kind="deny">
                    {line}
                  </PermissionLine>
                ))}
              </PermissionList>
            </section>
            <section aria-labelledby="agent-turned" className="flex flex-col gap-3 rounded-card bg-surface-raised p-8">
              <h2 id="agent-turned" className="m-0 text-xl font-semibold text-ink">
                {agentCopy.conversation.turnedTitle}
              </h2>
              <p className="m-0 text-base text-ink-muted">{agentCopy.conversation.turnedEmpty}</p>
            </section>
          </aside>
        </div>
      </Band>
    </>
  );
}

