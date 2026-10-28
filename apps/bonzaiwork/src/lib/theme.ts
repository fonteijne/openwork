import { useSyncExternalStore } from "react";

import { readLocal, writeLocal } from "./storage";

export type ThemePreference = "system" | "light" | "dark";

const KEY = "bonzaiwork.theme";
const listeners = new Set<() => void>();

function systemDark(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

export function readTheme(): ThemePreference {
  const stored = readLocal(KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

/** Same rule as the inline script in index.html, which runs before paint. */
export function applyTheme(preference = readTheme()) {
  const dark = preference === "dark" || (preference === "system" && systemDark());
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
}

export function setTheme(preference: ThemePreference) {
  writeLocal(KEY, preference === "system" ? null : preference);
  applyTheme(preference);
  for (const listener of listeners) listener();
}

export function watchSystemTheme() {
  try {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readTheme() === "system") applyTheme("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  } catch {
    return () => {};
  }
}

export function useTheme(): ThemePreference {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    readTheme,
    () => "system",
  );
}
