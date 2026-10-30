import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Download, Ellipsis, FileText, FolderOpen, LogOut, Plus, RefreshCw, Trash2, Upload, X } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys, modelName, preferredIn, projectHasKey, useProject, useStatus, useUsage } from "~/backend/queries";
import { PROJECT_COLORS, PROJECT_ICONS, type Command, type Connection, type NewConnectionInput, type Project, type RunMode, type Skill } from "~/backend/types";
import { PromptDialog } from "~/components/prompt-dialog";
import { PROJECT_ICON_COMPONENTS, ProjectIcon } from "~/components/project-icon";
import { PageTitle, TopBar } from "~/components/top-bar";
import { Button } from "~/components/ui/button";
import { Field, Input, SecretInput, Textarea, type SecretInputHandle } from "~/components/ui/field";
import { Menu, MenuItem, MenuSeparator } from "~/components/ui/menu";
import { Locked, Row, Section, Skeleton } from "~/components/ui/misc";
import { ConfirmDialog, Dialog } from "~/components/ui/overlay";
import { Select } from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { formatBytes, formatDateTime, formatMoney, relativeTime } from "~/lib/format";
import { href, navigate, SETTINGS_SECTIONS, type SettingsSection } from "~/lib/router";

import { FilePreview } from "../chat/sidecar";
import { ProjectLoading, ProjectMissing } from "../project/project-page";

async function attempt(action: () => Promise<unknown>, success?: string): Promise<boolean> {
  try {
    await action();
    if (success) toast(success);
    return true;
  } catch (failure) {
    toast(errorText(failure), { tone: "error" });
    return false;
  }
}

// ---------------------------------------------------------------------------
// General
// ---------------------------------------------------------------------------

