import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  BookOpen,
  CalendarClock,
  CircleCheckBig,
  CirclePlay,
  Clock,
  Folder,
  Inbox,
  Keyboard,
  LayoutGrid,
  Mail,
  Megaphone,
  MessageSquare,
  MessageSquarePlus,
  MessageSquareText,
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
import type { SearchHit } from "~/backend/cockpit";
import { useCockpit, useCockpitSearch, useInbox, useLibraryPages, useRuns, useShelves, useTodos } from "~/backend/cockpit-queries";
import { projectHasKey, startModel, useAttention, useProjects, useRecentChats, useRefreshAttention, useRoutines, useStatus } from "~/backend/queries";
import type { AttentionItem, Chat, Project, Routine } from "~/backend/types";
import { ProjectIcon } from "~/components/project-icon";
import { StatusChip, type ChipStatus } from "~/components/ui/chip";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "~/components/ui/command";
import { Kbd, Spinner } from "~/components/ui/misc";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { paletteCopy } from "~/copy/palette";
import { defaultProjectId } from "~/features/home/model";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { relativeTime } from "~/lib/format";
import { chordLabel } from "~/lib/platform";
import { APP_SETTINGS_GROUPS, canGoBack, canGoForward, goBack, goForward, href, navigate, parse, routeProjectId, SETTINGS_GROUPS, type Route } from "~/lib/router";
import { chord, focusComposer, PROJECT_SLOTS } from "~/lib/shortcuts";
import { setTheme } from "~/lib/theme";
import { DESKTOP, useMediaQuery, WIDE } from "~/lib/use-media";

import { useSidebarProjects } from "../projects/use-listed-projects";
import { useUi } from "./ui-store";

/*
 * ⌘K in the cockpit style (design v2-Palette): a big white dialog with the query as its title,
 * filter pills, groups with uppercase eyebrows ("Doen", "Jouw werk", "Bibliotheek en mail"), the
 * highlighted row with an accent ring and "Enter", a closing "Vraag de Bibliotheek" row and a grey
 * footer with the count and the keys. Behind it the palette of before: waiting chats, recent and
 * running chats, message hits, projects with their ⌘n chord, routines with "Nu uitvoeren",
 * settings crumbs and the shortcut actions, now next to the cockpit's search (projects, runs,
 * to-dos, Library pages, mail).
 *
 * The delegate row hands the query to the delegate page through sessionStorage
 * (`bonzaiwork.delegate.goal`), because the route `#/delegeren` carries no text.
 */

/** Where a row shows. */
type Group = "do" | "waiting" | "work" | "library" | "settings";
const GROUPS: readonly Group[] = ["do", "waiting", "work", "library", "settings"];

/** Where a row comes from: each source keeps its own limit without and with a query. */
type Source = "do" | "waiting" | "busy" | "recent" | "cockpit" | "content" | "projects" | "routines" | "library" | "settings" | "actions";
const LIMITS: Record<Source, { empty: number; typed: number }> = {
  do: { empty: 2, typed: 3 },
  waiting: { empty: 5, typed: 6 },
  busy: { empty: 3, typed: 6 },
  recent: { empty: 4, typed: 6 },
  cockpit: { empty: 0, typed: 8 },
  content: { empty: 0, typed: 6 },
  projects: { empty: 4, typed: 6 },
  routines: { empty: 0, typed: 6 },
  library: { empty: 0, typed: 8 },
  settings: { empty: 0, typed: 8 },
  actions: { empty: 5, typed: 10 },
};
const GROUP_OF: Record<Source, Group> = {
  do: "do",
  actions: "do",
  waiting: "waiting",
  busy: "work",
  recent: "work",
  cockpit: "work",
  content: "work",
  projects: "work",
  routines: "work",
  library: "library",
  settings: "settings",
};
/** Inside "Jouw werk": the cockpit's hits first, then what the person had open. */
const SOURCE_ORDER: readonly Source[] = ["do", "actions", "waiting", "cockpit", "busy", "recent", "content", "projects", "routines", "library", "settings"];

