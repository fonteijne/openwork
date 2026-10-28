import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { copy } from "~/copy";
import type { BonzaiworkStatus } from "~/lib/bonzaiwork-api";
import type { ServerConnection } from "~/lib/connection";
import type { Workspace } from "~/lib/workspace-chat";

import { KeyLinkForm } from "./key-link-form";

function Row(props: { label: string; value: React.ReactNode; action?: React.ReactNode; testId?: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border py-2 last:border-b-0" data-testid={props.testId}>
      <span className="text-sm font-medium text-foreground">{props.label}</span>
      <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
        <span className="truncate">{props.value}</span>
        {props.action}
      </span>
    </div>
  );
}

/** Which key is linked, with "Vervangen" (workstream B6). Shows state only, never the key. */
export function SettingsSheet(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: ServerConnection;
  status: BonzaiworkStatus;
  workspaces: Workspace[];
  onStatus: (status: BonzaiworkStatus) => void;
}) {
  const [replacing, setReplacing] = useState<string | null>(null);
  const keyState = (state: { hasKey: boolean; keyHint: string | null }) =>
    state.hasKey && state.keyHint ? copy.keyLinked(state.keyHint) : copy.keyMissing;

  const replaceRow = (scope: string, label: string, state: { hasKey: boolean; keyHint: string | null }, workspaceId?: string) =>
    replacing === scope ? (
      <div key={scope} className="border-b border-border py-3 last:border-b-0">
        <KeyLinkForm
          connection={props.connection}
          workspaceId={workspaceId}
          autoFocus
          onLinked={(status) => {
            props.onStatus(status);
            setReplacing(null);
          }}
          onCancel={() => setReplacing(null)}
        />
      </div>
    ) : (
      <Row
        key={scope}
        label={label}
        value={keyState(state)}
        testId={`key-row-${scope}`}
        action={<Button size="sm" variant="outline" onClick={() => setReplacing(scope)}>{copy.replaceKey}</Button>}
      />
    );

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{copy.settings}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col px-4">
          <Row label={copy.litellmServer} value={<span className="font-mono">{props.status.litellmBaseUrl}</span>} />
          {props.status.keyMode === "user"
            ? replaceRow("user", copy.key, props.status.user)
            : props.workspaces.map((workspace) => {
                const state = props.status.workspaces.find((entry) => entry.id === workspace.id) ?? { hasKey: false, keyHint: null };
                return replaceRow(workspace.id, workspace.displayName || workspace.name, state, workspace.id);
              })}
          {!props.status.keyStorePersistent ? (
            <p className="py-3 text-sm text-muted-foreground">{copy.keyStoreNotPersistent}</p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
