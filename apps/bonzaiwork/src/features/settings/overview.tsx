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
  const open = (target: SettingsGroup) => copy.settings.overviewOpen(copy.settings.groups[target]);

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
    <Section title={copy.settings.overview} className="mb-8">
      {group !== "toegang" ? (
        <>
          <OverviewRow
            label={copy.settings.overviewRows.key}
            value={hasKey ? copy.settings.key.linked((status.data?.keyMode === "user" ? status.data.user.keyHint : project.key.keyHint) ?? "") : <StatusChip status="locked" label={copy.settings.key.missing} />}
            attention={!hasKey}
            href={link("toegang")}
            openLabel={open("toegang")}
            testId="settings-overview-key"
          />
          {backend.capabilities.usage ? <OverviewRow label={copy.settings.overviewRows.usage} value={usage.data ? usageText(usage.data.spend, usage.data.maxBudget, usage.data.currency) : "…"} href={link("toegang")} openLabel={open("toegang")} /> : null}
          <OverviewRow
            label={copy.settings.overviewRows.runMode}
            value={runMode.data ? (runMode.data.supported && runMode.data.mode ? copy.settings.runModes[runMode.data.mode].label : <Locked>{copy.settings.runModes.default.label}</Locked>) : "…"}
            href={link("toegang")}
            openLabel={open("toegang")}
          />
          <OverviewRow
            label={copy.settings.overviewRows.connections}
            value={connections.data ? connectionsSummary(connections.data) : "…"}
            attention={connections.data?.some((connection) => connection.status === "needs_auth" || connection.status === "failed")}
            href={link("toegang")}
            openLabel={open("toegang")}
          />
        </>
      ) : null}
      {group !== "agent" ? (
        <>
          <OverviewRow label={copy.settings.overviewRows.defaultModel} value={modelName(status.data, project.defaultModel) ?? copy.settings.models.defaultModelNone} href={link("agent")} openLabel={open("agent")} />
          <OverviewRow label={copy.settings.overviewRows.models} value={models.length ? allowedSummary(project, models) : copy.settings.models.empty} attention={project.allowedModels !== null && project.allowedModels.length === 0 && models.length > 0} href={link("agent")} openLabel={open("agent")} />
          <OverviewRow label={copy.settings.overviewRows.instructions} value={instructions.data === undefined ? "…" : lines ? copy.settings.lines(lines) : copy.settings.none} href={link("agent")} openLabel={open("agent")} />
          <OverviewRow label={copy.settings.overviewRows.methods} value={methods.isLoading ? "…" : copy.settings.methodsCount(methods.skillCount, methods.commandCount) || copy.settings.none} href={link("agent")} openLabel={open("agent")} />
        </>
      ) : null}
      {group !== "project" ? (
        <>
          {backend.capabilities.agenda ? <OverviewRow label={copy.settings.overviewRows.post} value={agenda.data ? <PostLine post={post} className="min-w-0 truncate text-muted-foreground" /> : "…"} href={link("project")} openLabel={open("project")} /> : null}
          <OverviewRow label={copy.settings.overviewRows.folder} value={<span title={project.path}>{folderName(project.path)}</span>} href={link("project")} openLabel={open("project")} />
        </>
      ) : null}
      {group !== "technisch" ? (
        <>
          <OverviewRow label={copy.settings.overviewRows.engine} value={versions.data?.engine ?? (backend.mode === "demo" ? copy.boot.demoBadge : "…")} href={link("technisch")} openLabel={open("technisch")} />
          <OverviewRow label={copy.settings.overviewRows.activity} value={audit.data ? (audit.data.length ? copy.settings.changes(audit.data.length) : copy.settings.none) : "…"} href={link("technisch")} openLabel={open("technisch")} />
        </>
      ) : null}
    </Section>
  );
}
