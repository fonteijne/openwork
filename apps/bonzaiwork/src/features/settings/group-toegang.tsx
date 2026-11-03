import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ellipsis, Plus, Unlink, X } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys, modelName, useBrains, useReads, useStatus, useUsage } from "~/backend/queries";
import type { Project, RunMode } from "~/backend/types";
import { PromptDialog } from "~/components/prompt-dialog";
import { Button } from "~/components/ui/button";
import { StatusChip } from "~/components/ui/chip";
import { Menu, MenuItem } from "~/components/ui/menu";
import { Locked, Row, Section, Skeleton } from "~/components/ui/misc";
import { ConfirmDialog } from "~/components/ui/overlay";
import { Progress } from "~/components/ui/progress";
import { SegmentedControl } from "~/components/ui/segmented";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { BrainPicker } from "~/features/brain/brain-picker";
import { errorText } from "~/lib/errors";
import { formatMoney } from "~/lib/format";
import { href } from "~/lib/router";

import { ConnectionsSection } from "./connections";
import { attempt, folderName, KeyForm } from "./shared";

const RUN_MODES: readonly RunMode[] = ["default", "approve", "run-everything"];

/**
 * Toegang group (brief §6): the key without the vendor name, "Ontkoppelen" in the overflow (P8),
 * spend as a bar, run mode as a SegmentedControl, folders outside the project, connections with a
 * status-driven action, and the other brains this project reads. Locked rows, never missing ones (P4).
 */
export function ToegangGroup(props: { project: Project }) {
  return (
    <div className="flex flex-col gap-8">
      <KeySection project={props.project} />
      <UsageSection project={props.project} />
      <RunModeSection projectId={props.project.id} />
      <FoldersSection projectId={props.project.id} />
      <ConnectionsSection projectId={props.project.id} />
      <ReadsSection projectId={props.project.id} />
    </div>
  );
}

function KeySection(props: { project: Project }) {
  const backend = useBackend();
  const client = useQueryClient();
  const status = useStatus();
  const [replacing, setReplacing] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const { project } = props;
  const userMode = status.data?.keyMode === "user";
  const afterKeyChange = () => Promise.all([client.invalidateQueries({ queryKey: keys.projects }), client.invalidateQueries({ queryKey: keys.status })]);

  return (
    <Section title={copy.settings.key.title}>
      {userMode ? (
        <Row
          label={copy.settings.key.personal}
          value={status.data?.user.hasKey ? copy.settings.key.linked(status.data.user.keyHint ?? "") : <StatusChip status="locked" label={copy.settings.key.missing} />}
          action={
            <a href={href({ name: "settings", group: "toegang" })} className="inline-flex h-7 items-center rounded-full px-3 text-xs font-medium text-foreground ring-1 ring-inset ring-border-strong hover:bg-hover pointer-coarse:h-9">
              {copy.settings.key.personalOpen}
            </a>
          }
        />
      ) : replacing || !project.key.hasKey ? (
        <>
          {!project.key.hasKey ? <Row label={copy.settings.key.label} value={<StatusChip status="locked" label={copy.settings.key.missing} />} /> : null}
          <KeyForm
            autoFocus={replacing}
            onCancel={project.key.hasKey ? () => setReplacing(false) : undefined}
            onLink={async (key) => {
              client.setQueryData(keys.status, await backend.keys.linkProject(project.id, key));
              await afterKeyChange();
              setReplacing(false);
              toast(copy.keys.linkedToast);
            }}
          />
        </>
      ) : (
        <Row
          label={copy.settings.key.label}
          value={<span data-testid="settings-key-state">{copy.settings.key.linked(project.key.keyHint ?? "")}</span>}
          action={
            <>
              <Button variant="secondary" size="sm" onClick={() => setReplacing(true)}>
                {copy.settings.key.replace}
              </Button>
              <Menu
                align="end"
                trigger={
                  <Button variant="quiet" size="icon-sm" aria-label={copy.settings.key.more}>
                    <Ellipsis />
                  </Button>
                }
              >
                <MenuItem icon={<Unlink />} danger onClick={() => setUnlinking(true)}>
                  {copy.settings.key.unlink}
                </MenuItem>
              </Menu>
            </>
          }
        />
      )}
      {status.data?.keyStorePersistent === false ? <Locked className="py-2">{copy.onboarding.notPersistent}</Locked> : null}
      <ConfirmDialog
        open={unlinking}
        onOpenChange={setUnlinking}
        title={copy.keys.confirmUnlink}
        body={copy.keys.confirmUnlinkBody}
        confirmLabel={copy.settings.key.unlink}
        onConfirm={() => {
          setUnlinking(false);
          void attempt(async () => {
            client.setQueryData(keys.status, await backend.keys.unlinkProject(project.id));
            await afterKeyChange();
          }, copy.keys.unlinked);
        }}
      />
    </Section>
  );
}