/** How long the typed query rests before message text is searched (concept §6). */
const CONTENT_SEARCH_DELAY = 300;
const DAY = 24 * 60 * 60 * 1000;
const RECENT_DAYS = 30;
const DELEGATE_GOAL_KEY = "bonzaiwork.delegate.goal";
const ASK_ID = "ask-library";

type Filter = "all" | "project" | "recent";

type Entry = {
  id: string;
  source: Source;
  label: string;
  /** Second line: a result sentence, a snippet, what the agent asks. */
  detail?: string | null;
  /** Matches besides the label and the project name. */
  keywords?: readonly string[];
  icon: ReactNode;
  project?: Project | null;
  /** For the project filter. */
  projectId?: string | null;
  /** For "Laatste 30 dagen". */
  at?: number | null;
  status?: { status: ChipStatus; label?: string };
  time?: string;
  /** From the shortcuts table, so the row shows what tooltips and menus show (S6). */
  shortcut?: string;
  /** A second action on the row (⌘⏎ while highlighted): "Nu uitvoeren". */
  secondary?: { label: string; run: () => void };
  /** Shown without a query. */
  primary?: boolean;
  /** Always shown while typing: the row is about the query itself. */
  always?: boolean;
  strong?: boolean;
  disabled?: boolean;
  run: () => void;
};

/** Lower-case without accents, so "financien" finds "Financiën". */
function fold(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

function matches(entry: Entry, tokens: readonly string[]): boolean {
  if (tokens.length === 0 || entry.always) return true;
  const haystack = fold([entry.label, entry.detail ?? "", entry.project?.name ?? "", ...(entry.keywords ?? [])].join(" "));
  return tokens.every((token) => haystack.includes(token));
}

function chatTitle(chat: Pick<Chat, "title" | "untitled">): string {
  return chat.untitled ? copy.chat.untitled : chat.title;
}

const HIT_ICONS: Record<SearchHit["kind"], ReactNode> = {
  project: <Folder />,
  run: <CirclePlay />,
  todo: <CircleCheckBig />,
  page: <BookOpen />,
  mail: <Mail />,
  chat: <MessageSquare />,
};

/** The project tile and name in subtle ink: the row's project chip. */
function ProjectMeta(props: { project: Project }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <ProjectIcon icon={props.project.icon} color={props.project.color} size="sm" />
      <span className="max-w-[8rem] truncate max-sm:sr-only">{props.project.name}</span>
    </span>
  );
}

