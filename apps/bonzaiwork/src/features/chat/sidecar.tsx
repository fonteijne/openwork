import { useEffect, useRef } from "react";
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, FolderOpen, RotateCw, X } from "lucide-react";

import { useBackend } from "~/backend/context";
import type { Project } from "~/backend/types";
import { ProseHtml } from "~/components/prose-html";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/misc";
import { Dialog } from "~/components/ui/overlay";
import { Tooltip } from "~/components/ui/tooltip";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { folderOf } from "~/lib/file-links";
import { formatBytes } from "~/lib/format";
import { renderMarkdown } from "~/lib/markdown";

import { ConceptFacts } from "../brain/concept-facts";
import { closeProjectFile, useMarkdownLinkOpener, type OpenLink } from "./file-link";

/**
 * The document reader (brief §6): a project file rendered in the Details column, or in a dialog
 * where a page has no column (workflow outputs, settings). The details themselves live in
 * `features/project/details.tsx`.
 */

const MARKDOWN = /\.(md|markdown|mdx)$/i;

function fileQueryKey(projectId: string, chatId: string | null, path: string) {
  return ["file", projectId, chatId, path];
}

/** The absolute path of a project file, with the project's own separators, for "Tonen in map". */
export function absoluteFilePath(project: Project, path: string): string {
  const separator = project.path.includes("\\") ? "\\" : "/";
  return `${project.path.replace(/[\\/]+$/, "")}${separator}${path.split("/").join(separator)}`;
}

/** A project file's contents: Markdown rendered, other text as is. */
function FileBody(props: { projectId: string; chatId: string | null; path: string; onLink?: OpenLink }) {
  const backend = useBackend();
  const file = useQuery({
    queryKey: fileQueryKey(props.projectId, props.chatId, props.path),
    queryFn: () => backend.config.readFile(props.projectId, props.path, props.chatId),
  });
  if (file.isLoading) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-10/12" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }
  if (file.isError) return <p className="text-sm text-muted-foreground">{errorText(file.error)}</p>;
  const content = file.data?.content;
  if (content === null || content === undefined) return <p className="text-sm text-muted-foreground">{copy.project.reader.noPreview(file.data ? formatBytes(file.data.bytes) : null)}</p>;
  if (MARKDOWN.test(props.path)) {
    // Sanitized in renderMarkdown (DOMPurify): file contents are untrusted.
    return (
      <>
        <ConceptFacts projectId={props.projectId} path={props.path} />
        <ProseHtml html={renderMarkdown(content)} onLink={props.onLink} />
      </>
    );
  }
  return <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">{content}</pre>;
}

/** A file in a dialog, for pages without a Details column (workflow outputs, settings). */
export function FilePreview(props: { projectId: string; chatId: string | null; path: string | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(props.path)} onOpenChange={(open) => !open && props.onClose()} title={<span className="font-mono text-sm">{props.path}</span>} size="lg">
      {props.path ? <FileBody projectId={props.projectId} chatId={props.chatId} path={props.path} /> : null}
    </Dialog>
  );
}

/**
 * A project file in the Details column, opened from a document row or a link in the chat. The
 * path is in the hash (`?bestand=`), so it survives chat switches and ⌘[ (brief §6).
 */
export function FileView(props: { project: Project; path: string; chatId: string | null; onClose?: () => void }) {
  const backend = useBackend();
  const { project, path } = props;
  const openLink = useMarkdownLinkOpener(project, props.chatId, folderOf(path));
  const scroller = useRef<HTMLDivElement>(null);
  const name = path.split("/").at(-1) ?? path;
  const queryClient = useQueryClient();
  const queryKey = fileQueryKey(project.id, props.chatId, path);
  const reloading = useIsFetching({ queryKey, exact: true }) > 0;

  // A new file starts at the top.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [path]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border ps-2 pe-3" data-titlebar="sidecar">
        <Tooltip label={copy.project.reader.back}>
          <Button variant="quiet" size="icon-sm" aria-label={copy.project.reader.back} onClick={closeProjectFile}>
            <ChevronLeft />
          </Button>
        </Tooltip>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold" title={path}>
          {name}
        </h2>
        <Tooltip label={copy.project.reader.reload}>
          <Button
            variant="quiet"
            size="icon-sm"
            aria-label={copy.project.reader.reload}
            aria-busy={reloading}
            onClick={() => {
              if (!reloading) void queryClient.refetchQueries({ queryKey, exact: true });
            }}
          >
            <RotateCw className={cn(reloading && "animate-spin")} />
          </Button>
        </Tooltip>
        {backend.capabilities.revealPath ? (
          <Tooltip label={copy.project.details.reveal}>
            <Button variant="quiet" size="icon-sm" aria-label={copy.project.details.reveal} onClick={() => void backend.desktop.revealPath(absoluteFilePath(project, path))}>
              <FolderOpen />
            </Button>
          </Tooltip>
        ) : null}
        {props.onClose ? (
          <Button variant="quiet" size="icon-sm" aria-label={copy.common.close} onClick={props.onClose}>
            <X />
          </Button>
        ) : null}
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-5 py-4" data-testid="sidecar-file">
        <FileBody projectId={project.id} chatId={props.chatId} path={path} onLink={openLink} />
      </div>
    </div>
  );
}
