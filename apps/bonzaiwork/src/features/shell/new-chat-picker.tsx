import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { FolderPlus } from "lucide-react";

import { useBackend } from "~/backend/context";
import { projectHasKey, useStatus } from "~/backend/queries";
import type { Project } from "~/backend/types";
import { ProjectIcon } from "~/components/project-icon";
import { Button } from "~/components/ui/button";
import { StatusChip } from "~/components/ui/chip";
import { Command, CommandFooter, CommandGroup, CommandInput, CommandItem, CommandList } from "~/components/ui/command";
import { Kbd, KbdRow, type KbdHint } from "~/components/ui/misc";
import { copy } from "~/copy";
import { defaultProjectId } from "~/features/home/model";
import { chordLabel } from "~/lib/platform";
import { navigate } from "~/lib/router";
import { chord } from "~/lib/shortcuts";

import { focusComposerWhenReady } from "../projects/project-form";
import { useSidebarProjects } from "../projects/use-listed-projects";
import { MAX_ROW_CHORDS, pickerProjects, rowForDigit } from "./new-chat-model";
import { useUi } from "./ui-store";

const HINTS: readonly KbdHint[] = [
  { keys: "↑↓", label: copy.newChat.hints.navigate },
  { keys: "⏎", label: copy.palette.hints.choose },
  { keys: "esc", label: copy.palette.hints.close },
];

/**
 * ⌘N: where does the new chat start? One list of projects over a dimmed page; ⏎ opens that
 * project's empty chat with the composer focused (DESIGN.md S6, P5). The current project is the
 * first row, so ⌘N ⏎ starts a chat where the person already is; ⌘1…⌘9 choose a row by position.
 * A project without a key stays listed with its word (P4): its Werk tab says how to link one.
 */
export function NewChatPicker(props: { projectId: string | null }) {
  const backend = useBackend();
  const open = useUi((state) => state.newChatOpen);
  const setOpen = useUi((state) => state.setNewChat);
  const setNewProject = useUi((state) => state.setNewProject);
  const lastProjectId = useUi((state) => state.lastProjectId);
  const rememberProject = useUi((state) => state.rememberProject);
  const status = useStatus();
  const { projects } = useSidebarProjects();
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlighted(null);
    }
  }, [open]);

  // The open project when it is listed, else the one the person worked in last.
  const currentId = props.projectId && projects.some((project) => project.id === props.projectId) ? props.projectId : defaultProjectId(lastProjectId, projects);
  const rows = useMemo(() => pickerProjects(projects, currentId, query), [projects, currentId, query]);
  const readOnly = status.data?.readOnly ?? false;

  const choose = (project: Project) => {
    setOpen(false);
    rememberProject(project.id);
    if (backend.capabilities.agenda) void backend.agenda.reportPresence({ projectId: project.id, name: project.name });
    navigate({ name: "project", projectId: project.id, chatId: null });
    // After the dialog has closed and handed focus back, so the composer keeps it.
    focusComposerWhenReady();
  };

  const newProject = () => {
    setOpen(false);
    setNewProject(true);
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && !event.altKey && !event.shiftKey) {
      const row = rowForDigit(event.code, rows);
      if (row) {
        event.preventDefault();
        choose(row);
      }
      return;
    }
    // Before ↓ or typing no row is highlighted: ⏎ takes the first one (the current project).
    const first = rows[0];
    if (event.key === "Enter" && !highlighted && first) {
      event.preventDefault();
      choose(first);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(value) => setOpen(value)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-backdrop" />
        {/* No entrance animation: a high-frequency surface (V6), like the palette. */}
        <DialogPrimitive.Popup
          initialFocus={input}
          data-testid="new-chat-picker"
          className="fixed inset-x-3 top-[10vh] z-50 mx-auto flex max-h-[min(70vh,34rem)] max-w-2xl flex-col overflow-hidden rounded-window bg-popover text-popover-foreground shadow-shell outline-none"
        >
          <DialogPrimitive.Title className="sr-only">{copy.newChat.title}</DialogPrimitive.Title>
          <Command query={query} onQueryChange={setQuery} onHighlight={setHighlighted} className="min-h-0 flex-1">
            <CommandInput ref={input} placeholder={copy.newChat.placeholder} label={copy.newChat.title} onKeyDown={onInputKeyDown} />
            <CommandList aria-label={copy.newChat.title}>
              {rows.length ? (
                <CommandGroup label={copy.newChat.group}>
                  {rows.map((project, index) => (
                    <CommandItem
                      key={project.id}
                      value={project.id}
                      onSelect={() => choose(project)}
                      icon={<ProjectIcon icon={project.icon} color={project.color} size="md" />}
                      detail={project.id === currentId ? (project.description ? `${copy.newChat.current} · ${project.description}` : copy.newChat.current) : project.description}
                      meta={projectHasKey(status.data, project) ? null : <StatusChip status="locked" label={copy.shell.status.locked} className="text-[11px]" />}
                      trailing={index < MAX_ROW_CHORDS ? <Kbd className="text-subtle-foreground pointer-coarse:hidden">{chordLabel(String(index + 1))}</Kbd> : null}
                      className="min-h-11"
                    >
                      {project.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </CommandList>
            {rows.length === 0 ? (
              // What happened and what to do next (C6): the button is reached with tab or the pointer.
              <CommandFooter className="flex flex-wrap items-center justify-between gap-3 px-4 pb-4">
                <p className="text-sm text-muted-foreground" role="status">
                  {projects.length ? copy.newChat.noMatch : copy.newChat.noProjects}
                </p>
                {readOnly ? null : (
                  <Button variant="secondary" size="sm" className="gap-1.5" onClick={newProject} data-testid="new-chat-new-project">
                    <FolderPlus />
                    {copy.shell.newProject}
                    <Kbd className="text-subtle-foreground pointer-coarse:hidden">{chord("newProject")}</Kbd>
                  </Button>
                )}
              </CommandFooter>
            ) : null}
          </Command>
          <div className="flex h-9 shrink-0 items-center border-t border-border px-4 pointer-coarse:hidden">
            <KbdRow hints={HINTS} />
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
