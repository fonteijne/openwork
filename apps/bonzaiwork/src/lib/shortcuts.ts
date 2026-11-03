import { copy } from "~/copy";

import { chordLabel, isMac } from "./platform";

/**
 * The one shortcuts table (brief §4, DESIGN.md S6): the window listener in the app shell, the
 * palette, tooltips, menus and the ⌘⇧/ sheet all read it. Single keys (⏎, esc, 1–9) are not here:
 * they belong to the focused card, never to the window.
 */

export type ProjectSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export const PROJECT_SLOTS: readonly ProjectSlot[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export type ShortcutId =
  | "home"
  | "search"
  | "newChat"
  | "newProject"
  | "switchProject"
  | "agenda"
  | "details"
  | "sidebar"
  | "settings"
  | "back"
  | "forward"
  | "shortcuts"
  | "seenAll"
  | `project${ProjectSlot}`;

export type Shortcut = {
  id: ShortcutId;
  label: string;
  /** `KeyboardEvent.code`: the physical key, so ⌘[ works on every layout. */
  code: string;
  /** The key as the chord shows it. */
  key: string;
  shift: boolean;
};

const define = (id: ShortcutId, label: string, code: string, key: string, shift = false): Shortcut => ({ id, label, code, key, shift });

export const SHORTCUTS: readonly Shortcut[] = [
  define("home", copy.shell.shortcuts.home, "Digit0", "0"),
  define("search", copy.shell.shortcuts.search, "KeyK", "K"),
  define("newChat", copy.shell.shortcuts.newChat, "KeyN", "N"),
  define("newProject", copy.shell.shortcuts.newProject, "KeyN", "N", true),
  define("switchProject", copy.shell.shortcuts.switchProject, "KeyP", "P", true),
  ...PROJECT_SLOTS.map((slot) => define(`project${slot}`, copy.shell.shortcuts.project(slot), `Digit${slot}`, String(slot))),
  define("agenda", copy.shell.shortcuts.agenda, "KeyJ", "J"),
  define("details", copy.shell.shortcuts.details, "Backslash", "\\"),
  define("sidebar", copy.shell.shortcuts.sidebar, "Slash", "/"),
  define("settings", copy.shell.shortcuts.settings, "Comma", ","),
  define("back", copy.shell.shortcuts.back, "BracketLeft", "["),
  define("forward", copy.shell.shortcuts.forward, "BracketRight", "]"),
  define("shortcuts", copy.shell.shortcuts.shortcuts, "Slash", "/", true),
  define("seenAll", copy.shell.shortcuts.seenAll, "KeyU", "U", true),
];

export function shortcut(id: ShortcutId): Shortcut {
  const found = SHORTCUTS.find((entry) => entry.id === id);
  if (!found) throw new Error(`Unknown shortcut: ${id}`);
  return found;
}

/** The chord as tooltips and menus show it: "⌘K", "Ctrl+Shift+N". */
export function chord(id: ShortcutId): string {
  const entry = shortcut(id);
  return chordLabel(entry.key, { shift: entry.shift });
}

type KeyLike = Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "code" | "key">;

/** The shortcut a keydown is, or null. Only the platform's own modifier counts: Ctrl on a Mac is not ⌘. */
export function matchShortcut(event: KeyLike): Shortcut | null {
  const mod = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!mod || event.altKey) return null;
  return (
    SHORTCUTS.find((entry) => entry.shift === event.shiftKey && (entry.code === event.code || (!entry.shift && event.key.toLowerCase() === entry.key.toLowerCase()))) ?? null
  );
}

/** Focus is in a field: single keys belong to it. Chords with a modifier still work. */
export function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

/** Focus is inside a dialog, menu or list popup: the window's chords stay out of the way. */
export function inOverlay(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]') !== null;
}

/** The page's composer takes focus (⌘N, "Nieuwe chat"): the page that owns a composer listens. */
export const FOCUS_COMPOSER_EVENT = "bonzaiwork:focus-composer";

export function focusComposer(delay = 30): void {
  window.setTimeout(() => window.dispatchEvent(new Event(FOCUS_COMPOSER_EVENT)), delay);
}

/** "Alles gezien" (⌘⇧U): the app shell fires it, the page that keeps `lastSeenAt` (Vandaag) listens. */
export const SEEN_ALL_EVENT = "bonzaiwork:seen-all";

/**
 * Text for the open composer ("Vraag hierover" on a result row, brief §6): the Composer that is
 * mounted appends it and takes focus. Nothing navigates (S5).
 */
export const INSERT_COMPOSER_TEXT_EVENT = "bonzaiwork:insert-composer-text";

export function insertComposerText(text: string): void {
  window.dispatchEvent(new CustomEvent<string>(INSERT_COMPOSER_TEXT_EVENT, { detail: text }));
}

/** The text an insert event carries, or null for any other event. */
export function insertedText(event: Event): string | null {
  return event instanceof CustomEvent && typeof event.detail === "string" ? event.detail : null;
}
