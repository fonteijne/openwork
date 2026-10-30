import { useState } from "react";
import { Ellipsis, MessageSquare } from "lucide-react";

import { useBackend } from "~/backend/context";
import { useBrain, useBrainAuthor, useBrainHistory, useStatus } from "~/backend/queries";
import type { BrainMode, Project } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/field";
import { Menu, MenuItem } from "~/components/ui/menu";
import { Locked, Row, Section, Skeleton } from "~/components/ui/misc";
import { ConfirmDialog } from "~/components/ui/overlay";
import { Select } from "~/components/ui/select";
import { copy } from "~/copy";
import { formatDateTime, relativeTime } from "~/lib/format";
import { navigate } from "~/lib/router";
import { fileName } from "~/lib/tools";

import { useBrainAction } from "./actions";
import { brainStateLabel } from "./status-pill";

const MODES: BrainMode[] = ["auto", "manual", "read_only"];

function History(props: { projectId: string }) {
  const history = useBrainHistory(props.projectId);
  const author = useBrainAuthor();
  const { busy, run, brains } = useBrainAction(props.projectId);
  // A chat only exists on the laptop of whoever had it: link one's own turns only.
  const me = author.data?.author?.name ?? author.data?.suggested?.name ?? null;
  if (history.isLoading) return <Skeleton className="my-3 h-24 w-full" />;
  const entries = history.data ?? [];
  if (!entries.length) return <p className="py-3 text-sm text-muted-foreground">{copy.brain.historyEmpty}</p>;
  return (
    <>
      {entries.map((entry) => (
        <Row
          key={entry.commit}
          label={entry.title}
          hint={`${entry.author}, ${relativeTime(entry.at)}${entry.files.length ? `: ${entry.files.slice(0, 3).map(fileName).join(", ")}` : ""}`}
          action={
            <Menu align="end" trigger={<Button variant="quiet" size="icon-sm" aria-label={copy.brain.history} disabled={busy !== null}><Ellipsis /></Button>}>
              {entry.chatId && entry.author === me ? (
                <MenuItem icon={<MessageSquare />} onClick={() => navigate({ name: "project", projectId: props.projectId, chatId: entry.chatId })}>
                  {copy.brain.openChat}
                </MenuItem>
              ) : null}
              {entry.files.filter((file) => file.endsWith(".md")).slice(0, 8).map((file) => (
                <MenuItem key={file} onClick={() => void run("restore", () => brains.restore(props.projectId, entry.commit, file), copy.brain.restored)}>
                  {copy.brain.restoreNote}: {fileName(file)}
                </MenuItem>
              ))}
              <MenuItem onClick={() => void run("revert", () => brains.restore(props.projectId, entry.commit, null), copy.brain.restored)}>
                {copy.brain.revertTurn}
              </MenuItem>
            </Menu>
          }
        />
      ))}
    </>
  );
}

function Excluded(props: { projectId: string; current: string }) {
  const [value, setValue] = useState(props.current);
  const { busy, run, brains } = useBrainAction(props.projectId);
  const folders = value.split(",").map((folder) => folder.trim()).filter(Boolean);
  return (
    <div className="border-b border-border py-3">
      <label className="text-sm font-medium" htmlFor="brain-excluded">{copy.brain.excluded}</label>
      <p className="text-xs text-muted-foreground">{copy.brain.excludedHint}</p>
      <div className="mt-2 flex gap-2">
        <Input id="brain-excluded" value={value} onChange={(event) => setValue(event.target.value)} placeholder={copy.brain.excludedPlaceholder} />
        <Button variant="secondary" disabled={busy !== null || value === props.current} onClick={() => void run("excluded", () => brains.setExcluded(props.projectId, folders), copy.settings.saved)}>
          {copy.settings.save}
        </Button>
      </div>
    </div>
  );
}

function PrivateRepo(props: { projectId: string; path: string }) {
  const [url, setUrl] = useState("");
  const { busy, run, brains } = useBrainAction(props.projectId);
  const cloud = /\/Library\/(Mobile Documents|CloudStorage)\/|\/(OneDrive|Dropbox|Google Drive)( [^/]*)?\//i.test(props.path);
  if (cloud) return <Row label={copy.brain.privateRepo} value={<Locked>{copy.brain.privateRepoCloud}</Locked>} />;
  return (
    <div className="border-b border-border py-3">
      <label className="text-sm font-medium" htmlFor="brain-private-repo">{copy.brain.privateRepo}</label>
      <p className="text-xs text-muted-foreground">{copy.brain.privateRepoNone}</p>
      <div className="mt-2 flex gap-2">
        <Input id="brain-private-repo" value={url} onChange={(event) => setUrl(event.target.value)} placeholder={copy.brain.linkPlaceholder} className="font-mono" />
        <Button variant="secondary" disabled={busy !== null || !url.trim()} onClick={() => void run("remote", () => brains.attachRemote(props.projectId, url.trim()), copy.brain.shared)}>
          {copy.brain.privateRepoLink}
        </Button>
      </div>
    </div>
  );
}

