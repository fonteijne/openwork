import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useBackend } from "~/backend/context";
import { keys, newProjectModels, useStatus } from "~/backend/queries";
import type { RemoteCheck } from "~/backend/types";
import { BrainLinkField } from "~/features/brain/link-field";
import { Button } from "~/components/ui/button";
import { Disclosure } from "~/components/ui/disclosure";
import { Field, Textarea } from "~/components/ui/field";
import { Locked } from "~/components/ui/misc";
import { Dialog } from "~/components/ui/overlay";
import { SegmentedControl } from "~/components/ui/segmented";
import { Select } from "~/components/ui/select";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { errorText } from "~/lib/errors";
import { navigate } from "~/lib/router";

import { useUi } from "../shell/ui-store";
import { FolderRow, KeyField, NameField, StarterField, focusComposerWhenReady, useProjectDraft } from "./project-form";

export { DEFAULT_FOLDER_KEY, FALLBACK_FOLDER, defaultFolder } from "./project-form";

type Source = "new" | "brain";

/**
 * Nieuw project (brief §6, flow 6; assessment P-3): name with an auto-assigned look, starter
 * chips, the folder as a row value, the key (workspace mode, optional, checked before the dialog
 * closes), and "Meer" for the model and the instructions the starter seeded (P3). Lands on the
 * project's Werk tab with the composer focused. "Uit een gedeeld brein" stays as the second
 * source (brains plan §4.1): the brain is cloned first, then the project opens on that folder.
 */
export function NewProjectDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const backend = useBackend();
  const status = useStatus();
  const client = useQueryClient();
  const rememberProject = useUi((state) => state.rememberProject);
  const draft = useProjectDraft();
  const [source, setSource] = useState<Source>("new");
  const [check, setCheck] = useState<RemoteCheck | null>(null);
  const [cloning, setCloning] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Closing the dialog stops a running clone wait from registering or opening a project afterwards.
  const pending = useRef<AbortController | null>(null);
  // A clone that finished while the key was refused: the next attempt reuses it.
  const cloned = useRef<{ jobId: string; folderPath: string } | null>(null);
  const { reset, abandon } = draft;

  useEffect(() => {
    if (!props.open) {
      pending.current?.abort();
      pending.current = null;
      abandon();
      return;
    }
    reset();
    setSource("new");
    setCheck(null);
    setCloning(false);
    setFormError(null);
    cloned.current = null;
  }, [props.open, reset, abandon]);

  const submit = async () => {
    const fromBrain = source === "brain";
    if (fromBrain && !check?.ok) {
      setFormError(copy.brain.testFirst);
      return;
    }
    setFormError(null);
    const controller = new AbortController();
    pending.current = controller;
    try {
      let folderPath = draft.folder?.trim() || null;
      let jobId: string | null = null;
      if (fromBrain && check?.ok) {
        // The brain is cloned first; the project opens on the cloned folder (plan §4.1).
        if (!cloned.current) {
          setCloning(true);
          const started = await backend.brains.clone(check.sshUrl, { folderPath, name: draft.name.trim() || check.name });
          const job = await backend.brains.job(started.jobId, controller.signal);
          setCloning(false);
          if (controller.signal.aborted) return;
          if (job.state !== "done") {
            setFormError(job.error ?? copy.errors.generic);
            return;
          }
          cloned.current = { jobId: started.jobId, folderPath: started.folderPath };
        }
        folderPath = cloned.current.folderPath;
        jobId = cloned.current.jobId;
      }
      const project = await draft.create({ folderPath, requireKey: false });
      if (!project || controller.signal.aborted) return;
      if (jobId) {
        await backend.brains.register(project.id, { jobId, kind: "project" });
        // An empty repository becomes a brain with the template; the first user sets it up (plan §6.1).
        if (check?.ok && check.empty) await backend.brains.setUp(project.id, { name: project.name, description: "" });
        await client.invalidateQueries({ queryKey: keys.brains });
      }
      if (controller.signal.aborted) return;
      rememberProject(project.id);
      props.onOpenChange(false);
      toast(jobId ? copy.brain.fetched : copy.projects.created);
      if (jobId) {
        // A fetched brain opens on its Brein tab, where the trust card waits (brief §8).
        navigate({ name: "project-brain", projectId: project.id });
        return;
      }
      navigate({ name: "project", projectId: project.id, chatId: null });
      focusComposerWhenReady();
    } catch (failure) {
      if (!controller.signal.aborted) setFormError(errorText(failure));
    } finally {
      setCloning(false);
      if (pending.current === controller) pending.current = null;
    }
  };

  // A new project starts with the preferred models only: offer just those as its default.
  const startsWith = newProjectModels(status.data);
  const models = (status.data?.models ?? []).filter((entry) => !startsWith || startsWith.includes(entry.id));
  const readOnly = status.data?.readOnly ?? false;
  const busy = draft.busy || cloning;
  const message = draft.error?.field === "form" ? draft.error.message : formError;

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={copy.newProject.title}
      initialFocus={draft.nameInput}
      footer={
        <>
          <Button variant="secondary" onClick={() => props.onOpenChange(false)}>
            {copy.common.cancel}
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || readOnly || (source === "brain" && !check?.ok)} data-testid="project-create">
            {source === "brain" ? (busy ? copy.brain.fetching : copy.brain.fetch) : busy ? copy.projects.creating : copy.projects.create}
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
        {backend.capabilities.brains ? (
          <SegmentedControl
            value={source}
            onValueChange={(value) => {
              setSource(value);
              setFormError(null);
            }}
            items={[
              { value: "new", label: copy.brain.sourceNew },
              { value: "brain", label: copy.brain.sourceBrain },
            ]}
            label={copy.newProject.source}
            fill
            disabled={busy}
          />
        ) : null}
        {source === "brain" ? (
          <BrainLinkField
            check={check}
            disabled={busy}
            onCheck={(next) => {
              setCheck(next);
              cloned.current = null;
              if (next?.ok && !draft.name.trim()) draft.setName(next.name);
            }}
          />
        ) : null}

        <NameField draft={draft} />
        {source === "new" ? <StarterField draft={draft} /> : null}
        <FolderRow draft={draft} />
        <KeyField draft={draft} required={false} />

        {/* Model and instructions are rare decisions here: every one is editable later in Agent (P3). */}
        <Disclosure label={copy.newProject.more} size="md" className="-mx-1" panelClassName="ps-1 pt-3">
          <div className="grid gap-5">
            {models.length ? (
              <Field label={copy.newProject.model}>
                {(id) => (
                  <Select
                    id={id}
                    label={copy.newProject.model}
                    value={draft.model}
                    onValueChange={draft.setModel}
                    items={models.map((entry) => ({ value: entry.id, label: entry.name }))}
                    placeholder={copy.settings.defaultModelNone}
                    disabled={busy}
                  />
                )}
              </Field>
            ) : null}
            <Field label={copy.newProject.instructions} optional>
              {(id) => (
                <Textarea
                  id={id}
                  value={draft.instructions}
                  onChange={(event) => draft.setInstructions(event.target.value)}
                  placeholder={copy.newProject.instructionsPlaceholder}
                  rows={4}
                  disabled={busy}
                />
              )}
            </Field>
          </div>
        </Disclosure>

        {readOnly ? <Locked>{copy.settings.readOnly}</Locked> : null}
        {message ? (
          <p className="text-sm text-destructive-foreground" role="alert">
            {message}
          </p>
        ) : null}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
