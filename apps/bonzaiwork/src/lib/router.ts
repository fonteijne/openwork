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

/**
 * App settings groups. The cockpit's own: Verbindingen (keys and connections), Agent en rechten,
 * Werkwijzen, Geheugen (brains), Meldingen, Weergave; the older groups stay as routes.
 */
export type AppSettingsGroup =
  | "verbindingen"
  | "agent"
  | "werkwijzen"
  | "geheugen"
  | "meldingen"
  | "weergave"
  | "toegang"
  | "agenda"
  | "breinen"
  | "alle"
  | "technisch";
export const APP_SETTINGS_GROUPS: AppSettingsGroup[] = ["verbindingen", "agent", "werkwijzen", "geheugen", "meldingen", "weergave", "toegang", "agenda", "breinen", "alle", "technisch"];

/**
 * The tabs of a project page: Overzicht · To-do's · Runs · Chats · Uitvoer · Bronnen · Besluiten ·
 * Activiteit, plus Bestanden, Routines, Brein and Instellingen, and the Bewerken and Afronden sheets.
 * `work` is the chats tab (its old name, kept so links and shortcuts keep working).
 */
export type ProjectTab =
  | "overview"
  | "todos"
  | "runs"
  | "work"
  | "outputs"
  | "sources"
  | "decisions"
  | "activity"
  | "files"
  | "routines"
  | "brain"
  | "settings"
  | "edit"
  | "complete";

/** The Activity page: everything, or only what left the app. */
export type ActivityView = "all" | "sent";

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
  // The cockpit
  | { name: "plan" }
  | { name: "agent"; chatId: string | null }
  | { name: "inbox" }
  | { name: "runs" }
  | { name: "run"; runId: string }
  | { name: "delegate"; todoId: string | null }
  | { name: "approval"; approvalId: string }
  | { name: "library" }
  | { name: "library-shelf"; shelfId: string }
  | { name: "library-page"; pageId: string }
  | { name: "library-proposal"; proposalId: string }
  | { name: "activity"; view: ActivityView }
  | { name: "project-new"; fromProjectId: string | null; fromChatId: string | null }
  | { name: "project-overview"; projectId: string }
  | { name: "project-todos"; projectId: string }
  | { name: "project-runs"; projectId: string }
  | { name: "project-outputs"; projectId: string }
  | { name: "project-sources"; projectId: string }
  | { name: "project-decisions"; projectId: string }
  | { name: "project-activity"; projectId: string }
  | { name: "project-edit"; projectId: string }
  | { name: "project-complete"; projectId: string }
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
      return route.chatId ? `#/p/${enc(route.projectId)}/c/${enc(route.chatId)}` : `#/p/${enc(route.projectId)}/chats`;
    case "project-overview":
      return `#/p/${enc(route.projectId)}`;
    case "project-todos":
      return `#/p/${enc(route.projectId)}/todos`;
    case "project-runs":
      return `#/p/${enc(route.projectId)}/runs`;
    case "project-outputs":
      return `#/p/${enc(route.projectId)}/uitvoer`;
    case "project-sources":
      return `#/p/${enc(route.projectId)}/bronnen`;
    case "project-decisions":
      return `#/p/${enc(route.projectId)}/besluiten`;
    case "project-activity":
      return `#/p/${enc(route.projectId)}/activiteit`;
    case "project-edit":
      return `#/p/${enc(route.projectId)}/bewerken`;
    case "project-complete":
      return `#/p/${enc(route.projectId)}/afronden`;
    case "project-new":
      return route.fromProjectId && route.fromChatId ? `#/projecten/nieuw/${enc(route.fromProjectId)}/${enc(route.fromChatId)}` : "#/projecten/nieuw";
    case "plan":
      return "#/vandaag/plan";
    case "agent":
      return route.chatId ? `#/agent/c/${enc(route.chatId)}` : "#/agent";
    case "inbox":
      return "#/inbox";
    case "runs":
      return "#/runs";
    case "run":
      return `#/runs/${enc(route.runId)}`;
    case "delegate":
      return route.todoId ? `#/delegeren/${enc(route.todoId)}` : "#/delegeren";
    case "approval":
      return `#/goedkeuring/${enc(route.approvalId)}`;
    case "library":
      return "#/bibliotheek";
    case "library-shelf":
      return `#/bibliotheek/plank/${enc(route.shelfId)}`;
    case "library-page":
      return `#/bibliotheek/pagina/${enc(route.pageId)}`;
    case "library-proposal":
      return `#/bibliotheek/voorstel/${enc(route.proposalId)}`;
    case "activity":
      return route.view === "sent" ? "#/activiteit/verzonden" : "#/activiteit";
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
  if (first === "vandaag" && second === "plan") return { name: "plan" };
  if (first === undefined || first === "vandaag") return { name: "home" };
  if (first === "projecten" && second === "nieuw") return { name: "project-new", fromProjectId: third ?? null, fromChatId: third ? (fourth ?? null) : null };
  if (first === "projecten") return { name: "projects" };
  if (first === "agent") return { name: "agent", chatId: second === "c" && third ? third : null };
  if (first === "inbox") return { name: "inbox" };
  if (first === "runs") return second ? { name: "run", runId: second } : { name: "runs" };
  if (first === "delegeren") return { name: "delegate", todoId: second ?? null };
  if (first === "goedkeuring" && second) return { name: "approval", approvalId: second };
  if (first === "bibliotheek") {
    if (second === "plank" && third) return { name: "library-shelf", shelfId: third };
    if (second === "pagina" && third) return { name: "library-page", pageId: third };
    if (second === "voorstel" && third) return { name: "library-proposal", proposalId: third };
    if (second === undefined) return { name: "library" };
    return { name: "not-found" };
  }
  if (first === "activiteit") return { name: "activity", view: second === "verzonden" ? "sent" : "all" };
  if (first === "welkom") return { name: "onboarding" };
  if (first === "routines") return { name: "routines", routineId: second ?? null };
  if (first === "brein") return { name: "brain" };
  if (first === "instellingen") return { name: "settings", group: isAppGroup(second) ? second : null };
  if (first === "p" && second) {
    if (third === "c" && fourth) return { name: "project", projectId: second, chatId: fourth };
    if (third === "chats" || third === "werk") return { name: "project", projectId: second, chatId: null };
    if (third === "todos") return { name: "project-todos", projectId: second };
    if (third === "runs") return { name: "project-runs", projectId: second };
    if (third === "uitvoer") return { name: "project-outputs", projectId: second };
    if (third === "bronnen") return { name: "project-sources", projectId: second };
    if (third === "besluiten") return { name: "project-decisions", projectId: second };
    if (third === "activiteit") return { name: "project-activity", projectId: second };
    if (third === "bewerken") return { name: "project-edit", projectId: second };
    if (third === "afronden") return { name: "project-complete", projectId: second };
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
    if (third === undefined) return { name: "project-overview", projectId: second };
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
    case "project-overview":
      return "overview";
    case "project-todos":
      return "todos";
    case "project-runs":
      return "runs";
    case "project-outputs":
      return "outputs";
    case "project-sources":
      return "sources";
    case "project-decisions":
      return "decisions";
    case "project-activity":
      return "activity";
    case "project-edit":
      return "edit";
    case "project-complete":
      return "complete";
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
