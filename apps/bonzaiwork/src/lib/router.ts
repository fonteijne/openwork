import { useSyncExternalStore } from "react";

/**
 * Hash routes: the same build runs on a web server and from file:// in Electron,
 * where history routes would break a reload.
 */

export type SettingsSection = "general" | "key" | "brain" | "instructions" | "skills" | "commands" | "connections" | "permissions" | "files" | "activity";
export const SETTINGS_SECTIONS: SettingsSection[] = ["general", "key", "brain", "instructions", "skills", "commands", "connections", "permissions", "files", "activity"];

export type Route =
  | { name: "projects" }
  | { name: "onboarding" }
  | { name: "project"; projectId: string; chatId: string | null }
  | { name: "project-routines"; projectId: string; routineId: string | null }
  | { name: "project-settings"; projectId: string; section: SettingsSection }
  | { name: "routines"; routineId: string | null }
  | { name: "settings" };

const enc = encodeURIComponent;

export function href(route: Route): string {
  switch (route.name) {
    case "projects":
      return "#/";
    case "onboarding":
      return "#/welkom";
    case "project":
      return route.chatId ? `#/p/${enc(route.projectId)}/c/${enc(route.chatId)}` : `#/p/${enc(route.projectId)}`;
    case "project-routines":
      return route.routineId ? `#/p/${enc(route.projectId)}/routines/${enc(route.routineId)}` : `#/p/${enc(route.projectId)}/routines`;
    case "project-settings":
      return route.section === "general" ? `#/p/${enc(route.projectId)}/instellingen` : `#/p/${enc(route.projectId)}/instellingen/${route.section}`;
    case "routines":
      return route.routineId ? `#/routines/${enc(route.routineId)}` : "#/routines";
    case "settings":
      return "#/instellingen";
  }
}

function isSection(value: string | undefined): value is SettingsSection {
  return SETTINGS_SECTIONS.some((section) => section === value);
}

export function parse(hash: string): Route {
  const path = hash.replace(/^#/, "").split("?")[0] ?? "";
  const parts = path.split("/").filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
  const [first, second, third, fourth] = parts;
  if (first === "welkom") return { name: "onboarding" };
  if (first === "routines") return { name: "routines", routineId: second ?? null };
  if (first === "instellingen") return { name: "settings" };
  if (first === "p" && second) {
    if (third === "c" && fourth) return { name: "project", projectId: second, chatId: fourth };
    if (third === "routines") return { name: "project-routines", projectId: second, routineId: fourth ?? null };
    if (third === "instellingen") return { name: "project-settings", projectId: second, section: isSection(fourth) ? fourth : "general" };
    return { name: "project", projectId: second, chatId: null };
  }
  return { name: "projects" };
}

function subscribe(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => "");
  return parse(hash);
}

export function navigate(route: Route, options: { replace?: boolean } = {}) {
  const target = href(route);
  if (window.location.hash === target) return;
  if (options.replace) {
    const url = new URL(window.location.href);
    url.hash = target;
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = target;
  }
}
