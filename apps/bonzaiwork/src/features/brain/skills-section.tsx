import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Ellipsis, Pencil, Plus, Trash2 } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys, useHarness } from "~/backend/queries";
import type { HarnessItem, Skill } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Chip } from "~/components/ui/chip";
import { Menu, MenuItem, MenuSeparator } from "~/components/ui/menu";
import { Row, Section, Skeleton } from "~/components/ui/misc";
import { ConfirmDialog } from "~/components/ui/overlay";
import { copy } from "~/copy";

import { attempt, humanize } from "../settings/shared";
import { SkillEditor } from "../settings/werkwijzen";

/** What a harness item's chip says: how it starts (the agent picks it, you type /naam, or it is an agent). */
export function harnessKindChip(item: HarnessItem) {
  if (item.kind === "command") return <Chip mono>{copy.brain.harness.kinds.command(item.name)}</Chip>;
  return <Chip>{item.kind === "agent" ? copy.brain.harness.kinds.agent : copy.brain.harness.kinds.skill}</Chip>;
}

/**
 * Jouw brein → "Werkwijzen en skills" (brein-harnas-plan §1.5): what counts in every project, in
 * two groups with their origin. BonzaiWork's own parts are read-only; the user's own skills take
 * Bewerken, Verwijderen and Nieuwe skill, through the personal brain (so they are in its history).
 */
export function SkillsSection(props: { personalId: string; readOnly: boolean }) {
  const backend = useBackend();
  const client = useQueryClient();
  const harness = useHarness();
  const [editing, setEditing] = useState<Skill | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<HarnessItem | null>(null);
  const items = harness.data?.items ?? [];
  const bundled = items.filter((item) => item.source === "bundled");
  const own = items.filter((item) => item.source === "personal");
  const refresh = async () => {
    await Promise.all([client.invalidateQueries({ queryKey: keys.harness }), client.invalidateQueries({ queryKey: ["config"] }), client.invalidateQueries({ queryKey: keys.brains })]);
  };
  const asSkill = (item: HarnessItem): Skill => ({ name: item.name, description: item.description, scope: "global", error: null });
  return (
    <Section
      title={copy.brain.harness.title}
      action={
        <Button variant="quiet" size="sm" disabled={props.readOnly} data-testid="brain-skill-new" onClick={() => setCreating(true)}>
          <Plus />
          {copy.brain.harness.newSkill}
        </Button>
      }
    >
      {harness.isLoading ? (
        <Skeleton className="my-3 h-4 w-48" />
      ) : (
        <>
          <p className="py-2 text-xs text-muted-foreground">{copy.brain.harness.intro}</p>
          <ul className="flex flex-col" data-testid="brain-skills-own">
            {own.length ? (
              own.map((item) => (
                <li key={`${item.kind}:${item.name}`}>
                  <Row
                    label={humanize(item.name)}
                    hint={item.description || undefined}
                    value={
                      <span className="flex items-center gap-1.5">
                        <Chip tone="accent">{copy.brain.harness.fromYou}</Chip>
                        {harnessKindChip(item)}
                      </span>
                    }
                    action={
                      item.kind === "skill" && !props.readOnly ? (
                        <Menu
                          align="end"
                          trigger={
                            <Button variant="quiet" size="icon-sm" aria-label={`${humanize(item.name)}: ${copy.common.more}`}>
                              <Ellipsis />
                            </Button>
                          }
                        >
                          <MenuItem icon={<Pencil />} onClick={() => setEditing(asSkill(item))}>
                            {copy.brain.harness.edit}
                          </MenuItem>
                          <MenuSeparator />
                          <MenuItem icon={<Trash2 />} danger onClick={() => setRemoving(item)}>
                            {copy.brain.harness.remove}
                          </MenuItem>
                        </Menu>
                      ) : undefined
                    }
                  />
                </li>
              ))
            ) : (
              <li>
                <Row label={<span className="font-normal text-muted-foreground">{copy.brain.harness.emptyOwn}</span>} />
              </li>
            )}
          </ul>
          <ul className="flex flex-col" data-testid="brain-skills-bundled">
            {bundled.map((item) => (
              <li key={`${item.kind}:${item.name}`}>
                <Row
                  label={humanize(item.name)}
                  hint={item.description || undefined}
                  value={
                    <span className="flex items-center gap-1.5">
                      <Chip>{copy.brain.harness.fromBonzai(item.version)}</Chip>
                      {harnessKindChip(item)}
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        </>
      )}
      <SkillEditor
        open={creating || editing !== null}
        onOpenChange={(open) => !open && (setCreating(false), setEditing(null))}
        scopeId={props.personalId}
        projectId={props.personalId}
        skill={editing}
        save={(input) => backend.brains.savePersonalSkill(props.personalId, input)}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={copy.brain.harness.removeTitle(removing ? humanize(removing.name) : "")}
        body={copy.brain.harness.removeBody}
        confirmLabel={copy.brain.harness.remove}
        onConfirm={() => {
          const item = removing;
          setRemoving(null);
          if (!item) return;
          void attempt(async () => {
            await backend.brains.removePersonalSkill(props.personalId, item.name);
            await refresh();
          }, copy.brain.harness.removed);
        }}
      />
    </Section>
  );
}
