import { useEffect, useRef, useState } from "react";
import { ChevronRight, FolderOpen } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { useBackend } from "~/backend/context";
import { keys, useStatus } from "~/backend/queries";
import { PROJECT_COLORS, PROJECT_ICONS, type ProjectColor, type ProjectIcon as ProjectIconName } from "~/backend/types";
import { PROJECT_ICON_COMPONENTS } from "~/components/project-icon";
import { Button } from "~/components/ui/button";
import { Field, Input, SecretInput, Textarea, type SecretInputHandle } from "~/components/ui/field";
import { Dialog } from "~/components/ui/overlay";
import { Select } from "~/components/ui/select";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { navigate } from "~/lib/router";
import { readLocal } from "~/lib/storage";

export const DEFAULT_FOLDER_KEY = "bonzaiwork.defaultFolder";
export const FALLBACK_FOLDER = "~/BonzaiWork";

export function defaultFolder(): string {
  return readLocal(DEFAULT_FOLDER_KEY) || FALLBACK_FOLDER;
}

function ColorPicker(props: { value: ProjectColor; onChange: (value: ProjectColor) => void }) {
  return (
    <div role="radiogroup" aria-label={copy.newProject.color} className="flex flex-wrap gap-1.5">
      {PROJECT_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={props.value === color}
          aria-label={copy.colors[color]}
          title={copy.colors[color]}
          data-project-color={color}
          onClick={() => props.onChange(color)}
          className={cn(
            "size-7 rounded-full bg-[var(--project-solid)] ring-offset-2 ring-offset-popover transition-shadow duration-100 pointer-coarse:size-9",
            props.value === color ? "ring-2 ring-foreground" : "hover:ring-2 hover:ring-border-strong",
          )}
        />
      ))}
    </div>
  );
}

function IconPicker(props: { value: ProjectIconName; color: ProjectColor; onChange: (value: ProjectIconName) => void }) {
  return (
    <div role="radiogroup" aria-label={copy.newProject.icon} className="grid grid-cols-6 gap-1.5 sm:grid-cols-12" data-project-color={props.color}>
      {PROJECT_ICONS.map((icon) => {
        const Icon = PROJECT_ICON_COMPONENTS[icon];
        const checked = props.value === icon;
        return (
          <button
            key={icon}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={icon}
            onClick={() => props.onChange(icon)}
            className={cn(
              "flex aspect-square items-center justify-center rounded-full text-muted-foreground transition-colors duration-100 [&_svg]:size-4",
              checked ? "bg-[var(--project-soft)] text-[var(--project-ink)] ring-1 ring-[var(--project-solid)]" : "hover:bg-hover hover:text-foreground",
            )}
          >
            <Icon strokeWidth={1.75} />
          </button>
        );
      })}
    </div>
  );
}