/** Project settings, "Brein" (brains plan §8.2): rows, state right, one action each (DESIGN.md S2). */
export function BrainSettingsSection(props: { project: Project }) {
  const backend = useBackend();
  const status = useStatus();
  const brain = useBrain(props.project.id);
  const { busy, run, brains } = useBrainAction(props.project.id);
  const [stopping, setStopping] = useState(false);
  const readOnly = status.data?.readOnly ?? false;

  if (!backend.capabilities.brains) {
    return <Section title={copy.brain.sectionTitle}><Row label={copy.brain.sectionTitle} value={<Locked>{copy.brain.locked}</Locked>} /></Section>;
  }
  if (!brain) {
    return (
      <Section title={copy.brain.sectionTitle}>
        <Row label={copy.brain.notABrain} />
      </Section>
    );
  }

  const { status: brainStatus } = brain;
  const personalBrain = brainStatus.kind === "personal";
  return (
    <div className="flex flex-col gap-10">
      <Section title={copy.brain.sectionTitle}>
        <Row label={copy.brain.pillLabel} value={brainStateLabel(brainStatus)} />
        {brainStatus.error ? <p className="border-b border-border py-2.5 text-sm text-muted-foreground" role="status">{brainStatus.error}</p> : null}
        {brainStatus.remote ? <Row label={copy.brain.remote} value={<code className="font-mono text-xs">{brainStatus.remote}</code>} /> : null}
        {brainStatus.remote ? <Row label={copy.brain.branch} value={brainStatus.branch} /> : null}
        {brainStatus.remote ? (
          <Row
            label={copy.brain.mode}
            action={
              <Select
                label={copy.brain.mode}
                value={brainStatus.mode}
                disabled={readOnly || busy !== null}
                onValueChange={(value) => {
                  const mode = MODES.find((entry) => entry === value);
                  if (mode) void run("mode", () => brains.setMode(props.project.id, mode), copy.settings.saved);
                }}
                items={MODES.map((mode) => ({ value: mode, label: copy.brain.modes[mode] }))}
              />
            }
          />
        ) : null}
        <Row label={copy.brain.lastSync} value={brainStatus.lastSyncAt ? formatDateTime(brainStatus.lastSyncAt) : copy.brain.never} />
        {brainStatus.pendingTrust.length ? (
          <Row
            label={copy.brain.trustedParts}
            value={brainStatus.pendingTrust.map((item) => fileName(item.path)).join(", ")}
            action={
              <Button variant="secondary" size="sm" disabled={readOnly || busy !== null} onClick={() => void run("trust", () => brains.trust(props.project.id, brainStatus.pendingTrust.map((item) => item.path)), copy.brain.trusted)}>
                {copy.brain.trustAllow}
              </Button>
            }
          />
        ) : null}
        {brainStatus.unshared.length ? (
          <Row
            label={copy.brain.unshared(brainStatus.unshared.length)}
            value={brainStatus.unshared.slice(0, 3).map((item) => `${fileName(item.path)} (${copy.brain.unsharedReason[item.reason]})`).join(", ")}
          />
        ) : null}
        {brainStatus.warnings.map((warning) => <p key={warning} className="border-b border-border py-2.5 text-sm text-muted-foreground">{warning}</p>)}
        {personalBrain ? <Excluded key={brainStatus.excluded.join(",")} projectId={props.project.id} current={brainStatus.excluded.join(", ")} /> : null}
        {personalBrain && !brainStatus.remote ? <PrivateRepo projectId={props.project.id} path={brain.path} /> : null}
        {personalBrain ? null : (
          <Row
            label={copy.brain.stopSync}
            action={<Button variant="secondary" size="sm" disabled={readOnly} onClick={() => setStopping(true)}>{copy.brain.stopSync}</Button>}
          />
        )}
      </Section>
      <Section title={copy.brain.history}>
        <History projectId={props.project.id} />
      </Section>
      <ConfirmDialog
        open={stopping}
        onOpenChange={setStopping}
        title={copy.brain.stopSync}
        body={copy.brain.stopSyncBody}
        confirmLabel={copy.brain.stopSync}
        busy={busy !== null}
        onConfirm={() => void run("stop", () => brains.unregister(props.project.id), copy.brain.stopped).then(() => setStopping(false))}
      />
    </div>
  );
}
