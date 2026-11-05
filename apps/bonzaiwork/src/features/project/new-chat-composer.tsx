import { useEffect, useRef, useState } from "react";

import { useBackend } from "~/backend/context";
import { startModel, useStatus } from "~/backend/queries";
import type { Project } from "~/backend/types";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { errorText } from "~/lib/errors";
import { navigate } from "~/lib/router";
import { FOCUS_COMPOSER_EVENT } from "~/lib/shortcuts";

import { chatBlocked } from "../chat/blocked";
import { Composer, type ComposerHandle, type ComposerSubmit } from "../chat/composer";
import { sendFirstMessage } from "../chat/first-message";

/**
 * The project's new-chat composer (the same one the old Werk tab had): sending creates a chat in
 * the project with the message already sent and opens it, so the answer streams in there (P11).
 * A send that fails keeps the words in that chat's composer.
 */
export function NewChatComposer(props: { project: Project; placeholder?: string; autoFocus?: boolean; size?: "default" | "large" }) {
  const backend = useBackend();
  const status = useStatus();
  const composer = useRef<ComposerHandle>(null);
  const [model, setModel] = useState<string | null>(null);
  const [agent, setAgent] = useState<string | null>(null);
  const { project } = props;
  const blocked = chatBlocked(status.data, project);
  const effectiveModel = model ?? startModel(status.data, project);

  // ⌘N and "focus the composer" land here while this page owns the composer.
  useEffect(() => {
    const focus = () => composer.current?.focus();
    window.addEventListener(FOCUS_COMPOSER_EVENT, focus);
    return () => window.removeEventListener(FOCUS_COMPOSER_EVENT, focus);
  }, []);

  const submit = async (input: ComposerSubmit): Promise<boolean> => {
    if (!effectiveModel) return false;
    try {
      const chat = await backend.chats.create(project.id, { model: effectiveModel });
      sendFirstMessage(backend, chat, { text: input.text, model: effectiveModel, agent, attachments: input.attachments, command: input.command, skills: input.skills });
      navigate({ name: "project", projectId: project.id, chatId: chat.id });
      return true;
    } catch (failure) {
      toast(`${copy.chat.newChatFailed} ${errorText(failure)}`, { tone: "error" });
      return false;
    }
  };

  return (
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
      placeholder={props.placeholder ?? copy.project.composerPlaceholder(project.name)}
      size={props.size ?? "default"}
      keepUntilSent
    />
  );
}
