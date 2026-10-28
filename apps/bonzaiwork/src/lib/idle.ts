import { useEffect, useState } from "react";

/**
 * Work that can wait for a quiet moment: one item per idle period, so many
 * small mounts (a menu per list row) never add up to one long task (CLAUDE.md
 * Performance: INP and TBT).
 */
const queue: Array<() => void> = [];
let pending = false;
// Items often swap a placeholder for the real control: never between a press and its release.
let pressing = false;
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", () => (pressing = true), { capture: true, passive: true });
  for (const type of ["pointerup", "pointercancel"]) window.addEventListener(type, () => (pressing = false), { capture: true, passive: true });
}

function schedule() {
  pending = true;
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(pump, { timeout: 2000 });
  else window.setTimeout(pump, 16);
}

function pump() {
  pending = false;
  if (pressing) return schedule();
  queue.shift()?.();
  // React renders the update in its own task; the next item waits for the next quiet moment.
  if (queue.length) schedule();
}

export function whenIdle(task: () => void): () => void {
  queue.push(task);
  if (!pending) schedule();
  return () => {
    const index = queue.indexOf(task);
    if (index >= 0) queue.splice(index, 1);
  };
}

/** False on the first render, true from the component's turn in the idle queue (never while `enabled` is false). */
export function useIdleReady(enabled = true): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => (enabled && !ready ? whenIdle(() => setReady(true)) : undefined), [enabled, ready]);
  return ready;
}
