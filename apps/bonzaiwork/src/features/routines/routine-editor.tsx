import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useBackend } from "~/backend/context";
import { hasNoModels, keys, projectModels, useProjects, useStatus } from "~/backend/queries";
import type { Routine, RoutineInput, RoutineSchedule } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Disclosure } from "~/components/ui/disclosure";
import { Field, Input, Textarea } from "~/components/ui/field";
import { Dialog } from "~/components/ui/overlay";
import { SegmentedControl } from "~/components/ui/segmented";
import { Select } from "~/components/ui/select";
import { toast } from "~/components/ui/toast";
import { BrainPicker } from "~/features/brain/brain-picker";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { formatDateTime } from "~/lib/format";
import { dayShort, describeSchedule, localTimezone, nextOccurrences, WEEK_ORDER, WEEKDAYS } from "~/lib/schedule";
import { SMALL_UP, useMediaQuery } from "~/lib/use-media";

import { ModelsBlocked } from "../chat/blocked";
import { suggestName } from "./grouping";

type Kind = RoutineSchedule["kind"];

const ZONES = ["Europe/Amsterdam", "Europe/Brussels", "Europe/London", "Europe/Berlin", "America/New_York", "Asia/Singapore", "UTC"];
const KINDS: readonly Kind[] = ["once", "daily", "weekly", "interval"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toTime(hour: number, minute: number) {
  return `${pad(hour)}:${pad(minute)}`;
}

function parseTime(value: string): { hour: number; minute: number } {
  const [hour, minute] = value.split(":").map((part) => Number.parseInt(part, 10));
  return { hour: Number.isFinite(hour) ? Math.min(23, Math.max(0, hour ?? 0)) : 9, minute: Number.isFinite(minute) ? Math.min(59, Math.max(0, minute ?? 0)) : 0 };
}

function localDateInput(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Edits the "Wanneer" of a schedule (brief §8): kind as a `SegmentedControl` (P5), then only the
 * fields that kind needs. The timezone is not here: it is a rare choice and lives under "Meer
 * opties" (P3). `error` marks the day chips invalid (C6: the error sits on the field).
 */
export function ScheduleEditor(props: { value: RoutineSchedule; onChange: (value: RoutineSchedule) => void; error?: string | null; errorId?: string }) {
  const { value } = props;
  const zone = value.timezone;
  const days = value.kind === "weekly" || value.kind === "interval" ? value.daysOfWeek : WEEKDAYS;
  const time = value.kind === "daily" || value.kind === "weekly" ? toTime(value.hour, value.minute) : value.kind === "once" ? `${pad(new Date(value.at).getHours())}:${pad(new Date(value.at).getMinutes())}` : "09:00";

  const setKind = (kind: Kind) => {
    const { hour, minute } = parseTime(time);
    if (kind === "once") {
      const at = new Date();
      at.setDate(at.getDate() + 1);
      at.setHours(hour, minute, 0, 0);
      props.onChange({ kind, timezone: zone, at: at.getTime() });
    } else if (kind === "daily") props.onChange({ kind, timezone: zone, hour, minute });
    else if (kind === "weekly") props.onChange({ kind, timezone: zone, daysOfWeek: days, hour, minute });
    else props.onChange({ kind, timezone: zone, everyHours: 2, startHour: 9, endHour: 17, daysOfWeek: days });
  };

  const toggleDay = (day: number) => {
    if (value.kind !== "weekly" && value.kind !== "interval") return;
    const next = value.daysOfWeek.includes(day) ? value.daysOfWeek.filter((entry) => entry !== day) : [...value.daysOfWeek, day];
    props.onChange({ ...value, daysOfWeek: next.sort() });
  };

  const setTime = (input: string) => {
    const { hour, minute } = parseTime(input);
    if (value.kind === "daily" || value.kind === "weekly") props.onChange({ ...value, hour, minute });
    if (value.kind === "once") {
      const at = new Date(value.at);
      at.setHours(hour, minute, 0, 0);
      props.onChange({ ...value, at: at.getTime() });
    }
  };

  const hours = Array.from({ length: 25 }, (_, hour) => hour);
  // On a phone the four labels do not fit side by side: the track scrolls sideways with the checked pill in view (brief §6).
  const wide = useMediaQuery(SMALL_UP);

  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl
        label={copy.routines.schedule}
        value={value.kind}
        onValueChange={setKind}
        items={KINDS.map((kind) => ({ value: kind, label: copy.routines.editor.kinds[kind] }))}
        fill={wide}
        scroll={!wide}
        className={wide ? "max-w-xl" : undefined}
      />

      <div className="flex flex-wrap items-end gap-3">
        {value.kind === "once" ? (
          <>
            <Field label={copy.routines.date} className="w-40">
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  value={localDateInput(value.at)}
                  onChange={(event) => {
                    const [year, month, day] = event.target.value.split("-").map((part) => Number.parseInt(part, 10));
                    if (!year || !month || !day) return;
                    const at = new Date(value.at);
                    at.setFullYear(year, month - 1, day);
                    props.onChange({ ...value, at: at.getTime() });
                  }}
                />
              )}
            </Field>
            <Field label={copy.routines.at} className="w-32">{(id) => <Input id={id} type="time" value={time} onChange={(event) => setTime(event.target.value)} />}</Field>
          </>
        ) : null}

        {value.kind === "daily" || value.kind === "weekly" ? (
          <Field label={copy.routines.at} className="w-32">
            {(id) => <Input id={id} type="time" value={time} onChange={(event) => setTime(event.target.value)} />}
          </Field>
        ) : null}

        {value.kind === "interval" ? (
          <>
            <Field label={copy.routines.every} className="w-28">
              {(id) => (
                <Select
                  id={id}
                  label={copy.routines.every}
                  value={String(value.everyHours)}
                  onValueChange={(next) => props.onChange({ ...value, everyHours: Number.parseInt(next, 10) || 1 })}
                  items={[1, 2, 3, 4, 6, 8].map((hours) => ({ value: String(hours), label: hours === 1 ? "Elk uur" : `${hours} uur` }))}
                />
              )}
            </Field>
            <Field label={copy.routines.between} className="w-28">
              {(id) => (
                <Select id={id} label={copy.routines.between} value={String(value.startHour)} onValueChange={(next) => props.onChange({ ...value, startHour: Number.parseInt(next, 10) })} items={hours.slice(0, 24).map((hour) => ({ value: String(hour), label: toTime(hour, 0) }))} />
              )}
            </Field>
            <Field label={copy.routines.and} className="w-28">
              {(id) => (
                <Select id={id} label={copy.routines.and} value={String(value.endHour)} onValueChange={(next) => props.onChange({ ...value, endHour: Number.parseInt(next, 10) })} items={hours.slice(1).map((hour) => ({ value: String(hour), label: hour === 24 ? "24:00" : toTime(hour, 0) }))} />
              )}
            </Field>
          </>
        ) : null}
      </div>

      {value.kind === "weekly" || value.kind === "interval" ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{copy.routines.days}</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={copy.routines.days} aria-invalid={props.error ? true : undefined} aria-describedby={props.error ? props.errorId : undefined}>
            {WEEK_ORDER.map((day) => {
              const on = value.daysOfWeek.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDay(day)}
                  className={cn(
                    "h-8 min-w-10 rounded-full px-2.5 text-sm capitalize ring-1 ring-inset transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-10",
                    on ? "bg-primary text-primary-foreground ring-primary" : "text-muted-foreground ring-border-strong hover:bg-hover",
                    props.error && !on && "ring-red-9",
                  )}
                >
                  {dayShort(day)}
                </button>
              );
            })}
          </div>
          {props.error ? (
            <p id={props.errorId} role="alert" className="text-xs text-destructive-foreground">
              {props.error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Directly under "Wanneer": the sentence and the next three moments on one line (brief §8). */
function UpcomingLine(props: { schedule: RoutineSchedule; error?: string | null; errorId?: string }) {
  const runs = useMemo(() => nextOccurrences(props.schedule, Date.now(), 3), [props.schedule]);
  return (
    <p className="text-xs text-muted-foreground" aria-live="polite">
      <span className="font-medium text-foreground">{describeSchedule(props.schedule)}</span>
      {props.error ? (
        <span id={props.errorId} role="alert" className="block text-destructive-foreground">
          {props.error}
        </span>
      ) : runs.length ? (
        <span className="block tabular-nums">
          {copy.routines.editor.upcoming}: {runs.map((at) => formatDateTime(at)).join(" · ")}
        </span>
      ) : (
        <span className="block">{copy.routines.editor.noUpcoming}</span>
      )}
    </p>
  );
}

function defaultSchedule(): RoutineSchedule {
  return { kind: "weekly", timezone: localTimezone(), daysOfWeek: WEEKDAYS, hour: 9, minute: 0 };
}

type FieldErrors = { prompt?: string; name?: string; days?: string; once?: string; project?: string };

/**
 * The routine editor as a sentence (brief §8, assessment I-5): Opdracht (the focal field, P7) →
 * Wanneer with the next three moments right underneath → Project. Model, tijdzone and breinen sit
 * under one collapsed "Meer opties" row (P3). Errors are per field with `aria-invalid`, and focus
 * moves to the first one (C6). The name is suggested from the opdracht until the person edits it.
 * `template` prefills a new routine (starters, "Maak hier een routine van", brain maintenance).
 */
export function RoutineEditor(props: { open: boolean; onOpenChange: (open: boolean) => void; routine: Routine | null; projectId: string | null; onSaved?: (routine: Routine) => void; template?: Partial<RoutineInput> }) {
  const backend = useBackend();
  const client = useQueryClient();
  const status = useStatus();
  const projects = useProjects();
  const promptInput = useRef<HTMLTextAreaElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<string>("__default");
  const [schedule, setSchedule] = useState<RoutineSchedule>(defaultSchedule);
  const [brains, setBrains] = useState<string[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const errorId = `${useId()}-error`;

  const firstProjectId = projects.data?.find((project) => !project.archivedAt)?.id ?? null;
  useEffect(() => {
    if (!props.open) return;
    const routine = props.routine;
    const template = routine ? undefined : props.template;
    const initialName = routine?.name ?? template?.name ?? "";
    setName(initialName);
    setNameTouched(Boolean(initialName));
    setProjectId(routine?.projectId ?? props.projectId ?? firstProjectId);
    setPrompt(routine?.prompt ?? template?.prompt ?? "");
    setModel(routine?.model ?? template?.model ?? "__default");
    setSchedule(routine?.schedule ?? template?.schedule ?? defaultSchedule());
    setBrains(routine?.brains ?? template?.brains ?? []);
    setErrors({});
    setFailure(null);
  }, [props.open, props.routine, props.projectId, firstProjectId, props.template]);

  const project = projects.data?.find((entry) => entry.id === projectId) ?? null;
  const models = projectModels(status.data, project);
  const modelKnown = model === "__default" || models.some((entry) => entry.id === model);
  const shownName = nameTouched ? name : suggestName(prompt);
  /** An error leaves as soon as its field changes (C6: the message belongs to the state, not the click). */
  const clearError = (...fields: (keyof FieldErrors)[]) =>
    setErrors((current) => {
      if (!fields.some((field) => current[field])) return current;
      const next = { ...current };
      for (const field of fields) delete next[field];
      return next;
    });

  const save = async () => {
    const next: FieldErrors = {};
    if (!prompt.trim()) next.prompt = copy.routines.promptRequired;
    if (prompt.trim() && !shownName.trim()) next.name = copy.routines.nameRequired;
    if ((schedule.kind === "weekly" || schedule.kind === "interval") && schedule.daysOfWeek.length === 0) next.days = copy.routines.daysRequired;
    if (schedule.kind === "once" && schedule.at <= Date.now()) next.once = copy.routines.pastOnce;
    if (!projectId) next.project = copy.routines.editor.projectRequired;
    setErrors(next);
    if (next.prompt) return promptInput.current?.focus();
    if (next.name) return nameInput.current?.focus();
    if (Object.keys(next).length || !projectId) return;
    setBusy(true);
    setFailure(null);
    const input: RoutineInput = { projectId, name: shownName.trim(), prompt: prompt.trim(), model: model === "__default" ? null : model, schedule, brains: brains.filter((id) => id !== projectId) };
    try {
      const saved = props.routine ? await backend.routines.update(props.routine.id, input) : await backend.routines.create(input);
      await client.invalidateQueries({ queryKey: keys.allRoutines });
      await client.invalidateQueries({ queryKey: keys.attention });
      await client.invalidateQueries({ queryKey: keys.summary(projectId) });
      toast(props.routine ? copy.routines.saved : copy.routines.created);
      props.onOpenChange(false);
      props.onSaved?.(saved);
    } catch (error) {
      setFailure(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.routine ? props.routine.name : copy.routines.new}
      size="lg"
      initialFocus={promptInput}
      footer={
        <>
          <Button variant="secondary" onClick={() => props.onOpenChange(false)}>
            {copy.common.cancel}
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy} data-testid="routine-editor-save">
            {props.routine ? copy.routines.save : copy.routines.create}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-5"
        data-testid="routine-editor"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Field label={copy.routines.prompt} error={errors.prompt}>
          {(id, describedBy) => (
            <Textarea
              ref={promptInput}
              id={id}
              value={prompt}
              onChange={(event) => {
                setPrompt(event.target.value);
                clearError("prompt", "name");
              }}
              placeholder={copy.routines.editor.promptPlaceholder}
              rows={4}
              aria-invalid={errors.prompt ? true : undefined}
              aria-describedby={describedBy}
              className="text-base sm:text-sm"
            />
          )}
        </Field>

        <Field label={copy.routines.editor.name} error={errors.name} hint={nameTouched ? undefined : copy.routines.editor.nameHint} className="sm:max-w-md">
          {(id, describedBy) => (
            <Input
              ref={nameInput}
              id={id}
              value={shownName}
              onChange={(event) => {
                setNameTouched(true);
                setName(event.target.value);
                clearError("name");
              }}
              placeholder={copy.routines.namePlaceholder}
              maxLength={80}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={describedBy}
            />
          )}
        </Field>

        <fieldset className="flex min-w-0 flex-col gap-3">
          <legend className="mb-3 text-sm font-medium text-foreground">{copy.routines.schedule}</legend>
          <ScheduleEditor
            value={schedule}
            onChange={(next) => {
              setSchedule(next);
              clearError("days", "once");
            }}
            error={errors.days}
            errorId={`${errorId}-days`}
          />
          <UpcomingLine schedule={schedule} error={errors.once} errorId={`${errorId}-once`} />
        </fieldset>

        <Field label={copy.routines.project} error={errors.project} className="sm:max-w-md">
          {(id) => (
            <Select
              id={id}
              label={copy.routines.project}
              value={projectId}
              onValueChange={(next) => {
                setProjectId(next);
                clearError("project");
              }}
              placeholder={copy.routines.editor.projectRequired}
              items={(projects.data ?? []).filter((entry) => !entry.archivedAt).map((entry) => ({ value: entry.id, label: entry.name }))}
            />
          )}
        </Field>

        <Disclosure label={copy.routines.editor.moreOptions} keepMounted defaultOpen={Boolean(props.routine?.model || props.routine?.brains.length) || !modelKnown} className="-mx-1" panelClassName="flex flex-col gap-4 ps-0 pt-3 sm:ps-6">
          <Field label={copy.routines.model} className="sm:max-w-md">
            {(id) =>
              project && hasNoModels(status.data, project) ? (
                <div id={id} className="text-sm">
                  <ModelsBlocked projectId={project.id} />
                </div>
              ) : (
                <Select
                  id={id}
                  label={copy.routines.model}
                  value={modelKnown ? model : null}
                  placeholder={copy.routines.modelGone}
                  onValueChange={setModel}
                  items={[{ value: "__default", label: copy.routines.modelDefault }, ...models.map((entry) => ({ value: entry.id, label: entry.name }))]}
                />
              )
            }
          </Field>
          <Field label={copy.routines.timezone} className="sm:max-w-md">
            {(id) => (
              <Select
                id={id}
                label={copy.routines.timezone}
                value={schedule.timezone}
                onValueChange={(next) => setSchedule({ ...schedule, timezone: next })}
                items={[...new Set([localTimezone(), ...ZONES])].map((entry) => ({ value: entry, label: entry.replace(/_/g, " ") }))}
              />
            )}
          </Field>
          {backend.capabilities.brains ? <BrainPicker label={copy.routines.brains} hint={copy.routines.brainsHint} exclude={projectId} value={brains} onChange={setBrains} /> : null}
        </Disclosure>

        {failure ? (
          <p className="text-sm text-destructive-foreground" role="alert">
            {failure}
          </p>
        ) : null}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
