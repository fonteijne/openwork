import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ellipsis, ListChecks, Pencil, Plus, SlashSquare, Trash2 } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys } from "~/backend/queries";
import type { Command, Skill } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Chip } from "~/components/ui/chip";
import { Field, Input, Textarea } from "~/components/ui/field";
import { Menu, MenuItem, MenuSeparator } from "~/components/ui/menu";
import { Locked, Row, Section, Skeleton } from "~/components/ui/misc";
import { ConfirmDialog, Dialog } from "~/components/ui/overlay";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { errorText } from "~/lib/errors";

import { attempt, humanize, NAME_PATTERN, slugify } from "./shared";

export type MethodScope = "project" | "global";

/** A skill or a command as one list item: a title people read, when it applies, how it starts. */
type Method = { kind: "skill"; title: string; when: string; slug: string; error: string | null; skill: Skill } | { kind: "command"; title: string; when: string; slug: string; error: null; command: Command };

function toMethods(skills: readonly Skill[], commands: readonly Command[]): Method[] {
  const list: Method[] = [
    ...skills.map<Method>((skill) => ({ kind: "skill", title: humanize(skill.name), when: skill.description, slug: skill.name, error: skill.error, skill })),
    ...commands.map<Method>((command) => ({ kind: "command", title: humanize(command.name), when: command.description ?? "", slug: command.name, error: null, command })),
  ];
  return list.sort((a, b) => a.title.localeCompare(b.title, "nl"));
}

export function useMethods(projectId: string | null, scope: MethodScope) {
  const backend = useBackend();
  const id = projectId ?? "";
  const skills = useQuery({ queryKey: keys.skills(id, scope), queryFn: () => backend.config.skills(id, scope), enabled: projectId !== null });
  const commands = useQuery({ queryKey: keys.commands(id, scope === "global" ? "global" : "workspace"), queryFn: () => backend.config.commands(id, scope === "global" ? "global" : "workspace"), enabled: projectId !== null });
  const methods = useMemo(() => toMethods(skills.data ?? [], commands.data ?? []), [skills.data, commands.data]);
  return { methods, isLoading: skills.isLoading || commands.isLoading, skillCount: skills.data?.length ?? 0, commandCount: commands.data?.length ?? 0 };
}

/**
 * Skills and commands as one list, "Werkwijzen" (brief §6; assessment P-4): a title and when it
 * applies per row, a quiet chip that says how it starts (the agent picks it, or you type /naam),
 * one overflow action (S2). The slug is derived from the title in the editor and shown as state.
 * Without a project (app settings, first run) the section stays with a lock (P4).
 */
