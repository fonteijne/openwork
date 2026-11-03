import { useEffect, useMemo, useState } from "react";
import { Ellipsis, GitBranch, Pencil, Repeat, Search, Trash2, X } from "lucide-react";

import { useBackend } from "~/backend/context";
import type { Chat, ChatGroup, ChatSearchHit } from "~/backend/types";
import { PromptDialog } from "~/components/prompt-dialog";
import { Button } from "~/components/ui/button";
import { StatusChip } from "~/components/ui/chip";
import { Disclosure } from "~/components/ui/disclosure";
import { Menu, MenuItem } from "~/components/ui/menu";
import { Skeleton } from "~/components/ui/misc";
import { ConfirmDialog } from "~/components/ui/overlay";
import { SegmentedControl } from "~/components/ui/segmented";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { formatDateTime, relativeTime } from "~/lib/format";
import { href } from "~/lib/router";
import { readLocal, writeLocal } from "~/lib/storage";

import { useProjectState, useRuntime } from "../project/runtime";
import { ChatActions } from "./chat-actions";

/** Above this many chats the list gets its own search field; below it ⌘K covers search (brief §4). */
const SEARCH_THRESHOLD = 8;
/** The value of the "Alle" filter pill; group ids never collide with it. */
const ALL = "__all__";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const weekday = new Intl.DateTimeFormat("nl-NL", { weekday: "short" });

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * The row's time in one short form ("2 min", "3 u", "gisteren", "wo", "24 okt"): the brief's
 * "Bezig · 2 min" (§4) fits a 224px row where "23 minuten geleden" would not. The full moment sits
 * in the `title` of the `<time>` element (assessment chat-list P-8).
 */
function shortTime(timestamp: number, now: number): string {
  const diff = Math.abs(now - timestamp);
  if (diff < 45_000) return copy.chatList.time.now;
  if (diff < HOUR) return copy.chatList.time.minutes(Math.max(1, Math.round(diff / MINUTE)));
  const days = Math.round((startOfDay(now) - startOfDay(timestamp)) / DAY);
  if (days === 0 || diff < 6 * HOUR) return copy.chatList.time.hours(Math.max(1, Math.round(diff / HOUR)));
  if (days === 1) return copy.chatList.time.yesterday;
  if (days < 7) return weekday.format(timestamp);
  return relativeTime(timestamp, now);
}

/**
 * A two-line row (brief §4): the title, then the status word and the time, always visible, also on
 * touch and while hovering (the ⋯ keeps its own slot at the end). Status is icon + word through
 * `StatusChip`, never hue alone (V2, C5); idle shows only the time. A routine chat carries the
 * Repeat glyph with a name for assistive tech; sub-tasks are counted with a label, not a bare number.
 */
