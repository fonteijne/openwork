import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys, preferredIn, useStatus } from "~/backend/queries";
import type { Model, Project } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Chip } from "~/components/ui/chip";
import { Locked, Row, Section } from "~/components/ui/misc";
import { Popover, PopoverClose } from "~/components/ui/popover";
import { Select } from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { cn } from "~/lib/cn";
import { copy } from "~/copy";

import { attempt } from "./shared";

const FIRST = "__first";

/** "Alle (9)", "3 van 9", "Geen": the state of the allowed list as one phrase. */
export function allowedSummary(project: Project, models: readonly Model[]): string {
  if (project.allowedModels === null) return copy.settings.models.all(models.length);
  const chosen = models.filter((model) => project.allowedModels?.includes(model.id)).length;
  return chosen ? copy.settings.models.some(chosen, models.length) : copy.settings.models.none;
}

/**
 * Models by name, ids only in a tooltip (brief §6; assessment P-2, C3): the default model as a
 * Select, the allowed list as "Modellen in dit project · Alle (9)" with a Popover picker (S7).
 */
export function ModelsSection(props: { project: Project }) {
  const backend = useBackend();
  const client = useQueryClient();
  const status = useStatus();
  const [refreshing, setRefreshing] = useState(false);
  const { project } = props;
  const models = status.data?.models ?? [];
  const allowed = project.allowedModels;
  const preferred = preferredIn(status.data);
  const preferredSet = new Set(status.data?.preferredModels);
  const usable = models.filter((model) => !allowed || allowed.includes(model.id));
  const current = project.defaultModel && usable.some((model) => model.id === project.defaultModel) ? project.defaultModel : FIRST;

  const setAllowed = (next: string[] | null, success?: string) =>
    attempt(async () => {
      await backend.projects.update(project.id, { allowedModels: next });
      await client.invalidateQueries({ queryKey: keys.projects });
    }, success);

  const select = (
    <Select
      label={copy.settings.models.defaultModel}
      value={current}
      onValueChange={(value) =>
        void attempt(async () => {
          await backend.projects.setDefaultModel(project.id, value === FIRST ? null : value);
          await client.invalidateQueries({ queryKey: keys.projects });
        })
      }
      // The id sits under the name in the list, never in the row itself (C3).
      items={[{ value: FIRST, label: copy.settings.models.defaultModelNone }, ...usable.map((model) => ({ value: model.id, label: model.name, hint: model.id }))]}
      className="w-56"
    />
  );

  return (
    <Section
      title={copy.settings.models.title}
      action={
        <Button
          variant="quiet"
          size="sm"
          disabled={refreshing}
          onClick={() => {
            setRefreshing(true);
            void attempt(async () => {
              client.setQueryData(keys.status, await backend.keys.refreshModels());
            }, copy.settings.models.rechecked).finally(() => setRefreshing(false));
          }}
        >
          <RefreshCw className={cn(refreshing && "animate-spin motion-reduce:animate-none")} />
          {copy.settings.models.recheck}
        </Button>
      }
    >
      <Row label={copy.settings.models.defaultModel} action={select} />
      <Row
        label={copy.settings.models.inProject}
        value={<span data-testid="settings-models-summary">{models.length ? allowedSummary(project, models) : copy.settings.models.empty}</span>}
        hint={allowed !== null && allowed.length === 0 && models.length ? copy.settings.models.noneHint : undefined}
        action={
          models.length ? (
            <Popover
              label={copy.settings.models.inProject}
              align="end"
              modal
              trigger={
                <Button variant="secondary" size="sm" data-testid="settings-models-choose">
                  {copy.settings.models.choose}
                </Button>
              }
            >
              <div className="flex w-72 flex-col gap-1 p-1">
                <label className="flex min-h-8 items-center justify-between gap-3 px-1 text-sm font-medium">
                  {copy.settings.models.allOfKey}
                  <Switch checked={allowed === null} onCheckedChange={(checked) => void setAllowed(checked ? null : preferred.length ? preferred : [])} label={copy.settings.models.allOfKey} />
                </label>
                <div className="my-1 h-px bg-border" />
                {models.map((model) => (
                  <Checkbox
                    key={model.id}
                    checked={allowed === null || allowed.includes(model.id)}
                    disabled={allowed === null}
                    onCheckedChange={(checked) => {
                      const base = allowed ?? models.map((entry) => entry.id);
                      void setAllowed(checked ? [...base, model.id] : base.filter((id) => id !== model.id));
                    }}
                    trailing={preferredSet.has(model.id) ? <Chip size="sm">{copy.settings.models.preferred}</Chip> : undefined}
                  >
                    <span title={copy.settings.models.idLabel(model.id)}>{model.name}</span>
                  </Checkbox>
                ))}
                {allowed !== null ? (
                  <div className="mt-1 flex items-center justify-between gap-2 border-t border-border pt-2">
                    {preferred.length ? (
                      <Button variant="quiet" size="sm" onClick={() => void setAllowed(preferred, copy.settings.models.preferredDone)}>
                        {copy.settings.models.preferredOn}
                      </Button>
                    ) : (
                      <Locked>{copy.settings.models.preferred}</Locked>
                    )}
                    <PopoverClose render={<Button variant="ghost" size="sm" />}>{copy.settings.project.done}</PopoverClose>
                  </div>
                ) : (
                  <div className="mt-1 flex justify-end border-t border-border pt-2">
                    <PopoverClose render={<Button variant="ghost" size="sm" />}>{copy.settings.project.done}</PopoverClose>
                  </div>
                )}
              </div>
            </Popover>
          ) : undefined
        }
      />
    </Section>
  );
}