/** An uppercase eyebrow as the group's name. */
function GroupLabel(props: { children: ReactNode }) {
  return <span className="text-[13px] font-semibold uppercase leading-4 tracking-[0.08em] text-ink-muted">{props.children}</span>;
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

/**
 * Where a cockpit hit belongs (project) and when it last moved, for the filters: read from the
 * runs, to-dos, pages and inbox the other pages already load.
 */
function useHitFacts() {
  const runs = useRuns();
  const todos = useTodos();
  const inbox = useInbox();
  const pages = useLibraryPages(null);
  const shelves = useShelves();
  return useMemo(() => {
    const facts = new Map<string, { projectId: string | null; at: number | null }>();
    for (const run of runs.data ?? []) facts.set(`run:${run.id}`, { projectId: run.projectId, at: run.updatedAt });
    for (const todo of todos.data ?? []) facts.set(`todo:${todo.id}`, { projectId: todo.projectId, at: todo.createdAt });
    for (const item of inbox.data ?? []) facts.set(`mail:${item.id}`, { projectId: item.projectId ?? item.suggestedProjectId, at: item.receivedAt });
    const shelfProject = new Map((shelves.data ?? []).map((shelf) => [shelf.id, shelf.projectId] as const));
    for (const page of pages.data ?? []) facts.set(`page:${page.id}`, { projectId: shelfProject.get(page.shelfId) ?? null, at: page.updatedAt });
    return (hit: SearchHit) => facts.get(`${hit.kind}:${hit.id}`) ?? { projectId: hit.kind === "project" ? routeProjectId(parse(hit.href)) : null, at: null };
  }, [runs.data, todos.data, inbox.data, pages.data, shelves.data]);
}

/** ⌘K: find anything, do anything (brief §4, §5; DESIGN.md S6, P5). */
export function CommandPalette(props: { route: Route; projectId: string | null }) {
  const open = useUi((state) => state.paletteOpen);
  const setOpen = useUi((state) => state.setPalette);
  const input = useRef<HTMLInputElement>(null);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(value) => setOpen(value)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-backdrop" />
        {/* No entrance animation: a high-frequency surface (V6). */}
        <DialogPrimitive.Popup
          initialFocus={input}
          data-testid="command-palette"
          className="fixed inset-x-3 top-[4vh] z-50 mx-auto flex max-h-[92vh] max-w-[800px] flex-col overflow-hidden rounded-panel bg-surface-raised text-ink shadow-float outline-none sm:top-24 sm:max-h-[calc(100vh-8rem)]"
        >
          <DialogPrimitive.Title className="sr-only">{paletteCopy.title}</DialogPrimitive.Title>
          <PaletteBody route={props.route} projectId={props.projectId} input={input} />
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Everything inside the dialog; it mounts when the palette opens, so the query starts empty. */
function PaletteBody(props: { route: Route; projectId: string | null; input: RefObject<HTMLInputElement | null> }) {
  const backend = useBackend();
  const cockpit = useCockpit();
  const setOpen = useUi((state) => state.setPalette);
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
  const [filter, setFilter] = useState<Filter>("all");
  const [asked, setAsked] = useState<string | null>(null);
  const { input } = props;

  const byId = useMemo(() => new Map((projects.data ?? []).map((project) => [project.id, project] as const)), [projects.data]);
  const openProject = props.projectId ? (byId.get(props.projectId) ?? null) : null;
  /** The typed intent and message search go to the open project, else where the person worked last (brief §5). */
  const scopeProject = openProject ?? (byId.get(defaultProjectId(lastProjectId, listed) ?? "") ?? null);
  const hits = useContentHits(scopeProject?.id ?? null, query);
  const trimmed = query.trim();
  const cockpitHits = useCockpitSearch(trimmed);
  const hitFacts = useHitFacts();
  const answer = useQuery({ queryKey: ["cockpit", "palette-ask", asked ?? ""] as const, queryFn: () => cockpit.library.ask(asked ?? ""), enabled: asked !== null, staleTime: 60_000 });
  const libraryLocked = cockpit.capabilities.library;

  // The project pill leaves with the project.
  useEffect(() => {
    if (filter === "project" && !openProject) setFilter("all");
  }, [filter, openProject]);

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

  const delegate = (goal: string) => {
    try {
      if (goal) window.sessionStorage.setItem(DELEGATE_GOAL_KEY, goal);
      else window.sessionStorage.removeItem(DELEGATE_GOAL_KEY);
    } catch {
      // Without storage the delegate page starts with an empty goal.
    }
    go({ name: "delegate", todoId: null });
  };

  const entries = useMemo<Entry[]>(() => {
    const items = attention.data ?? [];
    const out: Entry[] = [];
    const listedChatIds = new Set<string>();
    const listedRoutineIds = new Set<string>();
    const readOnly = status.data?.readOnly ?? false;

    // Doen: the query as an assignment, then a new project (design v2-Palette).
    out.push({
      id: "delegate",
      source: "do",
      label: trimmed ? paletteCopy.delegate(trimmed) : paletteCopy.delegateEmpty,
      icon: <ArrowRight />,
      always: true,
      primary: true,
      strong: true,
      run: () => delegate(trimmed),
    });
    if (!readOnly) out.push({ id: "new-project", source: "do", label: paletteCopy.newProject, icon: <Plus />, always: true, primary: true, run: () => go({ name: "project-new", fromProjectId: null, fromChatId: null }) });

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
            source: "waiting",
            label: item.chatTitle,
            detail:
              item.kind === "permission"
                ? (copy.permission.actions[item.request.action] ?? copy.permission.fallbackAction)
                : item.kind === "question"
                  ? copy.palette.state.question
                  : copy.attention.chatFailed.title(copy.attention.chatFailed.reason[item.error.kind]),
            icon: <MessageSquare />,
            project: byId.get(item.projectId) ?? null,
            projectId: item.projectId,
            at: item.at,
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
            source: "waiting",
            label: item.name,
            detail: item.detail,
            icon: <Repeat />,
            project: byId.get(item.projectId) ?? null,
            projectId: item.projectId,
            at: item.at,
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

    // The cockpit's search: projects, runs and to-dos under Jouw werk, pages and mail under Bibliotheek en mail.
    const cockpitProjects = new Set<string>();
    if (trimmed) {
      for (const hit of cockpitHits.data ?? []) {
        if (hit.kind === "chat" && listedChatIds.has(hit.id)) continue;
        const facts = hitFacts(hit);
        if (hit.kind === "project" && facts.projectId) cockpitProjects.add(facts.projectId);
        const route = parse(hit.href);
        out.push({
          id: `hit-${hit.kind}-${hit.id}`,
          source: hit.group === "library" ? "library" : hit.group === "do" ? "do" : "cockpit",
          label: hit.title,
          detail: hit.meta,
          keywords: [trimmed],
          always: true,
          icon: HIT_ICONS[hit.kind],
          projectId: facts.projectId,
          at: facts.at,
          run: () => go(route),
        });
      }
    }

    // Bezig and Recent: the newest chats across projects, the open project's first (brief §9 `chats.recent`).
    const chats = [...(recent.data ?? [])]
      .filter((chat) => !listedChatIds.has(chat.id))
      .sort((a, b) => Number(b.projectId === props.projectId) - Number(a.projectId === props.projectId) || b.updatedAt - a.updatedAt);
    for (const chat of chats) {
      const running = chat.status === "running";
      out.push({
        id: `chat-${chat.id}`,
        source: running ? "busy" : "recent",
        label: chatTitle(chat),
        detail: running ? null : chat.preview,
        icon: chat.routineId ? <Repeat /> : <MessageSquare />,
        project: byId.get(chat.projectId) ?? null,
        projectId: chat.projectId,
        at: chat.updatedAt,
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
          source: "content",
          label: hit.title,
          detail: hit.snippet,
          // Every hit matches by definition; the query itself is the keyword.
          keywords: [query],
          icon: <MessageSquareText />,
          project: scopeProject,
          projectId: scopeProject.id,
          run: () => go({ name: "project", projectId: scopeProject.id, chatId: hit.chatId }),
        });
      }
    }

    // Projecten: pinned first, with their ⌘n chord, then by activity (brief §4); state as a word (V2, C5).
    const runningProjects = new Set((recent.data ?? []).filter((chat) => chat.status === "running").map((chat) => chat.projectId));
    for (const project of listed) {
      if (cockpitProjects.has(project.id)) continue;
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
        source: "projects",
        label: project.name,
        detail: project.description,
        keywords: project.description ? [project.description] : undefined,
        icon: <ProjectIcon icon={project.icon} color={project.color} size="sm" />,
        projectId: project.id,
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
        source: "routines",
        label: routine.name,
        keywords: [routine.prompt],
        icon: <Repeat />,
        project: byId.get(routine.projectId) ?? null,
        projectId: routine.projectId,
        at: routine.lastRun?.scheduledAt ?? null,
        status: routine.state === "needs_attention" ? { status: "waiting", label: copy.palette.state.attention } : routine.state === "inactive" ? { status: "idle", label: copy.palette.state.paused } : undefined,
        secondary: { label: copy.attention.routine.runNow, run: () => void runRoutine(routine) },
        run: () => go({ name: "routines", routineId: routine.id }),
      });
    }

    // Instellingen: every group of the app and of the open project, as a crumb (concept §6).
    for (const group of APP_SETTINGS_GROUPS) {
      out.push({
        id: `settings-${group}`,
        source: "settings",
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
          source: "settings",
          label: copy.palette.crumb([openProject.name, copy.project.tabs.settings, copy.project.settingsGroups[group]]),
          keywords: group === "toegang" ? copy.palette.settingsKeywords.toegang : group === "technisch" ? copy.palette.settingsKeywords.technisch : undefined,
          icon: <SlidersHorizontal />,
          projectId: openProject.id,
          run: () => go({ name: "project-settings", projectId: openProject.id, group, section: null }),
        });
      }
      out.push(
        { id: "project-files", source: "settings", label: copy.palette.crumb([openProject.name, copy.project.tabs.files]), icon: <SlidersHorizontal />, projectId: openProject.id, run: () => go({ name: "project-files", projectId: openProject.id }) },
        { id: "project-routines", source: "settings", label: copy.palette.crumb([openProject.name, copy.project.tabs.routines]), icon: <SlidersHorizontal />, projectId: openProject.id, run: () => go({ name: "project-routines", projectId: openProject.id, routineId: null }) },
        { id: "project-brain", source: "settings", label: copy.palette.crumb([openProject.name, copy.project.tabs.brain]), icon: <SlidersHorizontal />, projectId: openProject.id, run: () => go({ name: "project-brain", projectId: openProject.id }) },
      );
    }

    // Acties: the same commands the window listener runs, with their chords (S6).
    const actions: Entry[] = [
      {
        id: "new-chat",
        source: "actions",
        label: openProject ? copy.palette.actions.newChatIn(openProject.name) : copy.shell.newChat,
        shortcut: chord("newChat"),
        icon: <MessageSquarePlus />,
        primary: true,
        run: () => {
          go(openProject ? { name: "project", projectId: openProject.id, chatId: null } : { name: "home" });
          focusComposer(60);
        },
      },
      ...(props.route.name !== "home" ? [{ id: "go-home", source: "actions" as const, label: copy.palette.goHome, shortcut: chord("home"), icon: <Inbox />, primary: true, run: () => go({ name: "home" }) }] : []),
      { id: "agenda", source: "actions", label: copy.shell.agenda, shortcut: chord("agenda"), icon: <Clock />, run: () => { close(); toggleAgenda(wide); } },
      ...(openProject
        ? [
            { id: "details", source: "actions" as const, label: copy.shell.details, shortcut: chord("details"), icon: <PanelRight />, run: () => { close(); toggleDetails(wide); } },
            { id: "switch-project", source: "actions" as const, label: copy.shell.switchProject, shortcut: chord("switchProject"), icon: <ArrowLeftRight />, run: () => { close(); setSwitcher(true); } },
          ]
        : []),
      { id: "go-projects", source: "actions", label: copy.palette.actions.goAllProjects, icon: <LayoutGrid />, run: () => go({ name: "projects" }) },
      { id: "go-routines", source: "actions", label: copy.palette.actions.goRoutines, icon: <CalendarClock />, run: () => go({ name: "routines", routineId: null }) },
      { id: "go-brain", source: "actions", label: copy.palette.actions.goBrain, icon: <BookOpen />, run: () => go({ name: "brain" }) },
      { id: "go-settings", source: "actions", label: copy.palette.goSettings, shortcut: chord("settings"), icon: <Settings />, primary: true, run: () => go({ name: "settings" }) },
      ...(desktop ? [{ id: "sidebar", source: "actions" as const, label: copy.palette.actions.sidebar, shortcut: chord("sidebar"), icon: <PanelLeft />, run: () => { close(); toggleSidebar(); } }] : []),
      ...(canGoBack() ? [{ id: "back", source: "actions" as const, label: copy.shell.shortcuts.back, shortcut: chord("back"), icon: <ArrowLeft />, run: () => { close(); goBack(); } }] : []),
      ...(canGoForward() ? [{ id: "forward", source: "actions" as const, label: copy.shell.shortcuts.forward, shortcut: chord("forward"), icon: <ArrowRight />, run: () => { close(); goForward(); } }] : []),
      { id: "shortcuts", source: "actions", label: copy.shell.shortcutsTitle, shortcut: chord("shortcuts"), icon: <Keyboard />, primary: true, run: () => setShortcuts(true) },
      { id: "feedback", source: "actions", label: copy.shell.feedback, icon: <Megaphone />, run: () => setFeedback(true) },
      { id: "theme", source: "actions", label: copy.palette.toggleTheme, icon: <Moon />, run: () => { close(); setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"); } },
    ];
    return [...out, ...actions];
  }, [attention.data, recent.data, routines.data, hits.data, cockpitHits.data, hitFacts, listed, pinned, byId, status.data, openProject, scopeProject, props.projectId, props.route.name, query, trimmed, wide, desktop]);

  const tokens = useMemo(() => fold(query).split(/\s+/).filter(Boolean), [query]);
  const typed = tokens.length > 0;
  const groups = useMemo(() => {
    const since = Date.now() - RECENT_DAYS * DAY;
    const kept = (entry: Entry) => {
      // The filters narrow the results; what to do with the query stays.
      if (GROUP_OF[entry.source] === "do") return true;
      if (filter === "project") return openProject !== null && entry.projectId === openProject.id;
      if (filter === "recent") return typeof entry.at === "number" && entry.at >= since;
      return true;
    };
    const perSource = new Map<Source, Entry[]>();
    for (const entry of entries) {
      if (!typed && !entry.primary && (entry.source === "actions" || entry.source === "do")) continue;
      if (!kept(entry) || !matches(entry, tokens)) continue;
      const limit = typed ? LIMITS[entry.source].typed : LIMITS[entry.source].empty;
      const list = perSource.get(entry.source) ?? [];
      if (list.length >= limit) continue;
      list.push(entry);
      perSource.set(entry.source, list);
    }
    const perGroup = new Map<Group, Entry[]>();
    for (const source of SOURCE_ORDER) {
      const rows = perSource.get(source);
      if (!rows?.length) continue;
      perGroup.set(GROUP_OF[source], [...(perGroup.get(GROUP_OF[source]) ?? []), ...rows]);
    }
    // Nothing else matched: the words may be an assignment for the scoped project (concept §6).
    const others = GROUPS.filter((group) => group !== "do").some((group) => (perGroup.get(group)?.length ?? 0) > 0);
    if (typed && !others && scopeProject) {
      const locked = !projectHasKey(status.data, scopeProject) || !startModel(status.data, scopeProject);
      perGroup.set("do", [
        ...(perGroup.get("do") ?? []),
        {
          id: "start-chat",
          source: "do",
          label: starting ? copy.palette.starting : paletteCopy.startChat(scopeProject.name, query.trim()),
          detail: locked ? paletteCopy.startChatLocked : null,
          icon: starting ? <Spinner /> : <MessageSquarePlus />,
          disabled: locked || starting,
          run: () => void startChat(),
        },
      ]);
    }
    return GROUPS.map((group) => ({ group, rows: perGroup.get(group) ?? [] })).filter((section) => section.rows.length > 0);
  }, [entries, tokens, typed, filter, openProject, scopeProject, status.data, starting, query]);

  const showAsk = typed;
  const total = groups.reduce((sum, section) => sum + section.rows.length, 0) + (showAsk ? 1 : 0);
  const highlightedEntry = highlighted ? groups.flatMap((section) => section.rows).find((entry) => entry.id === highlighted) : undefined;

  const ask = () => {
    if (libraryLocked || !trimmed) return;
    setAsked(trimmed);
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const mod = event.metaKey || event.ctrlKey;
    if (event.key === "Enter" && mod && highlightedEntry?.secondary) {
      event.preventDefault();
      close();
      highlightedEntry.secondary.run();
    }
  };

  const filters: Array<{ id: Filter; label: string }> = [
    { id: "all", label: paletteCopy.filters.all },
    ...(openProject ? [{ id: "project" as const, label: openProject.name }] : []),
    { id: "recent", label: paletteCopy.filters.recent },
  ];

  const rowClass =
    "min-h-[52px] gap-3 rounded-card px-4 py-2 text-lg font-medium text-ink data-[highlighted]:bg-surface-alt data-[highlighted]:ring-2 data-[highlighted]:ring-inset data-[highlighted]:ring-accent [&>svg]:size-5 [&>svg]:text-ink pointer-coarse:min-h-12";
  const enterHint = <kbd className="hidden shrink-0 font-mono text-[13px] font-medium text-ink-muted group-data-[highlighted]/row:inline pointer-coarse:hidden!">{paletteCopy.enter}</kbd>;

  return (
    <>
      <Command query={query} onQueryChange={(value) => { setQuery(value); setAsked(null); }} onHighlight={setHighlighted} className="min-h-0 flex-1">
        <CommandInput
          ref={input}
          placeholder={paletteCopy.placeholder}
          label={paletteCopy.title}
          onKeyDown={onInputKeyDown}
          className="gap-4 border-line px-5 py-3 sm:px-8 sm:py-5 [&>svg]:size-6 [&>svg]:text-ink [&_input]:h-11 [&_input]:text-[22px] [&_input]:font-semibold [&_input]:text-ink [&_input]:placeholder:font-normal [&_input]:placeholder:text-ink-muted sm:[&_input]:text-2xl"
          trailing={
            <button type="button" onClick={close} aria-label={paletteCopy.close} className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface-alt">
              <kbd className="rounded-md border border-line-strong px-2 py-0.5 font-mono text-[13px] font-medium leading-5">{paletteCopy.esc}</kbd>
            </button>
          }
        />
        <div role="group" aria-label={paletteCopy.filters.label} className="flex shrink-0 flex-wrap gap-2 border-b border-line px-5 py-4 sm:px-8">
          {filters.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={filter === entry.id}
              onClick={() => {
                setFilter(entry.id);
                input.current?.focus();
              }}
              className={cn(
                "inline-flex min-h-9 max-w-full items-center truncate rounded-full px-4 text-sm transition-colors duration-200 pointer-coarse:min-h-11",
                filter === entry.id ? "bg-surface-inverse font-semibold text-ink-inverse" : "border border-line-strong bg-surface text-ink hover:border-ink",
              )}
            >
              <span className="truncate">{entry.label}</span>
            </button>
          ))}
        </div>
        <CommandList aria-label={trimmed ? `${paletteCopy.title}: ${trimmed}` : paletteCopy.title} className="px-3 pt-2 pb-4 sm:px-4">
          {groups.map((section) => (
            <CommandGroup key={section.group} label={<GroupLabel>{paletteCopy.groups[section.group]}</GroupLabel>} className="pb-2 [&>:first-child]:px-4 [&>:first-child]:pt-3 [&>:first-child]:pb-1">
              {section.rows.map((entry) => (
                <CommandItem
                  key={entry.id}
                  value={entry.id}
                  onSelect={entry.run}
                  icon={entry.icon}
                  disabled={entry.disabled}
                  className={cn(rowClass, entry.strong && "font-semibold")}
                  detail={entry.detail ? <span className="text-sm font-normal text-ink-muted">{entry.detail}</span> : null}
                  meta={
                    entry.project || entry.status || entry.time ? (
                      <>
                        {entry.project ? <ProjectMeta project={entry.project} /> : null}
                        {entry.status ? <StatusChip status={entry.status.status} label={entry.status.label} className="text-[11px]" /> : null}
                        {entry.time && !entry.status ? <span className="whitespace-nowrap text-sm max-sm:hidden">{entry.time}</span> : null}
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
                        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-ink ring-1 ring-inset ring-line-strong hover:bg-ink hover:text-surface [&_svg]:size-3.5 pointer-coarse:h-11"
                      >
                        <Play aria-hidden="true" />
                        <span className="max-sm:sr-only">{entry.secondary.label}</span>
                        <Kbd className="hidden group-data-[highlighted]/row:inline-flex max-sm:group-data-[highlighted]/row:hidden">{chordLabel("⏎")}</Kbd>
                      </button>
                    ) : (
                      <>
                        {entry.shortcut ? <Kbd className="text-ink-muted group-data-[highlighted]/row:hidden pointer-coarse:hidden">{entry.shortcut}</Kbd> : null}
                        {enterHint}
                      </>
                    )
                  }
                >
                  {entry.label}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          {showAsk ? (
            <div className="mt-2 border-t border-line pt-2">
              <CommandItem
                value={ASK_ID}
                onSelect={ask}
                disabled={libraryLocked !== null}
                icon={<MessageSquareText />}
                className={cn(rowClass, "min-h-[60px] font-semibold text-accent")}
                detail={<span className="text-sm font-normal text-ink-muted">{libraryLocked ?? paletteCopy.askDetail}</span>}
                trailing={enterHint}
              >
                {paletteCopy.ask(trimmed)}
              </CommandItem>
            </div>
          ) : null}
        </CommandList>
      </Command>
      {asked ? (
        <section aria-label={paletteCopy.answerTitle(asked)} aria-live="polite" className="max-h-[40vh] shrink-0 overflow-y-auto border-t border-line px-5 py-5 sm:px-8">
          <p className="m-0 mb-2 text-[13px] font-semibold uppercase leading-4 tracking-[0.08em] text-ink-muted">{paletteCopy.answerTitle(asked)}</p>
          {answer.isPending ? (
            <p className="m-0 flex items-center gap-2 text-base text-ink-muted">
              <Spinner />
              {paletteCopy.answerLoading}
            </p>
          ) : answer.isError || !answer.data ? (
            <p className="m-0 text-base text-danger" role="alert">
              {paletteCopy.answerFailed}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="m-0 whitespace-pre-wrap text-base text-ink">{answer.data.text}</p>
              {answer.data.citations.length ? (
                <ul aria-label={paletteCopy.answerSources} className="m-0 flex list-none flex-col gap-1 p-0">
                  {answer.data.citations.map((citation) => (
                    <li key={citation.pageId}>
                      <a href={href({ name: "library-page", pageId: citation.pageId })} onClick={close} className="inline-flex items-center gap-2 text-sm font-semibold text-accent no-underline hover:text-accent-hover">
                        <BookOpen className="size-4" aria-hidden="true" />
                        {citation.title}
                        <span className="font-normal text-ink-muted">· {citation.shelf}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </section>
      ) : null}
      <div className="flex shrink-0 flex-wrap gap-x-5 gap-y-1 bg-surface-alt px-5 py-3.5 text-[13px] leading-5 text-ink-muted sm:px-8">
        <span role="status">{paletteCopy.footer.count(total)}</span>
        <span className="pointer-coarse:hidden">{paletteCopy.footer.move}</span>
        <span className="pointer-coarse:hidden">{paletteCopy.footer.open}</span>
        {highlightedEntry?.secondary ? <span className="pointer-coarse:hidden">{paletteCopy.footer.run}</span> : null}
        <span className="pointer-coarse:hidden">{paletteCopy.footer.close}</span>
      </div>
    </>
  );
}
