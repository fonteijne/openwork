import { useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (callback) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", callback);
      return () => media.removeEventListener("change", callback);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** ≥640px (Tailwind `sm`): room for secondary columns in lists. */
export const SMALL_UP = "(min-width: 640px)";
/** ≥1280px: room for the sidecar next to the chat. */
export const WIDE = "(min-width: 1280px)";
/** ≥1024px: the sidebar is a column, not a drawer. */
export const DESKTOP = "(min-width: 1024px)";