/** "€ 18 van € 50" as a bar (brief §12 Progress); amber near the end, red when the budget is gone. */
export function usageText(spend: number, budget: number | null, currency: string): string {
  return budget !== null ? copy.settings.usage.of(formatMoney(spend, currency), formatMoney(budget, currency)) : formatMoney(spend, currency);
}

function UsageSection(props: { project: Project }) {
  const backend = useBackend();
  const status = useStatus();
  const usage = useUsage(props.project.id);
  if (!backend.capabilities.usage) {
    return (
      <Section title={copy.settings.usage.title}>
        <Row label={copy.settings.usage.thisMonth} value={<Locked>{copy.settings.usage.locked}</Locked>} />
      </Section>
    );
  }
  const data = usage.data;
  if (!data) {
    return (
      <Section title={copy.settings.usage.title}>
        <Skeleton className="my-3 h-4 w-40" />
      </Section>
    );
  }
  const ratio = data.maxBudget ? data.spend / data.maxBudget : null;
  return (
    <Section title={copy.settings.usage.title}>
      <div className="py-3">
        <Progress
          label={copy.settings.usage.thisMonth}
          caption={copy.settings.usage.thisMonth}
          value={data.maxBudget ? Math.min(data.spend, data.maxBudget) : null}
          max={data.maxBudget ?? undefined}
          valueText={usageText(data.spend, data.maxBudget, data.currency)}
          tone={ratio !== null && ratio >= 1 ? "exceeded" : ratio !== null && ratio >= 0.8 ? "warning" : "neutral"}
        />
      </div>
      {data.byModel.map((entry) => (
        <Row key={entry.model} label={modelName(status.data, entry.model) ?? entry.model} value={formatMoney(entry.spend, data.currency)} />
      ))}
    </Section>
  );
}

/** One row, the choice as a SegmentedControl, the consequence of the chosen option as its state (assessment I-7). */
function RunModeSection(props: { projectId: string }) {
  const backend = useBackend();
  const client = useQueryClient();
  const mode = useQuery({ queryKey: keys.runMode(props.projectId), queryFn: () => backend.config.runMode(props.projectId) });
  const chosen = mode.data?.mode ?? "default";
  return (
    <Section title={copy.settings.runMode.title}>
      {mode.isLoading ? (
        <Skeleton className="my-3 h-7 w-64 rounded-full" />
      ) : !mode.data?.supported ? (
        <Row label={copy.settings.runMode.question} value={<Locked>{mode.data?.reason ?? copy.settings.runModeUnsupported}</Locked>} />
      ) : (
        <Row
          label={copy.settings.runMode.question}
          hint={copy.settings.runModes[chosen].hint}
          action={
            <SegmentedControl<RunMode>
              label={copy.settings.runMode.question}
              size="sm"
              value={chosen}
              items={RUN_MODES.map((value) => ({ value, label: copy.settings.runMode.short[value] }))}
              onValueChange={(value) =>
                void attempt(async () => {
                  client.setQueryData(keys.runMode(props.projectId), await backend.config.setRunMode(props.projectId, value));
                }, copy.settings.saved)
              }
            />
          }
        />
      )}
    </Section>
  );
}

