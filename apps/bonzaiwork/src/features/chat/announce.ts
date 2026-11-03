import { useEffect, useRef, useState } from "react";

import type { ChatStatus, Message } from "~/backend/types";
import { copy } from "~/copy";
import { toolSentence } from "~/lib/tools";

/** At most one spoken step change per this many ms; an end state is spoken at once. */
const THROTTLE_MS = 5_000;

export type TurnPhase = { status: ChatStatus; decision: false | "permission" | "question" };

/** The last turn's tool steps (after the last question), in order. */
function lastTurnSteps(messages: readonly Message[]) {
  let start = messages.length;
  while (start > 0 && messages[start - 1]?.role === "assistant") start -= 1;
  return messages.slice(start).flatMap((message) => message.parts.flatMap((part) => (part.type === "tool" ? [part] : [])));
}

/**
 * The turn in one sentence for assistive tech: "Bezig: Leest prijslijst-2027.md", "Klaar · 2
 * stappen", "Wacht op jou: toestemming", "Mislukt: …". Null when there is nothing to say.
 */
export function turnSentence(phase: TurnPhase, messages: readonly Message[]): string | null {
  if (phase.decision === "permission") return copy.chat.announce.waitingPermission;
  if (phase.decision === "question") return copy.chat.announce.waitingQuestion;
  const steps = lastTurnSteps(messages);
  if (phase.status === "running") {
    const live = [...steps].reverse().find((step) => step.status === "running" || step.status === "pending");
    return copy.chat.announce.running(live ? toolSentence(live) : null);
  }
  if (phase.status === "waiting") return copy.chat.announce.waitingPermission;
  if (phase.status === "failed") {
    const error = [...messages].reverse().find((message) => message.error)?.error ?? null;
    return copy.attention.chatFailed.title(copy.attention.chatFailed.reason[error?.kind ?? "unknown"]);
  }
  return copy.chat.announce.done(steps.length);
}

/**
 * The sentence a polite live region should hold now. Opening a chat says nothing; while the turn
 * runs a changed step is spoken at most every five seconds; finishing, failing or stopping for a
 * decision is spoken at once (DESIGN.md V6 spirit: no chatter).
 */
export function useTurnAnnouncement(phase: TurnPhase, messages: readonly Message[]): string {
  const sentence = turnSentence(phase, messages);
  const [spoken, setSpoken] = useState("");
  const last = useRef<{ sentence: string | null; at: number; seenActive: boolean }>({ sentence, at: 0, seenActive: phase.status === "running" || phase.decision !== false });
  const urgent = phase.status !== "running" || phase.decision !== false;

  useEffect(() => {
    const state = last.current;
    if (sentence === state.sentence) return;
    const active = phase.status === "running" || phase.decision !== false;
    // An idle chat that was never seen working (just opened) has nothing to report.
    if (!active && !state.seenActive) {
      state.sentence = sentence;
      return;
    }
    state.seenActive = state.seenActive || active;
    const wait = urgent ? 0 : Math.max(0, state.at + THROTTLE_MS - Date.now());
    const timer = window.setTimeout(() => {
      state.sentence = sentence;
      state.at = Date.now();
      setSpoken(sentence ?? "");
    }, wait);
    return () => window.clearTimeout(timer);
  }, [sentence, urgent, phase.status, phase.decision]);

  return spoken;
}
