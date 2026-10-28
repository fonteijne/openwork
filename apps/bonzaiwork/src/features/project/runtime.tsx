import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useStore } from "zustand";

import { useBackend } from "~/backend/context";

import { projectRuntime, type ProjectRuntime, type ProjectState } from "./store";

const RuntimeContext = createContext<ProjectRuntime | null>(null);

/** Keeps the open project's event stream alive while anything inside is mounted. */
export function ProjectRuntimeProvider(props: { projectId: string; children: ReactNode }) {
  const backend = useBackend();
  const runtime = useMemo(() => projectRuntime(backend, props.projectId), [backend, props.projectId]);
  useEffect(() => runtime.retain(), [runtime]);
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