export function NewProjectDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const backend = useBackend();
  const status = useStatus();
  const client = useQueryClient();
  const nameInput = useRef<HTMLInputElement>(null);
  const keyField = useRef<SecretInputHandle>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<ProjectColor>("jade");
  const [icon, setIcon] = useState<ProjectIconName>("folder");
  const [folder, setFolder] = useState<string | null>(null);
  const [typingFolder, setTypingFolder] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: "name" | "key" | "form"; message: string } | null>(null);
  const workspaceKeys = status.data?.keyMode === "workspace";

  useEffect(() => {
    if (!props.open) return;
    setName("");
    setDescription("");
    setColor(PROJECT_COLORS[Math.floor(Math.random() * 6)] ?? "jade");
    setIcon("folder");
    setFolder(null);
    setTypingFolder(false);
    setInstructions("");
    setShowMore(false);
    setModel(status.data?.defaultModel ?? null);
    setError(null);
  }, [props.open, status.data?.defaultModel]);

  const pickFolder = async () => {
    if (!backend.capabilities.folderPicker) {
      setTypingFolder(true);
      return;
    }
    const picked = await backend.desktop.pickFolder();
    if (picked) {
      setFolder(picked);
      if (!name.trim()) setName(picked.split(/[\\/]/).filter(Boolean).at(-1) ?? "");
    }
  };

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError({ field: "name", message: copy.newProject.nameRequired });
      nameInput.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const project = await backend.projects.create({
        name: trimmed,
        description: description.trim() || null,
        color,
        icon,
        folderPath: folder?.trim() || null,
        instructions: instructions.trim() || null,
        defaultModel: model,
      });
      let keyFailure: string | null = null;
      const key = workspaceKeys ? keyField.current?.take().trim() : "";
      if (key) {
        try {
          await backend.keys.linkProject(project.id, key);
        } catch (failure) {
          keyFailure = errorText(failure);
        }
      }
      await Promise.all([client.invalidateQueries({ queryKey: keys.projects }), client.invalidateQueries({ queryKey: keys.status })]);
      props.onOpenChange(false);
      if (keyFailure) {
        toast(keyFailure, { tone: "error" });
        navigate({ name: "project-settings", projectId: project.id, section: "key" });
      } else {
        toast(copy.projects.created);
        navigate({ name: "project", projectId: project.id, chatId: null });
      }
    } catch (failure) {
      setError({ field: "form", message: errorText(failure) });
    } finally {
      setBusy(false);
    }
  };

  const models = status.data?.models ?? [];
  const folderLabel = folder ? folder : copy.newProject.folderDefault(defaultFolder());

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={copy.newProject.title}
      size="lg"
      initialFocus={nameInput}
      footer={
        <>
          <Button variant="secondary" onClick={() => props.onOpenChange(false)}>
            {copy.common.cancel}
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy}>
            {busy ? copy.projects.creating : copy.projects.create}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={copy.newProject.name} error={error?.field === "name" ? error.message : null}>
            {(id, describedBy) => (
              <Input ref={nameInput} id={id} aria-describedby={describedBy} aria-invalid={error?.field === "name" || undefined} value={name} onChange={(event) => setName(event.target.value)} placeholder={copy.newProject.namePlaceholder} maxLength={80} />
            )}
          </Field>
          <Field label={copy.newProject.description} optional>
            {(id) => <Input id={id} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={copy.newProject.descriptionPlaceholder} maxLength={160} />}
          </Field>
        </div>

        <div className="flex flex-col gap-2.5">
          <span className="text-sm font-medium">{copy.newProject.look}</span>
          <ColorPicker value={color} onChange={setColor} />
          <IconPicker value={icon} color={color} onChange={setIcon} />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{copy.newProject.folder}</span>
          {typingFolder ? (
            <div className="flex gap-2">
              <Input aria-label={copy.newProject.folderPathLabel} placeholder="/Users/jij/Documenten/Offertes" value={folder ?? ""} onChange={(event) => setFolder(event.target.value)} autoFocus className="font-mono" />
              <Button
                variant="quiet"
                onClick={() => {
                  setTypingFolder(false);
                  setFolder(null);
                }}
              >
                {copy.newProject.folderUseDefault}
              </Button>
            </div>
          ) : (
            <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 rounded-2xl bg-muted/70 px-4 py-2">
              <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                <FolderOpen className="size-4 shrink-0" />
                <span className={cn("truncate", folder && "font-mono text-xs")}>{folderLabel}</span>
              </span>
              <Button variant="ghost" size="sm" onClick={() => void pickFolder()}>
                {copy.newProject.folderChoose}
              </Button>
            </div>
          )}
        </div>

        {workspaceKeys ? (
          <Field label={copy.newProject.key} optional error={error?.field === "key" ? error.message : null} hint={status.data?.keyStorePersistent === false ? copy.onboarding.notPersistent : undefined}>
            {(id, describedBy) => <SecretInput ref={keyField} id={id} describedBy={describedBy} placeholder={copy.onboarding.keyPlaceholder} onSubmit={() => void submit()} />}
          </Field>
        ) : null}

        <div>
          <button
            type="button"
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
            aria-expanded={showMore}
            onClick={() => setShowMore((value) => !value)}
          >
            <ChevronRight className={cn("size-4 transition-transform duration-150", showMore && "rotate-90")} />
            {copy.common.more}
          </button>
          {showMore ? (
            <div className="mt-3 grid gap-5">
              {models.length ? (
                <Field label={copy.newProject.model}>
                  {(id) => (
                    <Select
                      id={id}
                      label={copy.newProject.model}
                      value={model}
                      onValueChange={setModel}
                      items={models.map((entry) => ({ value: entry.id, label: entry.name }))}
                    />
                  )}
                </Field>
              ) : null}
              <Field label={copy.newProject.instructions} optional>
                {(id) => <Textarea id={id} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder={copy.newProject.instructionsPlaceholder} rows={4} />}
              </Field>
            </div>
          ) : null}
        </div>

        {error?.field === "form" ? (
          <p className="text-sm text-destructive-foreground" role="alert">
            {error.message}
          </p>
        ) : null}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