function GeneralSection(props: { project: Project }) {
  const backend = useBackend();
  const client = useQueryClient();
  const status = useStatus();
  const { project } = props;
  const [editing, setEditing] = useState<"name" | "description" | null>(null);
  const [removing, setRemoving] = useState(false);
  const readOnly = status.data?.readOnly ?? false;
  const update = (patch: Parameters<typeof backend.projects.update>[1], message: string = copy.settings.saved) =>
    attempt(async () => {
      await backend.projects.update(project.id, patch);
      await client.invalidateQueries({ queryKey: keys.projects });
    }, message);

  return (
    <div className="flex flex-col gap-10">
      <Section title={copy.settings.sections.general}>
        <Row label={copy.settings.name} value={project.name} action={<Button variant="secondary" size="sm" onClick={() => setEditing("name")} disabled={readOnly}>{copy.settings.edit}</Button>} />
        <Row label={copy.settings.description} value={project.description ?? "—"} action={<Button variant="secondary" size="sm" onClick={() => setEditing("description")}>{copy.settings.edit}</Button>} />
        <div className="border-b border-border py-3">
          <p className="mb-2 text-sm font-medium">{copy.settings.look}</p>
          <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={copy.newProject.color}>
            {PROJECT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={project.color === color}
                aria-label={copy.colors[color]}
                data-project-color={color}
                onClick={() => void update({ color })}
                className={cn("size-6 rounded-full bg-[var(--project-solid)] ring-offset-2 ring-offset-background pointer-coarse:size-9", project.color === color ? "ring-2 ring-foreground" : "hover:ring-2 hover:ring-border-strong")}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-1" role="radiogroup" aria-label={copy.newProject.icon} data-project-color={project.color}>
            {PROJECT_ICONS.map((icon) => {
              const Icon = PROJECT_ICON_COMPONENTS[icon];
              return (
                <button
                  key={icon}
                  type="button"
                  role="radio"
                  aria-checked={project.icon === icon}
                  aria-label={icon}
                  onClick={() => void update({ icon })}
                  className={cn("flex size-8 items-center justify-center rounded-full [&_svg]:size-4 pointer-coarse:size-10", project.icon === icon ? "bg-[var(--project-soft)] text-[var(--project-ink)] ring-1 ring-[var(--project-solid)]" : "text-muted-foreground hover:bg-hover")}
                >
                  <Icon strokeWidth={1.75} />
                </button>
              );
            })}
          </div>
        </div>
        <Row
          label={copy.settings.folder}
          value={<span className="font-mono text-xs">{project.path}</span>}
          action={
            backend.capabilities.revealPath ? (
              <Button variant="secondary" size="sm" onClick={() => void backend.desktop.revealPath(project.path)}>
                <FolderOpen />
                {copy.settings.reveal}
              </Button>
            ) : undefined
          }
        />
        <Row
          label={copy.routines.title}
          action={
            <Button variant="secondary" size="sm" onClick={() => navigate({ name: "project-routines", projectId: project.id, routineId: null })}>
              <CalendarClock />
              {copy.settings.routinesOpen}
            </Button>
          }
        />
      </Section>

      <Section title={copy.common.more}>
        <Row
          label={copy.settings.export}
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
              {copy.settings.exportAction}
            </Button>
          }
        />
        <Row
          label={project.archivedAt ? copy.projects.unarchive : copy.projects.archive}
          action={
            <Button variant="secondary" size="sm" onClick={() => void update({ archived: !project.archivedAt }, project.archivedAt ? copy.projects.restored : copy.projects.archived)}>
              {project.archivedAt ? copy.projects.unarchive : copy.projects.archive}
            </Button>
          }
        />
        <Row
          label={copy.settings.remove}
          hint={copy.projects.removeBody}
          action={
            <Button variant="danger" size="sm" onClick={() => setRemoving(true)} disabled={readOnly}>
              {copy.projects.removeConfirm}
            </Button>
          }
        />
      </Section>

      <PromptDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === "name" ? copy.projects.rename : copy.settings.description}
        label={editing === "name" ? copy.settings.name : copy.settings.description}
        initialValue={editing === "name" ? project.name : project.description ?? ""}
        submitLabel={copy.settings.save}
        onSubmit={async (value) => {
          await backend.projects.update(project.id, editing === "name" ? { name: value } : { description: value });
          await client.invalidateQueries({ queryKey: keys.projects });
          toast(copy.settings.saved);
        }}
      />
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

// ---------------------------------------------------------------------------
// Key and models
// ---------------------------------------------------------------------------

export function KeyForm(props: { onLink: (key: string) => Promise<void>; onCancel?: () => void; autoFocus?: boolean }) {
  const field = useRef<SecretInputHandle>(null);
  const [present, setPresent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    const key = field.current?.take().trim() ?? "";
    if (!key) return;
    setBusy(true);
    setError(null);
    try {
      await props.onLink(key);
    } catch (failure) {
      setError(errorText(failure));
      field.current?.focus();
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="flex flex-col gap-3 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Field label={copy.onboarding.keyLabel} error={error}>
        {(id, describedBy) => <SecretInput ref={field} id={id} describedBy={describedBy} invalid={Boolean(error)} placeholder={copy.onboarding.keyPlaceholder} autoFocus={props.autoFocus} disabled={busy} onPresenceChange={setPresent} onSubmit={() => void submit()} />}
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={!present || busy}>
          {busy ? copy.onboarding.linking : copy.keys.link}
        </Button>
        {props.onCancel ? (
          <Button variant="ghost" onClick={props.onCancel} disabled={busy}>
            {copy.common.cancel}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function KeySection(props: { project: Project }) {
  const backend = useBackend();
  const client = useQueryClient();
  const status = useStatus();
  const usage = useUsage(props.project.id);
  const [replacing, setReplacing] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { project } = props;
  const userMode = status.data?.keyMode === "user";
  const models = status.data?.models ?? [];
  const allowed = project.allowedModels;
  const preferred = preferredIn(status.data);
  const preferredSet = new Set(status.data?.preferredModels);
  const chosen = allowed === null ? models.length : models.filter((model) => allowed.includes(model.id)).length;

  const afterKeyChange = async () => {
    await Promise.all([client.invalidateQueries({ queryKey: keys.projects }), client.invalidateQueries({ queryKey: keys.status })]);
  };
  const setAllowed = (next: string[] | null, success?: string) =>
    attempt(async () => {
      await backend.projects.update(project.id, { allowedModels: next });
      await client.invalidateQueries({ queryKey: keys.projects });
    }, success);

  return (
    <div className="flex flex-col gap-10">
      <Section title={copy.settings.sections.key}>
        {userMode ? (
          <Row label={copy.settings.personalKey} value={status.data?.user.hasKey ? copy.keys.linked(status.data.user.keyHint ?? "") : copy.keys.missing} action={<Button variant="secondary" size="sm" onClick={() => navigate({ name: "settings" })}>{copy.nav.settings}</Button>} />
        ) : replacing || !project.key.hasKey ? (
          <KeyForm
            autoFocus={replacing}
            onCancel={project.key.hasKey ? () => setReplacing(false) : undefined}
            onLink={async (key) => {
              const next = await backend.keys.linkProject(project.id, key);
              client.setQueryData(keys.status, next);
              await afterKeyChange();
              setReplacing(false);
              toast(copy.keys.linkedToast);
            }}
          />
        ) : (
          <Row
            label={copy.sidecar.key}
            value={copy.keys.linked(project.key.keyHint ?? "")}
            action={
              <>
                <Button variant="secondary" size="sm" onClick={() => setReplacing(true)}>
                  {copy.keys.replace}
                </Button>
                <Button variant="quiet" size="sm" onClick={() => setUnlinking(true)}>
                  {copy.keys.unlink}
                </Button>
              </>
            }
          />
        )}
        {status.data?.keyStorePersistent === false ? <p className="py-2 text-xs text-muted-foreground">{copy.onboarding.notPersistent}</p> : null}
      </Section>

      <Section
        title={copy.settings.models}
        action={
          <Button
            variant="quiet"
            size="sm"
            disabled={refreshing}
            onClick={() => {
              setRefreshing(true);
              void attempt(async () => {
                const next = await backend.keys.refreshModels();
                client.setQueryData(keys.status, next);
              }, copy.settings.modelsRefreshed).finally(() => setRefreshing(false));
            }}
          >
            <RefreshCw className={cn(refreshing && "animate-spin")} />
            {copy.settings.modelsRefresh}
          </Button>
        }
      >
        <Row
          label={copy.settings.defaultModel}
          action={
            <Select
              label={copy.settings.defaultModel}
              value={project.defaultModel && (!allowed || allowed.includes(project.defaultModel)) ? project.defaultModel : "__first"}
              onValueChange={(value) =>
                void attempt(async () => {
                  await backend.projects.setDefaultModel(project.id, value === "__first" ? null : value);
                  await client.invalidateQueries({ queryKey: keys.projects });
                }, copy.settings.saved)
              }
              items={[{ value: "__first", label: copy.settings.defaultModelNone }, ...models.filter((model) => !allowed || allowed.includes(model.id)).map((model) => ({ value: model.id, label: model.name }))]}
              className="w-56"
            />
          }
        />
        <Row label={copy.settings.allowedAll} action={<Switch checked={allowed === null} onCheckedChange={(checked) => void setAllowed(checked ? null : [])} label={copy.settings.allowedAll} />} />
        {allowed !== null && models.length > 0 ? (
          <Row
            label={chosen ? copy.settings.allowedCount(chosen, models.length) : copy.settings.allowedNone}
            hint={preferred.length === 0 ? <Locked>{copy.settings.allowedPreferredUnavailable}</Locked> : chosen ? undefined : copy.settings.allowedNoneHint}
            action={
              <Button variant="secondary" size="sm" disabled={preferred.length === 0} onClick={() => void setAllowed(preferred, copy.settings.allowedPreferredDone)}>
                {copy.settings.allowedPreferred}
              </Button>
            }
          />
        ) : null}
        {models.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">{copy.settings.modelsEmpty}</p>
        ) : (
          models.map((model) => (
            <label key={model.id} className={cn("flex min-h-11 items-center gap-3 border-b border-border py-2 last:border-b-0", allowed === null && "opacity-60")}>
              <input
                type="checkbox"
                className="size-4 accent-[var(--primary)]"
                disabled={allowed === null}
                checked={allowed === null || allowed.includes(model.id)}
                onChange={(event) => {
                  const current = allowed ?? models.map((entry) => entry.id);
                  const next = event.target.checked ? [...current, model.id] : current.filter((id) => id !== model.id);
                  void setAllowed(next);
                }}
              />
              <span className="flex flex-1 items-center gap-2 text-sm">
                {model.name}
                {preferredSet.has(model.id) ? <span className="rounded-full bg-muted px-2 py-px text-xs text-muted-foreground">{copy.settings.preferredBadge}</span> : null}
              </span>
              <span className="font-mono text-xs text-subtle-foreground max-sm:hidden">{model.id}</span>
            </label>
          ))
        )}
      </Section>

      <Section title={copy.settings.usage}>
        {backend.capabilities.usage ? (
          usage.data ? (
            <>
              <Row label={copy.settings.usage} value={formatMoney(usage.data.spend, usage.data.currency)} />
              <Row label={copy.settings.budget} value={usage.data.maxBudget !== null ? formatMoney(usage.data.maxBudget, usage.data.currency) : "—"} hint={copy.settings.budgetManaged} />
              {usage.data.byModel.map((entry) => (
                <Row key={entry.model} label={modelName(status.data, entry.model) ?? entry.model} value={formatMoney(entry.spend, usage.data?.currency ?? "EUR")} />
              ))}
            </>
          ) : (
            <Skeleton className="my-3 h-4 w-40" />
          )
        ) : (
          <div className="py-3">
            <Locked>{copy.settings.usageLocked}</Locked>
          </div>
        )}
      </Section>

      <ConfirmDialog
        open={unlinking}
        onOpenChange={setUnlinking}
        title={copy.keys.confirmUnlink}
        body={copy.keys.confirmUnlinkBody}
        confirmLabel={copy.keys.unlink}
        onConfirm={() => {
          setUnlinking(false);
          void attempt(async () => {
            const next = await backend.keys.unlinkProject(project.id);
            client.setQueryData(keys.status, next);
            await afterKeyChange();
          }, copy.keys.unlinked);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Instructions
// ---------------------------------------------------------------------------

function InstructionsSection(props: { project: Project }) {
  const backend = useBackend();
  const client = useQueryClient();
  const instructions = useQuery({ queryKey: keys.instructions(props.project.id), queryFn: () => backend.config.instructions(props.project.id) });
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(instructions.data ?? ""), [instructions.data]);
  const dirty = value !== (instructions.data ?? "");
  return (
    <Section title={copy.settings.sections.instructions}>
      <div className="flex flex-col gap-3 py-3">
        <p className="text-xs text-muted-foreground">{copy.settings.instructionsHint}</p>
        {instructions.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <Textarea value={value} onChange={(event) => setValue(event.target.value)} placeholder={copy.settings.instructionsPlaceholder} rows={14} className="font-mono text-[13px]" aria-label={copy.settings.sections.instructions} />
        )}
        <div className="flex gap-2">
          <Button
            variant="primary"
            disabled={!dirty || busy}
            onClick={() => {
              setBusy(true);
              void attempt(async () => {
                await backend.config.setInstructions(props.project.id, value);
                await client.invalidateQueries({ queryKey: keys.instructions(props.project.id) });
              }, copy.settings.saved).finally(() => setBusy(false));
            }}
          >
            {busy ? copy.settings.saving : copy.settings.save}
          </Button>
          {dirty ? (
            <Button variant="ghost" onClick={() => setValue(instructions.data ?? "")}>
              {copy.settings.cancel}
            </Button>
          ) : null}
        </div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Skills and commands
// ---------------------------------------------------------------------------

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function SkillEditor(props: { open: boolean; onOpenChange: (open: boolean) => void; scopeId: string; projectId: string; skill: Skill | null }) {
  const backend = useBackend();
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const existing = useQuery({
    queryKey: keys.skill(props.projectId, props.skill?.name ?? ""),
    queryFn: () => backend.config.skill(props.projectId, props.skill?.name ?? ""),
    enabled: props.open && Boolean(props.skill),
  });
  useEffect(() => {
    if (!props.open) return;
    setName(props.skill?.name ?? "");
    setDescription(props.skill?.description ?? "");
    setContent(existing.data?.content ?? (props.skill ? "" : "# Naam van de skill\n\n1. Eerste stap\n2. Tweede stap\n"));
    setError(null);
  }, [props.open, props.skill, existing.data]);

  const save = async () => {
    if (!NAME_PATTERN.test(name)) return setError(copy.settings.skillNameHint);
    try {
      await backend.config.saveSkill(props.scopeId, { name, description: description.trim(), content });
      await client.invalidateQueries({ queryKey: ["config"] });
      await client.invalidateQueries({ queryKey: keys.entries(props.projectId) });
      toast(copy.settings.saved);
      props.onOpenChange(false);
    } catch (failure) {
      setError(errorText(failure));
    }
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.skill ? props.skill.name : copy.settings.skillNew}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => props.onOpenChange(false)}>
            {copy.common.cancel}
          </Button>
          <Button variant="primary" onClick={() => void save()}>
            {copy.settings.save}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={copy.settings.skillName} hint={copy.settings.skillNameHint}>
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={name} onChange={(event) => setName(event.target.value.toLowerCase())} disabled={Boolean(props.skill)} className="font-mono" />}
        </Field>
        <Field label={copy.settings.skillDescription}>{(id) => <Input id={id} value={description} onChange={(event) => setDescription(event.target.value)} />}</Field>
        <Field label={copy.settings.skillContent}>{(id) => <Textarea id={id} value={content} onChange={(event) => setContent(event.target.value)} rows={12} className="font-mono text-[13px]" />}</Field>
        {error ? <p className="text-sm text-destructive-foreground" role="alert">{error}</p> : null}
      </div>
    </Dialog>
  );
}

export function SkillsList(props: { projectId: string; scope: "project" | "global" }) {
  const backend = useBackend();
  const client = useQueryClient();
  const scopeId = props.scope === "global" ? "global" : props.projectId;
  const editable = props.scope !== "global" || backend.capabilities.globalConfig;
  const skills = useQuery({ queryKey: keys.skills(props.projectId, props.scope), queryFn: () => backend.config.skills(props.projectId, props.scope) });
  const [editing, setEditing] = useState<Skill | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Skill | null>(null);
  return (
    <>
      <Section
        title={props.scope === "global" ? copy.settings.appSections.skills : copy.settings.sections.skills}
        action={
          editable ? (
            <Button variant="quiet" size="sm" onClick={() => setCreating(true)}>
              <Plus />
              {copy.settings.skillNew}
            </Button>
          ) : undefined
        }
      >
        {skills.isLoading ? (
          <Skeleton className="my-3 h-4 w-48" />
        ) : skills.data?.length ? (
          skills.data.map((skill) => (
            <Row
              key={skill.name}
              label={<span className="font-mono text-[13px]">{skill.name}</span>}
              hint={skill.error ?? skill.description}
              action={
                editable ? (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => setEditing(skill)}>
                      {copy.settings.edit}
                    </Button>
                    <Button variant="quiet" size="icon-sm" aria-label={`${skill.name} ${copy.settings.delete}`} onClick={() => setRemoving(skill)}>
                      <Trash2 />
                    </Button>
                  </>
                ) : undefined
              }
            />
          ))
        ) : (
          <p className="py-3 text-sm text-muted-foreground">{props.scope === "global" ? copy.settings.skillsEmptyGlobal : copy.settings.skillsEmpty}</p>
        )}
        {!editable ? <Locked className="pt-1">{copy.settings.globalReadOnly}</Locked> : null}
      </Section>
      <SkillEditor open={creating || editing !== null} onOpenChange={(open) => !open && (setCreating(false), setEditing(null))} scopeId={scopeId} projectId={props.projectId} skill={editing} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={copy.settings.skillRemoveTitle(removing?.name ?? "")}
        body={copy.settings.skillRemoved}
        confirmLabel={copy.settings.delete}
        onConfirm={() => {
          const skill = removing;
          setRemoving(null);
          if (skill)
            void attempt(async () => {
              await backend.config.removeSkill(scopeId, skill.name);
              await client.invalidateQueries({ queryKey: ["config"] });
            }, copy.settings.skillRemoved);
        }}
      />
    </>
  );
}

function CommandEditor(props: { open: boolean; onOpenChange: (open: boolean) => void; projectId: string; scope: "workspace" | "global"; command: Command | null }) {
  const backend = useBackend();
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!props.open) return;
    setName(props.command?.name ?? "");
    setDescription(props.command?.description ?? "");
    setTemplate(props.command?.template ?? "");
    setError(null);
  }, [props.open, props.command]);
  const save = async () => {
    if (!NAME_PATTERN.test(name)) return setError(copy.settings.skillNameHint);
    if (!template.trim()) return setError(copy.settings.commandTemplate);
    try {
      await backend.config.saveCommand(props.scope === "global" ? "global" : props.projectId, { name, description: description.trim() || null, template, scope: props.scope });
      await client.invalidateQueries({ queryKey: ["config"] });
      await client.invalidateQueries({ queryKey: keys.entries(props.projectId) });
      toast(copy.settings.saved);
      props.onOpenChange(false);
    } catch (failure) {
      setError(errorText(failure));
    }
  };
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.command ? `/${props.command.name}` : copy.settings.commandNew}
      footer={
        <>
          <Button variant="secondary" onClick={() => props.onOpenChange(false)}>
            {copy.common.cancel}
          </Button>
          <Button variant="primary" onClick={() => void save()}>
            {copy.settings.save}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={copy.settings.commandName} hint={copy.settings.commandNameHint}>
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={name} onChange={(event) => setName(event.target.value.toLowerCase())} disabled={Boolean(props.command)} className="font-mono" />}
        </Field>
        <Field label={copy.settings.commandDescription} optional>
          {(id) => <Input id={id} value={description} onChange={(event) => setDescription(event.target.value)} />}
        </Field>
        <Field label={copy.settings.commandTemplate} hint={copy.settings.commandTemplateHint}>
          {(id, describedBy) => <Textarea id={id} aria-describedby={describedBy} value={template} onChange={(event) => setTemplate(event.target.value)} rows={5} />}
        </Field>
        {error ? <p className="text-sm text-destructive-foreground" role="alert">{error}</p> : null}
      </div>
    </Dialog>
  );
}

