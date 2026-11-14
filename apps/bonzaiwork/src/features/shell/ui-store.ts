import { create } from "zustand";

import { readLocal, writeLocal } from "~/lib/storage";
import { WIDE } from "~/lib/use-media";

/** App-level UI state that is not data: drawers, dialogs, panel preferences. */
type UiState = {
  drawerOpen: boolean;
  paletteOpen: boolean;
  newProjectOpen: boolean;
  /** The ⌘N picker: which project the new chat starts in. */
  newChatOpen: boolean;
  feedbackOpen: boolean;
  /** The ⌘⇧/ sheet with the shortcuts table. */
  shortcutsOpen: boolean;
  /** The project switcher menu in the project header (⌘⇧P). */
  switcherOpen: boolean;
  /** The sidebar column is hidden on desktop (⌘/), remembered per device. */
  sidebarCollapsed: boolean;
  /** A project row the person opened by hand in the sidebar, next to the open project (one at a time). */
  expandedProjectId: string | null;
  /** The project the person worked in last; the home composer starts there. */
  lastProjectId: string | null;
  /** Desktop sidecar column, remembered per device. */
  sidecarPinned: boolean;
  /** The sidecar as a sheet (phones) or a non-modal panel (1024–1279) on smaller screens. */
  sidecarSheetOpen: boolean;
  /** The agenda panel is shown: as an overlay, or as a column when pinned on a wide screen. */
  agendaOpen: boolean;
  /** The agenda opens as a column of its own on wide screens; remembered per device. */
  agendaPinned: boolean;
  setDrawer(open: boolean): void;
  setPalette(open: boolean): void;
  setNewProject(open: boolean): void;
  setNewChat(open: boolean): void;
  setFeedback(open: boolean): void;
  setShortcuts(open: boolean): void;
  setSwitcher(open: boolean): void;
  toggleSidebar(): void;
  setExpandedProject(projectId: string | null): void;
  rememberProject(projectId: string): void;
  toggleSidecar(): void;
  setSidecarSheet(open: boolean): void;
  /** ⌘\ and the "Details" button: the column on a wide screen, the panel or sheet otherwise. */
  toggleDetails(wide: boolean): void;
  /** Make sure the Details surface is shown: the column when `wide`, the sheet otherwise (a file opens in it). */
  showDetails(wide: boolean): void;
  /** Open or close the agenda; `wide`: whether a pinned agenda is a column now. */
  setAgenda(open: boolean, wide: boolean): void;
  toggleAgenda(wide: boolean): void;
  setAgendaPinned(pinned: boolean, wide: boolean): void;
};

/** A project file open in the Details column; the path lives in the hash (`?bestand=`, features/chat/file-link.tsx). */
export type SidecarFile = { projectId: string; chatId: string | null; path: string };

/** `bonzaiwork.agenda`: "open" (a pinned column that is shown), "pinned" (hidden), nothing (overlay). */
const AGENDA_KEY = "bonzaiwork.agenda";
const SIDEBAR_KEY = "bonzaiwork.sidebar";
const EXPANDED_KEY = "bonzaiwork.expandedProject";
const LAST_PROJECT_KEY = "bonzaiwork.lastProject";
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
    newChatOpen: false,
    feedbackOpen: false,
    shortcutsOpen: false,
    switcherOpen: false,
    sidebarCollapsed: readLocal(SIDEBAR_KEY) === "collapsed",
    expandedProjectId: readLocal(EXPANDED_KEY),
    lastProjectId: readLocal(LAST_PROJECT_KEY),
    sidecarPinned: readLocal("bonzaiwork.sidecar") !== "closed",
    sidecarSheetOpen: false,
    // A pinned column comes back after a restart; an overlay never opens by itself (plan §7.6).
    agendaOpen: storedAgenda === "open" && wideNow(),
    agendaPinned: storedAgenda === "open" || storedAgenda === "pinned",
    setDrawer: (open) => set({ drawerOpen: open }),
    setPalette: (open) => set({ paletteOpen: open }),
    setNewProject: (open) => set({ newProjectOpen: open, drawerOpen: false }),
    setNewChat: (open) => set({ newChatOpen: open, drawerOpen: false, paletteOpen: false }),
    setFeedback: (open) => set({ feedbackOpen: open, drawerOpen: false, paletteOpen: false }),
    setShortcuts: (open) => set({ shortcutsOpen: open, drawerOpen: false, paletteOpen: false }),
    setSwitcher: (open) => set({ switcherOpen: open }),
    toggleSidebar: () => {
      const next = !get().sidebarCollapsed;
      writeLocal(SIDEBAR_KEY, next ? "collapsed" : null);
      set({ sidebarCollapsed: next });
    },
    setExpandedProject: (projectId) => {
      writeLocal(EXPANDED_KEY, projectId);
      set({ expandedProjectId: projectId });
    },
    rememberProject: (projectId) => {
      if (get().lastProjectId === projectId) return;
      writeLocal(LAST_PROJECT_KEY, projectId);
      set({ lastProjectId: projectId });
    },
    toggleSidecar: () => {
      const next = !get().sidecarPinned;
      writeLocal("bonzaiwork.sidecar", next ? null : "closed");
      set({ sidecarPinned: next, ...collapseAgendaColumn(next) });
    },
    setSidecarSheet: (open) => set({ sidecarSheetOpen: open }),
    toggleDetails: (wide) => {
      if (wide) get().toggleSidecar();
      else set({ sidecarSheetOpen: !get().sidecarSheetOpen });
    },
    showDetails: (wide) => {
      if (!wide) {
        set({ sidecarSheetOpen: true });
        return;
      }
      if (!get().sidecarPinned) writeLocal("bonzaiwork.sidecar", null);
      set({ sidecarPinned: true, ...collapseAgendaColumn(true) });
    },
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
