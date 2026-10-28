import { useEffect, useMemo, useRef, useState } from "react";
import { KeyRound, PanelRight } from "lucide-react";

import { useBackend } from "~/backend/context";
import { projectHasKey, startModel, useComposerEntries, useStatus } from "~/backend/queries";
import type { Project } from "~/backend/types";
import { ProjectIcon } from "~/components/project-icon";
import { PageTitle, TopBar } from "~/components/top-bar";
import { Button } from "~/components/ui/button";
import { StatusDot } from "~/components/ui/misc";
import { Tooltip } from "~/components/ui/tooltip";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { errorText } from "~/lib/errors";
import { relativeTime } from "~/lib/format";
import { href, navigate } from "~/lib/router";
import { useMediaQuery, WIDE } from "~/lib/use-media";

import { useProjectState, useRuntime } from "../project/runtime";
import { FOCUS_COMPOSER_EVENT } from "../shell/sidebar";
import { useUi } from "../shell/ui-store";
import { Composer, type ComposerHandle, type ComposerSubmit } from "./composer";

/** C5: blocked is not an error. Neutral, with what to do and where. */
export function KeyBlocked(props: { projectId: string }) {
  const status = useStatus();
  const userMode = status.data?.keyMode === "user";
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
      <KeyRound className="size-4 shrink-0" />
      <span>{userMode ? copy.keys.userMissing : copy.keys.projectMissing}</span>
      <a
        className="font-medium text-foreground underline underline-offset-2"
        href={userMode ? href({ name: "settings" }) : href({ name: "project-settings", projectId: props.projectId, section: "key" })}
      >
        {copy.keys.link}
      </a>
    </span>
  );
}

function suggestionsFor(project: Project): string[] {
  return [
    `Vat samen wat er deze week in ${project.name} is gebeurd`,
    "Maak een planning voor de komende twee weken",
    "Zoek op het web wat concurrenten hierover schrijven",
  ];
}

/** A project with no chat open: the composer is the focal element (DESIGN.md P7). */
export function ProjectHome(props: { project: Project }) {
  const backend = useBackend();
  const runtime = useRuntime();
  const status = useStatus();
  const entries = useComposerEntries(props.project.id);
  const wide = useMediaQuery(WIDE);
  const toggleSidecar = useUi((state) => state.toggleSidecar);
  const setSidecarSheet = useUi((state) => state.setSidecarSheet);
  const sidecarPinned = useUi((state) => state.sidecarPinned);
  const chats = useProjectState((state) => state.chats);
  const composer = useRef<ComposerHandle>(null);
  const [model, setModel] = useState<string | null>(null);
  const [agent, setAgent] = useState<string | null>(null);
  const { project } = props;
  const hasKey = projectHasKey(status.data, project);
  const effectiveModel = model ?? startModel(status.data, project);

  useEffect(() => {
    const focus = () => composer.current?.focus();
    window.addEventListener(FOCUS_COMPOSER_EVENT, focus);
    return () => window.removeEventListener(FOCUS_COMPOSER_EVENT, focus);
  }, []);

  const recent = useMemo(
    () => Object.values(chats).filter((chat) => !chat.parentId && !chat.archived).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6),
    [chats],
  );
  const commands = (entries.data ?? []).filter((entry) => entry.kind === "command").slice(0, 3);

  const submit = async (input: ComposerSubmit): Promise<boolean> => {
    if (!effectiveModel) return false;
    try {
      const chat = await backend.chats.create(project.id, { model: effectiveModel });
      runtime.upsertChat(chat);
      runtime.addLocalMessage(chat.id, input.command ? `/${input.command} ${input.text}`.trim() : input.text, input.attachments);
      navigate({ name: "project", projectId: project.id, chatId: chat.id });
      void backend.chats
        .send(project.id, chat.id, { text: input.text, model: effectiveModel, agent, attachments: input.attachments, command: input.command, skills: input.skills })
        .catch((failure: unknown) => toast(`${copy.chat.sendFailed} ${errorText(failure)}`, { tone: "error" }));
      return true;
    } catch (failure) {
      toast(`${copy.chat.newChatFailed} ${errorText(failure)}`, { tone: "error" });
      return false;
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar
        actions={
          <Tooltip label={wide && sidecarPinned ? copy.chat.sidecarHide : copy.chat.sidecarShow}>
            <Button variant="quiet" size="icon" aria-label={wide && sidecarPinned ? copy.chat.sidecarHide : copy.chat.sidecarShow} onClick={() => (wide ? toggleSidecar() : setSidecarSheet(true))}>
              <PanelRight />
            </Button>
          </Tooltip>
        }
      >
        <ProjectIcon icon={project.icon} color={project.color} size="sm" className="lg:hidden" />
        <PageTitle>{project.name}</PageTitle>
      </TopBar>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 pt-[12vh] pb-10 sm:px-6">
          <h2 className="mb-6 text-center text-2xl font-medium tracking-tight text-foreground sm:text-[1.75rem] sm:leading-tight">{copy.chat.emptyTitle(project.name)}</h2>
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
            blocked={hasKey ? undefined : <KeyBlocked projectId={project.id} />}
            autoFocus
            size="large"
          />
          {hasKey ? (
            <div className="mt-4 flex flex-wrap justify-center gap-2" aria-label={copy.chat.suggestions}>
              {commands.map((command) => (
                <Button key={command.name} variant="secondary" size="sm" className="rounded-full" onClick={() => composer.current?.setText(`/${command.name}`)}>
                  /{command.name}
                </Button>
              ))}
              {suggestionsFor(project)
                .slice(0, commands.length ? 2 : 3)
                .map((suggestion) => (
                  <Button key={suggestion} variant="secondary" size="sm" className="h-auto min-h-7 max-w-full rounded-full py-1 text-start whitespace-normal" onClick={() => composer.current?.setText(suggestion)}>
                    {suggestion}
                  </Button>
                ))}
            </div>
          ) : null}

          {recent.length ? (
            <section className="mt-10 lg:hidden" aria-label={copy.chatList.recent}>
              <h3 className="mb-1 text-xs font-medium text-subtle-foreground">{copy.chatList.recent}</h3>
              <ul className="border-t border-border">
                {recent.map((chat) => (
                  <li key={chat.id} className="border-b border-border last:border-b-0">
                    <a href={href({ name: "project", projectId: project.id, chatId: chat.id })} className="flex min-h-12 items-center gap-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate text-foreground">{chat.untitled ? copy.chat.untitled : chat.title}</span>
                      <StatusDot status={chat.status} />
                      <span className="shrink-0 text-xs text-subtle-foreground">{relativeTime(chat.updatedAt)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
}
