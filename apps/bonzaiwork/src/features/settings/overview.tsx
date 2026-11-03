import { useQuery } from "@tanstack/react-query";

import { useBackend } from "~/backend/context";
import { keys, modelName, projectHasKey, useAgendaSettings, useStatus, useUsage } from "~/backend/queries";
import type { Project } from "~/backend/types";
import { StatusChip } from "~/components/ui/chip";
import { Locked, Section } from "~/components/ui/misc";
import { copy } from "~/copy";
import { PostLine } from "~/features/agenda/bridge-post-field";
import { href, type SettingsGroup } from "~/lib/router";

import { connectionsSummary } from "./connections";
import { settingsCopy } from "./copy";
import { allowedSummary } from "./models";
import { usageText } from "./group-toegang";
import { folderName, OverviewRow } from "./shared";
import { useMethods } from "./werkwijzen";

/**
 * "Overzicht" (brief §6; assessment I-2): one row per concern with its current state, the row a
 * link to its group (S2, P1). The rows of the open group are left out: they stand right below,
 * with their controls. Most visits end here, so the state must be readable without opening anything.
 */
export function Overview(props: { project: Project; group: SettingsGroup }) {
  const backend = useBackend();
  const status = useStatus();
  const { project, group } = props;
  const hasKey = projectHasKey(status.data, project);
  const link = (target: SettingsGroup) => href({ name: "project-settings", projectId: project.id, group: target });
  const open = (target: SettingsGroup) => settingsCopy.overviewOpen(settingsCopy.groups[target]);

  const instructions = useQuery({ queryKey: keys.instructions(project.id), queryFn: () => backend.config.instructions(project.id), enabled: group !== "agent" });
  const methods = useMethods(group === "agent" ? null : project.id, "project");
  const connections = useQuery({ queryKey: keys.connections(project.id), queryFn: () => backend.config.connections(project.id), enabled: group !== "toegang" });
  const runMode = useQuery({ queryKey: keys.runMode(project.id), queryFn: () => backend.config.runMode(project.id), enabled: group !== "toegang" });
  const usage = useUsage(project.id);
  const agenda = useAgendaSettings(backend.capabilities.agenda && group !== "project");
  const audit = useQuery({ queryKey: keys.audit(project.id), queryFn: () => backend.config.audit(project.id), enabled: group !== "technisch" });
  const versions = useQuery({ queryKey: keys.versions, queryFn: () => backend.settings.versions(), staleTime: 5 * 60_000, enabled: group !== "technisch" });

  const models = status.data?.models ?? [];
  const lines = (instructions.data ?? "").split("\n").filter((line) => line.trim()).length;
  const post = agenda.data?.projects.find((entry) => entry.workspaceId === project.id)?.bridgePost ?? null;

  return (
    <Section title={settingsCopy.overview} className="mb-8">
      {group !== "toegang" ? (
        <>
          <OverviewRow
            label={settingsCopy.overviewRows.key}
            value={hasKey ? settingsCopy.key.linked((status.data?.keyMode === "user" ? status.data.user.keyHint : project.key.keyHint) ?? "") : <StatusChip status="locked" label={settingsCopy.key.missing} />}
            attention={!hasKey}
            href={link("toegang")}
            openLabel={open("toegang")}
            testId="settings-overview-key"
          />
          {backend.capabilities.usage ? <OverviewRow label={settingsCopy.overviewRows.usage} value={usage.data ? usageText(usage.data.spend, usage.data.maxBudget, usage.data.currency) : "…"} href={link("toegang")} openLabel={open("toegang")} /> : null}
          <OverviewRow
            label={settingsCopy.overviewRows.runMode}
            value={runMode.data ? (runMode.data.supported && runMode.data.mode ? copy.settings.runModes[runMode.data.mode].label : <Locked>{copy.settings.runModes.default.label}</Locked>) : "…"}
            href={link("toegang")}
            openLabel={open("toegang")}
          />
          <OverviewRow
            label={settingsCopy.overviewRows.connections}
            value={connections.data ? connectionsSummary(connections.data) : "…"}
            attention={connections.data?.some((connection) => connection.status === "needs_auth" || connection.status === "failed")}
            href={link("toegang")}
            openLabel={open("toegang")}
          />
        </>
      ) : null}
      {group !== "agent" ? (
        <>
          <OverviewRow label={settingsCopy.overviewRows.defaultModel} value={modelName(status.data, project.defaultModel) ?? settingsCopy.models.defaultModelNone} href={link("agent")} openLabel={open("agent")} />
          <OverviewRow label={settingsCopy.overviewRows.models} value={models.length ? allowedSummary(project, models) : settingsCopy.models.empty} attention={project.allowedModels !== null && project.allowedModels.length === 0 && models.length > 0} href={link("agent")} openLabel={open("agent")} />
          <OverviewRow label={settingsCopy.overviewRows.instructions} value={instructions.data === undefined ? "…" : lines ? settingsCopy.lines(lines) : settingsCopy.none} href={link("agent")} openLabel={open("agent")} />
          <OverviewRow label={settingsCopy.overviewRows.methods} value={methods.isLoading ? "…" : settingsCopy.methodsCount(methods.skillCount, methods.commandCount) || settingsCopy.none} href={link("agent")} openLabel={open("agent")} />
        </>
      ) : null}
      {group !== "project" ? (
        <>
          {backend.capabilities.agenda ? <OverviewRow label={settingsCopy.overviewRows.post} value={agenda.data ? <PostLine post={post} className="min-w-0 truncate text-muted-foreground" /> : "…"} href={link("project")} openLabel={open("project")} /> : null}
          <OverviewRow label={settingsCopy.overviewRows.folder} value={<span title={project.path}>{folderName(project.path)}</span>} href={link("project")} openLabel={open("project")} />
        </>
      ) : null}
      {group !== "technisch" ? (
        <>
          <OverviewRow label={settingsCopy.overviewRows.engine} value={versions.data?.engine ?? (backend.mode === "demo" ? copy.boot.demoBadge : "…")} href={link("technisch")} openLabel={open("technisch")} />
          <OverviewRow label={settingsCopy.overviewRows.activity} value={audit.data ? (audit.data.length ? settingsCopy.changes(audit.data.length) : settingsCopy.none) : "…"} href={link("technisch")} openLabel={open("technisch")} />
        </>
      ) : null}
    </Section>
  );
}
