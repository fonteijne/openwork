import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { CalendarClock, FolderPlus, LayoutGrid, Megaphone, MessageSquare, MessageSquarePlus, Moon, Search, Settings } from "lucide-react";

import { useProjects } from "~/backend/queries";
import { ProjectIcon } from "~/components/project-icon";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { navigate, type Route } from "~/lib/router";
import { setTheme } from "~/lib/theme";

import { useOptionalRuntime } from "../project/runtime";
import { FOCUS_COMPOSER_EVENT } from "./sidebar";
import { useUi } from "./ui-store";

type Entry = { id: string; group: string; label: string; hint?: string; icon: ReactNode; run: () => void };

function useChatEntries(projectId: string | null): Entry[] {
  const runtime = useOptionalRuntime();
  const [chats, setChats] = useState(() => (runtime ? Object.values(runtime.store.getState().chats) : []));
  useEffect(() => {
    if (!runtime) {
      setChats([]);
      return;
    }
    setChats(Object.values(runtime.store.getState().chats));
    return runtime.store.subscribe((state) => setChats(Object.values(state.chats)));
  }, [runtime]);
  return chats
    .filter((chat) => !chat.parentId && projectId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((chat) => ({
      id: `chat-${chat.id}`,
      group: copy.palette.chats,
      label: chat.untitled ? copy.chat.untitled : chat.title,
      icon: <MessageSquare />,
      run: () => navigate({ name: "project", projectId: chat.projectId, chatId: chat.id }),
    }));
}

/** ⌘K: jump to any project, chat or action (DESIGN.md S6). */
export function CommandPalette(props: { route: Route; projectId: string | null }) {
  const open = useUi((state) => state.paletteOpen);
  const setOpen = useUi((state) => state.setPalette);
  const setNewProject = useUi((state) => state.setNewProject);
  const setFeedback = useUi((state) => state.setFeedback);
  const projects = useProjects();
  const chatEntries = useChatEntries(props.projectId);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(0);
    }
  }, [open]);

  const entries = useMemo<Entry[]>(() => {
    const actions: Entry[] = [
      ...(props.projectId
        ? [
            {
              id: "new-chat",
              group: copy.palette.actions,
              label: copy.palette.newChat,
              icon: <MessageSquarePlus />,
              run: () => {
                navigate({ name: "project", projectId: props.projectId ?? "", chatId: null });
                window.setTimeout(() => window.dispatchEvent(new Event(FOCUS_COMPOSER_EVENT)), 60);
              },
            },
          ]
        : []),
      { id: "new-project", group: copy.palette.actions, label: copy.palette.newProject, icon: <FolderPlus />, run: () => setNewProject(true) },
      { id: "go-projects", group: copy.palette.actions, label: copy.palette.goProjects, icon: <LayoutGrid />, run: () => navigate({ name: "projects" }) },
      { id: "go-routines", group: copy.palette.actions, label: copy.palette.goRoutines, icon: <CalendarClock />, run: () => navigate({ name: "routines", routineId: null }) },
      { id: "go-settings", group: copy.palette.actions, label: copy.palette.goSettings, icon: <Settings />, run: () => navigate({ name: "settings" }) },
      { id: "feedback", group: copy.palette.actions, label: copy.palette.feedback, icon: <Megaphone />, run: () => setFeedback(true) },
      {
        id: "theme",
        group: copy.palette.actions,
        label: copy.palette.toggleTheme,
        icon: <Moon />,
        run: () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"),
      },
    ];
    const projectEntries: Entry[] = (projects.data ?? [])
      .filter((project) => !project.archivedAt)
      .map((project) => ({
        id: `project-${project.id}`,
        group: copy.palette.projects,
        label: project.name,
        hint: project.description ?? undefined,
        icon: <ProjectIcon icon={project.icon} color={project.color} size="sm" />,
        run: () => navigate({ name: "project", projectId: project.id, chatId: null }),
      }));
    const all = [...chatEntries, ...projectEntries, ...actions];
    const needle = query.trim().toLowerCase();
    if (!needle) return [...chatEntries.slice(0, 5), ...projectEntries, ...actions];
    return all.filter((entry) => entry.label.toLowerCase().includes(needle) || entry.hint?.toLowerCase().includes(needle)).slice(0, 30);
  }, [projects.data, chatEntries, query, props.projectId, setNewProject, setFeedback]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${highlight}"]`)?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  const choose = (entry: Entry | undefined) => {
    if (!entry) return;
    setOpen(false);
    entry.run();
  };

  let lastGroup = "";
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(value) => setOpen(value)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-backdrop" />
        <DialogPrimitive.Popup className="fixed inset-x-3 top-[10vh] z-50 mx-auto flex max-h-[70vh] max-w-xl flex-col overflow-hidden rounded-window bg-popover text-popover-foreground shadow-shell outline-none">
          <DialogPrimitive.Title className="sr-only">{copy.nav.search}</DialogPrimitive.Title>
          <div className="flex items-center gap-2.5 border-b border-border px-4">
            <Search className="size-4 shrink-0 text-subtle-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setHighlight(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  if (!entries.length) return;
                  setHighlight((current) => (current + (event.key === "ArrowDown" ? 1 : entries.length - 1)) % entries.length);
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  choose(entries[highlight]);
                }
              }}
              placeholder={copy.palette.placeholder}
              aria-label={copy.palette.placeholder}
              role="combobox"
              aria-expanded="true"
              aria-controls="palette-list"
              aria-activedescendant={entries[highlight] ? `palette-${entries[highlight]?.id}` : undefined}
              className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-subtle-foreground max-sm:text-[16px]"
            />
          </div>
          <ul ref={list} id="palette-list" role="listbox" className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {entries.length === 0 ? <li className="px-3 py-6 text-center text-sm text-muted-foreground">{copy.palette.empty}</li> : null}
            {entries.map((entry, index) => {
              const header = entry.group !== lastGroup ? entry.group : null;
              lastGroup = entry.group;
              return (
                <li key={entry.id} role="presentation">
                  {header ? <p className="px-2.5 pt-2 pb-1 text-xs text-subtle-foreground">{header}</p> : null}
                  <div
                    id={`palette-${entry.id}`}
                    role="option"
                    aria-selected={index === highlight}
                    data-index={index}
                    onMouseMove={() => setHighlight(index)}
                    onClick={() => choose(entry)}
                    className={cn("flex min-h-9 cursor-default items-center gap-2.5 rounded-md px-2.5 text-sm [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground pointer-coarse:min-h-11", index === highlight && "bg-hover")}
                  >
                    {entry.icon}
                    <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                    {entry.hint ? <span className="max-w-[40%] truncate text-xs text-subtle-foreground">{entry.hint}</span> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
