import { create } from "zustand";

import { readLocal, writeLocal } from "~/lib/storage";

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
  setDrawer(open: boolean): void;
  setPalette(open: boolean): void;
  setNewProject(open: boolean): void;
  setFeedback(open: boolean): void;
  toggleSidecar(): void;
  setSidecarSheet(open: boolean): void;
  /** Show a file in the sidecar: the column when `wide`, the sheet otherwise. */
  openSidecarFile(file: SidecarFile, wide: boolean): void;
  closeSidecarFile(): void;
};

export type SidecarFile = { projectId: string; chatId: string | null; path: string };

export const useUi = create<UiState>((set, get) => ({
  drawerOpen: false,
  paletteOpen: false,
  newProjectOpen: false,
  feedbackOpen: false,
  sidecarPinned: readLocal("bonzaiwork.sidecar") !== "closed",
  sidecarSheetOpen: false,
  sidecarFile: null,
  setDrawer: (open) => set({ drawerOpen: open }),
  setPalette: (open) => set({ paletteOpen: open }),
  setNewProject: (open) => set({ newProjectOpen: open, drawerOpen: false }),
  setFeedback: (open) => set({ feedbackOpen: open, drawerOpen: false, paletteOpen: false }),
  toggleSidecar: () => {
    const next = !get().sidecarPinned;
    writeLocal("bonzaiwork.sidecar", next ? null : "closed");
    set({ sidecarPinned: next });
  },
  setSidecarSheet: (open) => set({ sidecarSheetOpen: open }),
  openSidecarFile: (file, wide) => {
    if (!wide) {
      set({ sidecarFile: file, sidecarSheetOpen: true });
      return;
    }
    if (!get().sidecarPinned) writeLocal("bonzaiwork.sidecar", null);
    set({ sidecarFile: file, sidecarPinned: true });
  },
  closeSidecarFile: () => set({ sidecarFile: null }),
}));
