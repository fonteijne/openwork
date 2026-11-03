import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, KeyRound } from "lucide-react";

import { useBackend } from "~/backend/context";
import { hasNoModels, projectHasKey, startModel, useStatus } from "~/backend/queries";
import type { Project } from "~/backend/types";
import { ProjectIcon } from "~/components/project-icon";
import { Button } from "~/components/ui/button";
import { StatusChip } from "~/components/ui/chip";
import { Popover, PopoverClose } from "~/components/ui/popover";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { href, navigate } from "~/lib/router";
import { FOCUS_COMPOSER_EVENT } from "~/lib/shortcuts";

import { ModelsBlocked } from "../chat/blocked";
import { Composer, type ComposerHandle, type ComposerSubmit } from "../chat/composer";
import { useUi } from "../shell/ui-store";
import { defaultProjectId } from "./model";

/**
 * The project pill in front of the composer (brief §5): a tile in the project's color and its
 * name; a Popover with project tiles to switch (S7). A project without a key stays listed with a
 * lock and its word, never hidden (P4, C5).
 */
function ProjectPill(props: { projects: readonly Project[]; selected: Project; onSelect: (projectId: string) => void }) {
  const status = useStatus();
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label={copy.home.chooseProject}
      trigger={
        <Button variant="quiet" size="sm" className="max-w-[14rem] gap-1.5 ps-1.5 text-foreground" aria-label={`${copy.home.chooseProject}: ${props.selected.name}`} data-testid="home-project-pill">
          <ProjectIcon icon={props.selected.icon} color={props.selected.color} size="sm" />
          <span className="truncate">{props.selected.name}</span>
          <ChevronDown className="size-3.5! text-subtle-foreground" />
        </Button>
      }
    >
      <ul className="flex w-72 flex-col" aria-label={copy.home.chooseProject}>
        {props.projects.map((project) => {
          const locked = !projectHasKey(status.data, project);
          const current = project.id === props.selected.id;
          return (
            <li key={project.id}>
              <PopoverClose
                render={
                  <button
                    type="button"
                    aria-current={current ? "true" : undefined}
                    onClick={() => props.onSelect(project.id)}
                    className={cn(
                      "flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-start text-sm outline-none transition-colors duration-100 hover:bg-hover focus-visible:bg-hover pointer-coarse:min-h-11",
                      current && "font-semibold",
                    )}
                  />
                }
              >
                <ProjectIcon icon={project.icon} color={project.color} size="md" />
                <span className="min-w-0 flex-1 truncate text-foreground">{project.name}</span>
                {locked ? <StatusChip status="locked" label={copy.shell.status.locked} /> : null}
                {current ? <Check aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /> : null}
              </PopoverClose>
            </li>
          );
        })}
      </ul>
    </Popover>
  );
}

/** The one row under a locked composer: why, and where to fix it (P4, C5, C6). */
function KeyRow(props: { project: Project }) {
  const status = useStatus();
  const userMode = status.data?.keyMode === "user";
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
      <KeyRound className="size-4 shrink-0" aria-hidden="true" />
      <span>{userMode ? copy.keys.userMissing : copy.home.keyLocked}</span>
      <a className="font-medium text-foreground underline underline-offset-2" href={userMode ? href({ name: "settings", group: "toegang" }) : href({ name: "project-settings", projectId: props.project.id, group: "toegang" })}>
        {copy.home.linkKey}
      </a>
    </span>
  );
}

/**
 * The composer of Vandaag (brief §5): starts work in any project. ⏎ creates the chat, sends the
 * message and opens the chat with the message already on its way (P11: the person's words stay in
 * the composer until the chat exists).
 */
export function HomeComposer(props: { projects: readonly Project[]; size: "default" | "large"; autoFocus: boolean; className?: string }) {
  const backend = useBackend();
  const status = useStatus();
  const lastProjectId = useUi((state) => state.lastProjectId);
  const rememberProject = useUi((state) => state.rememberProject);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [agent, setAgent] = useState<string | null>(null);
  const composer = useRef<ComposerHandle>(null);

  const projectId = chosenId && props.projects.some((project) => project.id === chosenId) ? chosenId : defaultProjectId(lastProjectId, props.projects);
  const project = props.projects.find((entry) => entry.id === projectId) ?? null;

  useEffect(() => {
    const focus = () => composer.current?.focus();
    window.addEventListener(FOCUS_COMPOSER_EVENT, focus);
    return () => window.removeEventListener(FOCUS_COMPOSER_EVENT, focus);
  }, []);

  if (!project) return null;

  const effectiveModel = model ?? startModel(status.data, project);
  const blocked = !projectHasKey(status.data, project) ? <KeyRow project={project} /> : hasNoModels(status.data, project) ? <ModelsBlocked projectId={project.id} /> : undefined;

  const select = (id: string) => {
    setChosenId(id);
    setModel(null);
    setAgent(null);
    rememberProject(id);
    composer.current?.focus();
  };

  const submit = async (input: ComposerSubmit): Promise<boolean> => {
    if (!effectiveModel) return false;
    try {
      const chat = await backend.chats.create(project.id, { model: effectiveModel });
      // The chat is the person's object (P11): it opens at once, the message arrives in it.
      void backend.chats
        .send(project.id, chat.id, { text: input.text, model: effectiveModel, agent, attachments: input.attachments, command: input.command, skills: input.skills })
        .catch((failure: unknown) => toast(`${copy.chat.sendFailed} ${errorText(failure)}`, { tone: "error" }));
      rememberProject(project.id);
      if (backend.capabilities.agenda) void backend.agenda.reportPresence({ projectId: project.id, name: project.name });
      navigate({ name: "project", projectId: project.id, chatId: chat.id });
      return true;
    } catch (failure) {
      toast(`${copy.home.startFailed} ${errorText(failure)}`, { tone: "error" });
      return false;
    }
  };

  return (
    <div className={props.className} data-testid="home-composer">
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
        autoFocus={props.autoFocus}
        size={props.size}
        placeholder={copy.home.composerPlaceholder}
        keepUntilSent
        leading={<ProjectPill projects={props.projects} selected={project} onSelect={select} />}
      />
    </div>
  );
}
