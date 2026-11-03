import type { KeyboardEvent } from "react";

import { isEditable } from "./shortcuts";

/**
 * Chords on a focused decision card (brief §4, DESIGN.md S6, T4): ⏎, esc and 1–9 belong to the card
 * element, never to the window. Shared by the cards on Vandaag, the Werk tab and in the chat.
 */
export type CardChords = {
  enter?: () => void;
  escape?: () => void;
  digit?: (n: number) => void;
};

/** A chord pressed this soon after focus arrived by script is a leftover of the previous answer. */
const SCRIPT_FOCUS_GRACE_MS = 300;

const scripted = new WeakMap<Element, number>();

/**
 * Move focus to a card by script (after an answer, focus follows to the next card). The card
 * remembers that the person did not put it there, until it loses focus or is pressed.
 */
export function focusCard(element: HTMLElement, options?: FocusOptions): void {
  scripted.set(element, Date.now());
  element.addEventListener("blur", () => scripted.delete(element), { once: true });
  element.focus(options);
}

/**
 * Inert while a field inside the card has focus, and a focused button or link keeps its own ⏎.
 * Radios let ⏎ through, so a choice made with ↑↓ can be sent without leaving it. A held key
 * (`event.repeat`) never answers, so one press cannot answer two cards in a row.
 */
export function cardKeys(chords: CardChords) {
  return (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target;
    if (event.metaKey || event.ctrlKey || event.altKey || isEditable(target)) return;
    if (target instanceof Element && target !== event.currentTarget && target.closest('button:not([role="radio"]), a, select, [role="menu"], [role="listbox"]')) return;
    if (event.repeat) return;
    const since = scripted.get(event.currentTarget);
    const fresh = since !== undefined && Date.now() - since < SCRIPT_FOCUS_GRACE_MS;
    if (event.key === "Enter" && chords.enter) {
      event.preventDefault();
      if (!fresh) chords.enter();
    } else if (event.key === "Escape" && chords.escape) {
      // Esc refuses or skips, and that cannot be undone (P8): it only counts once the person put
      // focus on the card themselves (Tab, a click), never while focus got there by script.
      if (since !== undefined) return;
      event.preventDefault();
      chords.escape();
    } else if (/^[1-9]$/.test(event.key) && chords.digit) {
      event.preventDefault();
      chords.digit(Number(event.key));
    }
  };
}

/** A press on the card is the person's own focus: esc counts from then on. */
export function ownCardFocus(event: { currentTarget: Element }): void {
  scripted.delete(event.currentTarget);
}
