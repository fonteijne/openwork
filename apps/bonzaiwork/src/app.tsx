import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { ChatView } from "~/components/chat-view";
import { Onboarding } from "~/components/onboarding";
import { SettingsSheet } from "~/components/settings-sheet";
import { WorkspaceSidebar } from "~/components/workspace-sidebar";
import { copy } from "~/copy";
import { bonzaiworkApi, type BonzaiworkStatus } from "~/lib/bonzaiwork-api";
import { connectToLocalServer, type ServerConnection } from "~/lib/connection";
import { chooseWorkspaceFolder, createWorkspace, listWorkspaces, type Workspace } from "~/lib/workspace-chat";

type Boot =
  | { phase: "connecting" }
  | { phase: "failed"; message: string }
  | { phase: "ready"; connection: ServerConnection; status: BonzaiworkStatus; workspaces: Workspace[] };

/** Loading keeps the destination layout (DESIGN.md States): sidebar and chat skeletons. */
function ShellSkeleton() {
  return (
    <div className="flex h-dvh bg-background" aria-busy="true" aria-label={copy.connecting}>
      <div className="flex w-60 flex-col gap-2 border-e border-border p-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-4 h-7 w-full" />
        <Skeleton className="h-7 w-full" />
      </div>
      <div className="flex flex-1 flex-col justify-end p-4">
        <Skeleton className="mx-auto h-24 w-full max-w-2xl rounded-[var(--dls-radius)]" />
      </div>
    </div>
  );
}

export function App() {
  const [boot, setBoot] = useState<Boot>({ phase: "connecting" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Record<string, string | null>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);

  const start = useCallback(async () => {
    setBoot({ phase: "connecting" });
    try {
      const connection = await connectToLocalServer();
      const [status, workspaces] = await Promise.all([bonzaiworkApi.status(connection), listWorkspaces(connection)]);
      setBoot({ phase: "ready", connection, status, workspaces });
      setSelectedId((current) => current ?? workspaces[0]?.id ?? null);
    } catch (failure) {
      setBoot({ phase: "failed", message: failure instanceof Error ? failure.message : String(failure) });
    }
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

  if (boot.phase === "connecting") return <ShellSkeleton />;
  if (boot.phase === "failed") {
    return (
      <main className="flex h-dvh flex-col items-center justify-center gap-3 bg-background">
        <p className="text-sm text-foreground">{copy.serverUnavailable}</p>
        <p className="max-w-md text-center text-sm text-muted-foreground">{boot.message}</p>
        <Button variant="outline" onClick={() => void start()}>{copy.retry}</Button>
      </main>
    );
  }

  const { connection, status, workspaces } = boot;
  const setStatus = (next: BonzaiworkStatus) => setBoot({ ...boot, status: next });
  if (status.keyMode === "user" && !status.user.hasKey) {
    return <Onboarding connection={connection} status={status} onLinked={setStatus} />;
  }

  const selected = workspaces.find((workspace) => workspace.id === selectedId) ?? null;
  const addWorkspace = async (folderPath: string) => {
    const next = await createWorkspace(connection, folderPath);
    const created = next.find((workspace) => workspace.path === folderPath) ?? next.at(-1);
    setBoot({ ...boot, workspaces: next, status: await bonzaiworkApi.status(connection) });
    if (created) setSelectedId(created.id);
  };

  return (
    <div className="flex h-dvh bg-background text-foreground">
      <WorkspaceSidebar
        workspaces={workspaces}
        selectedId={selected?.id ?? null}
        onSelect={setSelectedId}
        onPickFolder={async () => {
          const folder = await chooseWorkspaceFolder();
          if (folder === null) return false;
          await addWorkspace(folder);
          return true;
        }}
        onCreate={addWorkspace}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      {selected ? (
        <ChatView
          key={selected.id}
          connection={connection}
          workspace={selected}
          status={status}
          sessionId={sessions[selected.id] ?? null}
          onSession={(sessionId) => setSessions((current) => ({ ...current, [selected.id]: sessionId }))}
        />
      ) : (
        <main className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">{copy.noWorkspaces}</p>
        </main>
      )}
      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        connection={connection}
        status={status}
        workspaces={workspaces}
        onStatus={setStatus}
      />
    </div>
  );
}
