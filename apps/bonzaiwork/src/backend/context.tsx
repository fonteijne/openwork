import { createContext, useContext, type ReactNode } from "react";

import type { Backend } from "./types";

const BackendContext = createContext<Backend | null>(null);

export function BackendProvider(props: { backend: Backend; children: ReactNode }) {
  return <BackendContext.Provider value={props.backend}>{props.children}</BackendContext.Provider>;
}

export function useBackend(): Backend {
  const backend = useContext(BackendContext);
  if (!backend) throw new Error("BackendProvider is missing");
  return backend;
}