function ChatRow(props: { chat: Chat; active: boolean; subtasks: number; now: number; snippet?: string | null }) {
  const { chat } = props;
  const time = (
    <time dateTime={new Date(chat.updatedAt).toISOString()} title={formatDateTime(chat.updatedAt)} className="shrink-0 tabular-nums">
      {shortTime(chat.updatedAt, props.now)}
    </time>
  );
  return (
    <div className="group/row relative">
      <a
        href={href({ name: "project", projectId: chat.projectId, chatId: chat.id })}
        aria-current={props.active ? "page" : undefined}
        className={cn(
          "flex min-h-11 flex-col justify-center rounded-2xl py-1.5 ps-2.5 pe-8 text-sm text-muted-foreground transition-colors duration-100 hover:bg-hover hover:text-foreground pointer-coarse:min-h-12",
          props.active && "bg-background font-semibold text-foreground shadow-card",
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {chat.routineId ? <Repeat role="img" aria-label={copy.chatList.routineChat} className="size-3.5 shrink-0 text-subtle-foreground" /> : null}
          <span className={cn("truncate", chat.untitled && "italic")}>{chat.untitled ? copy.chat.untitled : chat.title}</span>
        </span>
        <span className="flex min-w-0 items-center gap-1 text-xs font-normal text-subtle-foreground">
          {chat.status === "idle" ? time : <StatusChip status={chat.status} detail={<>· {time}</>} className="min-w-0" />}
          {props.subtasks > 0 ? (
            <span className="flex min-w-0 items-center gap-1">
              <span aria-hidden="true">·</span>
              <GitBranch aria-hidden="true" className="size-3 shrink-0" />
              <span className="truncate">{copy.chatList.subtasks(props.subtasks)}</span>
            </span>
          ) : null}
        </span>
        {props.snippet ? <span className="line-clamp-2 text-xs font-normal text-subtle-foreground">{props.snippet}</span> : null}
      </a>
      <div className="absolute inset-y-0 end-1 flex items-center opacity-0 transition-opacity duration-100 group-hover/row:opacity-100 group-focus-within/row:opacity-100 has-[[data-popup-open]]:opacity-100 pointer-coarse:opacity-100">
        <ChatActions chat={chat} trigger={<Button variant="quiet" size="icon-sm" aria-label={copy.chat.actions}><Ellipsis /></Button>} />
      </div>
    </div>
  );
}

function Rows(props: { chats: Chat[]; activeId: string | null; subtasks: Map<string, number>; now: number }) {
  return (
    <div className="flex flex-col gap-px">
      {props.chats.map((chat) => (
        <ChatRow key={chat.id} chat={chat} active={chat.id === props.activeId} subtasks={props.subtasks.get(chat.id) ?? 0} now={props.now} />
      ))}
    </div>
  );
}

/** The ⋯ of the selected group filter: rename or remove it (the group menu of the old sections, kept). */
function GroupMenu(props: { group: ChatGroup; onRemoved: () => void }) {
  const backend = useBackend();
  const runtime = useRuntime();
  const [renaming, setRenaming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const { group } = props;
  return (
    <>
      <Menu align="end" trigger={<Button variant="quiet" size="icon-sm" className="size-6" aria-label={copy.chatList.groupMenu(group.label)}><Ellipsis /></Button>}>
        <MenuItem icon={<Pencil />} onClick={() => setRenaming(true)}>
          {copy.chatList.renameGroup}
        </MenuItem>
        <MenuItem icon={<Trash2 />} danger onClick={() => setRemoving(true)}>
          {copy.chatList.removeGroup}
        </MenuItem>
      </Menu>
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
          props.onRemoved();
          void backend.groups
            .remove(runtime.projectId, group.id)
            .then(() => runtime.reload())
            .catch((failure: unknown) => toast(errorText(failure), { tone: "error" }));
        }}
      />
    </>
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

/** The remembered group filter of a project, per device (brief §9). */
function useGroupFilter(projectId: string, groups: ChatGroup[]): [string, (value: string) => void] {
  const key = `bonzaiwork.chatGroup.${projectId}`;
  const [stored, setStored] = useState(() => readLocal(key) ?? ALL);
  // A removed group falls back to "Alle" without touching storage; the pill row only lists live groups.
  const value = stored !== ALL && groups.some((group) => group.id === stored) ? stored : ALL;
  const set = (next: string) => {
    setStored(next);
    writeLocal(key, next === ALL ? null : next);
  };
  return [value, set];
}

/**
 * The open project's chats in the sidebar (brief §4; ~224px wide): one newest-first stream with
 * pinned chats as a short band above it, groups as filter pills (empty groups never render), the
 * archive as a collapsed tail, and a search field only once the list is long enough to need one.
 * Sub-tasks stay with their parent and are counted on its row. "Nieuwe chat" is rendered by the
 * sidebar row above this list, so it is the one filled control (P7) and not repeated here.
 */
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
  const [filter, setFilter] = useGroupFilter(runtime.projectId, groups);
  const now = useNow();

  const { top, subtasks } = useMemo(() => {
    const all = Object.values(chatsById);
    const counts = new Map<string, number>();
    for (const chat of all) if (chat.parentId) counts.set(chat.parentId, (counts.get(chat.parentId) ?? 0) + 1);
    return { top: all.filter((chat) => !chat.parentId).sort((a, b) => b.updatedAt - a.updatedAt), subtasks: counts };
  }, [chatsById]);

  // Pills only for groups that hold a chat (brief §4: empty groups never render), in the stored order.
  const liveGroups = useMemo(() => groups.filter((group) => top.some((chat) => chat.groupId === group.id)), [groups, top]);
  const selectedGroup = liveGroups.find((group) => group.id === filter) ?? null;
  const filtered = selectedGroup ? top.filter((chat) => chat.groupId === selectedGroup.id) : top;
  const pinned = filtered.filter((chat) => chat.pinned && !chat.archived);
  const stream = filtered.filter((chat) => !chat.pinned && !chat.archived);
  const archived = filtered.filter((chat) => chat.archived);

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

  const searchable = top.length > SEARCH_THRESHOLD;
  const searching = searchable && trimmed.length > 0;
  const titleMatches = searching ? top.filter((chat) => chat.title.toLowerCase().includes(trimmed)) : [];
  const results: { chat: Chat; snippet: string | null }[] = searching
    ? [
        ...titleMatches.map((chat) => ({ chat, snippet: null })),
        ...(hits ?? []).flatMap((hit) => {
          const chat = chatsById[hit.chatId];
          return chat && !chat.parentId && !titleMatches.includes(chat) ? [{ chat, snippet: hit.snippet }] : [];
        }),
      ]
    : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {searchable ? (
        <div className="px-1 pb-1">
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle-foreground" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setQuery("");
              }}
              // The long placeholder ("Zoek in titels en berichten") clips at 224px; the scope sits in the title.
              placeholder={copy.chatList.search}
              title={backend.capabilities.contentSearch ? copy.chatList.searchContent : copy.chatList.searchTitles}
              aria-label={copy.chatList.search}
              className="h-8 w-full rounded-full bg-hover ps-8 pe-8 text-sm text-foreground placeholder:text-subtle-foreground focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:text-base pointer-coarse:h-10 [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button type="button" className="absolute end-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-subtle-foreground hover:text-foreground" aria-label={copy.common.close} onClick={() => setQuery("")}>
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <nav className="min-h-0 flex-1 overflow-y-auto px-1 pb-2" aria-label={copy.chatList.recent}>
        {chatsState === "loading" ? (
          <div className="flex flex-col gap-1 pt-1" aria-busy="true">
            {/* Three two-line rows, like the rows they stand in for (DESIGN.md States). */}
            {["w-3/4 w-1/3", "w-1/2 w-1/4", "w-5/6 w-2/5"].map((widths) => {
              const [title, meta] = widths.split(" ");
              return (
                <div key={widths} className="flex min-h-11 flex-col justify-center gap-1.5 ps-2.5">
                  <Skeleton className={cn("h-3.5", title)} />
                  <Skeleton className={cn("h-3", meta)} />
                </div>
              );
            })}
          </div>
        ) : chatsState === "error" ? (
          <div className="px-2.5 pt-3 text-sm text-muted-foreground">
            {copy.chat.loadFailed}{" "}
            <button type="button" className="font-medium text-foreground underline underline-offset-2" onClick={() => void runtime.reload()}>
              {copy.chat.retry}
            </button>
          </div>
        ) : searching ? (
          results.length ? (
            <div className="mt-1 flex flex-col gap-px">
              {results.map(({ chat, snippet }) => (
                <ChatRow key={chat.id} chat={chat} active={chat.id === props.activeChatId} subtasks={subtasks.get(chat.id) ?? 0} now={now} snippet={snippet} />
              ))}
            </div>
          ) : (
            <p className="px-2.5 pt-3 text-sm text-muted-foreground">{copy.chatList.noMatches}</p>
          )
        ) : top.length === 0 ? (
          <p className="px-2.5 pt-3 text-sm text-muted-foreground">{copy.chatList.empty}</p>
        ) : (
          <>
            {liveGroups.length ? (
              <div className="mb-1.5 flex items-start gap-1 ps-1">
                {/* The group filter is one tab stop with ←/→ (P5: Base UI RadioGroup); it wraps instead of scrolling sideways at 224px. */}
                <SegmentedControl
                  size="sm"
                  label={copy.chatList.filter}
                  value={filter}
                  onValueChange={setFilter}
                  wrap
                  items={[{ value: ALL, label: copy.chatList.all }, ...liveGroups.map((group) => ({ value: group.id, label: group.label }))]}
                />
                {selectedGroup ? <GroupMenu key={selectedGroup.id} group={selectedGroup} onRemoved={() => setFilter(ALL)} /> : null}
              </div>
            ) : null}

            {pinned.length ? (
              <div className="mb-1.5 border-b border-border pb-1.5">
                <p className="ps-2.5 pb-0.5 text-xs font-medium text-subtle-foreground">{copy.chatList.pinned}</p>
                <Rows chats={pinned} activeId={props.activeChatId} subtasks={subtasks} now={now} />
              </div>
            ) : null}

            {stream.length ? (
              <Rows chats={stream} activeId={props.activeChatId} subtasks={subtasks} now={now} />
            ) : pinned.length === 0 && archived.length === 0 ? (
              <p className="px-2.5 pt-2 text-sm text-muted-foreground">{copy.chatList.emptyFilter}</p>
            ) : null}

            {nextCursor ? (
              <Button variant="quiet" size="sm" className="mt-1 w-full" disabled={loadingMore} onClick={() => void runtime.loadMore()}>
                {copy.chatList.loadMore}
              </Button>
            ) : null}

            {archived.length ? (
              <Disclosure size="sm" label={copy.chatList.showArchived(archived.length)} className="mt-1.5" panelClassName="ps-0 pt-0.5 pb-0">
                <Rows chats={archived} activeId={props.activeChatId} subtasks={subtasks} now={now} />
              </Disclosure>
            ) : null}
          </>
        )}
      </nav>
    </div>
  );
}
