import { useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { addDays, dateOf, dutchDuration, QUARTER_MINUTES, weekOf } from "@bonzaiwork/agenda/model";
import { ChevronDown, Download, FolderOpen } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys, useAgendaSettings, usePersonalBrain, useStatus } from "~/backend/queries";
import { PROJECT_COLORS, PROJECT_ICONS, type Project, type ProjectPatch } from "~/backend/types";
import { PROJECT_ICON_COMPONENTS, ProjectIcon } from "~/components/project-icon";
import { Button } from "~/components/ui/button";
import { Disclosure } from "~/components/ui/disclosure";
import { Row, Section, Skeleton } from "~/components/ui/misc";
import { ConfirmDialog } from "~/components/ui/overlay";
import { Popover, PopoverClose } from "~/components/ui/popover";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { ProjectPostRow } from "~/features/agenda/agenda-settings";
import { cn } from "~/lib/cn";
import { navigate } from "~/lib/router";

import { settingsCopy } from "./copy";
import { attempt, folderName, InlineTextRow } from "./shared";

/**
 * Project group (brief §6): name and description inline with undo in the toast (P8), look in a
 * Popover (S7), the folder by its name, the Bridge post with this week's line, and the rare
 * actions under a collapsed "Meer" (P3).
 */
export function ProjectGroup(props: { project: Project }) {
  const backend = useBackend();
  const client = useQueryClient();
  const status = useStatus();
  const { project } = props;
  const personal = usePersonalBrain()?.projectId === project.id;
  const [removing, setRemoving] = useState(false);
  const readOnly = status.data?.readOnly ?? false;
  const update = async (patch: ProjectPatch) => {
    await backend.projects.update(project.id, patch);
    await client.invalidateQueries({ queryKey: keys.projects });
  };
  /** Saves, then offers the previous value in the toast instead of asking first (P8). */
  const saveWithUndo = async (patch: ProjectPatch, previous: ProjectPatch, done: string, restored: string) => {
    await update(patch);
    toast(done, { action: { label: copy.common.undo, onClick: () => void attempt(() => update(previous), restored) } });
  };

  return (
    <div className="flex flex-col gap-8">
      <Section title={settingsCopy.groups.project}>
        <InlineTextRow
          label={settingsCopy.project.name}
          value={project.name}
          required={settingsCopy.project.nameEmpty}
          disabled={readOnly}
          onSave={(next, previous) => saveWithUndo({ name: next }, { name: previous }, settingsCopy.project.nameChanged, settingsCopy.project.nameRestored)}
          testId="settings-project-name"
        />
        <Row label={settingsCopy.project.look} action={<LookPicker project={project} disabled={readOnly} onChange={(patch) => void attempt(() => update(patch), settingsCopy.project.lookSaved)} />} />
        <InlineTextRow
          label={settingsCopy.project.description}
          value={project.description ?? ""}
          empty={settingsCopy.project.descriptionEmpty}
          placeholder={settingsCopy.project.descriptionPlaceholder}
          multiline
          onSave={(next, previous) => saveWithUndo({ description: next || null }, { description: previous || null }, settingsCopy.project.descriptionChanged, settingsCopy.project.descriptionRestored)}
        />
        <Row
          label={settingsCopy.project.folder}
          value={<span title={project.path}>{folderName(project.path)}</span>}
          action={
            backend.capabilities.revealPath ? (
              <Button variant="secondary" size="sm" onClick={() => void backend.desktop.revealPath(project.path)}>
                <FolderOpen />
                {settingsCopy.project.reveal}
              </Button>
            ) : undefined
          }
        />
        <ProjectPostRow projectId={project.id} />
        <WeekRow projectId={project.id} />
      </Section>

      <Disclosure label={settingsCopy.project.more} testId="settings-project-more" panelClassName="ps-0 pt-0">
        <div className="border-t border-border">
          <Row
            label={settingsCopy.project.export}
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  void attempt(async () => {
                    const url = await backend.projects.exportUrl(project.id);
                    if (!url) return;
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `${project.name}.json`;
                    link.click();
                  })
                }
              >
                <Download />
                {settingsCopy.project.exportAction}
              </Button>
            }
          />
          {personal ? null : (
            <Row
              label={project.archivedAt ? copy.projects.unarchive : copy.projects.archive}
              action={
                <Button variant="secondary" size="sm" onClick={() => void attempt(() => update({ archived: !project.archivedAt }), project.archivedAt ? copy.projects.restored : copy.projects.archived)}>
                  {project.archivedAt ? copy.projects.unarchive : copy.projects.archive}
                </Button>
              }
            />
          )}
          <Row
            label={settingsCopy.project.remove}
            action={
              <Button variant="danger" size="sm" onClick={() => setRemoving(true)} disabled={readOnly}>
                {copy.projects.removeConfirm}
              </Button>
            }
          />
        </div>
      </Disclosure>

      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={copy.projects.removeTitle(project.name)}
        body={copy.projects.removeBody}
        confirmLabel={copy.projects.removeConfirm}
        onConfirm={() => {
          setRemoving(false);
          void attempt(async () => {
            await backend.projects.remove(project.id);
            await client.invalidateQueries({ queryKey: keys.projects });
            navigate({ name: "projects" }, { replace: true });
          }, copy.projects.removed);
        }}
      />
    </div>
  );
}

