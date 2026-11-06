import { useCallback, useState } from "react";

import type { Chat, Message } from "~/backend/types";
import { readLocalJson, writeLocalJson } from "~/lib/storage";

/**
 * "Dit lijkt doorlopend werk met een doel": when a personal chat reads like client work, the Agent
 * suggests making it a project (design v2-Conversation). There is no backend signal for this yet,
 * so the page decides with a small heuristic over what the person wrote:
 *
 * - the chat is not archived (moved chats are done) and the person wrote at least twice
 *   (a single question is not ongoing work), and
 * - one of their messages names a client cue: a client, an offer, a contract, a ticket or a deadline.
 *
 * In the demo this flags "Onderhoud voor een bakkerij" (a contract, Lars van Dijk's request with a
 * HubSpot ticket and "voor maandag") and none of the admin chats. "Niet nu" is remembered per chat
 * on this device.
 */

const CLIENT_CUES = /\b(klant|klanten|opdrachtgever|offerte|offertes|contract|onderhoudscontract|ticket|deadline|voor maandag|voor vrijdag)\b/i;
const MIN_USER_MESSAGES = 2;
const DISMISSED_KEY = "bonzaiwork.agent.projectHint.dismissed";

function userText(message: Message): string {
  return message.parts.map((part) => (part.type === "text" ? part.text : "")).join(" ");
}

export function looksLikeProjectWork(chat: Pick<Chat, "archived">, messages: readonly Message[]): boolean {
  if (chat.archived) return false;
  const written = messages.filter((message) => message.role === "user").map(userText);
  if (written.length < MIN_USER_MESSAGES) return false;
  return written.some((text) => CLIENT_CUES.test(text));
}

function readDismissed(): string[] {
  const value = readLocalJson(DISMISSED_KEY);
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

/** Which chats the person answered "Niet nu" for, remembered in localStorage. */
export function useDismissedHints(): { isDismissed: (chatId: string) => boolean; dismiss: (chatId: string) => void } {
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const isDismissed = useCallback((chatId: string) => dismissed.includes(chatId), [dismissed]);
  const dismiss = useCallback((chatId: string) => {
    const next = [...readDismissed().filter((entry) => entry !== chatId), chatId].slice(-200);
    writeLocalJson(DISMISSED_KEY, next);
    setDismissed(next);
  }, []);
  return { isDismissed, dismiss };
}
