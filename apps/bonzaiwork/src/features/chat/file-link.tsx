import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from "react";

import type { Project } from "~/backend/types";
import { markdownLinkTarget } from "~/lib/file-links";
import { routeProjectId, parse } from "~/lib/router";
import { useMediaQuery, WIDE } from "~/lib/use-media";

import { useUi, type SidecarFile } from "../shell/ui-store";

/** Opens a link in the side panel when it points at a project file; false when it does not. */
export type OpenLink = (href: string | null) => boolean;

// ---------------------------------------------------------------------------
// The open file lives in the hash: `#/p/x/c/y?bestand=offertes/2026-031.md` (brief §6). The route
// parser ignores the query, so routes are untouched; this module reads and writes it, keeps it
// across chat switches inside the same project, and lets ⌘[ / ⌘] restore it (the route stack
// records whole hashes).
// ---------------------------------------------------------------------------

const PARAM = "bestand";

function splitHash(hash: string): { path: string; query: URLSearchParams } {
  const index = hash.indexOf("?");
  if (index === -1) return { path: hash, query: new URLSearchParams() };
  return { path: hash.slice(0, index), query: new URLSearchParams(hash.slice(index + 1)) };
}

/** The project-relative path in `?bestand=`, or null. */
export function fileParamOf(hash: string): string | null {
  const value = splitHash(hash).query.get(PARAM);
  return value && value.trim() ? value : null;
}

/** Encodes a path for the query; slashes stay readable, as in the route itself. */
function encodePath(path: string): string {
  return encodeURIComponent(path).replace(/%2F/gi, "/");
}

export function withFileParam(hash: string, path: string | null): string {
  const { path: route, query } = splitHash(hash);
  query.delete(PARAM);
  const rest = query.toString();
  const parts = [rest, path ? `${PARAM}=${encodePath(path)}` : ""].filter(Boolean);
  return parts.length ? `${route}?${parts.join("&")}` : route;
}

/** Listeners for changes made here: replaceState fires no hashchange, and dispatching one would push a route-stack entry. */
const listeners = new Set<() => void>();
function notify() {
  for (const listener of listeners) listener();
}

/** The file the person opened last, and in which project: re-attached when the route changes inside that project. */
let sticky: { projectId: string; path: string } | null = null;

function writeHash(hash: string) {
  const url = new URL(window.location.href);
  url.hash = hash;
  window.history.replaceState(window.history.state, "", url);
  notify();
}

/** Puts `path` in the hash (or removes it with null) without a new history entry. */
export function setFileParam(path: string | null, projectId: string | null) {
  const current = window.location.hash || "#/";
  sticky = path && projectId ? { projectId, path } : null;
  const next = withFileParam(current, path);
  if (next !== current) writeHash(next);
  else notify();
}

/** What the hash says now: a reload or a direct link lands with the file already open. */
function remember(hash: string) {
  const param = fileParamOf(hash);
  const projectId = routeProjectId(parse(hash));
  sticky = param && projectId ? { projectId, path: param } : null;
}

if (typeof window !== "undefined") {
  remember(window.location.hash || "#/");
  // A chat switch or a tab drops the query (typed routes write clean hashes): bring the file back
  // while the person stays in its project; leaving the project forgets it.
  window.addEventListener("hashchange", () => {
    const hash = window.location.hash || "#/";
    if (fileParamOf(hash)) {
      remember(hash);
      notify();
      return;
    }
    if (sticky && routeProjectId(parse(hash)) === sticky.projectId) {
      writeHash(withFileParam(hash, sticky.path));
      return;
    }
    sticky = null;
    notify();
  });
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("hashchange", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("hashchange", callback);
  };
}

/** The file open in the Details column of this project, read from the hash; null when none. */
export function useOpenedFile(projectId: string): string | null {
  const param = useSyncExternalStore(subscribe, () => fileParamOf(window.location.hash), () => null);
  const routeProject = useSyncExternalStore(subscribe, () => routeProjectId(parse(window.location.hash)), () => null);
  return param && routeProject === projectId ? param : null;
}

/**
 * Shows a project file in the Details column (a sheet on phones): the hash gets `?bestand=` and
 * the column opens. Nothing navigates (S5): the chat stays where it is.
 */
export function openProjectFile(file: SidecarFile, wide: boolean) {
  useUi.getState().showDetails(wide);
  setFileParam(file.path, file.projectId);
}

/** Closes the reader: the Details column shows its details again. */
export function closeProjectFile() {
  setFileParam(null, null);
}

export function useOpenProjectFile(project: Project, chatId: string | null): (path: string) => void {
  const wide = useMediaQuery(WIDE);
  return useCallback((path: string) => openProjectFile({ projectId: project.id, chatId, path }, wide), [project.id, chatId, wide]);
}

// ---------------------------------------------------------------------------
// Links in Markdown
// ---------------------------------------------------------------------------

const FileLinkContext = createContext<OpenLink | null>(null);

/** Links to Markdown files in this project's chat open in the side panel. */
export function ProjectFileLinks(props: { project: Project; chatId: string | null; children: ReactNode }) {
  const openLink = useMarkdownLinkOpener(props.project, props.chatId);
  return <FileLinkContext.Provider value={openLink}>{props.children}</FileLinkContext.Provider>;
}

export function useOpenLink(): OpenLink | null {
  return useContext(FileLinkContext);
}

/** A link handler that shows Markdown files from this project in the side panel. */
export function useMarkdownLinkOpener(project: Project, chatId: string | null, baseDir = ""): OpenLink {
  const open = useOpenProjectFile(project, chatId);
  return useCallback(
    (link) => {
      const path = markdownLinkTarget(link, project.path, baseDir);
      if (!path) return false;
      open(path);
      return true;
    },
    [project.path, baseDir, open],
  );
}
