import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FolderOpen } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys, newProjectModels, useStatus } from "~/backend/queries";
import type { RemoteCheck } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Field, Input } from "~/components/ui/field";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { errorText } from "~/lib/errors";
import { navigate } from "~/lib/router";

import { useUi } from "../shell/ui-store";
import { BrainLinkField } from "./link-field";

type OkCheck = Extract<RemoteCheck, { ok: true }>;

/**
 * Joins a shared brain as a new project in one go (brief §8; plan §4.1): clone, wait, create the
 * project on the cloned folder, register it as a brain, put the template in an empty one, and land
 * on its Brein tab, so the first thing a colleague sees is what the team already knows (I-7).
 */
export function useJoinBrain() {
  const backend = useBackend();
  const status = useStatus();
  const client = useQueryClient();
  const rememberProject = useUi((state) => state.rememberProject);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Leaving the page stops the wait from registering or opening a project afterwards.
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  const join = async (check: OkCheck, input: { name: string; folderPath: string | null }): Promise<boolean> => {
    if (busy) return false;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError(null);
    try {
      const name = input.name.trim() || check.name;
      const started = await backend.brains.clone(check.sshUrl, { folderPath: input.folderPath, name });
      const job = await backend.brains.job(started.jobId, controller.signal);
      if (controller.signal.aborted) return false;
      if (job.state !== "done") {
        setError(job.error ?? copy.errors.generic);
        return false;
      }
      const project = await backend.projects.create({
        name,
        description: null,
        color: "blue",
        icon: "book",
        folderPath: started.folderPath,
        instructions: null,
        defaultModel: null,
        allowedModels: newProjectModels(status.data),
      });
      await backend.brains.register(project.id, { jobId: started.jobId, kind: "project" });
      // An empty repository becomes a brain with the template; the first user sets it up (plan §6.1).
      if (check.empty) await backend.brains.setUp(project.id, { name: project.name, description: "" });
      await Promise.all([client.invalidateQueries({ queryKey: keys.projects }), client.invalidateQueries({ queryKey: keys.brains })]);
      if (controller.signal.aborted) return false;
      rememberProject(project.id);
      toast(copy.brain.join.fetched);
      navigate({ name: "project-brain", projectId: project.id });
      return true;
    } catch (failure) {
      if (!controller.signal.aborted) setError(errorText(failure));
      return false;
    } finally {
      setBusy(false);
      if (pending.current === controller) pending.current = null;
    }
  };

  return { busy, error, join };
}

/**
 * "Brein van je team ophalen" inline (brief §8): paste the link, the check runs on blur, the name
 * and folder are prefilled from the check, one button fetches and opens the Brein tab. Colour,
 * icon, description and key are settable later in the project's settings (P3).
 */
export function JoinBrainForm(props: { onDone?: () => void }) {
  const backend = useBackend();
  const { busy, error, join } = useJoinBrain();
  const [check, setCheck] = useState<RemoteCheck | null>(null);
  const [name, setName] = useState("");
  const [folder, setFolder] = useState("");
  const [touched, setTouched] = useState(false);
  const ok = check?.ok ? check : null;
  const shownName = touched ? name : (ok?.name ?? name);

  const pickFolder = async () => {
    const picked = await backend.desktop.pickFolder();
    if (picked) setFolder(picked);
  };

  const submit = async () => {
    if (!ok) return;
    const done = await join(ok, { name: shownName, folderPath: folder.trim() || null });
    if (done) props.onDone?.();
  };

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="brain-join"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <BrainLinkField check={check} onCheck={setCheck} disabled={busy} autoFocus />
      {ok ? (
        <>
          <Field label={copy.brain.join.name}>
            {(id) => (
              <Input
                id={id}
                value={shownName}
                disabled={busy}
                onChange={(event) => {
                  setTouched(true);
                  setName(event.target.value);
                }}
              />
            )}
          </Field>
          <Field label={copy.brain.join.folder} hint={folder.trim() ? undefined : copy.brain.join.folderDefault(shownName.trim())}>
            {(id) => (
              <div className="flex items-center gap-2">
                <Input id={id} value={folder} disabled={busy} onChange={(event) => setFolder(event.target.value)} className="font-mono" placeholder={backend.capabilities.folderPicker ? undefined : "/Users/jij/BonzaiWork/…"} />
                {backend.capabilities.folderPicker ? (
                  <Button variant="secondary" size="sm" disabled={busy} onClick={() => void pickFolder()}>
                    <FolderOpen />
                    {copy.brain.join.pickFolder}
                  </Button>
                ) : null}
              </div>
            )}
          </Field>
        </>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive-foreground" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={busy || !ok || !shownName.trim()} data-testid="brain-join-submit">
          {busy ? copy.brain.join.fetching : copy.brain.join.fetch}
        </Button>
        {props.onDone ? (
          <Button variant="quiet" disabled={busy} onClick={props.onDone}>
            {copy.common.cancel}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
