import { createContext, useCallback, useContext, type MouseEvent } from "react";

import type { Project } from "~/backend/types";
import { markdownLinkTarget } from "~/lib/file-links";
import { useMediaQuery, WIDE } from "~/lib/use-media";

import { useUi } from "../shell/ui-store";

/** Opens a link in the side panel when it points at a project file; false when it does not. */
export type OpenLink = (href: string | null) => boolean;

const FileLinkContext = createContext<OpenLink | null>(null);

export const FileLinkProvider = FileLinkContext.Provider;

export function useOpenLink(): OpenLink | null {
  return useContext(FileLinkContext);
}

/** A link handler that shows Markdown files from this project in the side panel. */
export function useMarkdownLinkOpener(project: Project, chatId: string | null, baseDir = ""): OpenLink {
  const wide = useMediaQuery(WIDE);
  const openSidecarFile = useUi((state) => state.openSidecarFile);
  return useCallback(
    (link) => {
      const path = markdownLinkTarget(link, project.path, baseDir);
      if (!path) return false;
      openSidecarFile({ projectId: project.id, chatId, path }, wide);
      return true;
    },
    [project.id, project.path, chatId, baseDir, wide, openSidecarFile],
  );
}

/**
 * Click handler for rendered Markdown (HTML from `renderMarkdown`): a click on
 * a link to a project file opens it in the side panel instead of outside the app.
 */
export function catchFileLink(event: MouseEvent<HTMLElement>, open: OpenLink | null) {
  if (!open || event.defaultPrevented) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const anchor = target.closest("a");
  if (!anchor || !event.currentTarget.contains(anchor)) return;
  if (open(anchor.getAttribute("href"))) event.preventDefault();
}
