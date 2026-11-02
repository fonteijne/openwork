import { createContext, useCallback, useContext, type ReactNode } from "react";

import type { Project } from "~/backend/types";
import { markdownLinkTarget } from "~/lib/file-links";
import { useMediaQuery, WIDE } from "~/lib/use-media";

import { useUi } from "../shell/ui-store";

/** Opens a link in the side panel when it points at a project file; false when it does not. */
export type OpenLink = (href: string | null) => boolean;

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
