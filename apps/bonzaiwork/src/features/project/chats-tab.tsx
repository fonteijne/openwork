import { useMemo } from "react";
import { Diamond, Ellipsis, Repeat } from "lucide-react";

import type { ProjectBrief, Run } from "~/backend/cockpit";
import { useRuns } from "~/backend/cockpit-queries";
import type { Chat, Project } from "~/backend/types";
import { Band, Tag } from "~/components/io";
import { TopBarHost, type TopBarHostSlots } from "~/components/top-bar";
import { Button } from "~/components/ui/button";
import { Disclosure } from "~/components/ui/disclosure";
import { Skeleton } from "~/components/ui/misc";
import { copy } from "~/copy";
import { projectsCopy } from "~/copy/projects";
import { cn } from "~/lib/cn";
import { href } from "~/lib/router";

import { ChatActions } from "../chat/chat-actions";
import { ChatView } from "../chat/chat-view";
import { ProjectFileLinks } from "../chat/file-link";
import { activityLabel } from "./dates";
import { NewChatComposer } from "./new-chat-composer";
import { RunCard } from "./run-card";
import { useProjectState } from "./runtime";
import { ButtonLink } from "./shared";

const C = projectsCopy.chats;

function chatTitle(chat: Chat): string {
  return chat.untitled ? C.untitled : chat.title;
}

function ChatLink(props: { chat: Chat; selected: boolean; runs: readonly Run[]; now: number }) {
  const { chat } = props;
  const waiting = props.runs.filter((run) => run.status === "review" || run.status === "question").length;
  return (
    <a
      href={href({ name: "project", projectId: chat.projectId, chatId: chat.id })}
      aria-current={props.selected ? "page" : undefined}
      className={cn(
        "flex flex-col gap-1 rounded-card px-5 py-4 text-ink no-underline transition-colors",
        props.selected ? "bg-surface-raised p-5 ring-2 ring-inset ring-ink" : "hover:bg-surface-raised/60",
      )}
    >
      <span className="flex items-start gap-2 text-lg font-semibold leading-[26px]">
        {chat.routineId ? <Repeat className="mt-1 size-4 shrink-0 text-ink-muted" aria-label={copy.project.work.routineChat} /> : null}
        <span className="min-w-0">{chatTitle(chat)}</span>
      </span>
      {waiting ? (
        <span className="inline-flex items-center gap-1.5 text-sm text-ink-muted">
          <Diamond className="size-4 shrink-0" aria-hidden="true" />
          {C.runWaiting(waiting)}
        </span>
      ) : (
        <span className="text-sm text-ink-muted">
          {activityLabel(chat.updatedAt, props.now)}
          {props.runs.length ? ` · ${C.runs(props.runs.length)}` : ""}
        </span>
      )}
    </a>
  );
}

function ChatColumn(props: { project: Project; chatId: string | null; runsByChat: Map<string, Run[]> }) {
  const chats = useProjectState((state) => state.chats);
  const chatsState = useProjectState((state) => state.chatsState);
  const now = Math.floor(Date.now() / 60_000) * 60_000;
  const all = useMemo(() => Object.values(chats).filter((chat) => !chat.parentId), [chats]);
  const listed = useMemo(() => all.filter((chat) => !chat.archived).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt), [all]);
  const archived = useMemo(() => all.filter((chat) => chat.archived).sort((a, b) => b.updatedAt - a.updatedAt), [all]);
  const link = (chat: Chat) => <ChatLink key={chat.id} chat={chat} selected={chat.id === props.chatId} runs={props.runsByChat.get(chat.id) ?? []} now={now} />;
  return (
    <nav aria-label={C.label} className="flex min-w-0 flex-[1_1_280px] flex-col gap-4 lg:max-w-[320px]">
      <div className="flex">
        <ButtonLink href={href({ name: "project", projectId: props.project.id, chatId: null })} aria-current={props.chatId === null ? "page" : undefined}>
          {C.newChat}
        </ButtonLink>
      </div>
      {chatsState === "loading" && listed.length === 0 ? (
        <div className="flex flex-col gap-4 px-5 py-2" aria-busy="true">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-44" />
        </div>
      ) : listed.length === 0 ? (
        <p className="m-0 px-5 text-base text-ink-muted">{C.empty}</p>
      ) : (
        <div className="flex flex-col gap-1">{listed.map(link)}</div>
      )}
      {archived.length ? (
        <Disclosure label={C.archived(archived.length)} size="md" className="px-3" panelClassName="ps-0 pt-2">
          <div className="flex flex-col gap-1">{archived.map(link)}</div>
        </Disclosure>
      ) : null}
      <p className="m-0 px-5 text-sm text-ink-muted">{C.note}</p>
    </nav>
  );
}