export function MethodsSection(props: { projectId: string | null; scope: MethodScope }) {
  const backend = useBackend();
  const client = useQueryClient();
  const { methods, isLoading } = useMethods(props.projectId, props.scope);
  const editable = props.projectId !== null && (props.scope !== "global" || backend.capabilities.globalConfig);
  const scopeId = props.scope === "global" ? "global" : (props.projectId ?? "");
  const [editing, setEditing] = useState<Method | null>(null);
  const [creating, setCreating] = useState<"skill" | "command" | null>(null);
  const [removing, setRemoving] = useState<Method | null>(null);
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ["config"] });
    if (props.projectId) await client.invalidateQueries({ queryKey: keys.entries(props.projectId) });
  };

  return (
    <>
      <Section
        title={copy.settings.methods.title}
        action={
          editable ? (
            <Menu
              align="end"
              trigger={
                <Button variant="quiet" size="sm" data-testid="settings-methods-new">
                  <Plus />
                  {copy.settings.methods.new}
                </Button>
              }
            >
              <MenuItem icon={<ListChecks />} onClick={() => setCreating("skill")}>
                {copy.settings.methods.newSkill}
              </MenuItem>
              <MenuItem icon={<SlashSquare />} onClick={() => setCreating("command")}>
                {copy.settings.methods.newCommand}
              </MenuItem>
            </Menu>
          ) : undefined
        }
      >
        {props.projectId === null ? (
          <div className="py-3">
            <Locked>{copy.settings.methods.locked}</Locked>
          </div>
        ) : isLoading ? (
          <Skeleton className="my-3 h-4 w-48" />
        ) : methods.length ? (
          methods.map((method) => (
            <Row
              key={`${method.kind}:${method.slug}`}
              label={method.title}
              hint={method.error ? <span className="text-destructive-foreground">{method.error}</span> : method.when || undefined}
              value={method.kind === "command" ? <Chip mono>{copy.settings.methods.commandChip(method.slug)}</Chip> : <Chip>{copy.settings.methods.skillChip}</Chip>}
              action={
                editable ? (
                  <Menu
                    align="end"
                    trigger={
                      <Button variant="quiet" size="icon-sm" aria-label={`${method.title}: ${copy.common.more}`}>
                        <Ellipsis />
                      </Button>
                    }
                  >
                    <MenuItem icon={<Pencil />} onClick={() => setEditing(method)}>
                      {copy.settings.methods.edit}
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem icon={<Trash2 />} danger onClick={() => setRemoving(method)}>
                      {copy.settings.methods.delete}
                    </MenuItem>
                  </Menu>
                ) : undefined
              }
            />
          ))
        ) : (
          <p className="py-3 text-sm text-muted-foreground">{props.scope === "global" ? copy.settings.methods.emptyGlobal : copy.settings.methods.empty}</p>
        )}
        {props.projectId !== null && !editable ? <Locked className="pt-2">{copy.settings.methods.readOnly}</Locked> : null}
      </Section>

      {props.projectId !== null ? (
        <>
          <SkillEditor
            open={creating === "skill" || editing?.kind === "skill"}
            onOpenChange={(open) => !open && (setCreating(null), setEditing(null))}
            scopeId={scopeId}
            projectId={props.projectId}
            skill={editing?.kind === "skill" ? editing.skill : null}
            onSaved={refresh}
          />
          <CommandEditor
            open={creating === "command" || editing?.kind === "command"}
            onOpenChange={(open) => !open && (setCreating(null), setEditing(null))}
            scopeId={scopeId}
            scope={props.scope === "global" ? "global" : "workspace"}
            command={editing?.kind === "command" ? editing.command : null}
            onSaved={refresh}
          />
        </>
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={copy.settings.methods.removeTitle(removing?.title ?? "")}
        body={copy.settings.methods.removeBody}
        confirmLabel={copy.settings.methods.delete}
        onConfirm={() => {
          const method = removing;
          setRemoving(null);
          if (!method) return;
          void attempt(async () => {
            if (method.kind === "skill") await backend.config.removeSkill(scopeId, method.slug);
            else await backend.config.removeCommand(scopeId, method.slug);
            await refresh();
          }, copy.settings.methods.removed);
        }}
      />
    </>
  );
}

/** The slug line under the title: derived while typing, fixed once the skill exists. */
function SlugState(props: { slug: string; existing: boolean; kind: "skill" | "command" }) {
  if (!props.slug) return null;
  return (
    <span className="font-mono text-xs">{props.kind === "command" ? copy.settings.methods.typed(props.slug) : props.existing ? props.slug : copy.settings.methods.savedAs(props.slug)}</span>
  );
}

export function SkillEditor(props: { open: boolean; onOpenChange: (open: boolean) => void; scopeId: string; projectId: string; skill: Skill | null; onSaved?: () => Promise<void> }) {
  const backend = useBackend();
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const existing = useQuery({
    queryKey: keys.skill(props.projectId, props.skill?.name ?? ""),
    queryFn: () => backend.config.skill(props.projectId, props.skill?.name ?? ""),
    enabled: props.open && Boolean(props.skill),
  });
  useEffect(() => {
    if (!props.open) return;
    setTitle(props.skill ? humanize(props.skill.name) : "");
    setWhen(props.skill?.description ?? "");
    setContent(existing.data?.content ?? (props.skill ? "" : copy.settings.methods.stepsStarter));
    setError(null);
  }, [props.open, props.skill, existing.data]);
  const slug = props.skill?.name ?? slugify(title);

  const save = async () => {
    if (!title.trim()) return setError(copy.settings.methods.titleRequired);
    if (!NAME_PATTERN.test(slug)) return setError(copy.settings.methods.titleRequired);
    setBusy(true);
    try {
      // The title stays readable in the file: a skill's first line is its heading.
      const body = content.trim().startsWith("#") ? content : `# ${title.trim()}\n\n${content}`;
      await backend.config.saveSkill(props.scopeId, { name: slug, description: when.trim(), content: body });
      await props.onSaved?.();
      toast(copy.settings.methods.saved);
      props.onOpenChange(false);
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
      title={props.skill ? humanize(props.skill.name) : copy.settings.methods.skillTitle}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => props.onOpenChange(false)} disabled={busy}>
            {copy.common.cancel}
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy}>
            {copy.settings.save}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={copy.settings.methods.titleLabel} hint={<SlugState slug={slug} existing={Boolean(props.skill)} kind="skill" />}>
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={copy.settings.methods.titlePlaceholder} disabled={Boolean(props.skill)} />}
        </Field>
        <Field label={copy.settings.methods.when}>{(id) => <Input id={id} value={when} onChange={(event) => setWhen(event.target.value)} placeholder={copy.settings.methods.whenPlaceholder} />}</Field>
        <Field label={copy.settings.methods.steps}>{(id) => <Textarea id={id} value={content} onChange={(event) => setContent(event.target.value)} rows={10} className="leading-relaxed" />}</Field>
        {error ? (
          <p className="text-sm text-destructive-foreground" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

function CommandEditor(props: { open: boolean; onOpenChange: (open: boolean) => void; scopeId: string; scope: "workspace" | "global"; command: Command | null; onSaved?: () => Promise<void> }) {
  const backend = useBackend();
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [template, setTemplate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!props.open) return;
    setTitle(props.command ? humanize(props.command.name) : "");
    setWhen(props.command?.description ?? "");
    setTemplate(props.command?.template ?? "");
    setError(null);
  }, [props.open, props.command]);
  const slug = props.command?.name ?? slugify(title);

  const save = async () => {
    if (!title.trim() || !NAME_PATTERN.test(slug)) return setError(copy.settings.methods.titleRequired);
    if (!template.trim()) return setError(copy.settings.methods.templateRequired);
    setBusy(true);
    try {
      await backend.config.saveCommand(props.scopeId, { name: slug, description: when.trim() || null, template, scope: props.scope });
      await props.onSaved?.();
      toast(copy.settings.methods.saved);
      props.onOpenChange(false);
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
      title={props.command ? `/${props.command.name}` : copy.settings.methods.commandTitle}
      footer={
        <>
          <Button variant="secondary" onClick={() => props.onOpenChange(false)} disabled={busy}>
            {copy.common.cancel}
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy}>
            {copy.settings.save}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={copy.settings.methods.titleLabel} hint={<SlugState slug={slug} existing={Boolean(props.command)} kind="command" />}>
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={copy.settings.methods.titlePlaceholder} disabled={Boolean(props.command)} />}
        </Field>
        <Field label={copy.settings.methods.when} optional>
          {(id) => <Input id={id} value={when} onChange={(event) => setWhen(event.target.value)} placeholder={copy.settings.methods.whenPlaceholder} />}
        </Field>
        <Field label={copy.settings.methods.template} hint={copy.settings.methods.templateHint}>
          {(id, describedBy) => <Textarea id={id} aria-describedby={describedBy} value={template} onChange={(event) => setTemplate(event.target.value)} rows={5} />}
        </Field>
        {error ? (
          <p className="text-sm text-destructive-foreground" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
