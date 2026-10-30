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
  setDrawer(open: boolean): void;
  setPalette(open: boolean): void;
  setNewProject(open: boolean): void;
  setFeedback(open: boolean): void;
  toggleSidecar(): void;
  setSidecarSheet(open: boolean): void;
};

export const useUi = create<UiState>((set, get) => ({
  drawerOpen: false,
  paletteOpen: false,
  newProjectOpen: false,
  feedbackOpen: false,
  sidecarPinned: readLocal("bonzaiwork.sidecar") !== "closed",
  sidecarSheetOpen: false,
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
}));