/** The open chat in the white panel: its title, the key, the chat's ⋯ menu, then the conversation. */
function OpenChat(props: { project: Project; chatId: string; brief: ProjectBrief | null | undefined; runs: readonly Run[] }) {
  const chat = useProjectState((state) => state.chats[props.chatId]);
  // The chat view's own bar is replaced by this header (title, key, the chat's ⋯ menu).
  const slots = useMemo<TopBarHostSlots>(() => ({ leading: null, actions: null }), []);
  const inline = props.runs.length ? (
    <div className="flex flex-col gap-4">
      {props.runs.map((run) => (
        <RunCard key={run.id} run={run} projectName={props.project.name} />
      ))}
    </div>
  ) : undefined;
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 px-6 pt-6 lg:px-10 lg:pt-10">
        <h2 tabIndex={-1} data-page-title="" className="m-0 min-w-[12rem] flex-1 text-[28px] font-bold leading-[34px] text-ink outline-none">
          {chat ? chatTitle(chat) : <Skeleton className="h-7 w-64" />}
        </h2>
        <Tag>{props.brief?.keyAlias ? projectsCopy.keyTag(props.brief.keyAlias) : projectsCopy.noKeyTag}</Tag>
        {chat ? (
          <ChatActions
            chat={chat}
            trigger={
              <Button variant="quiet" size="icon-xl" aria-label={C.actions}>
                <Ellipsis />
              </Button>
            }
          />
        ) : null}
      </div>
      <div className="h-[calc(100dvh-220px)] min-h-[520px] lg:h-[min(calc(100dvh-240px),960px)] [&_[data-testid=composer-dock]]:bg-surface-raised [&_[data-testid=composer-dock]]:px-4 lg:[&_[data-testid=composer-dock]]:px-8">
        <TopBarHost.Provider value={slots}>
          <ProjectFileLinks project={props.project} chatId={props.chatId}>
            <ChatView key={props.chatId} project={props.project} chatId={props.chatId} inline={inline} />
          </ProjectFileLinks>
        </TopBarHost.Provider>
      </div>
    </>
  );
}

/**
 * Chats (design v2-ProjectChats): the project's chats on the left, the open chat in a white panel
 * on the right, with the run card of a run this chat started inside the conversation. Without a
 * chat the panel is the new-chat composer.
 */
export function ChatsTab(props: { project: Project; chatId: string | null; brief: ProjectBrief | null | undefined }) {
  const runs = useRuns();
  const runsByChat = useMemo(() => {
    const map = new Map<string, Run[]>();
    for (const run of runs.data ?? []) {
      if (!run.chatRef || run.chatRef.projectId !== props.project.id) continue;
      map.set(run.chatRef.chatId, [...(map.get(run.chatRef.chatId) ?? []), run]);
    }
    return map;
  }, [runs.data, props.project.id]);

  return (
    <Band tone="alt" className="flex-1" inner="flex flex-wrap items-start gap-8 lg:gap-10">
      <ChatColumn project={props.project} chatId={props.chatId} runsByChat={runsByChat} />
      <section aria-label={copy.project.tabs.work} className="flex min-w-0 flex-[999_1_560px] flex-col overflow-hidden rounded-panel bg-surface-raised">
        {props.chatId ? (
          <OpenChat project={props.project} chatId={props.chatId} brief={props.brief} runs={runsByChat.get(props.chatId) ?? []} />
        ) : (
          <div className="flex flex-col gap-6 p-6 lg:p-10">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="m-0 flex-[1_1_auto] text-[28px] font-bold leading-[34px] text-ink">{C.newTitle}</h2>
              <Tag>{props.brief?.keyAlias ? projectsCopy.keyTag(props.brief.keyAlias) : projectsCopy.noKeyTag}</Tag>
            </div>
            <p className="m-0 max-w-[60ch] text-lg text-ink-muted">{C.newLead}</p>
            <NewChatComposer project={props.project} autoFocus size="large" />
          </div>
        )}
      </section>
    </Band>
  );
}
