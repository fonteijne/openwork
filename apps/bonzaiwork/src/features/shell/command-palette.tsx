import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  BookOpen,
  CalendarClock,
  Clock,
  FolderPlus,
  Inbox,
  Keyboard,
  LayoutGrid,
  Megaphone,
  MessageSquare,
  MessageSquarePlus,
  Moon,
  PanelLeft,
  PanelRight,
  Play,
  Plus,
  Repeat,
  Settings,
  SlidersHorizontal,
} from "lucide-react";

import { useBackend } from "~/backend/context";
import { projectHasKey, startModel, useAttention, useProjects, useRecentChats, useRefreshAttention, useRoutines, useStatus } from "~/backend/queries";
import type { AttentionItem, Chat, Project, Routine } from "~/backend/types";
import { ProjectIcon } from "~/components/project-icon";
import { StatusChip, type ChipStatus } from "~/components/ui/chip";
import { Command, CommandFooter, CommandGroup, CommandInput, CommandItem, CommandList } from "~/components/ui/command";
import { Kbd, KbdRow, Locked, Spinner, type KbdHint } from "~/components/ui/misc";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { defaultProjectId } from "~/features/home/model";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { relativeTime } from "~/lib/format";
import { chordLabel } from "~/lib/platform";
import { APP_SETTINGS_GROUPS, canGoBack, canGoForward, goBack, goForward, navigate, SETTINGS_GROUPS, type Route } from "~/lib/router";
import { PARK_EVENT, chord, focusComposer, PROJECT_SLOTS } from "~/lib/shortcuts";
import { setTheme } from "~/lib/theme";
import { DESKTOP, useMediaQuery, WIDE } from "~/lib/use-media";

import { useSidebarProjects } from "../projects/use-listed-projects";
import { useUi } from "./ui-store";

/** The sections, in the order they show (brief §5 "Find anything", concept §6). */
type Group = "waiting" | "busy" | "recent" | "content" | "projects" | "routines" | "settings" | "actions";
const GROUPS: readonly Group[] = ["waiting", "busy", "recent", "content", "projects", "routines", "settings", "actions"];

/** How many rows a group shows without a query, and with one. */
const LIMITS: Record<Group, { empty: number; typed: number }> = {
  waiting: { empty: 5, typed: 8 },
  busy: { empty: 5, typed: 8 },
  recent: { empty: 5, typed: 8 },
  content: { empty: 0, typed: 8 },
  projects: { empty: 5, typed: 8 },
  routines: { empty: 3, typed: 8 },
  settings: { empty: 0, typed: 10 },
  actions: { empty: 6, typed: 20 },
};

/** How long the typed query rests before message text is searched (concept §6). */
const CONTENT_SEARCH_DELAY = 300;

type Entry = {
  id: string;
  group: Group;
  label: string;
  /** Second line: a result sentence, a snippet, what the agent asks. */
  detail?: string | null;
  /** Matches besides the label and the project name. */
  keywords?: readonly string[];
  icon: ReactNode;
  project?: Project | null;
  status?: { status: ChipStatus; label?: string };
  time?: string;
  /** From the shortcuts table, so the row shows what tooltips and menus show (S6). */
  shortcut?: string;
  /** A second action on the row (⌘⏎ while highlighted): "Nu uitvoeren". */
  secondary?: { label: string; run: () => void };
  /** Shown without a query. */
  primary?: boolean;
  run: () => void;
};

/** Lower-case without accents, so "financien" finds "Financiën". */
function fold(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

function matches(entry: Entry, tokens: readonly string[]): boolean {
  if (tokens.length === 0) return true;
  const haystack = fold([entry.label, entry.detail ?? "", entry.project?.name ?? "", ...(entry.keywords ?? [])].join(" "));
  return tokens.every((token) => haystack.includes(token));
}

function chatTitle(chat: Pick<Chat, "title" | "untitled">): string {
  return chat.untitled ? copy.chat.untitled : chat.title;
}

/** The project tile and name in subtle ink: the row's project chip. */
function ProjectMeta(props: { project: Project }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <ProjectIcon icon={props.project.icon} color={props.project.color} size="sm" />
      <span className="max-w-[8rem] truncate max-sm:sr-only">{props.project.name}</span>
    </span>
  );
}

