import { useCallback, useRef, useState, type ReactNode, type RefObject } from "react";
import { FolderOpen } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { useBackend } from "~/backend/context";
import { keys, newProjectModels, startModel, useStatus } from "~/backend/queries";
import { BackendError, type Project } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Field, Input, SecretInput, type SecretInputHandle } from "~/components/ui/field";
import { Row } from "~/components/ui/misc";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { readLocal } from "~/lib/storage";
import { FOCUS_COMPOSER_EVENT } from "~/lib/shortcuts";

import { suggestLook, type Look } from "./look";
import { LookTile } from "./look-picker";
import { StarterChips } from "./starter-chips";
import { starterById, type StarterId } from "./starters";

export const DEFAULT_FOLDER_KEY = "bonzaiwork.defaultFolder";
export const FALLBACK_FOLDER = "~/BonzaiWork";

export function defaultFolder(): string {
  return readLocal(DEFAULT_FOLDER_KEY) || FALLBACK_FOLDER;
}

export type FormField = "name" | "key" | "form";
export type FormError = { field: FormField; message: string };

/** Which field a backend failure belongs to, so the message lands under it (assessment P-11, C6). */
export function errorFor(failure: unknown): FormError {
  if (failure instanceof BackendError) {
    if (failure.code === "conflict" || failure.code === "invalid_name") return { field: "name", message: failure.message };
    if (failure.code === "key_rejected") return { field: "key", message: copy.newProject.keyRejected };
    if (failure.code === "invalid_key") return { field: "key", message: copy.newProject.keyRequired };
    if (failure.code === "litellm_unreachable") return { field: "key", message: copy.newProject.keyUnreachable };
  }
  return { field: "form", message: errorText(failure) };
}

/**
 * The page that owns a composer listens for `FOCUS_COMPOSER_EVENT` (brief §4). After a project is
 * made the destination page still has to mount (a lazy chunk, a query refetch), so this waits for
 * its composer to exist before sending the event, instead of guessing a delay.
 */
export function focusComposerWhenReady(attempts = 12): void {
  if (typeof window === "undefined" || !window.matchMedia("(pointer: fine)").matches) return;
  let left = attempts;
  const tick = () => {
    if (document.querySelector('[data-testid="composer-input"]')) {
      window.dispatchEvent(new Event(FOCUS_COMPOSER_EVENT));
      return;
    }
    left -= 1;
    if (left > 0) window.setTimeout(tick, 150);
  };
  window.setTimeout(tick, 120);
}

export type ProjectDraft = {
  name: string;
  setName: (name: string) => void;
  starter: StarterId | null;
  chooseStarter: (id: StarterId | null) => void;
  /** The look as shown: the person's own choice, else the starter's, else what the name suggests. */
  look: Look;
  setLook: (look: Look) => void;
  instructions: string;
  setInstructions: (text: string) => void;
  model: string | null;
  setModel: (model: string | null) => void;
  folder: string | null;
  setFolder: (folder: string | null) => void;
  error: FormError | null;
  setError: (error: FormError | null) => void;
  busy: boolean;
  keyField: RefObject<SecretInputHandle | null>;
  nameInput: RefObject<HTMLInputElement | null>;
  /** In workspace mode a key goes on the project; in user mode one key serves every project. */
  keyMode: "workspace" | "user" | null;
  /** The key field is shown: always in workspace mode, in user mode only until a key is linked. */
  asksKey: boolean;
  reset: () => void;
  /** Call when the form goes away without finishing: a project made in a failed attempt gets listed. */
  abandon: () => void;
  /**
   * Creates the project and links the key (create → link, assessment I-1). A project whose key
   * was refused stays remembered, so the next attempt links only and never makes a duplicate.
   * Returns null after setting a field error; the caller never sees a half state.
   */
  create: (input: { folderPath: string | null; requireKey: boolean }) => Promise<Project | null>;
};

