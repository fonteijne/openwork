import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useStore } from "zustand";

import { useBackend } from "~/backend/context";

import { projectRuntime, type ProjectRuntime, type ProjectState } from "./store";

const RuntimeContext = createContext<ProjectRuntime | null>(null);

/**
 * The last few projects stay alive after their page or sidebar row unmounts, so coming back is
 * instant (DESIGN.md P11; brief §4). Each parked entry is one retain handle of a runtime; the
 * oldest is released when a fourth arrives, and all of them when the window goes to the background,
 * so at most three event streams stay open in live mode.
 */
const PARKED_MAX = 3;
const parked: { projectId: string; release: () => void }[] = [];

function unpark(projectId: string): (() => void) | null {
  const index = parked.findIndex((entry) => entry.projectId === projectId);
  if (index === -1) return null;
  const [entry] = parked.splice(index, 1);
  return entry?.release ?? null;
}

function park(projectId: string, release: () => void) {
  unpark(projectId)?.();
  parked.push({ projectId, release });
  while (parked.length > PARKED_MAX) parked.shift()?.release();
}

function releaseParked() {
  for (const entry of parked.splice(0)) entry.release();
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) releaseParked();
  });
}

/**
 * Keeps a project's event stream alive while anything inside is mounted. The project page and the
 * expanded sidebar row each wrap their own provider; the runtime itself is shared per project.
 */
export function ProjectRuntimeProvider(props: { projectId: string; children: ReactNode }) {
  const backend = useBackend();
  const runtime = useMemo(() => projectRuntime(backend, props.projectId), [backend, props.projectId]);
  useEffect(() => {
    const release = runtime.retain();
    // This holder keeps the runtime alive now; a parked handle for it is redundant.
    unpark(runtime.projectId)?.();
    return () => park(runtime.projectId, release);
  }, [runtime]);
  return <RuntimeContext.Provider value={runtime}>{props.children}</RuntimeContext.Provider>;
}

export function useRuntime(): ProjectRuntime {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error("ProjectRuntimeProvider is missing");
  return runtime;
}

export function useOptionalRuntime(): ProjectRuntime | null {
  return useContext(RuntimeContext);
}

/** Select from the open project's state. Return stored references; derive with useMemo. */
export function useProjectState<T>(selector: (state: ProjectState) => T): T {
  return useStore(useRuntime().store, selector);
}