export function CommandsList(props: { projectId: string; scope: "workspace" | "global" }) {
  const backend = useBackend();
  const client = useQueryClient();
  const editable = props.scope !== "global" || backend.capabilities.globalConfig;
  const commands = useQuery({ queryKey: keys.commands(props.projectId, props.scope), queryFn: () => backend.config.commands(props.projectId, props.scope) });
  const [editing, setEditing] = useState<Command | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Command | null>(null);
  return (
    <>
      <Section
        title={props.scope === "global" ? copy.settings.appSections.commands : copy.settings.sections.commands}
        action={
          editable ? (
            <Button variant="quiet" size="sm" onClick={() => setCreating(true)}>
              <Plus />
              {copy.settings.commandNew}
            </Button>
          ) : undefined
        }
      >
        {commands.isLoading ? (
          <Skeleton className="my-3 h-4 w-48" />
        ) : commands.data?.length ? (
          commands.data.map((command) => (
            <Row
              key={command.name}
              label={<span className="font-mono text-[13px]">/{command.name}</span>}
              hint={command.description}
              action={
                editable ? (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => setEditing(command)}>
                      {copy.settings.edit}
                    </Button>
                    <Button variant="quiet" size="icon-sm" aria-label={`/${command.name} ${copy.settings.delete}`} onClick={() => setRemoving(command)}>
                      <Trash2 />
                    </Button>
                  </>
                ) : undefined
              }
            />
          ))
        ) : (
          <p className="py-3 text-sm text-muted-foreground">{props.scope === "global" ? copy.settings.commandsEmptyGlobal : copy.settings.commandsEmpty}</p>
        )}
        {!editable ? <Locked className="pt-1">{copy.settings.globalReadOnly}</Locked> : null}
      </Section>
      <CommandEditor open={creating || editing !== null} onOpenChange={(open) => !open && (setCreating(false), setEditing(null))} projectId={props.projectId} scope={props.scope} command={editing} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={copy.settings.commandRemoveTitle(removing?.name ?? "")}
        body={copy.settings.commandRemoved}
        confirmLabel={copy.settings.delete}
        onConfirm={() => {
          const command = removing;
          setRemoving(null);
          if (command)
            void attempt(async () => {
              await backend.config.removeCommand(props.scope === "global" ? "global" : props.projectId, command.name);
              await client.invalidateQueries({ queryKey: ["config"] });
            }, copy.settings.commandRemoved);
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

const CATALOG: { name: string; label: string; url: string }[] = [
  { name: "notion", label: "Notion", url: "https://mcp.notion.com/mcp" },
  { name: "linear", label: "Linear", url: "https://mcp.linear.app/mcp" },
  { name: "github", label: "GitHub", url: "https://api.githubcopilot.com/mcp/" },
  { name: "atlassian", label: "Jira en Confluence", url: "https://mcp.atlassian.com/v1/sse" },
  { name: "hubspot", label: "HubSpot", url: "https://mcp.hubspot.com/anthropic" },
];

function ConnectionDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; projectId: string }) {
  const backend = useBackend();
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"remote" | "local">("remote");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (props.open) {
      setName("");
      setKind("remote");
      setTarget("");
      setError(null);
    }
  }, [props.open]);
  const save = async () => {
    if (!NAME_PATTERN.test(name)) return setError(copy.settings.skillNameHint);
    if (!target.trim()) return setError(kind === "remote" ? copy.settings.connectionUrl : copy.settings.connectionCommand);
    const input: NewConnectionInput = kind === "remote" ? { name, kind, url: target.trim() } : { name, kind, command: target.trim() };
    setBusy(true);
    try {
      await backend.config.addConnection(props.projectId, input);
      await client.invalidateQueries({ queryKey: keys.connections(props.projectId) });
      toast(copy.settings.connectionAdded);
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
      title={copy.settings.connectionNew}
      footer={
        <>
          <Button variant="secondary" onClick={() => props.onOpenChange(false)}>
            {copy.common.cancel}
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy}>
            {copy.settings.add}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-1.5 text-sm font-medium">{copy.settings.connectionCatalog}</p>
          <div className="flex flex-wrap gap-1.5">
            {CATALOG.map((entry) => (
              <Button
                key={entry.name}
                variant="secondary"
                size="sm"
                className="rounded-full"
                onClick={() => {
                  setName(entry.name);
                  setKind("remote");
                  setTarget(entry.url);
                }}
              >
                {entry.label}
              </Button>
            ))}
          </div>
        </div>
        <Field label={copy.settings.connectionName}>{(id) => <Input id={id} value={name} onChange={(event) => setName(event.target.value.toLowerCase())} className="font-mono" />}</Field>
        <Field label={copy.settings.connectionKind}>
          {(id) => (
            <Select
              id={id}
              label={copy.settings.connectionKind}
              value={kind}
              onValueChange={(value) => setKind(value === "local" ? "local" : "remote")}
              items={[
                { value: "remote", label: copy.settings.connectionRemote },
                { value: "local", label: copy.settings.connectionLocal },
              ]}
            />
          )}
        </Field>
        <Field label={kind === "remote" ? copy.settings.connectionUrl : copy.settings.connectionCommand}>
          {(id) => <Input id={id} value={target} onChange={(event) => setTarget(event.target.value)} className="font-mono" placeholder={kind === "remote" ? "https://…" : "npx -y …"} />}
        </Field>
        {error ? <p className="text-sm text-destructive-foreground" role="alert">{error}</p> : null}
      </div>
    </Dialog>
  );
}

