import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";

import type { ProjectBrief, ProjectBriefPatch } from "~/backend/cockpit";
import { useAreas, useCockpit, useCockpitRefresh } from "~/backend/cockpit-queries";
import { useBackend } from "~/backend/context";
import { keys, useStatus } from "~/backend/queries";
import type { Project } from "~/backend/types";
import { Eyebrow, LinkArrow, StatusBadge, Tag, dot } from "~/components/io";
import { useDocumentTitle } from "~/components/top-bar";
import { Button } from "~/components/ui/button";
import { Input, Textarea } from "~/components/ui/field";
import { Skeleton } from "~/components/ui/misc";
import { ConfirmDialog } from "~/components/ui/overlay";
import { Select } from "~/components/ui/select";
import { toast } from "~/components/ui/toast";
import { projectsCopy } from "~/copy/projects";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { href, navigate } from "~/lib/router";

import { KeyForm } from "../settings/shared";
import { dayLabel, fromDateInput, toDateInput } from "./dates";
import { AccentTitle, areaTagText } from "./shared";

const E = projectsCopy.edit;

type Values = { name: string; goal: string; doneWhen: string; areaId: string; target: string; state: "active" | "on_hold" };

function valuesOf(project: Project, brief: ProjectBrief): Values {
  return {
    name: project.name,
    goal: brief.goal ?? project.description ?? "",
    doneWhen: brief.doneWhen ?? "",
    areaId: brief.area.id,
    target: toDateInput(brief.target),
    state: brief.state === "on_hold" ? "on_hold" : "active",
  };
}

const FIELD_KEYS: ReadonlyArray<keyof Values> = ["name", "goal", "doneWhen", "areaId", "target", "state"];

function FieldBlock(props: { label: ReactNode; htmlFor?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", props.className)}>
      <label htmlFor={props.htmlFor} className="text-base font-semibold text-ink">
        {props.label}
      </label>
      {props.children}
      {props.hint ? <p className="m-0 text-sm text-ink-muted">{props.hint}</p> : null}
    </div>
  );
}

const CONTROL = "rounded-[8px]! text-lg!";

