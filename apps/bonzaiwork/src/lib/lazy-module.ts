import { useEffect, useState } from "react";

/**
 * Code the first screen does not need (Base UI popups: menus, tooltips,
 * dialogs, toasts), fetched on demand and then readable synchronously.
 * CLAUDE.md Performance: heavy parts split off the first load.
 */
export type LazyModule<T> = { get(): T | null; load(): Promise<T> };

export function lazyModule<T>(load: () => Promise<T>): LazyModule<T> {
  let value: T | null = null;
  let pending: Promise<T> | null = null;
  return {
    get: () => value,
    load: () =>
      (pending ??= load().then((loaded) => {
        value = loaded;
        return loaded;
      })),
  };
}

/** The module once `wanted` and loaded; null before. Loading starts when `wanted` turns true. */
export function useModule<T>(module: LazyModule<T>, wanted: boolean): T | null {
  const [, setLoaded] = useState(false);
  const value = module.get();
  useEffect(() => {
    if (wanted && !value) void module.load().then(() => setLoaded(true));
  }, [wanted, value, module]);
  return wanted ? value : null;
}
