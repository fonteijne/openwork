import { useState } from "react";

/**
 * True from the first time `open` is true. Dialogs mount (and load their code)
 * when first opened, then stay mounted so they can animate closed.
 */
export function useOpenedOnce(open: boolean): boolean {
  const [opened, setOpened] = useState(open);
  if (open && !opened) setOpened(true);
  return opened;
}