function FoldersSection(props: { projectId: string }) {
  const backend = useBackend();
  const client = useQueryClient();
  const mode = useQuery({ queryKey: keys.runMode(props.projectId), queryFn: () => backend.config.runMode(props.projectId) });
  const folders = useQuery({ queryKey: keys.folders(props.projectId), queryFn: () => backend.config.folders(props.projectId) });
  const [adding, setAdding] = useState(false);
  // The engine that takes no run mode (OpenCode v2) takes no folder list either; the row stays with its reason (P4).
  const apply = mode.data?.supported !== false;
  const setFolders = (next: string[]) =>
    attempt(async () => {
      client.setQueryData(keys.folders(props.projectId), await backend.config.setFolders(props.projectId, next));
    }, copy.settings.saved);
  const addFolder = async () => {
    if (backend.capabilities.folderPicker) {
      const picked = await backend.desktop.pickFolder();
      if (picked) await setFolders([...(folders.data ?? []), picked]);
    } else setAdding(true);
  };
  return (
    <Section
      title={copy.settings.folders.title}
      action={
        apply ? (
          <Button variant="quiet" size="sm" onClick={() => void addFolder()}>
            <Plus />
            {copy.settings.folders.add}
          </Button>
        ) : undefined
      }
    >
      {!apply ? (
        <Row label={copy.settings.folders.title} value={<Locked>{copy.settings.foldersUnsupported}</Locked>} />
      ) : folders.data?.length ? (
        folders.data.map((folder) => (
          <Row
            key={folder}
            label={<span title={folder}>{folderName(folder)}</span>}
            value={<span className="font-mono text-xs">{folder}</span>}
            action={
              <Button variant="quiet" size="icon-sm" aria-label={copy.settings.folders.remove(folder)} onClick={() => void setFolders((folders.data ?? []).filter((entry) => entry !== folder))}>
                <X />
              </Button>
            }
          />
        ))
      ) : (
        <Row label={copy.settings.folders.empty} />
      )}
      <PromptDialog open={adding} onOpenChange={setAdding} title={copy.settings.folders.add} label={copy.settings.folders.pathLabel} placeholder={copy.settings.folders.placeholder} submitLabel={copy.settings.add} onSubmit={async (path) => void (await setFolders([...(folders.data ?? []), path]))} />
    </Section>
  );
}

/** Other brains this project reads without asking (brains plan §5.2); a lock without the capability (P4). */
function ReadsSection(props: { projectId: string }) {
  const backend = useBackend();
  const client = useQueryClient();
  const status = useStatus();
  const reads = useReads(props.projectId);
  const brains = useBrains();
  const [busy, setBusy] = useState(false);
  const others = (brains.data ?? []).some((brain) => brain.status.kind === "project" && brain.projectId !== props.projectId);
  const change = async (next: string[]) => {
    setBusy(true);
    client.setQueryData(keys.reads(props.projectId), next);
    try {
      client.setQueryData(keys.reads(props.projectId), await backend.brains.setReads(props.projectId, next));
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
      await reads.refetch();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title={copy.settings.brains.title}>
      {!backend.capabilities.brains ? (
        <Row label={copy.brain.reads} value={<Locked>{copy.brain.locked}</Locked>} />
      ) : !others ? (
        <Row label={copy.settings.brains.none} />
      ) : (
        <div className="py-3">
          <BrainPicker label={copy.brain.reads} hint={copy.brain.readsHint} exclude={props.projectId} value={reads.data ?? []} onChange={(next) => void change(next)} disabled={(status.data?.readOnly ?? false) || busy} />
        </div>
      )}
    </Section>
  );
}