const CONNECTION_TONE: Record<Connection["status"], string> = {
  connected: "text-green-11",
  disabled: "text-subtle-foreground",
  needs_auth: "text-warning-foreground",
  failed: "text-destructive-foreground",
  pending: "text-subtle-foreground",
};

function ConnectionsSection(props: { project: Project }) {
  const backend = useBackend();
  const client = useQueryClient();
  const connections = useQuery({ queryKey: keys.connections(props.project.id), queryFn: () => backend.config.connections(props.project.id) });
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Connection | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: keys.connections(props.project.id) });
  return (
    <>
      <Section
        title={copy.settings.sections.connections}
        action={
          <Button variant="quiet" size="sm" onClick={() => setAdding(true)}>
            <Plus />
            {copy.settings.connectionNew}
          </Button>
        }
      >
        {connections.isLoading ? (
          <Skeleton className="my-3 h-4 w-48" />
        ) : connections.data?.length ? (
          connections.data.map((connection) => (
            <Row
              key={connection.name}
              label={connection.name}
              hint={
                <span className={CONNECTION_TONE[connection.status]}>
                  {copy.settings.connectionStatus[connection.status]}
                  {connection.error ? ` · ${connection.error}` : ""}
                </span>
              }
              action={
                <>
                  <Switch
                    checked={connection.enabled}
                    label={`${connection.name}: ${connection.enabled ? copy.common.on : copy.common.off}`}
                    onCheckedChange={(enabled) => void attempt(async () => {
                      await backend.config.setConnectionEnabled(props.project.id, connection.name, enabled);
                      await refresh();
                    })}
                  />
                  <Menu
                    align="end"
                    trigger={
                      <Button variant="quiet" size="icon-sm" aria-label={`${connection.name}: ${copy.common.more}`}>
                        <Ellipsis />
                      </Button>
                    }
                  >
                    {connection.kind === "remote" ? (
                      <MenuItem icon={<LogOut />} onClick={() => void attempt(async () => {
                        await backend.config.signOutConnection(props.project.id, connection.name);
                        await refresh();
                      }, copy.settings.connectionSignedOut)}>
                        {copy.settings.connectionSignOut}
                      </MenuItem>
                    ) : null}
                    <MenuSeparator />
                    <MenuItem icon={<Trash2 />} danger onClick={() => setRemoving(connection)}>
                      {copy.settings.delete}
                    </MenuItem>
                  </Menu>
                </>
              }
            />
          ))
        ) : (
          <p className="py-3 text-sm text-muted-foreground">{copy.settings.connectionsEmpty}</p>
        )}
      </Section>
      <ConnectionDialog open={adding} onOpenChange={setAdding} projectId={props.project.id} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={copy.settings.connectionRemoveTitle(removing?.name ?? "")}
        body={copy.settings.connectionRemoved}
        confirmLabel={copy.settings.delete}
        onConfirm={() => {
          const connection = removing;
          setRemoving(null);
          if (connection)
            void attempt(async () => {
              await backend.config.removeConnection(props.project.id, connection.name);
              await refresh();
            }, copy.settings.connectionRemoved);
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Permissions, files, activity
// ---------------------------------------------------------------------------

function PermissionsSection(props: { project: Project }) {
  const backend = useBackend();
  const client = useQueryClient();
  const mode = useQuery({ queryKey: keys.runMode(props.project.id), queryFn: () => backend.config.runMode(props.project.id) });
  const folders = useQuery({ queryKey: keys.folders(props.project.id), queryFn: () => backend.config.folders(props.project.id) });
  const [adding, setAdding] = useState(false);
  const setFolders = (next: string[]) =>
    attempt(async () => {
      const saved = await backend.config.setFolders(props.project.id, next);
      client.setQueryData(keys.folders(props.project.id), saved);
    }, copy.settings.saved);
  const addFolder = async () => {
    if (backend.capabilities.folderPicker) {
      const picked = await backend.desktop.pickFolder();
      if (picked) await setFolders([...(folders.data ?? []), picked]);
    } else setAdding(true);
  };
  return (
    <div className="flex flex-col gap-10">
      <Section title={copy.settings.runMode}>
        {mode.isLoading ? (
          <Skeleton className="my-3 h-16 w-full" />
        ) : !mode.data?.supported ? (
          <div className="py-3">
            <Locked>{mode.data?.reason ?? copy.settings.runModeUnsupported}</Locked>
          </div>
        ) : (
          <div role="radiogroup" aria-label={copy.settings.runMode} className="flex flex-col">
            {(["default", "approve", "run-everything"] as RunMode[]).map((value) => (
              <label key={value} className="flex cursor-default items-start gap-3 border-b border-border py-3 last:border-b-0">
                <input
                  type="radio"
                  name="run-mode"
                  className="mt-0.5 size-4 accent-[var(--primary)]"
                  checked={mode.data?.mode === value}
                  onChange={() =>
                    void attempt(async () => {
                      const next = await backend.config.setRunMode(props.project.id, value);
                      client.setQueryData(keys.runMode(props.project.id), next);
                    }, copy.settings.saved)
                  }
                />
                <span>
                  <span className="block text-sm font-medium">{copy.settings.runModes[value].label}</span>
                  <span className="block text-xs text-muted-foreground">{copy.settings.runModes[value].hint}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </Section>
      <Section
        title={copy.settings.folders}
        action={
          <Button variant="quiet" size="sm" onClick={() => void addFolder()}>
            <Plus />
            {copy.settings.folderAdd}
          </Button>
        }
      >
        {folders.data?.length ? (
          folders.data.map((folder) => (
            <Row
              key={folder}
              label={<span className="font-mono text-xs">{folder}</span>}
              action={
                <Button variant="quiet" size="icon-sm" aria-label={copy.settings.folderRemove(folder)} onClick={() => void setFolders((folders.data ?? []).filter((entry) => entry !== folder))}>
                  <X />
                </Button>
              }
            />
          ))
        ) : (
          <p className="py-3 text-sm text-muted-foreground">{copy.settings.foldersEmpty}</p>
        )}
        <p className="pt-2 text-xs text-muted-foreground">{copy.settings.foldersHint}</p>
      </Section>
      <PromptDialog open={adding} onOpenChange={setAdding} title={copy.settings.folderAdd} label={copy.newProject.folderPathLabel} placeholder="/Users/jij/Documenten" submitLabel={copy.settings.add} onSubmit={async (path) => void (await setFolders([...(folders.data ?? []), path]))} />
    </div>
  );
}

function FilesSection(props: { project: Project }) {
  const backend = useBackend();
  const client = useQueryClient();
  const files = useQuery({ queryKey: keys.files(props.project.id), queryFn: () => backend.config.files(props.project.id) });
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const upload = async (list: FileList) => {
    const items = Array.from(list);
    await attempt(async () => {
      for (const file of items) await backend.composer.upload(props.project.id, file);
      await client.invalidateQueries({ queryKey: keys.files(props.project.id) });
    }, copy.settings.uploaded(items.length));
  };
  return (
    <Section
      title={copy.settings.sections.files}
      action={
        <>
          <input ref={input} type="file" multiple hidden onChange={(event) => event.target.files && void upload(event.target.files).finally(() => (event.target.value = ""))} />
          <Button variant="quiet" size="sm" onClick={() => input.current?.click()}>
            <Upload />
            {copy.settings.upload}
          </Button>
        </>
      }
    >
      {files.isLoading ? (
        <Skeleton className="my-3 h-4 w-48" />
      ) : files.data?.length ? (
        <ul>
          {files.data.map((file) => (
            <li key={file.path} className="border-b border-border last:border-b-0">
              <button type="button" onClick={() => setPreview(file.path)} className="flex min-h-11 w-full items-center gap-3 py-2 text-start hover:bg-hover/50">
                <FileText className="size-4 shrink-0 text-subtle-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{file.path}</span>
                <span className="shrink-0 text-xs text-subtle-foreground tabular-nums">{formatBytes(file.bytes)}</span>
                <span className="w-32 shrink-0 whitespace-nowrap text-end text-xs text-subtle-foreground max-sm:hidden">{relativeTime(file.updatedAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-3 text-sm text-muted-foreground">{copy.settings.filesEmpty}</p>
      )}
      <FilePreview projectId={props.project.id} chatId={null} path={preview} onClose={() => setPreview(null)} />
    </Section>
  );
}

function ActivitySection(props: { project: Project }) {
  const backend = useBackend();
  const audit = useQuery({ queryKey: keys.audit(props.project.id), queryFn: () => backend.config.audit(props.project.id) });
  return (
    <Section title={copy.settings.sections.activity}>
      {audit.isLoading ? (
        <Skeleton className="my-3 h-4 w-48" />
      ) : audit.data?.length ? (
        audit.data.map((entry) => <Row key={entry.id} label={entry.summary} value={<span className="text-xs">{entry.actor} · {formatDateTime(entry.at)}</span>} />)
      ) : (
        <p className="py-3 text-sm text-muted-foreground">{copy.settings.activityEmpty}</p>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function SectionContent(props: { project: Project; section: SettingsSection }): ReactNode {
  switch (props.section) {
    case "general":
      return <GeneralSection project={props.project} />;
    case "key":
      return <KeySection project={props.project} />;
    case "instructions":
      return <InstructionsSection project={props.project} />;
    case "skills":
      return <SkillsList projectId={props.project.id} scope="project" />;
    case "commands":
      return <CommandsList projectId={props.project.id} scope="workspace" />;
    case "connections":
      return <ConnectionsSection project={props.project} />;
    case "permissions":
      return <PermissionsSection project={props.project} />;
    case "files":
      return <FilesSection project={props.project} />;
    case "activity":
      return <ActivitySection project={props.project} />;
  }
}

export function ProjectSettingsPage(props: { projectId: string; section: SettingsSection }) {
  const { project, isLoading } = useProject(props.projectId);
  const status = useStatus();
  if (!project) return isLoading ? <ProjectLoading /> : <ProjectMissing />;
  const keyAttention = !projectHasKey(status.data, project);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar>
        <ProjectIcon icon={project.icon} color={project.color} size="sm" />
        <PageTitle>{copy.settings.projectTitle}</PageTitle>
      </TopBar>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-4 pb-16 sm:px-6 md:flex-row md:gap-10 md:pt-8">
          <nav aria-label={copy.settings.projectTitle} className="-mx-4 shrink-0 overflow-x-auto px-4 md:sticky md:top-0 md:mx-0 md:w-48 md:self-start md:overflow-visible md:px-0">
            <ul className="flex gap-1 md:flex-col md:gap-px">
              {SETTINGS_SECTIONS.map((section) => (
                <li key={section} className="shrink-0">
                  <a
                    href={href({ name: "project-settings", projectId: project.id, section })}
                    aria-current={props.section === section ? "page" : undefined}
                    className={cn(
                      "flex h-8 items-center gap-2 whitespace-nowrap rounded-full px-3 text-sm text-muted-foreground hover:bg-hover hover:text-foreground pointer-coarse:h-10",
                      props.section === section && "bg-active font-semibold text-foreground",
                    )}
                  >
                    {copy.settings.sections[section]}
                    {section === "key" && keyAttention ? <span className="size-1.5 rounded-full bg-amber-9" aria-label={copy.keys.missing} /> : null}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="min-w-0 max-w-2xl flex-1">
            {status.data?.readOnly ? <p className="mb-6 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{copy.settings.readOnly}</p> : null}
            <SectionContent project={project} section={props.section} />
          </div>
        </div>
      </main>
    </div>
  );
}

