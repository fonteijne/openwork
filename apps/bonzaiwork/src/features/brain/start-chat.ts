import { useBackend } from "~/backend/context";
import { startModel, useProject, useStatus } from "~/backend/queries";
import { navigate } from "~/lib/router";

import { useRuntime } from "../project/runtime";

/**
 * A new chat that starts with a fixed instruction from BonzaiWork (merging
 * versions, a workflow stage, a check), the way the composer starts one.
 */
export function useStartChat(projectId: string) {
  const backend = useBackend();
  const runtime = useRuntime();
  const status = useStatus();
  const { project } = useProject(projectId);
  return async (start: { title: string; prompt: string }): Promise<void> => {
    const model = startModel(status.data, project);
    if (!model) return;
    const chat = await backend.chats.create(projectId, start.title ? { model, title: start.title } : { model });
    runtime.upsertChat(chat);
    runtime.addLocalMessage(chat.id, start.prompt, []);
    navigate({ name: "project", projectId, chatId: chat.id });
    await backend.chats.send(projectId, chat.id, { text: start.prompt, model, agent: null, attachments: [], command: null, skills: [] });
  };
}
