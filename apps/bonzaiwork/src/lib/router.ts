import { useSyncExternalStore } from "react";

/**
 * Hash routes: the same build runs on a web server and from file:// in Electron,
 * where history routes would break a reload. Sitemap: docs/bonzaiwork/ui-ux-overhaul.md §3.
 */

/** The old project-settings sections; they keep working as aliases of the new groups (brief §3, S1). */
export type SettingsSection = "general" | "key" | "brain" | "instructions" | "skills" | "commands" | "connections" | "permissions" | "files" | "activity";
export const SETTINGS_SECTIONS: SettingsSection[] = ["general", "key", "brain", "instructions", "skills", "commands", "connections", "permissions", "files", "activity"];

/** Project settings: four groups as a pill strip (brief §6). */
export type SettingsGroup = "project" | "agent" | "toegang" | "technisch";
export const SETTINGS_GROUPS: SettingsGroup[] = ["project", "agent", "toegang", "technisch"];

/** App settings groups (brief §3). */
export type AppSettingsGroup = "toegang" | "weergave" | "agenda" | "breinen" | "alle" | "technisch";
export const APP_SETTINGS_GROUPS: AppSettingsGroup[] = ["toegang", "weergave", "agenda", "breinen", "alle", "technisch"];

/** The tabs of a project page: Werk · Bestanden · Routines · Brein · Instellingen. */
export type ProjectTab = "work" | "files" | "routines" | "brain" | "settings";

export type Route =
  | { name: "home" }
  | { name: "projects" }
  | { name: "onboarding" }
  | { name: "project"; projectId: string; chatId: string | null }
  | { name: "project-files"; projectId: string }
  | { name: "project-routines"; projectId: string; routineId: string | null }
  | { name: "project-brain"; projectId: string }
  | {
      name: "project-settings";
      projectId: string;
      group?: SettingsGroup;
      /** An old section, kept so a link can still land on one row of the group; `files` and `brain` become tabs. */
      section?: SettingsSection | null;
    }
  | { name: "routines"; routineId: string | null }
  | { name: "brain" }
  | { name: "settings"; group?: AppSettingsGroup | null }
  | { name: "not-found" };

const enc = encodeURIComponent;

/** Which group an old settings section belongs to; `files` and `brain` left settings for a tab. */
export function settingsGroupOf(section: SettingsSection | null | undefined): SettingsGroup {
  switch (section) {
    case "instructions":
    case "skills":
    case "commands":
      return "agent";
    case "key":
    case "connections":
    case "permissions":
      return "toegang";
    case "activity":
      return "technisch";
    default:
      return "project";
  }
}

export function href(route: Route): string {
  switch (route.name) {
    case "home":
      return "#/";
    case "projects":
      return "#/projecten";
    case "onboarding":
      return "#/welkom";
    case "project":
      return route.chatId ? `#/p/${enc(route.projectId)}/c/${enc(route.chatId)}` : `#/p/${enc(route.projectId)}`;
    case "project-files":
      return `#/p/${enc(route.projectId)}/bestanden`;
    case "project-routines":
      return route.routineId ? `#/p/${enc(route.projectId)}/routines/${enc(route.routineId)}` : `#/p/${enc(route.projectId)}/routines`;
    case "project-brain":
      return `#/p/${enc(route.projectId)}/brein`;
    case "project-settings": {
      if (route.section === "files") return href({ name: "project-files", projectId: route.projectId });
      if (route.section === "brain") return href({ name: "project-brain", projectId: route.projectId });
      const group = route.group ?? settingsGroupOf(route.section);
      return group === "project" ? `#/p/${enc(route.projectId)}/instellingen` : `#/p/${enc(route.projectId)}/instellingen/${group}`;
    }
    case "routines":
      return route.routineId ? `#/routines/${enc(route.routineId)}` : "#/routines";
    case "brain":
      return "#/brein";
    case "settings":
      return route.group ? `#/instellingen/${route.group}` : "#/instellingen";
    case "not-found":
      return "#/niet-gevonden";
  }
}

function isSection(value: string | undefined): value is SettingsSection {
  return SETTINGS_SECTIONS.some((section) => section === value);
}

function isGroup(value: string | undefined): value is SettingsGroup {
  return SETTINGS_GROUPS.some((group) => group === value);
}

function isAppGroup(value: string | undefined): value is AppSettingsGroup {
  return APP_SETTINGS_GROUPS.some((group) => group === value);
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
  if (first === undefined || first === "vandaag") return { name: "home" };
  if (first === "projecten") return { name: "projects" };
  if (first === "welkom") return { name: "onboarding" };
  if (first === "routines") return { name: "routines", routineId: second ?? null };
  if (first === "brein") return { name: "brain" };
  if (first === "instellingen") return { name: "settings", group: isAppGroup(second) ? second : null };
  if (first === "p" && second) {
    if (third === "c" && fourth) return { name: "project", projectId: second, chatId: fourth };
    if (third === "bestanden") return { name: "project-files", projectId: second };
    if (third === "routines") return { name: "project-routines", projectId: second, routineId: fourth ?? null };
    if (third === "brein") return { name: "project-brain", projectId: second };
    if (third === "instellingen") {
      if (isGroup(fourth)) return { name: "project-settings", projectId: second, group: fourth, section: null };
      // Old section hashes stay as aliases (decision S1).
      if (fourth === "files") return { name: "project-files", projectId: second };
      if (fourth === "brain") return { name: "project-brain", projectId: second };
      if (isSection(fourth)) return { name: "project-settings", projectId: second, group: settingsGroupOf(fourth), section: fourth };
      return { name: "project-settings", projectId: second, group: "project", section: null };
    }
    if (third === undefined) return { name: "project", projectId: second, chatId: null };
  }
  return { name: "not-found" };
}

export function routeProjectId(route: Route): string | null {
  return "projectId" in route ? route.projectId : null;
}

export function routeTab(route: Route): ProjectTab | null {
  switch (route.name) {
    case "project":
      return "work";
    case "project-files":
      return "files";
    case "project-routines":
      return "routines";
    case "project-brain":
      return "brain";
    case "project-settings":
      return "settings";
    default:
      return null;
  }
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

// ---------------------------------------------------------------------------
// In-app route stack for ⌘[ / ⌘] (brief §4): Electron has no browser chrome.
// ---------------------------------------------------------------------------

const MAX_STACK = 100;
const stack: string[] = [];
let index = -1;

function currentHash(): string {
  return window.location.hash || "#/";
}

/** Records a hash: a step back or forward moves the cursor, anything else starts a new branch. */
function record(hash: string) {
  if (stack[index] === hash) return;
  if (stack[index - 1] === hash) {
    index -= 1;
    return;
  }
  if (stack[index + 1] === hash) {
    index += 1;
    return;
  }
  stack.splice(index + 1);
  stack.push(hash);
  if (stack.length > MAX_STACK) stack.shift();
  index = stack.length - 1;
}

/** Starts following the hash; call once at startup. */
export function watchRouteHistory(): () => void {
  record(currentHash());
  const onChange = () => record(currentHash());
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function canGoBack(): boolean {
  return index > 0;
}

export function canGoForward(): boolean {
  return index < stack.length - 1;
}

export function goBack(): void {
  const target = stack[index - 1];
  if (target !== undefined) window.location.hash = target;
}

export function goForward(): void {
  const target = stack[index + 1];
  if (target !== undefined) window.location.hash = target;
}
