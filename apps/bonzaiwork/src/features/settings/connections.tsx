import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ellipsis, Info, LogIn, Plus, RefreshCw, Trash2 } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys } from "~/backend/queries";
import type { Connection, ConnectionStatus, NewConnectionInput } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Chip, StatusChip, type ChipStatus } from "~/components/ui/chip";
import { Field, Input } from "~/components/ui/field";
import { Menu, MenuItem, MenuSeparator } from "~/components/ui/menu";
import { Row, Section, Skeleton } from "~/components/ui/misc";
import { ConfirmDialog, Dialog } from "~/components/ui/overlay";
import { SegmentedControl } from "~/components/ui/segmented";
import { Switch } from "~/components/ui/switch";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";

import { attempt, humanize, NAME_PATTERN } from "./shared";

/** Services people add often: one click fills name and address (assessment I-6). */
const CATALOG: { name: string; label: string; url: string }[] = [
  { name: "notion", label: "Notion", url: "https://mcp.notion.com/mcp" },
  { name: "linear", label: "Linear", url: "https://mcp.linear.app/mcp" },
  { name: "github", label: "GitHub", url: "https://api.githubcopilot.com/mcp/" },
  { name: "atlassian", label: "Jira en Confluence", url: "https://mcp.atlassian.com/v1/sse" },
  { name: "hubspot", label: "HubSpot", url: "https://mcp.hubspot.com/anthropic" },
];

/** Names people recognise for connection slugs the catalog does not add (demo and common ones). */
const KNOWN_LABELS: Record<string, string> = {
  "google-drive": "Google Drive",
  mailchimp: "Mailchimp",
  "exact-online": "Exact Online",
  slack: "Slack",
  gmail: "Gmail",
};

export function connectionLabel(name: string): string {
  return CATALOG.find((entry) => entry.name === name)?.label ?? KNOWN_LABELS[name] ?? humanize(name);
}

/**
 * The service mark slot (V5): a tile with the service's initials, in the row's leading slot, until
 * the real logo assets land (seam). Never a generic icon for a company.
 */
function ServiceMark(props: { name: string; className?: string }) {
  const label = connectionLabel(props.name);
  const initials = label
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
  return (
    <span aria-hidden="true" className={cn("flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold tracking-tight text-foreground", props.className)}>
      {initials}
    </span>
  );
}

const CHIP_STATUS: Record<ConnectionStatus, ChipStatus> = { connected: "idle", disabled: "idle", needs_auth: "waiting", failed: "failed", pending: "running" };

/** "HubSpot verbonden · Exact Online: inloggen nodig" for the Overzicht. */
export function connectionsSummary(connections: readonly Connection[]): string {
  const connected = connections.filter((connection) => connection.status === "connected").length;
  const attention = connections.filter((connection) => connection.status === "needs_auth" || connection.status === "failed").length;
  return connections.length ? copy.settings.connectionsSummary(connected, attention) || copy.settings.connections.status.disabled : copy.settings.none;
}

/**
 * Connections (brief §6; assessment P-5): mark + label, status as icon + word (C5), and the one
 * action the status asks for: sign in again, retry, or the on/off switch. Address and command live
 * in the overflow under "Technische details" (P3, C3).
 */
export function ConnectionsSection(props: { projectId: string }) {
  const backend = useBackend();
  const client = useQueryClient();
  const connections = useQuery({ queryKey: keys.connections(props.projectId), queryFn: () => backend.config.connections(props.projectId) });
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Connection | null>(null);
  const [details, setDetails] = useState<Connection | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: keys.connections(props.projectId) });

  const action = (connection: Connection) => {
    switch (connection.status) {
      case "needs_auth":
        return (
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              void attempt(async () => {
                await backend.config.signOutConnection(props.projectId, connection.name);
                await refresh();
              }, copy.settings.connections.signedOut)
            }
          >
            <LogIn />
            {copy.settings.connections.signIn}
          </Button>
        );
      case "failed":
        return (
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              void attempt(async () => {
                await backend.config.setConnectionEnabled(props.projectId, connection.name, false);
                await backend.config.setConnectionEnabled(props.projectId, connection.name, true);
                await refresh();
              }, copy.settings.connections.retried)
            }
          >
            <RefreshCw />
            {copy.settings.connections.retry}
          </Button>
        );
      default:
        return (
          <Switch
            checked={connection.enabled}
            label={copy.settings.connections.toggle(connectionLabel(connection.name), connection.enabled)}
            onCheckedChange={(enabled) =>
              void attempt(async () => {
                await backend.config.setConnectionEnabled(props.projectId, connection.name, enabled);
                await refresh();
              })
            }
          />
        );
    }
  };

  return (
    <>
      <Section
        title={copy.settings.connections.title}
        action={
          <Button variant="quiet" size="sm" onClick={() => setAdding(true)} data-testid="settings-connection-add">
            <Plus />
            {copy.settings.connections.add}
          </Button>
        }
      >
        {connections.isLoading ? (
          <Skeleton className="my-3 h-4 w-48" />
        ) : connections.data?.length ? (
          connections.data.map((connection) => (
            <Row
              key={connection.name}
              label={
                <span className="flex items-center gap-2.5">
                  <ServiceMark name={connection.name} />
                  {connectionLabel(connection.name)}
                </span>
              }
              value={
                <StatusChip
                  status={CHIP_STATUS[connection.status]}
                  label={copy.settings.connections.status[connection.status]}
                  detail={connection.status === "failed" && connection.error ? `· ${connection.error}` : undefined}
                />
              }
              action={
                <>
                  {action(connection)}
                  <Menu
                    align="end"
                    trigger={
                      <Button variant="quiet" size="icon-sm" aria-label={`${connectionLabel(connection.name)}: ${copy.common.more}`}>
                        <Ellipsis />
                      </Button>
                    }
                  >
                    <MenuItem icon={<Info />} onClick={() => setDetails(connection)}>
                      {copy.settings.connections.technical}
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem icon={<Trash2 />} danger onClick={() => setRemoving(connection)}>
                      {copy.settings.connections.remove}
                    </MenuItem>
                  </Menu>
                </>
              }
            />
          ))
        ) : (
          <p className="py-3 text-sm text-muted-foreground">{copy.settings.connections.empty}</p>
        )}
      </Section>
      <ConnectionDialog open={adding} onOpenChange={setAdding} projectId={props.projectId} />
      <Dialog open={details !== null} onOpenChange={(open) => !open && setDetails(null)} title={details ? connectionLabel(details.name) : ""}>
        {details ? (
          <div className="flex flex-col">
            <Row label={copy.settings.connections.name} value={<Chip mono>{details.name}</Chip>} />
            <Row label={copy.settings.connections.kind} value={details.kind === "remote" ? copy.settings.connections.remote : copy.settings.connections.local} />
            <Row label={details.kind === "remote" ? copy.settings.connections.url : copy.settings.connections.command} value={<span className="break-all font-mono text-xs">{details.target}</span>} className="[&>div:last-child]:max-w-full [&>div:last-child>div]:whitespace-normal" />
          </div>
        ) : null}
      </Dialog>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={copy.settings.connections.removeTitle(removing ? connectionLabel(removing.name) : "")}
        body={copy.settings.connections.removeBody}
        confirmLabel={copy.settings.connections.remove}
        onConfirm={() => {
          const connection = removing;
          setRemoving(null);
          if (connection)
            void attempt(async () => {
              await backend.config.removeConnection(props.projectId, connection.name);
              await refresh();
            }, copy.settings.connections.removed);
        }}
      />
    </>
  );
}