export function useProjectDraft(): ProjectDraft {
  const backend = useBackend();
  const status = useStatus();
  const client = useQueryClient();
  const keyField = useRef<SecretInputHandle>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const [name, setNameState] = useState("");
  const [starter, setStarter] = useState<StarterId | null>(null);
  const [chosenLook, setChosenLook] = useState<Look | null>(null);
  const [instructions, setInstructionsState] = useState("");
  const [instructionsTouched, setInstructionsTouched] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [error, setError] = useState<FormError | null>(null);
  const [busy, setBusy] = useState(false);
  // A project made in an earlier attempt whose key was refused: the next attempt only links.
  const created = useRef<Project | null>(null);

  const keyMode = status.data?.keyMode ?? null;
  const asksKey = keyMode === "workspace" || (keyMode === "user" && !status.data?.user.hasKey);
  const starterData = starterById(starter);
  const look = chosenLook ?? starterData?.look ?? suggestLook(name);

  const setName = useCallback((next: string) => {
    setNameState(next);
    setError((current) => (current?.field === "name" ? null : current));
  }, []);

  const chooseStarter = useCallback(
    (id: StarterId | null) => {
      const previous = starterById(starter);
      const next = starterById(id);
      setStarter(id);
      // The name follows the starter while it is still the starter's own suggestion.
      setNameState((current) => (!current.trim() || (previous && current === previous.name) ? (next?.name ?? "") : current));
      if (!instructionsTouched) setInstructionsState(next?.instructions ?? "");
    },
    [starter, instructionsTouched],
  );

  const setInstructions = useCallback((text: string) => {
    setInstructionsState(text);
    setInstructionsTouched(true);
  }, []);

  /** The dialog closed with a project made but its key refused: the list shows it now (P4: a locked row, never a hidden one). */
  const abandon = useCallback(() => {
    if (!created.current) return;
    created.current = null;
    void client.invalidateQueries({ queryKey: keys.projects });
  }, [client]);

  const reset = useCallback(() => {
    setNameState("");
    setStarter(null);
    setChosenLook(null);
    setInstructionsState("");
    setInstructionsTouched(false);
    setModel(null);
    setFolder(null);
    setError(null);
    setBusy(false);
    created.current = null;
    keyField.current?.clear();
  }, []);

  const create = useCallback(
    async (input: { folderPath: string | null; requireKey: boolean }): Promise<Project | null> => {
      const trimmed = name.trim();
      if (!trimmed) {
        setError({ field: "name", message: copy.newProject.nameRequired });
        nameInput.current?.focus();
        return null;
      }
      const key = asksKey ? (keyField.current?.take().trim() ?? "") : "";
      if (asksKey && input.requireKey && !key) {
        setError({ field: "key", message: copy.newProject.keyRequired });
        keyField.current?.focus();
        return null;
      }
      setBusy(true);
      setError(null);
      try {
        // User mode: one key for everything, checked before the project exists.
        if (keyMode === "user" && asksKey && key) {
          try {
            client.setQueryData(keys.status, await backend.keys.linkUser(key));
          } catch (failure) {
            setError(errorFor(failure));
            keyField.current?.focus();
            return null;
          }
        }
        let project = created.current;
        if (!project) {
          project = await backend.projects.create({
            name: trimmed,
            description: null,
            color: look.color,
            icon: look.icon,
            folderPath: input.folderPath,
            instructions: instructions.trim() || null,
            defaultModel: model ?? startModel(status.data, { allowedModels: newProjectModels(status.data), defaultModel: null }),
            allowedModels: newProjectModels(status.data),
          });
          created.current = project;
        }
        if (keyMode === "workspace" && key) {
          try {
            client.setQueryData(keys.status, await backend.keys.linkProject(project.id, key));
          } catch (failure) {
            // The project exists; the key did not take. Same screen, the key field says why (C6).
            // The list is not refreshed yet: the first run must stay on its screen (app.tsx leaves
            // #/welkom as soon as a project is listed), and the next attempt links this project.
            setError(errorFor(failure));
            keyField.current?.focus();
            return null;
          }
        }
        await Promise.all([client.invalidateQueries({ queryKey: keys.projects }), client.invalidateQueries({ queryKey: keys.status })]);
        created.current = null;
        return project;
      } catch (failure) {
        setError(errorFor(failure));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [asksKey, backend, client, instructions, keyMode, look, model, name, status.data],
  );

  return {
    name,
    setName,
    starter,
    chooseStarter,
    look,
    setLook: setChosenLook,
    instructions,
    setInstructions,
    model,
    setModel,
    folder,
    setFolder,
    error,
    setError,
    busy,
    keyField,
    nameInput,
    keyMode,
    asksKey,
    reset,
    abandon,
    create,
  };
}

/** Name field with the look tile in front (the tile is the Popover trigger). */
export function NameField(props: { draft: ProjectDraft; autoFocus?: boolean; label?: ReactNode }) {
  const { draft } = props;
  const invalid = draft.error?.field === "name";
  return (
    <Field label={props.label ?? copy.newProject.name} error={invalid ? draft.error?.message : null}>
      {(id, describedBy) => (
        <div className="flex items-center gap-2.5">
          <LookTile look={draft.look} name={draft.name} onChange={draft.setLook} disabled={draft.busy} />
          <Input
            ref={draft.nameInput}
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            value={draft.name}
            onChange={(event) => draft.setName(event.target.value)}
            placeholder={copy.newProject.namePlaceholder}
            maxLength={80}
            autoFocus={props.autoFocus}
            disabled={draft.busy}
            autoComplete="off"
            data-testid="project-name"
          />
        </div>
      )}
    </Field>
  );
}

export function StarterField(props: { draft: ProjectDraft }) {
  return <StarterChips value={props.draft.starter} onChange={props.draft.chooseStarter} disabled={props.draft.busy} />;
}

/**
 * The key field (C3: "key", never a vendor name). `testId` keeps the smoke test's
 * `litellm-key-input`; `required` drops "(optioneel)". The hint explains where the key comes from
 * only on the first run, where nothing else does.
 */
export function KeyField(props: { draft: ProjectDraft; required: boolean; hint?: boolean; testId?: string }) {
  const status = useStatus();
  const { draft } = props;
  if (!draft.asksKey) return null;
  const invalid = draft.error?.field === "key";
  const hint = status.data?.keyStorePersistent === false ? copy.newProject.keyNotPersistent : props.hint ? copy.newProject.keyHint : undefined;
  return (
    <Field label={copy.newProject.key} optional={!props.required} error={invalid ? draft.error?.message : null} hint={hint}>
      {(id, describedBy) => (
        <SecretInput
          ref={draft.keyField}
          id={id}
          describedBy={describedBy}
          invalid={invalid}
          placeholder={copy.newProject.keyPlaceholder}
          disabled={draft.busy}
          testId={props.testId}
          onPresenceChange={() => draft.setError(draft.error?.field === "key" ? null : draft.error)}
        />
      )}
    </Field>
  );
}

/** "Map · Nieuwe map in ~/BonzaiWork · Kiezen": the folder as a row value (S2), the picker on the right. */
export function FolderRow(props: { draft: ProjectDraft }) {
  const backend = useBackend();
  const { draft } = props;
  const [typing, setTyping] = useState(false);

  const pick = async () => {
    if (!backend.capabilities.folderPicker) {
      setTyping(true);
      return;
    }
    const picked = await backend.desktop.pickFolder();
    if (picked) {
      draft.setFolder(picked);
      if (!draft.name.trim()) draft.setName(picked.split(/[\\/]/).filter(Boolean).at(-1) ?? "");
    }
  };

  if (typing) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">{copy.newProject.folder}</span>
        <div className="flex gap-2">
          <Input
            aria-label={copy.newProject.folderPathLabel}
            placeholder={copy.newProject.folderPathPlaceholder}
            value={draft.folder ?? ""}
            onChange={(event) => draft.setFolder(event.target.value)}
            autoFocus
            className="font-mono"
            disabled={draft.busy}
          />
          <Button
            variant="quiet"
            disabled={draft.busy}
            onClick={() => {
              setTyping(false);
              draft.setFolder(null);
            }}
          >
            {copy.newProject.folderUseDefault}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Row
      className="min-h-10 py-1.5"
      label={copy.newProject.folder}
      value={
        <span className="flex min-w-0 items-center gap-1.5">
          <FolderOpen aria-hidden="true" className="size-4 shrink-0" />
          <span className={cn("truncate", draft.folder && "font-mono text-xs")}>{draft.folder ?? copy.newProject.folderDefault(defaultFolder())}</span>
        </span>
      }
      action={
        <Button variant="ghost" size="sm" disabled={draft.busy} onClick={() => void pick()}>
          {draft.folder ? copy.newProject.folderChange : copy.newProject.folderChoose}
        </Button>
      }
    />
  );
}
