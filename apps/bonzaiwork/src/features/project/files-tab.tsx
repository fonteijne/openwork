import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, FolderOpen, Upload } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys, useStatus } from "~/backend/queries";
import type { Project } from "~/backend/types";
import { TopBar } from "~/components/top-bar";
import { Button } from "~/components/ui/button";
import { EmptyState, Skeleton } from "~/components/ui/misc";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { errorText } from "~/lib/errors";
import { folderOf, projectRelativePath } from "~/lib/file-links";
import { relativeTime } from "~/lib/format";
import { fileName, touchedFiles } from "~/lib/tools";

import { useOpenProjectFile } from "../chat/file-link";
import { absoluteFilePath } from "../chat/sidecar";
import { projectCopy } from "./copy";
import { DocumentRow } from "./details";
import { useProjectState } from "./runtime";

/** The chat that changed each file, as far as the loaded messages say (brief §6: "in welke chat als bekend"). */
function useChangedIn(projectPath: string): Map<string, string> {
  const messages = useProjectState((state) => state.messages);
  const chats = useProjectState((state) => state.chats);
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const [chatId, entry] of Object.entries(messages)) {
      const chat = chats[chatId];
      if (!chat) continue;
      for (const file of touchedFiles(entry.list)) {
        if (!file.changed) continue;
        const path = projectRelativePath(file.path, projectPath);
        if (path && !map.has(path)) map.set(path, chat.untitled ? copy.chat.untitled : chat.title);
      }
    }
    return map;
  }, [messages, chats, projectPath]);
}

/**
 * Project · Bestanden (brief §6): `config.files` as document rows (name, folder, changed when and
 * in which chat as far as known), newest first; the reader opens in the Details column; the two
 * page actions are "Uploaden" and "Map tonen" (in the project header's action slot).
 */
export function FilesTab(props: { project: Project }) {
  const backend = useBackend();
  const client = useQueryClient();
  const status = useStatus();
  const files = useQuery({ queryKey: keys.files(props.project.id), queryFn: () => backend.config.files(props.project.id), staleTime: 15_000 });
  const openFile = useOpenProjectFile(props.project, null);
  const changedIn = useChangedIn(props.project.path);
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const readOnly = status.data?.readOnly ?? false;
  const sorted = useMemo(() => [...(files.data ?? [])].sort((a, b) => b.updatedAt - a.updatedAt), [files.data]);

  const upload = async (list: FileList) => {
    const items = Array.from(list);
    if (!items.length) return;
    setUploading(true);
    try {
      for (const file of items) await backend.composer.upload(props.project.id, file);
      await client.invalidateQueries({ queryKey: keys.files(props.project.id) });
      toast(projectCopy.files.uploaded(items.length));
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <TopBar
        actions={
          <>
            <input ref={input} type="file" multiple hidden onChange={(event) => event.target.files && void upload(event.target.files).finally(() => (event.target.value = ""))} />
            <Button variant="secondary" size="sm" disabled={readOnly || uploading} aria-busy={uploading} onClick={() => input.current?.click()} data-testid="files-upload">
              <Upload />
              {uploading ? projectCopy.files.uploading : copy.project.upload}
            </Button>
            {backend.capabilities.revealPath ? (
              <Button variant="quiet" size="sm" onClick={() => void backend.desktop.revealPath(props.project.path)} data-testid="files-reveal">
                <FolderOpen />
                {copy.project.showFolder}
              </Button>
            ) : null}
          </>
        }
      />
      <main className="min-h-0 flex-1 overflow-y-auto" aria-label={projectCopy.files.label}>
        <div className="mx-auto w-full max-w-3xl px-4 pt-4 pb-16 sm:px-6">
          {files.isLoading ? (
            <div className="flex flex-col gap-3 border-t border-border pt-4" aria-busy="true">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-4 w-72" />
              <Skeleton className="h-4 w-48" />
            </div>
          ) : sorted.length ? (
            <ul className="flex flex-col border-t border-border" data-testid="files-list">
              {sorted.map((file) => {
                const folder = folderOf(file.path);
                const chat = changedIn.get(file.path);
                const when = chat ? copy.project.changedIn(relativeTime(file.updatedAt), chat) : copy.project.changed(relativeTime(file.updatedAt));
                return (
                  <DocumentRow
                    key={file.path}
                    name={fileName(file.path)}
                    meta={
                      <>
                        <span className="font-mono">{folder || projectCopy.files.folderRoot}</span>
                        <span aria-hidden="true"> · </span>
                        {when}
                      </>
                    }
                    onOpen={() => openFile(file.path)}
                    revealPath={absoluteFilePath(props.project, file.path)}
                  />
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={<FileText />}
              title={copy.project.filesEmpty}
              action={
                <Button variant="secondary" disabled={readOnly || uploading} onClick={() => input.current?.click()}>
                  <Upload />
                  {copy.project.upload}
                </Button>
              }
            />
          )}
        </div>
      </main>
    </>
  );
}