/** The project's key: what it is, replace it, remove it; in user mode the personal key's page. */
function KeyBox(props: { project: Project; brief: ProjectBrief }) {
  const backend = useBackend();
  const client = useQueryClient();
  const status = useStatus();
  const [replacing, setReplacing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const { project, brief } = props;
  const userMode = status.data?.keyMode === "user";
  const hasKey = userMode ? (status.data?.user.hasKey ?? false) : project.key.hasKey;
  const refresh = () => Promise.all([client.invalidateQueries({ queryKey: keys.projects }), client.invalidateQueries({ queryKey: keys.status }), client.invalidateQueries({ queryKey: ["cockpit"] })]);
  return (
    <section aria-labelledby="edit-key" className="flex flex-col gap-4 rounded-card bg-surface-alt p-6 lg:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <h3 id="edit-key" className="m-0 flex-1 text-xl font-semibold text-ink">
          {E.keyTitle}
        </h3>
        {hasKey ? <StatusBadge kind="connected">{E.keyLinked}</StatusBadge> : <StatusBadge kind="unknown">{E.keyMissing}</StatusBadge>}
      </div>
      <p className="m-0 text-base text-ink-muted">{E.keyLead}</p>
      {userMode ? (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-base text-ink">{E.keyUser}</p>
          <LinkArrow href={href({ name: "settings", group: "toegang" })}>{E.keyUserOpen}</LinkArrow>
        </div>
      ) : (
        <>
          {hasKey && !replacing ? (
            <>
              <dl className="m-0 grid gap-x-5 gap-y-3 text-base sm:grid-cols-2">
                <div>
                  <dt className="text-ink-muted">{E.keyAlias}</dt>
                  <dd className="m-0 font-mono text-sm text-ink">{dot(brief.keyAlias, project.key.keyHint)}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">{E.keyBudget}</dt>
                  <dd className="m-0 text-ink">{brief.keyLeft !== null ? E.keyBudgetLeft(brief.keyLeft) : E.keyBudgetUnknown}</dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" size="xl" onClick={() => setReplacing(true)}>
                  {E.keyReplace}
                </Button>
              </div>
            </>
          ) : (
            <div className="rounded-[12px] bg-surface-raised px-5 py-2">
              <KeyForm
                autoFocus={replacing}
                onCancel={hasKey ? () => setReplacing(false) : undefined}
                onLink={async (key) => {
                  client.setQueryData(keys.status, await backend.keys.linkProject(project.id, key));
                  await refresh();
                  setReplacing(false);
                  toast(E.keyLinked);
                }}
              />
            </div>
          )}
          <p className="m-0 text-sm text-ink-muted">{E.keyStored}</p>
          {hasKey ? (
            <button type="button" onClick={() => setRemoving(true)} className="self-start bg-transparent p-0 text-start text-base font-semibold text-danger hover:underline">
              {E.keyRemove}
            </button>
          ) : null}
        </>
      )}
      <LinkArrow href={href({ name: "project-settings", projectId: project.id, group: "toegang" })}>{E.keyModels}</LinkArrow>
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={E.keyRemoveTitle}
        body={E.keyRemoveBody}
        confirmLabel={E.keyRemoveConfirm}
        onConfirm={() => {
          setRemoving(false);
          void (async () => {
            try {
              client.setQueryData(keys.status, await backend.keys.unlinkProject(project.id));
              await refresh();
            } catch (failure) {
              toast(errorText(failure), { tone: "error" });
            }
          })();
        }}
      />
    </section>
  );
}

function EditForm(props: { project: Project; brief: ProjectBrief }) {
  const backend = useBackend();
  const cockpit = useCockpit();
  const refreshCockpit = useCockpitRefresh();
  const client = useQueryClient();
  const status = useStatus();
  const areas = useAreas();
  const { project, brief } = props;
  const [initial] = useState(() => valuesOf(project, brief));
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readOnly = status.data?.readOnly ?? false;
  const changed = FIELD_KEYS.filter((key) => values[key] !== initial[key]);
  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((current) => ({ ...current, [key]: value }));
  const close = () => navigate({ name: "project-overview", projectId: project.id });
  const area = (areas.data ?? []).find((entry) => entry.id === values.areaId) ?? brief.area;

  const apply = async (next: Values, previous: Values) => {
    const name = next.name.trim();
    const goal = next.goal.trim();
    if (name !== previous.name.trim() || goal !== previous.goal.trim()) await backend.projects.update(project.id, { name, description: goal || null });
    const patch: ProjectBriefPatch = { goal: goal || null, doneWhen: next.doneWhen.trim() || null, target: fromDateInput(next.target), state: next.state };
    if (next.areaId !== previous.areaId) patch.areaId = next.areaId;
    await cockpit.projects.updateBrief(project.id, patch);
    await Promise.all([client.invalidateQueries({ queryKey: keys.projects }), refreshCockpit()]);
  };

  const save = async () => {
    if (!values.name.trim()) {
      setError(E.nameRequired);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apply(values, initial);
      toast(E.saved, {
        action: {
          label: projectsCopy.complete.undo,
          onClick: () => void apply(initial, values).catch((failure: unknown) => toast(errorText(failure), { tone: "error" })),
        },
      });
      close();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  const targetChanged = values.target !== initial.target;
  return (
    <form
      className="flex min-h-full flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="flex items-start gap-4 px-6 pb-6 pt-10 lg:px-12 lg:pt-12">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Eyebrow>{E.eyebrow}</Eyebrow>
          <h2 className="m-0 text-[32px] font-bold leading-[38px] tracking-[-0.015em] text-ink">{E.title}</h2>
          <p className="m-0 text-base text-ink-muted" aria-live="polite">
            {E.unsaved(changed.length)}
          </p>
        </div>
        <button type="button" aria-label={E.close} onClick={close} className="flex size-12 shrink-0 items-center justify-center rounded-full border border-line-strong text-ink transition-colors hover:bg-ink hover:text-surface">
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-6 px-6 pb-12 lg:px-12">
        <FieldBlock label={E.name} htmlFor="edit-name">
          <Input id="edit-name" value={values.name} onChange={(event) => set("name", event.target.value)} className={cn(CONTROL, "h-[52px]")} aria-invalid={error === E.nameRequired || undefined} disabled={busy || readOnly} />
        </FieldBlock>
        <FieldBlock label={E.goal} htmlFor="edit-goal">
          <Textarea id="edit-goal" rows={2} value={values.goal} onChange={(event) => set("goal", event.target.value)} className={cn(CONTROL, "min-h-20")} disabled={busy || readOnly} />
        </FieldBlock>
        <FieldBlock label={E.doneWhen} htmlFor="edit-done">
          <Textarea id="edit-done" rows={2} value={values.doneWhen} onChange={(event) => set("doneWhen", event.target.value)} className={cn(CONTROL, "min-h-20")} disabled={busy || readOnly} />
        </FieldBlock>
        <div className="grid gap-5 sm:grid-cols-2">
          <FieldBlock label={E.area} htmlFor="edit-area" hint={E.areaHint(area.client)}>
            <Select id="edit-area" value={values.areaId} onValueChange={(value) => set("areaId", value)} label={E.area} items={(areas.data ?? [brief.area]).map((entry) => ({ value: entry.id, label: entry.name }))} disabled={busy || readOnly} className="h-[52px]! rounded-[8px]! px-4! text-lg!" />
          </FieldBlock>
          <FieldBlock
            label={
              <>
                {E.target}
                {targetChanged ? <span className="font-normal text-ink-muted"> · {E.changed}</span> : null}
              </>
            }
            htmlFor="edit-target"
            hint={targetChanged && brief.target ? E.targetWas(dayLabel(brief.target)) : values.target ? null : E.targetNone}
          >
            <Input id="edit-target" type="date" value={values.target} onChange={(event) => set("target", event.target.value)} className={cn(CONTROL, "h-[52px]", targetChanged && "font-semibold ring-2! ring-ink!")} disabled={busy || readOnly} />
          </FieldBlock>
        </div>

        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className="mb-3 p-0 text-base font-semibold text-ink">{E.status}</legend>
          {(["active", "on_hold"] as const).map((state) => (
            <label key={state} className={cn("flex cursor-pointer items-start gap-3 rounded-card bg-surface-alt px-5 py-4", values.state === state && "ring-2 ring-inset ring-ink")}>
              <input type="radio" name="edit-state" checked={values.state === state} onChange={() => set("state", state)} className="mt-1.5 size-4 accent-[var(--accent)]" disabled={busy || readOnly} />
              <span className="flex flex-col">
                <span className="text-lg font-semibold text-ink">{state === "active" ? E.statusActive : E.statusHold}</span>
                <span className="text-sm text-ink-muted">{state === "active" ? E.statusActiveHint : E.statusHoldHint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <KeyBox project={project} brief={brief} />

        <section aria-labelledby="edit-finish" className="flex flex-col gap-3 rounded-card bg-surface-alt p-6 lg:p-8">
          <h3 id="edit-finish" className="m-0 text-xl font-semibold text-ink">
            {E.finishTitle}
          </h3>
          <p className="m-0 text-base text-ink-muted">{E.finishBody}</p>
          <div className="flex flex-wrap gap-6">
            <LinkArrow href={href({ name: "project-complete", projectId: project.id })}>{E.finish}</LinkArrow>
          </div>
        </section>
        {readOnly ? <p className="m-0 text-base text-ink-muted">{E.readOnly}</p> : null}
        {error ? (
          <p className="m-0 text-base font-semibold text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-4 border-t border-line bg-surface-raised px-6 py-6 lg:px-12 lg:py-8">
        <Button type="submit" variant="primary" size="xl" disabled={busy || readOnly || changed.length === 0}>
          {busy ? E.saving : E.save}
        </Button>
        <Button variant="secondary" size="xl" onClick={close}>
          {E.cancel}
        </Button>
        <p className="m-0 min-w-[14rem] flex-1 text-sm text-ink-muted">{E.footer}</p>
      </div>
    </form>
  );
}

/**
 * Bewerken (design v2-ProjectEdit): the project stays readable on the left; the sheet on the
 * right edits title, goal, klaar-als, area, target date, status and the project's key, and leads
 * to Afronden. Saving writes the name and goal to the project and the rest to the brief.
 */
export function EditPage(props: { project: Project; brief: ProjectBrief | null | undefined }) {
  const { project, brief } = props;
  useDocumentTitle(`${E.title} · ${project.name}`);
  const state = project.archivedAt !== null ? "completed" : (brief?.state ?? "active");
  return (
    <div className="flex flex-1 flex-wrap items-stretch bg-surface-alt">
      <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-6 px-6 pb-16 pt-10 lg:px-12 lg:pt-14">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {brief ? <Tag>{areaTagText(brief.area)}</Tag> : null}
            <Eyebrow>{dot(brief?.area.name, projectsCopy.state[state])}</Eyebrow>
          </div>
          <h1 tabIndex={-1} data-page-title="" className="m-0 max-w-[18ch] text-[40px] font-bold leading-[46px] tracking-[-0.02em] text-ink outline-none lg:text-[48px] lg:leading-[54px]">
            <AccentTitle text={project.name} />
          </h1>
        </div>
        <div className="flex flex-col gap-3 rounded-card bg-surface-raised p-8">
          <Eyebrow>{E.stands}</Eyebrow>
          <p className="m-0 text-xl font-semibold leading-7 text-ink">{brief?.goal ?? project.description ?? projectsCopy.index.noGoal}</p>
          {brief?.changes.length ? <p className="m-0 text-base text-ink-muted">{brief.changes[brief.changes.length - 1]?.text}</p> : null}
        </div>
        <div className="flex flex-col gap-3 rounded-card bg-surface-raised p-8">
          <Eyebrow>{E.where}</Eyebrow>
          <p className="m-0 text-base text-ink">{E.whereBody}</p>
        </div>
      </div>
      <aside aria-label={E.title} className="flex min-w-0 flex-[1_1_620px] flex-col bg-surface-raised shadow-float lg:max-w-[720px] lg:rounded-s-panel">
        {brief ? (
          <EditForm key={`${project.id}-${brief.state}`} project={project} brief={brief} />
        ) : (
          <div className="flex flex-col gap-5 p-12" aria-busy="true">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}
      </aside>
    </div>
  );
}
