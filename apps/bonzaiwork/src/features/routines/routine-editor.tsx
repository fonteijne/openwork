import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useBackend } from "~/backend/context";
import { keys, projectModels, useProjects, useStatus } from "~/backend/queries";
import type { Routine, RoutineSchedule } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Field, Input, Textarea } from "~/components/ui/field";
import { Dialog } from "~/components/ui/overlay";
import { Select } from "~/components/ui/select";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { formatDateTime } from "~/lib/format";
import { dayShort, describeSchedule, localTimezone, nextOccurrences, WEEK_ORDER, WEEKDAYS } from "~/lib/schedule";

type Kind = RoutineSchedule["kind"];

const ZONES = ["Europe/Amsterdam", "Europe/Brussels", "Europe/London", "Europe/Berlin", "America/New_York", "Asia/Singapore", "UTC"];

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

/** Edits a schedule; every change shows the next runs right away. */
export function ScheduleEditor(props: { value: RoutineSchedule; onChange: (value: RoutineSchedule) => void }) {
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

  const kinds: Kind[] = ["once", "daily", "weekly", "interval"];
  const hours = Array.from({ length: 25 }, (_, hour) => hour);

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label={copy.routines.schedule} className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:grid-cols-4">
        {kinds.map((kind) => (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={value.kind === kind}
            onClick={() => setKind(kind)}
            className={cn(
              "h-8 rounded-full px-3 text-sm text-muted-foreground transition-colors duration-100 hover:text-foreground pointer-coarse:h-10",
              value.kind === kind && "bg-background font-medium text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)]",
            )}
          >
            {copy.routines.kinds[kind]}
          </button>
        ))}
      </div>

      {value.kind === "once" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label={copy.routines.date}>
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
          <Field label={copy.routines.at}>{(id) => <Input id={id} type="time" value={time} onChange={(event) => setTime(event.target.value)} />}</Field>
        </div>
      ) : null}

      {value.kind === "weekly" || value.kind === "interval" ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{copy.routines.days}</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={copy.routines.days}>
            {WEEK_ORDER.map((day) => {
              const on = value.daysOfWeek.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDay(day)}
                  className={cn(
                    "h-8 min-w-10 rounded-full px-2.5 text-sm capitalize ring-1 ring-inset transition-colors duration-100 pointer-coarse:h-10",
                    on ? "bg-primary text-primary-foreground ring-primary" : "text-muted-foreground ring-border-strong hover:bg-hover",
                  )}
                >
                  {dayShort(day)}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {value.kind === "daily" || value.kind === "weekly" ? (
        <Field label={copy.routines.at} className="max-w-40">
          {(id) => <Input id={id} type="time" value={time} onChange={(event) => setTime(event.target.value)} />}
        </Field>
      ) : null}

      {value.kind === "interval" ? (
        <div className="flex flex-wrap items-end gap-3">
          <Field label={copy.routines.every} className="w-32">
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
        </div>
      ) : null}

      <Field label={copy.routines.timezone} className="max-w-64">
        {(id) => (
          <Select
            id={id}
            label={copy.routines.timezone}
            value={zone}
            onValueChange={(next) => props.onChange({ ...value, timezone: next })}
            items={[...new Set([localTimezone(), ...ZONES])].map((entry) => ({ value: entry, label: entry.replace(/_/g, " ") }))}
          />
        )}
      </Field>
    </div>
  );
}

function SchedulePreview(props: { schedule: RoutineSchedule }) {
  const runs = useMemo(() => nextOccurrences(props.schedule, Date.now(), 5), [props.schedule]);
  return (
    <div className="rounded-lg bg-muted/60 px-3 py-2.5">
      <p className="text-sm font-medium text-foreground">{describeSchedule(props.schedule)}</p>
      {runs.length ? (
        <ol className="mt-1.5 flex flex-col gap-0.5 text-xs text-muted-foreground">
          {runs.map((at) => (
            <li key={at} className="tabular-nums">
              {formatDateTime(at)}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">{copy.routines.previewEmpty}</p>
      )}
    </div>
  );
}

function defaultSchedule(): RoutineSchedule {
  return { kind: "weekly", timezone: localTimezone(), daysOfWeek: WEEKDAYS, hour: 9, minute: 0 };
}

export function RoutineEditor(props: { open: boolean; onOpenChange: (open: boolean) => void; routine: Routine | null; projectId: string | null; onSaved?: (routine: Routine) => void }) {
  const backend = useBackend();
  const client = useQueryClient();
  const status = useStatus();
  const projects = useProjects();
  const nameInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<string>("__default");
  const [schedule, setSchedule] = useState<RoutineSchedule>(defaultSchedule);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    const routine = props.routine;
    setName(routine?.name ?? "");
    setProjectId(routine?.projectId ?? props.projectId ?? projects.data?.find((project) => !project.archivedAt)?.id ?? null);
    setPrompt(routine?.prompt ?? "");
    setModel(routine?.model ?? "__default");
    setSchedule(routine?.schedule ?? defaultSchedule());
    setError(null);
  }, [props.open, props.routine, props.projectId, projects.data]);

  const project = projects.data?.find((entry) => entry.id === projectId) ?? null;
  const models = projectModels(status.data, project);

  const save = async () => {
    if (!name.trim()) return setError(copy.routines.nameRequired);
    if (!prompt.trim()) return setError(copy.routines.promptRequired);
    if ((schedule.kind === "weekly" || schedule.kind === "interval") && schedule.daysOfWeek.length === 0) return setError(copy.routines.daysRequired);
    if (schedule.kind === "once" && schedule.at <= Date.now()) return setError(copy.routines.pastOnce);
    if (!projectId) return;
    setBusy(true);
    setError(null);
    const input = { projectId, name: name.trim(), prompt: prompt.trim(), model: model === "__default" ? null : model, schedule };
    try {
      const saved = props.routine ? await backend.routines.update(props.routine.id, input) : await backend.routines.create(input);
      await client.invalidateQueries({ queryKey: keys.allRoutines });
      await client.invalidateQueries({ queryKey: keys.summary(projectId) });
      toast(props.routine ? copy.routines.saved : copy.routines.created);
      props.onOpenChange(false);
      props.onSaved?.(saved);
    } catch (failure) {
      setError(errorText(failure));
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
      initialFocus={nameInput}
      footer={
        <>
          <Button variant="secondary" onClick={() => props.onOpenChange(false)}>
            {copy.common.cancel}
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy}>
            {props.routine ? copy.routines.save : copy.routines.create}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={copy.routines.name}>{(id) => <Input ref={nameInput} id={id} value={name} onChange={(event) => setName(event.target.value)} placeholder={copy.routines.namePlaceholder} maxLength={80} />}</Field>
          <Field label={copy.routines.project}>
            {(id) => (
              <Select
                id={id}
                label={copy.routines.project}
                value={projectId}
                onValueChange={setProjectId}
                items={(projects.data ?? []).filter((entry) => !entry.archivedAt).map((entry) => ({ value: entry.id, label: entry.name }))}
              />
            )}
          </Field>
        </div>
        <Field label={copy.routines.prompt}>{(id) => <Textarea id={id} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={copy.routines.promptPlaceholder} rows={4} />}</Field>
        <Field label={copy.routines.model} className="sm:max-w-sm">
          {(id) => (
            <Select
              id={id}
              label={copy.routines.model}
              value={model}
              onValueChange={setModel}
              items={[{ value: "__default", label: copy.routines.modelDefault }, ...models.map((entry) => ({ value: entry.id, label: entry.name }))]}
            />
          )}
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{copy.routines.schedule}</span>
          <ScheduleEditor value={schedule} onChange={setSchedule} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{copy.routines.preview}</span>
          <SchedulePreview schedule={schedule} />
        </div>
        {error ? (
          <p className="text-sm text-destructive-foreground" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