/** Message hits for the scoped project once the query rested (concept §6), only when the backend searches text. */
function useContentHits(projectId: string | null, query: string) {
  const backend = useBackend();
  const [rested, setRested] = useState("");
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setRested("");
      return;
    }
    const timer = window.setTimeout(() => setRested(trimmed), CONTENT_SEARCH_DELAY);
    return () => window.clearTimeout(timer);
  }, [query]);
  return useQuery({
    queryKey: ["palette-search", projectId ?? "", rested] as const,
    queryFn: () => backend.chats.search(projectId ?? "", rested),
    enabled: backend.capabilities.contentSearch && projectId !== null && rested.length >= 2,
    staleTime: 30_000,
  });
}

/** ⌘K: find anything, do anything (brief §4, §5; DESIGN.md S6, P5). */
export function CommandPalette(props: { route: Route; projectId: string | null }) {
  const backend = useBackend();
  const open = useUi((state) => state.paletteOpen);
  const setOpen = useUi((state) => state.setPalette);
  const setNewProject = useUi((state) => state.setNewProject);
  const setFeedback = useUi((state) => state.setFeedback);
  const setShortcuts = useUi((state) => state.setShortcuts);
  const setSwitcher = useUi((state) => state.setSwitcher);
  const toggleSidebar = useUi((state) => state.toggleSidebar);
  const toggleDetails = useUi((state) => state.toggleDetails);
  const toggleAgenda = useUi((state) => state.toggleAgenda);
  const lastProjectId = useUi((state) => state.lastProjectId);
  const rememberProject = useUi((state) => state.rememberProject);
  const wide = useMediaQuery(WIDE);
  const desktop = useMediaQuery(DESKTOP);
  const status = useStatus();
  const projects = useProjects();
  const { projects: listed, pinned } = useSidebarProjects();
  const attention = useAttention();
  const recent = useRecentChats();
  const routines = useRoutines(null);
  const refreshAttention = useRefreshAttention();
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const intent = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlighted(null);
      setStarting(false);
    }
  }, [open]);

  const byId = useMemo(() => new Map((projects.data ?? []).map((project) => [project.id, project] as const)), [projects.data]);
  const openProject = props.projectId ? (byId.get(props.projectId) ?? null) : null;
  /** The typed intent and message search go to the open project, else where the person worked last (brief §5). */
  const scopeProject = openProject ?? (byId.get(defaultProjectId(lastProjectId, listed) ?? "") ?? null);
  const hits = useContentHits(scopeProject?.id ?? null, query);

  const close = () => setOpen(false);
  const go = (route: Route) => {
    close();
    navigate(route);
  };

  const runRoutine = async (routine: Routine) => {
    try {
      const run = await backend.routines.run(routine.id);
      const chatId = run.chatId;
      // "Nu uitvoeren" keeps its name: "Gestart" with the chat the run made (C2).
      toast(copy.attention.routine.started, chatId ? { action: { label: copy.attention.openChat, onClick: () => navigate({ name: "project", projectId: routine.projectId, chatId }) } } : {});
      await refreshAttention();
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
    }
  };

  /** The typed intent: a chat in the scoped project with the query as its first message (brief §5: `chats.create` + `chats.send`). */
  const startChat = async () => {
    const text = query.trim();
    const project = scopeProject;
    const model = project ? startModel(status.data, project) : null;
    if (!project || !model || !text || starting) return;
    setStarting(true);
    try {
      const chat = await backend.chats.create(project.id, { model });
      // The chat is the person's object (P11): it opens at once, the message arrives in it.
      void backend.chats
        .send(project.id, chat.id, { text, model, agent: null, attachments: [], command: null, skills: [] })
        .catch((failure: unknown) => toast(`${copy.chat.sendFailed} ${errorText(failure)}`, { tone: "error" }));
      rememberProject(project.id);
      if (backend.capabilities.agenda) void backend.agenda.reportPresence({ projectId: project.id, name: project.name });
      go({ name: "project", projectId: project.id, chatId: chat.id });
    } catch (failure) {
      toast(`${copy.home.startFailed} ${errorText(failure)}`, { tone: "error" });
    } finally {
      setStarting(false);
    }
  };

  const entries = useMemo<Entry[]>(() => {
    const items = attention.data ?? [];
    const out: Entry[] = [];
    const listedChatIds = new Set<string>();
    const listedRoutineIds = new Set<string>();

    // Wacht op jou: what stops an agent or a routine, across projects (brief §5 order, `sortAttention`).
    const waitingRow = (item: AttentionItem): Entry | null => {
      switch (item.kind) {
        case "permission":
        case "question":
        case "chat_failed": {
          listedChatIds.add(item.chatId);
          const failed = item.kind === "chat_failed";
          return {
            id: `chat-${item.chatId}`,
            group: "waiting",
            label: item.chatTitle,
            detail:
              item.kind === "permission"
                ? (copy.permission.actions[item.request.action] ?? copy.permission.fallbackAction)
                : item.kind === "question"
                  ? copy.palette.state.question
                  : copy.attention.chatFailed.title(copy.attention.chatFailed.reason[item.error.kind]),
            icon: <MessageSquare />,
            project: byId.get(item.projectId) ?? null,
            status: { status: failed ? "failed" : "waiting" },
            time: relativeTime(item.at),
            run: () => go({ name: "project", projectId: item.projectId, chatId: item.chatId }),
          };
        }
        case "routine": {
          const routine = routines.data?.find((entry) => entry.id === item.routineId) ?? null;
          listedRoutineIds.add(item.routineId);
          return {
            id: `routine-${item.routineId}`,
            group: "waiting",
            label: item.name,
            detail: item.detail,
            icon: <Repeat />,
            project: byId.get(item.projectId) ?? null,
            status: item.reason === "failed" ? { status: "failed" } : { status: "waiting", label: item.reason === "missed" ? copy.palette.state.missed : copy.palette.state.attention },
            time: relativeTime(item.at),
            secondary: routine ? { label: copy.attention.routine.runNow, run: () => void runRoutine(routine) } : undefined,
            run: () => go({ name: "routines", routineId: item.routineId }),
          };
        }
        default:
          return null;
      }
    };
    for (const item of items) {
      const row = waitingRow(item);
      if (row) out.push(row);
    }

    // Bezig and Recent: the newest chats across projects, the open project's first (brief §9 `chats.recent`).
    const chats = [...(recent.data ?? [])]
      .filter((chat) => !listedChatIds.has(chat.id))
      .sort((a, b) => Number(b.projectId === props.projectId) - Number(a.projectId === props.projectId) || b.updatedAt - a.updatedAt);
    for (const chat of chats) {
      const running = chat.status === "running";
      out.push({
        id: `chat-${chat.id}`,
        group: running ? "busy" : "recent",
        label: chatTitle(chat),
        detail: running ? null : chat.preview,
        icon: chat.routineId ? <Repeat /> : <MessageSquare />,
        project: byId.get(chat.projectId) ?? null,
        status: running ? { status: "running" } : chat.status === "waiting" ? { status: "waiting" } : chat.status === "failed" ? { status: "failed" } : undefined,
        time: relativeTime(chat.updatedAt),
        run: () => go({ name: "project", projectId: chat.projectId, chatId: chat.id }),
      });
      listedChatIds.add(chat.id);
    }

    // In berichten: hits in message text of the scoped project, with their snippet.
    for (const hit of hits.data ?? []) {
      if (listedChatIds.has(hit.chatId) && !hit.snippet) continue;
      if (scopeProject) {
        out.push({
          id: `hit-${hit.chatId}`,
          group: "content",
          label: hit.title,
          detail: hit.snippet,
          // Every hit matches by definition; the query itself is the keyword.
          keywords: [query],
          icon: <MessageSquare />,
          project: scopeProject,
          run: () => go({ name: "project", projectId: scopeProject.id, chatId: hit.chatId }),
        });
      }
    }

    // Projecten: pinned first, with their ⌘n chord, then by activity (brief §4); state as a word (V2, C5).
    const runningProjects = new Set((recent.data ?? []).filter((chat) => chat.status === "running").map((chat) => chat.projectId));
    for (const project of listed) {
      const slot = PROJECT_SLOTS.find((entry) => pinned[entry - 1]?.id === project.id);
      const need = items.find((item) => (item.kind === "permission" || item.kind === "question" || item.kind === "chat_failed") && item.projectId === project.id);
      const projectStatus: ChipStatus = !projectHasKey(status.data, project)
        ? "locked"
        : need && need.kind !== "chat_failed"
          ? "waiting"
          : need
            ? "failed"
            : runningProjects.has(project.id)
              ? "running"
              : "idle";
      out.push({
        id: `project-${project.id}`,
        group: "projects",
        label: project.name,
        keywords: project.description ? [project.description] : undefined,
        icon: <ProjectIcon icon={project.icon} color={project.color} size="sm" />,
        status: projectStatus === "idle" ? undefined : { status: projectStatus, label: projectStatus === "locked" ? copy.shell.status.locked : undefined },
        shortcut: slot ? chord(`project${slot}`) : undefined,
        primary: true,
        run: () => go({ name: "project", projectId: project.id, chatId: null }),
      });
    }

    // Routines: by name, "Nu uitvoeren" as the second action (concept §6).
    for (const routine of routines.data ?? []) {
      if (routine.state === "archived" || listedRoutineIds.has(routine.id)) continue;
      out.push({
        id: `routine-${routine.id}`,
        group: "routines",
        label: routine.name,
        keywords: [routine.prompt],
        icon: <Repeat />,
        project: byId.get(routine.projectId) ?? null,
        status: routine.state === "needs_attention" ? { status: "waiting", label: copy.palette.state.attention } : routine.state === "inactive" ? { status: "idle", label: copy.palette.state.paused } : undefined,
        secondary: { label: copy.attention.routine.runNow, run: () => void runRoutine(routine) },
        run: () => go({ name: "routines", routineId: routine.id }),
      });
    }

    // Instellingen: every group of the app and of the open project, as a crumb (concept §6).
    for (const group of APP_SETTINGS_GROUPS) {
      out.push({
        id: `settings-${group}`,
        group: "settings",
        label: copy.palette.crumb([copy.shell.settings, copy.shell.appSettingsGroups[group]]),
        keywords: copy.palette.settingsKeywords[group],
        icon: <Settings />,
        run: () => go({ name: "settings", group }),
      });
    }
    if (openProject) {
      for (const group of SETTINGS_GROUPS) {
        out.push({
          id: `project-settings-${group}`,
          group: "settings",
          label: copy.palette.crumb([openProject.name, copy.project.tabs.settings, copy.project.settingsGroups[group]]),
          keywords: group === "toegang" ? copy.palette.settingsKeywords.toegang : group === "technisch" ? copy.palette.settingsKeywords.technisch : undefined,
          icon: <SlidersHorizontal />,
          run: () => go({ name: "project-settings", projectId: openProject.id, group, section: null }),
        });
      }
      out.push(
        { id: "project-files", group: "settings", label: copy.palette.crumb([openProject.name, copy.project.tabs.files]), icon: <SlidersHorizontal />, run: () => go({ name: "project-files", projectId: openProject.id }) },
        { id: "project-routines", group: "settings", label: copy.palette.crumb([openProject.name, copy.project.tabs.routines]), icon: <SlidersHorizontal />, run: () => go({ name: "project-routines", projectId: openProject.id, routineId: null }) },
        { id: "project-brain", group: "settings", label: copy.palette.crumb([openProject.name, copy.project.tabs.brain]), icon: <SlidersHorizontal />, run: () => go({ name: "project-brain", projectId: openProject.id }) },
      );
    }

    // Acties: the same commands the window listener runs, with their chords (S6).
    const readOnly = status.data?.readOnly ?? false;
    const actions: Entry[] = [
      {
        id: "new-chat",
        group: "actions",
        label: openProject ? copy.palette.actions.newChatIn(openProject.name) : copy.shell.newChat,
        shortcut: chord("newChat"),
        icon: <MessageSquarePlus />,
        primary: true,
        run: () => {
          go(openProject ? { name: "project", projectId: openProject.id, chatId: null } : { name: "home" });
          focusComposer(60);
        },
      },
      ...(readOnly ? [] : [{ id: "new-project", group: "actions" as const, label: copy.shell.newProject, shortcut: chord("newProject"), icon: <FolderPlus />, primary: true, run: () => { close(); setNewProject(true); } }]),
      ...(props.route.name !== "home" ? [{ id: "go-home", group: "actions" as const, label: copy.palette.goHome, shortcut: chord("home"), icon: <Inbox />, primary: true, run: () => go({ name: "home" }) }] : []),
      { id: "agenda", group: "actions", label: copy.shell.agenda, shortcut: chord("agenda"), icon: <Clock />, primary: true, run: () => { close(); toggleAgenda(wide); } },
      // After the palette has closed and given focus back, so the dialog's own focus is not undone.
      ...(backend.capabilities.today ? [{ id: "park", group: "actions" as const, label: copy.shell.shortcuts.park, shortcut: chord("park"), icon: <Inbox />, run: () => { close(); window.setTimeout(() => window.dispatchEvent(new Event(PARK_EVENT)), 80); } }] : []),
      ...(openProject
        ? [
            { id: "details", group: "actions" as const, label: copy.shell.details, shortcut: chord("details"), icon: <PanelRight />, run: () => { close(); toggleDetails(wide); } },
            { id: "switch-project", group: "actions" as const, label: copy.shell.switchProject, shortcut: chord("switchProject"), icon: <ArrowLeftRight />, run: () => { close(); setSwitcher(true); } },
          ]
        : []),
      { id: "go-projects", group: "actions", label: copy.palette.actions.goAllProjects, icon: <LayoutGrid />, run: () => go({ name: "projects" }) },
      { id: "go-routines", group: "actions", label: copy.palette.actions.goRoutines, icon: <CalendarClock />, run: () => go({ name: "routines", routineId: null }) },
      { id: "go-brain", group: "actions", label: copy.palette.actions.goBrain, icon: <BookOpen />, run: () => go({ name: "brain" }) },
      { id: "go-settings", group: "actions", label: copy.palette.goSettings, shortcut: chord("settings"), icon: <Settings />, primary: true, run: () => go({ name: "settings" }) },
      ...(desktop ? [{ id: "sidebar", group: "actions" as const, label: copy.palette.actions.sidebar, shortcut: chord("sidebar"), icon: <PanelLeft />, run: () => { close(); toggleSidebar(); } }] : []),
      ...(canGoBack() ? [{ id: "back", group: "actions" as const, label: copy.shell.shortcuts.back, shortcut: chord("back"), icon: <ArrowLeft />, run: () => { close(); goBack(); } }] : []),
      ...(canGoForward() ? [{ id: "forward", group: "actions" as const, label: copy.shell.shortcuts.forward, shortcut: chord("forward"), icon: <ArrowRight />, run: () => { close(); goForward(); } }] : []),
      { id: "shortcuts", group: "actions", label: copy.shell.shortcutsTitle, shortcut: chord("shortcuts"), icon: <Keyboard />, primary: true, run: () => setShortcuts(true) },
      { id: "feedback", group: "actions", label: copy.shell.feedback, icon: <Megaphone />, run: () => setFeedback(true) },
      { id: "theme", group: "actions", label: copy.palette.toggleTheme, icon: <Moon />, run: () => { close(); setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"); } },
    ];
    return [...out, ...actions];
  }, [attention.data, recent.data, routines.data, hits.data, listed, pinned, byId, status.data, openProject, scopeProject, props.projectId, props.route.name, query, wide, desktop]);

  const tokens = useMemo(() => fold(query).split(/\s+/).filter(Boolean), [query]);
  const typed = tokens.length > 0;
  const groups = useMemo(() => {
    const perGroup = new Map<Group, Entry[]>();
    for (const entry of entries) {
      if (!typed && entry.group === "actions" && !entry.primary) continue;
      if (!matches(entry, tokens)) continue;
      const limit = typed ? LIMITS[entry.group].typed : LIMITS[entry.group].empty;
      const list = perGroup.get(entry.group) ?? [];
      if (list.length >= limit) continue;
      list.push(entry);
      perGroup.set(entry.group, list);
    }
    return GROUPS.map((group) => ({ group, rows: perGroup.get(group) ?? [] })).filter((section) => section.rows.length > 0);
  }, [entries, tokens, typed]);
  const total = groups.reduce((sum, section) => sum + section.rows.length, 0);
  const highlightedEntry = highlighted ? entries.find((entry) => entry.id === highlighted) : undefined;

  // The typed intent: nothing matched, so the words are an assignment (concept §6).
  const intentText = query.trim();
  const showIntent = typed && total === 0 && intentText.length > 0;
  const intentModel = scopeProject ? startModel(status.data, scopeProject) : null;
  const intentLocked = scopeProject ? !projectHasKey(status.data, scopeProject) || !intentModel : true;

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const mod = event.metaKey || event.ctrlKey;
    if (event.key === "Enter" && mod && highlightedEntry?.secondary) {
      event.preventDefault();
      close();
      highlightedEntry.secondary.run();
      return;
    }
    // ↓ reaches the intent row: it is no option, so it is never pre-highlighted (brief §5).
    if (event.key === "ArrowDown" && showIntent && !event.altKey && !mod) {
      event.preventDefault();
      intent.current?.focus();
    }
  };

  const hints: KbdHint[] = showIntent
    ? [
        { keys: "↓", label: copy.palette.hints.choose },
        { keys: "esc", label: copy.palette.hints.close },
      ]
    : [
        { keys: "⏎", label: copy.palette.hints.open },
        ...(highlightedEntry?.secondary ? [{ keys: chordLabel("⏎"), label: copy.palette.hints.run }] : []),
        { keys: "esc", label: copy.palette.hints.close },
      ];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(value) => setOpen(value)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-backdrop" />
        {/* No entrance animation: a high-frequency surface (V6). */}
        <DialogPrimitive.Popup
          initialFocus={input}
          data-testid="command-palette"
          className="fixed inset-x-3 top-[10vh] z-50 mx-auto flex max-h-[min(70vh,40rem)] max-w-2xl flex-col overflow-hidden rounded-window bg-popover text-popover-foreground shadow-shell outline-none"
        >
          <DialogPrimitive.Title className="sr-only">{copy.nav.search}</DialogPrimitive.Title>
          <Command query={query} onQueryChange={setQuery} onHighlight={setHighlighted} className="min-h-0 flex-1">
            <CommandInput ref={input} placeholder={copy.palette.placeholder} label={copy.nav.search} onKeyDown={onInputKeyDown} />
            <CommandList aria-label={copy.nav.search}>
              {groups.map((section) => (
                <CommandGroup key={section.group} label={copy.palette.groups[section.group]}>
                  {section.rows.map((entry) => (
                    <CommandItem
                      key={entry.id}
                      value={entry.id}
                      onSelect={entry.run}
                      icon={entry.icon}
                      detail={entry.detail}
                      meta={
                        entry.project || entry.status || entry.time ? (
                          <>
                            {entry.project ? <ProjectMeta project={entry.project} /> : null}
                            {entry.status ? <StatusChip status={entry.status.status} label={entry.status.label} className="text-[11px]" /> : null}
                            {entry.time && !entry.status ? <span className="whitespace-nowrap max-sm:hidden">{entry.time}</span> : null}
                          </>
                        ) : null
                      }
                      trailing={
                        entry.secondary ? (
                          <button
                            type="button"
                            tabIndex={-1}
                            data-testid="palette-run-now"
                            onClick={(event) => {
                              event.stopPropagation();
                              close();
                              entry.secondary?.run();
                            }}
                            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border hover:bg-active hover:text-foreground [&_svg]:size-3.5"
                          >
                            <Play aria-hidden="true" />
                            <span className="max-sm:sr-only">{entry.secondary.label}</span>
                            <Kbd className="hidden group-data-[highlighted]/row:inline-flex max-sm:group-data-[highlighted]/row:hidden">{chordLabel("⏎")}</Kbd>
                          </button>
                        ) : entry.shortcut ? (
                          <Kbd className="text-subtle-foreground pointer-coarse:hidden">{entry.shortcut}</Kbd>
                        ) : null
                      }
                    >
                      {entry.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
            {showIntent && scopeProject ? (
              <CommandFooter className="border-t border-border p-1.5">
                <button
                  ref={intent}
                  type="button"
                  disabled={intentLocked || starting}
                  aria-label={copy.palette.startChatLabel(scopeProject.name, intentText)}
                  data-testid="palette-start-chat"
                  onClick={() => void startChat()}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      input.current?.focus();
                    }
                  }}
                  className={cn(
                    "flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-start text-sm text-foreground outline-none hover:bg-hover focus-visible:bg-hover focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 pointer-coarse:min-h-11 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground",
                  )}
                >
                  {starting ? <Spinner /> : <Plus aria-hidden="true" />}
                  <span className="min-w-0 flex-1 truncate">
                    {starting ? (
                      copy.palette.starting
                    ) : (
                      <>
                        <span className="text-muted-foreground">{copy.palette.startChat(scopeProject.name)}</span> <span className="font-medium">{intentText}</span>
                      </>
                    )}
                  </span>
                  <ProjectIcon icon={scopeProject.icon} color={scopeProject.color} size="sm" />
                  {intentLocked ? <Locked>{copy.shell.status.locked}</Locked> : <Kbd className="text-subtle-foreground pointer-coarse:hidden">⏎</Kbd>}
                </button>
              </CommandFooter>
            ) : null}
          </Command>
          <div className="flex h-9 shrink-0 items-center border-t border-border px-4 pointer-coarse:hidden">
            <KbdRow hints={hints} />
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