/** Catalog first: a tile adds a known service in one go; "Andere dienst" opens the form. */
function ConnectionDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; projectId: string }) {
  const backend = useBackend();
  const client = useQueryClient();
  const [custom, setCustom] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"remote" | "local">("remote");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (props.open) {
      setCustom(false);
      setName("");
      setKind("remote");
      setTarget("");
      setError(null);
    }
  }, [props.open]);

  const add = async (input: NewConnectionInput) => {
    setBusy(true);
    setError(null);
    try {
      await backend.config.addConnection(props.projectId, input);
      await client.invalidateQueries({ queryKey: keys.connections(props.projectId) });
      toast(copy.settings.connections.added);
      props.onOpenChange(false);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };
  const save = () => {
    if (!NAME_PATTERN.test(name)) return setError(copy.settings.connections.nameHint);
    if (!target.trim()) return setError(kind === "remote" ? copy.settings.connections.url : copy.settings.connections.command);
    void add(kind === "remote" ? { name, kind, url: target.trim() } : { name, kind, command: target.trim() });
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={copy.settings.connections.add}
      footer={
        custom ? (
          <>
            <Button variant="secondary" onClick={() => props.onOpenChange(false)} disabled={busy}>
              {copy.common.cancel}
            </Button>
            <Button variant="primary" onClick={save} disabled={busy}>
              {copy.settings.add}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {!custom ? (
          <div role="group" aria-label={copy.settings.connections.catalog} className="flex flex-col">
            {CATALOG.map((entry) => (
              <button
                key={entry.name}
                type="button"
                disabled={busy}
                onClick={() => void add({ name: entry.name, kind: "remote", url: entry.url })}
                className="flex min-h-11 items-center gap-3 border-b border-border py-2 text-start text-sm outline-none hover:bg-hover/60 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45 pointer-coarse:min-h-12"
              >
                <ServiceMark name={entry.name} />
                <span className="min-w-0 flex-1 truncate font-medium">{entry.label}</span>
                <Plus aria-hidden="true" className="size-4 text-subtle-foreground" />
              </button>
            ))}
            <button type="button" onClick={() => setCustom(true)} className="flex min-h-11 items-center gap-3 py-2 text-start text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-12">
              <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-md ring-1 ring-inset ring-border">
                <Plus className="size-4" />
              </span>
              {copy.settings.connections.other}
            </button>
          </div>
        ) : (
          <>
            <Field label={copy.settings.connections.name} hint={copy.settings.connections.nameHint}>
              {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={name} onChange={(event) => setName(event.target.value.toLowerCase())} autoFocus />}
            </Field>
            <Field label={copy.settings.connections.kind}>
              {(id) => (
                <div id={id}>
                  <SegmentedControl
                    label={copy.settings.connections.kind}
                    value={kind}
                    onValueChange={setKind}
                    fill
                    items={[
                      { value: "remote", label: copy.settings.connections.remote },
                      { value: "local", label: copy.settings.connections.local },
                    ]}
                  />
                </div>
              )}
            </Field>
            <Field label={kind === "remote" ? copy.settings.connections.url : copy.settings.connections.command}>
              {(id) => <Input id={id} value={target} onChange={(event) => setTarget(event.target.value)} className="font-mono" placeholder={kind === "remote" ? "https://…" : "npx -y …"} />}
            </Field>
          </>
        )}
        {error ? (
          <p className="text-sm text-destructive-foreground" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
