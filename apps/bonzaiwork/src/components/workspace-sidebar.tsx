import { useState } from "react";
import { FolderPlus, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { copy } from "~/copy";
import type { Workspace } from "~/lib/workspace-chat";

export function WorkspaceSidebar(props: {
  workspaces: Workspace[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Desktop: opens the folder picker. Returns false when no picker exists (browser dev). */
  onPickFolder: () => Promise<boolean>;
  onCreate: (folderPath: string) => Promise<void>;
  onOpenSettings: () => void;
}) {
  const [typing, setTyping] = useState(false);
  const [folder, setFolder] = useState("");
  const [error, setError] = useState<string | null>(null);

  const startCreate = async () => {
    setError(null);
    try {
      if (!(await props.onPickFolder())) setTyping(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  return (
    <aside className="flex w-60 shrink-0 flex-col border-e border-border bg-muted/30">
      <div className="flex h-12 items-center px-4 text-sm font-semibold text-foreground">{copy.appName}</div>
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2" aria-label={copy.workspaces}>
        {props.workspaces.map((workspace) => (
          <button
            key={workspace.id}
            type="button"
            onClick={() => props.onSelect(workspace.id)}
            aria-current={workspace.id === props.selectedId ? "page" : undefined}
            className="truncate rounded-lg px-2.5 py-1.5 text-start text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground"
            data-testid="workspace-item"
          >
            {workspace.displayName || workspace.name}
          </button>
        ))}
        {typing ? (
          <form
            className="flex flex-col gap-2 p-1"
            onSubmit={(event) => {
              event.preventDefault();
              const path = folder.trim();
              if (!path) return;
              void props.onCreate(path).then(() => {
                setTyping(false);
                setFolder("");
              }, (failure: unknown) => setError(failure instanceof Error ? failure.message : String(failure)));
            }}
          >
            <Input value={folder} onChange={(event) => setFolder(event.target.value)} placeholder="/pad/naar/map" aria-label={copy.workspaceFolder} autoFocus data-testid="workspace-folder-input" />
            <Button type="submit" size="sm" disabled={!folder.trim()}>{copy.createWorkspace}</Button>
          </form>
        ) : null}
        {error ? <p className="px-2 text-sm text-destructive" role="alert">{error}</p> : null}
      </nav>
      <div className="flex flex-col gap-0.5 border-t border-border p-2">
        <Button variant="ghost" size="sm" className="justify-start" onClick={() => void startCreate()} data-testid="new-workspace">
          <FolderPlus />
          {copy.newWorkspace}
        </Button>
        <Button variant="ghost" size="sm" className="justify-start" onClick={props.onOpenSettings} data-testid="open-settings">
          <Settings />
          {copy.settings}
        </Button>
      </div>
    </aside>
  );
}
