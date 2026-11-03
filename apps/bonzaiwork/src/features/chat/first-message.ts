import type { Backend, Chat, SendInput } from "~/backend/types";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { errorText } from "~/lib/errors";
import { writeLocal } from "~/lib/storage";

import { projectRuntime } from "../project/store";

/** The composer of a chat re-reads its draft when this fires for it (a first message came back). */
export const DRAFT_RESTORED_EVENT = "bonzaiwork:draft-restored";
export type DraftRestored = { projectId: string; chatId: string };

export function draftKey(projectId: string, chatId: string | null): string {
  return `bonzaiwork.draft.${projectId}.${chatId ?? "nieuw"}`;
}

/**
 * The first message of a chat made outside its page (Vandaag, "Boek in een chat"): the chat and
 * the message are in the project's store before the page opens, so it never shows empty (P11),
 * and a send that fails keeps the person's words: the text goes back into that chat's composer
 * and the toast offers "Opnieuw" with the same attachments.
 */
export function sendFirstMessage(backend: Backend, chat: Chat, input: SendInput): void {
  const runtime = projectRuntime(backend, chat.projectId);
  runtime.upsertChat(chat);
  const shown = input.command ? `/${input.command} ${input.text}`.trim() : input.text;
  const files = input.attachments.map((attachment) => ({ name: attachment.name, mime: attachment.mime }));

  const attempt = () => {
    const localId = runtime.addLocalMessage(chat.id, shown, files);
    const restore = (text: string | null) => {
      writeLocal(draftKey(chat.projectId, chat.id), text);
      const detail: DraftRestored = { projectId: chat.projectId, chatId: chat.id };
      window.dispatchEvent(new CustomEvent(DRAFT_RESTORED_EVENT, { detail }));
    };
    let restored = false;
    backend.chats.send(chat.projectId, chat.id, input).then(
      // A retry that lands takes the words back out of the composer.
      () => (restored ? restore(null) : undefined),
      (failure: unknown) => {
        runtime.removeLocalMessage(chat.id, localId);
        if (shown.trim()) {
          restore(shown);
          restored = true;
        }
        toast(`${copy.chat.sendFailed} ${errorText(failure)}`, { tone: "error", action: { label: copy.chat.resend, onClick: attempt } });
      },
    );
  };
  attempt();
}