/** Colour and icon in one anchored surface (brief §6, S7); each pick saves at once. */
function LookPicker(props: { project: Project; disabled?: boolean; onChange: (patch: ProjectPatch) => void }) {
  const { project } = props;
  return (
    <Popover
      label={settingsCopy.project.lookChoose}
      align="end"
      trigger={
        <button
          type="button"
          disabled={props.disabled}
          className="inline-flex h-7 items-center gap-2 rounded-full ps-1 pe-2.5 text-xs font-medium text-foreground ring-1 ring-inset ring-border-strong outline-none transition-colors duration-100 hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45 data-[popup-open]:bg-hover pointer-coarse:h-9 motion-reduce:transition-none"
          data-testid="settings-project-look"
        >
          <ProjectIcon icon={project.icon} color={project.color} size="sm" />
          {copy.colors[project.color]}
          <ChevronDown aria-hidden="true" className="size-3.5 text-subtle-foreground" />
        </button>
      }
    >
      <div className="flex w-64 flex-col gap-3 p-1">
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={copy.newProject.color}>
          {PROJECT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={project.color === color}
              aria-label={copy.colors[color]}
              data-project-color={color}
              onClick={() => props.onChange({ color })}
              className={cn("size-6 rounded-full bg-[var(--project-solid)] ring-offset-2 ring-offset-popover outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-9", project.color === color ? "ring-2 ring-foreground" : "hover:ring-2 hover:ring-border-strong")}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={copy.newProject.icon} data-project-color={project.color}>
          {PROJECT_ICONS.map((icon) => {
            const Icon = PROJECT_ICON_COMPONENTS[icon];
            return (
              <button
                key={icon}
                type="button"
                role="radio"
                aria-checked={project.icon === icon}
                aria-label={icon}
                onClick={() => props.onChange({ icon })}
                className={cn("flex size-8 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4 pointer-coarse:size-10", project.icon === icon ? "bg-[var(--project-soft)] text-[var(--project-ink)] ring-1 ring-[var(--project-solid)]" : "text-muted-foreground hover:bg-hover")}
              >
                <Icon strokeWidth={1.75} />
              </button>
            );
          })}
        </div>
        <div className="flex justify-end">
          <PopoverClose render={<Button variant="ghost" size="sm" />}>{settingsCopy.project.done}</PopoverClose>
        </div>
      </div>
    </Popover>
  );
}

/**
 * "Deze week 6u 15m bijgehouden · 30m zonder post" (brief §6): this project's quarters in the
 * current week, from the agenda's day views. Amber only on the missing post (V2). Locked rows
 * belong to the Bridge-post row above; without the agenda this row renders nothing.
 */
function WeekRow(props: { projectId: string }) {
  const backend = useBackend();
  const available = backend.capabilities.agenda;
  const settings = useAgendaSettings(available);
  const enabled = available && (settings.data?.enabled ?? false);
  const today = dateOf(Date.now());
  const week = weekOf(today);
  const dates = Array.from({ length: 7 }, (_, index) => addDays(week.from, index)).filter((date) => date <= today);
  const days = useQueries({
    queries: dates.map((date) => ({ queryKey: keys.agendaDay(date), queryFn: () => backend.agenda.day(date), enabled, staleTime: 60_000 })),
  });
  if (!enabled) return null;
  if (days.some((day) => day.isLoading)) return <Row label={settingsCopy.project.week} value={<Skeleton className="h-4 w-28" />} />;
  let quarters = 0;
  let withoutPost = 0;
  for (const day of days) {
    for (const block of day.data?.blocks ?? []) {
      if (block.workspaceId !== props.projectId) continue;
      quarters += block.quarters;
      if (!block.bridgePost) withoutPost += block.quarters;
    }
  }
  const value = quarters ? (
    <>
      {settingsCopy.project.weekTracked(dutchDuration(quarters * QUARTER_MINUTES))}
      {withoutPost ? <span className="text-warning-foreground"> · {settingsCopy.project.weekWithoutPost(dutchDuration(withoutPost * QUARTER_MINUTES))}</span> : null}
    </>
  ) : (
    settingsCopy.project.weekNothing
  );
  return <Row label={settingsCopy.project.week} value={<span data-testid="settings-project-week">{value}</span>} />;
}
