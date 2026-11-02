import { create } from "zustand";

import { readLocal, writeLocal } from "~/lib/storage";
import { WIDE } from "~/lib/use-media";

/** App-level UI state that is not data: drawers, dialogs, panel preferences. */
type UiState = {
  drawerOpen: boolean;
  paletteOpen: boolean;
  newProjectOpen: boolean;
  feedbackOpen: boolean;
  /** Desktop sidecar column, remembered per device. */
  sidecarPinned: boolean;
  /** The sidecar as a sheet on smaller screens. */
  sidecarSheetOpen: boolean;
  /** A project file the sidecar shows instead of its details. */
  sidecarFile: SidecarFile | null;
  /** The agenda panel is shown: as an overlay, or as a column when pinned on a wide screen. */
  agendaOpen: boolean;
  /** The agenda opens as a column of its own on wide screens; remembered per device. */
  agendaPinned: boolean;
  setDrawer(open: boolean): void;
  setPalette(open: boolean): void;
  setNewProject(open: boolean): void;
  setFeedback(open: boolean): void;
  toggleSidecar(): void;
  setSidecarSheet(open: boolean): void;
  /** Show a file in the sidecar: the column when `wide`, the sheet otherwise. */
  openSidecarFile(file: SidecarFile, wide: boolean): void;
  closeSidecarFile(): void;
  /** Open or close the agenda; `wide`: whether a pinned agenda is a column now. */
  setAgenda(open: boolean, wide: boolean): void;
  toggleAgenda(wide: boolean): void;
  setAgendaPinned(pinned: boolean, wide: boolean): void;
};

export type SidecarFile = { projectId: string; chatId: string | null; path: string };

/** `bonzaiwork.agenda`: "open" (a pinned column that is shown), "pinned" (hidden), nothing (overlay). */
const AGENDA_KEY = "bonzaiwork.agenda";
const storedAgenda = readLocal(AGENDA_KEY);
const wideNow = () => typeof window !== "undefined" && window.matchMedia(WIDE).matches;

function rememberAgenda(pinned: boolean, open: boolean) {
  writeLocal(AGENDA_KEY, pinned ? (open ? "open" : "pinned") : null);
}

/**
 * Where focus was when the person opened the agenda (click or shortcut), so closing puts it back.
 * Not state: nothing renders from it.
 */
let agendaReturnFocus: HTMLElement | null = null;
export function takeAgendaReturnFocus(): HTMLElement | null {
  const element = agendaReturnFocus;
  agendaReturnFocus = null;
  return element;
}
export const peekAgendaReturnFocus = () => agendaReturnFocus;

export const useUi = create<UiState>((set, get) => {
  /** Showing the sidecar column hides an agenda column; the agenda stays pinned for next time. */
  const collapseAgendaColumn = (sidecarShown: boolean): Partial<UiState> => {
    const { agendaOpen, agendaPinned } = get();
    if (!sidecarShown || !agendaOpen || !agendaPinned) return {};
    rememberAgenda(true, false);
    return { agendaOpen: false };
  };
  return {
  drawerOpen: false,
  paletteOpen: false,
  newProjectOpen: false,
  feedbackOpen: false,
  sidecarPinned: readLocal("bonzaiwork.sidecar") !== "closed",
  sidecarSheetOpen: false,
  sidecarFile: null,
  // A pinned column comes back after a restart; an overlay never opens by itself (plan §7.6).
  agendaOpen: storedAgenda === "open" && wideNow(),
  agendaPinned: storedAgenda === "open" || storedAgenda === "pinned",
  setDrawer: (open) => set({ drawerOpen: open }),
  setPalette: (open) => set({ paletteOpen: open }),
  setNewProject: (open) => set({ newProjectOpen: open, drawerOpen: false }),
  setFeedback: (open) => set({ feedbackOpen: open, drawerOpen: false, paletteOpen: false }),
  toggleSidecar: () => {
    const next = !get().sidecarPinned;
    writeLocal("bonzaiwork.sidecar", next ? null : "closed");
    set({ sidecarPinned: next, ...collapseAgendaColumn(next) });
  },
  setSidecarSheet: (open) => set({ sidecarSheetOpen: open }),
  openSidecarFile: (file, wide) => {
    if (!wide) {
      set({ sidecarFile: file, sidecarSheetOpen: true });
      return;
    }
    if (!get().sidecarPinned) writeLocal("bonzaiwork.sidecar", null);
    set({ sidecarFile: file, sidecarPinned: true, ...collapseAgendaColumn(true) });
  },
  closeSidecarFile: () => set({ sidecarFile: null }),
  setAgenda: (open, wide) => {
    const { agendaOpen, agendaPinned, sidecarPinned } = get();
    if (open === agendaOpen) return;
    if (open && typeof document !== "undefined" && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) agendaReturnFocus = document.activeElement;
    if (agendaPinned) rememberAgenda(true, open);
    // Two columns do not fit next to a chat: the one opened last wins (plan §7.2).
    const column = open && agendaPinned && wide;
    if (column && sidecarPinned) writeLocal("bonzaiwork.sidecar", "closed");
    set({ agendaOpen: open, ...(column ? { sidecarPinned: false } : {}) });
  },
  toggleAgenda: (wide) => get().setAgenda(!get().agendaOpen, wide),
  setAgendaPinned: (pinned, wide) => {
    const { agendaOpen, sidecarPinned } = get();
    rememberAgenda(pinned, agendaOpen);
    const column = agendaOpen && pinned && wide;
    if (column && sidecarPinned) writeLocal("bonzaiwork.sidecar", "closed");
    set({ agendaPinned: pinned, ...(column ? { sidecarPinned: false } : {}) });
  },
};
});
