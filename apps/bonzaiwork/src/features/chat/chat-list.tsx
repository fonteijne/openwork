import { useEffect, useMemo, useState } from "react";
import { Archive, ChevronRight, Ellipsis, GitBranch, Pencil, Repeat, Search, Trash2, X } from "lucide-react";

import { useBackend } from "~/backend/context";
import type { Chat, ChatGroup, ChatSearchHit } from "~/backend/types";
import { PromptDialog } from "~/components/prompt-dialog";
import { Button } from "~/components/ui/button";
import { Menu, MenuItem } from "~/components/ui/menu";
import { ConfirmDialog } from "~/components/ui/overlay";
import { Skeleton, StatusDot } from "~/components/ui/misc";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { relativeTime } from "~/lib/format";
import { href } from "~/lib/router";

import { useProjectState, useRuntime } from "../project/runtime";
import { ChatActions } from "./chat-actions";

const STATUS_LABEL = {
  idle: "",
  running: copy.chatList.running,
  waiting: copy.chatList.waiting,
  failed: copy.chatList.failed,
} as const;

function ChatRow(props: { chat: Chat; active: boolean; subtasks: number; now: number; snippet?: string | null }) {
  const { chat } = props;
  return (
    <div className="group/row relative">
      <a
        href={href({ name: "project", projectId: chat.projectId, chatId: chat.id })}
        aria-current={props.active ? "page" : undefined}
        className={cn(
          "flex min-h-9 items-center gap-2 rounded-full py-1.5 ps-3 pe-9 text-sm text-muted-foreground transition-colors duration-100 hover:bg-hover hover:text-foreground pointer-coarse:min-h-11",
          props.active && "bg-background font-semibold text-foreground shadow-card",
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            {chat.routineId ? <Repeat className="size-3.5 shrink-0 text-subtle-foreground" aria-label={copy.chatList.routineChat} /> : null}
            <span className={cn("truncate", chat.untitled && "italic")}>{chat.untitled ? copy.chat.untitled : chat.title}</span>
          </span>
          {props.snippet ? <span className="line-clamp-2 text-xs font-normal text-subtle-foreground">{props.snippet}</span> : null}
        </span>
        <StatusDot status={chat.status} label={STATUS_LABEL[chat.status] || undefined} />
        {props.subtasks > 0 ? (
          <span className="flex items-center gap-0.5 text-xs text-subtle-foreground" title={copy.chatList.subtasks(props.subtasks)}>
            <GitBranch className="size-3" />
            {props.subtasks}
          </span>
        ) : null}
        <span className="shrink-0 text-xs font-normal text-subtle-foreground tabular-nums group-hover/row:opacity-0 group-focus-within/row:opacity-0 pointer-coarse:hidden">
          {relativeTime(chat.updatedAt, props.now).replace(" geleden", "")}
        </span>
      </a>
      <div className="absolute inset-y-0 end-1 flex items-center opacity-0 transition-opacity duration-100 group-hover/row:opacity-100 group-focus-within/row:opacity-100 has-[[data-popup-open]]:opacity-100 pointer-coarse:opacity-100">
        <ChatActions chat={chat} trigger={<Button variant="quiet" size="icon-sm" aria-label={copy.chat.actions}><Ellipsis /></Button>} />
      </div>
    </div>
  );
}

function GroupSection(props: { group: ChatGroup | null; label: string; chats: Chat[]; activeId: string | null; subtasks: Map<string, number>; now: number; collapsible?: boolean }) {
  const backend = useBackend();
  const runtime = useRuntime();
  const [open, setOpen] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [removing, setRemoving] = useState(false);
  if (props.chats.length === 0 && !props.group) return null;
  const group = props.group;
  return (
    <div className="mt-3 first:mt-1">
      <div className="group/head flex h-7 items-center gap-1 ps-2.5 pe-1">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1 text-xs font-medium text-subtle-foreground hover:text-foreground"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="truncate">{props.label}</span>
          <ChevronRight className={cn("size-3 shrink-0 transition-transform duration-150", open && "rotate-90")} />
        </button>
        {group ? (
          <Menu
            align="end"
            trigger={
              <Button variant="quiet" size="icon-sm" className="size-6 opacity-0 group-hover/head:opacity-100 focus-visible:opacity-100 data-[popup-open]:opacity-100 pointer-coarse:opacity-100" aria-label={`${props.label}: ${copy.common.more}`}>
                <Ellipsis />
              </Button>
            }
          >
            <MenuItem icon={<Pencil />} onClick={() => setRenaming(true)}>
              {copy.chatList.renameGroup}
            </MenuItem>
            <MenuItem icon={<Trash2 />} danger onClick={() => setRemoving(true)}>
              {copy.chatList.removeGroup}
            </MenuItem>
          </Menu>
        ) : null}
      </div>
      {open ? (
        <div className="flex flex-col gap-px">
          {props.chats.map((chat) => (
            <ChatRow key={chat.id} chat={chat} active={chat.id === props.activeId} subtasks={props.subtasks.get(chat.id) ?? 0} now={props.now} />
          ))}
          {props.chats.length === 0 ? <p className="px-2.5 py-1 text-xs text-subtle-foreground">{copy.chatList.emptyGroup}</p> : null}
        </div>
      ) : null}
      {group ? (
        <>
          <PromptDialog
            open={renaming}
            onOpenChange={setRenaming}
            title={copy.chatList.renameGroup}
            label={copy.chatList.groupName}
            initialValue={group.label}
            submitLabel={copy.settings.save}
            onSubmit={async (label) => {
              await backend.groups.rename(runtime.projectId, group.id, label);
              await runtime.reloadGroups();
            }}
          />
          <ConfirmDialog
            open={removing}
            onOpenChange={setRemoving}
            title={`${copy.chatList.removeGroup}?`}
            body={copy.chatList.removeGroupBody}
            confirmLabel={copy.chatList.removeGroup}
            onConfirm={() => {
              setRemoving(false);
              void backend.groups
                .remove(runtime.projectId, group.id)
                .then(() => runtime.reload())
                .catch((failure: unknown) => toast(errorText(failure), { tone: "error" }));
            }}
          />
        </>
      ) : null}
    </div>
  );
}

function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** The project's chats: pinned, then groups, then the rest. Sub-tasks stay with their parent. */
export function ChatList(props: { activeChatId: string | null }) {
  const backend = useBackend();
  const runtime = useRuntime();
  const chatsById = useProjectState((state) => state.chats);
  const chatsState = useProjectState((state) => state.chatsState);
  const groups = useProjectState((state) => state.groups);
  const nextCursor = useProjectState((state) => state.nextCursor);
  const loadingMore = useProjectState((state) => state.loadingMore);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ChatSearchHit[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const now = useNow();

  const { pinned, byGroup, ungrouped, archived, subtasks } = useMemo(() => {
    const all = Object.values(chatsById);
    const counts = new Map<string, number>();
    for (const chat of all) if (chat.parentId) counts.set(chat.parentId, (counts.get(chat.parentId) ?? 0) + 1);
    const top = all.filter((chat) => !chat.parentId).sort((a, b) => b.updatedAt - a.updatedAt);
    const active = top.filter((chat) => !chat.archived);
    const grouped = new Map<string, Chat[]>();
    const rest: Chat[] = [];
    for (const chat of active.filter((entry) => !entry.pinned)) {
      if (chat.groupId && groups.some((group) => group.id === chat.groupId)) grouped.set(chat.groupId, [...(grouped.get(chat.groupId) ?? []), chat]);
      else rest.push(chat);
    }
    return { pinned: active.filter((chat) => chat.pinned), byGroup: grouped, ungrouped: rest, archived: top.filter((chat) => chat.archived), subtasks: counts };
  }, [chatsById, groups]);

  const trimmed = query.trim().toLowerCase();
  useEffect(() => {
    if (!trimmed || !backend.capabilities.contentSearch) {
      setHits(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void backend.chats.search(runtime.projectId, trimmed).then(
        (result) => !cancelled && setHits(result),
        () => !cancelled && setHits(null),
      );
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [trimmed, backend, runtime.projectId]);

  const searching = trimmed.length > 0;
  const titleMatches = searching ? Object.values(chatsById).filter((chat) => !chat.parentId && chat.title.toLowerCase().includes(trimmed)) : [];
  const results: { chat: Chat; snippet: string | null }[] = searching
    ? [
        ...titleMatches.map((chat) => ({ chat, snippet: null })),
        ...(hits ?? []).flatMap((hit) => {
          const chat = chatsById[hit.chatId];
          return chat && !titleMatches.includes(chat) ? [{ chat, snippet: hit.snippet }] : [];
        }),
      ]
    : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-2 pb-1">
        <div className="relative">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setQuery("");
            }}
            placeholder={backend.capabilities.contentSearch ? copy.chatList.searchContent : copy.chatList.searchTitles}
            aria-label={copy.chatList.search}
            className="h-8 w-full rounded-full bg-hover ps-8 pe-8 text-sm text-foreground placeholder:text-subtle-foreground focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:text-[16px] pointer-coarse:h-10 [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button type="button" className="absolute end-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-subtle-foreground hover:text-foreground" aria-label={copy.common.close} onClick={() => setQuery("")}>
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label={copy.chatList.recent}>
        {chatsState === "loading" ? (
          <div className="flex flex-col gap-2 px-2.5 pt-3" aria-busy="true">
            {[72, 56, 84, 64, 48].map((width) => (
              <Skeleton key={width} className="h-4" />
            ))}
          </div>
        ) : chatsState === "error" ? (
          <div className="px-2.5 pt-4 text-sm text-muted-foreground">
            {copy.chat.loadFailed}{" "}
            <button type="button" className="font-medium text-foreground underline underline-offset-2" onClick={() => void runtime.reload()}>
              {copy.chat.retry}
            </button>
          </div>
        ) : searching ? (
          results.length ? (
            <div className="mt-1 flex flex-col gap-px">
              {results.map(({ chat, snippet }) => (
                <ChatRow key={chat.id} chat={chat} active={chat.id === props.activeChatId} subtasks={0} now={now} snippet={snippet} />
              ))}
            </div>
          ) : (
            <p className="px-2.5 pt-4 text-sm text-muted-foreground">{copy.chatList.noMatches}</p>
          )
        ) : pinned.length + ungrouped.length + byGroup.size + archived.length === 0 ? (
          <p className="px-2.5 pt-4 text-sm text-muted-foreground">{copy.chatList.empty}</p>
        ) : (
          <>
            {pinned.length ? <GroupSection group={null} label={copy.chatList.pinned} chats={pinned} activeId={props.activeChatId} subtasks={subtasks} now={now} /> : null}
            {groups.map((group) => (
              <GroupSection key={group.id} group={group} label={group.label} chats={byGroup.get(group.id) ?? []} activeId={props.activeChatId} subtasks={subtasks} now={now} />
            ))}
            {ungrouped.length ? <GroupSection group={null} label={groups.length || pinned.length ? copy.chatList.ungrouped : copy.chatList.recent} chats={ungrouped} activeId={props.activeChatId} subtasks={subtasks} now={now} /> : null}
            {nextCursor ? (
              <Button variant="quiet" size="sm" className="mt-2 w-full" disabled={loadingMore} onClick={() => void runtime.loadMore()}>
                {copy.chatList.loadMore}
              </Button>
            ) : null}
            {archived.length ? (
              <div className="mt-3">
                <button
                  type="button"
                  className="flex h-7 w-full items-center gap-1.5 rounded-full px-3 text-xs font-medium text-subtle-foreground hover:text-foreground"
                  aria-expanded={showArchived}
                  onClick={() => setShowArchived((value) => !value)}
                >
                  <Archive className="size-3.5" />
                  {copy.chatList.showArchived(archived.length)}
                  <ChevronRight className={cn("size-3 transition-transform duration-150", showArchived && "rotate-90")} />
                </button>
                {showArchived ? (
                  <div className="flex flex-col gap-px">
                    {archived.map((chat) => (
                      <ChatRow key={chat.id} chat={chat} active={chat.id === props.activeChatId} subtasks={subtasks.get(chat.id) ?? 0} now={now} />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </nav>
    </div>
  );
}
