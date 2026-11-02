import { useState, type FormEvent } from "react";
import { keyStart, NOTE_MAX, OTHER_LABEL_MAX, REFERENCE_MAX } from "@bonzaiwork/agenda/model";

import { useBackend } from "~/backend/context";
import { useAgendaSettings, useProjects } from "~/backend/queries";
import type { BridgePost, Correction, QuarterKind } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Field, Input, Textarea } from "~/components/ui/field";
import { Select } from "~/components/ui/select";
import { copy } from "~/copy";
import { errorText } from "~/lib/errors";

import { BridgePostField, draftPost, emptyPost, PostLine, type PostDraft } from "./bridge-post-field";
import { quarterOptions } from "./format";

/**
 * Add or change quarters (plan §7.3): from–to per quarter, the kind (project, other, away), the
 * project or a label with its own Bridge post, a note and a reference. "Terug naar meting" drops
 * your correction. Saving goes straight through; the panel offers undo (P8).
 */

export type EditorInput = {
  date: string;
  mode: "add" | "edit";
  from: string;
  to: string;
  kind: QuarterKind;
  workspaceId: string | null;
  label: string;
  post: BridgePost | null;
  note: string | null;
  reference: string | null;
  /** One of the quarters carries a correction of yours. */
  canReset: boolean;
};

export type EditorResult = { undoId: string; message: string };

export function QuarterEditor(props: { input: EditorInput; readOnly: boolean; onDone: (result: EditorResult) => void; onCancel: () => void }) {
  const backend = useBackend();
  const projects = useProjects();
  const settings = useAgendaSettings();
  const { input } = props;
  const [from, setFrom] = useState(input.from);
  const [to, setTo] = useState(input.to);
  const [kind, setKind] = useState<QuarterKind>(input.kind);
  const [workspaceId, setWorkspaceId] = useState(input.workspaceId);
  const [label, setLabel] = useState(input.kind === "other" ? input.label : "");
  const [post, setPost] = useState<PostDraft>(emptyPost(input.kind === "other" ? input.post : null));
  const [note, setNote] = useState(input.note ?? "");
  const [reference, setReference] = useState(input.reference ?? "");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const options = quarterOptions(input.date);
  const order = (key: string) => keyStart(key) ?? 0;
  const rangeInvalid = order(to) < order(from);
  const choices = (projects.data ?? []).filter((project) => !project.archivedAt || project.id === workspaceId);
  const projectPost = settings.data?.projects.find((project) => project.workspaceId === workspaceId)?.bridgePost ?? null;
  const parsedPost = draftPost(post);

  function correction(): Correction | null {
    if (kind === "away") return { kind: "away" };
    if (kind === "project") return workspaceId ? { kind: "project", workspaceId } : null;
    const text = label.replace(/\s+/g, " ").trim();
    if (!text || parsedPost === "invalid") return null;
    return { kind: "other", label: text, bridgePost: parsedPost };
  }

  async function save(reset: boolean) {
    setTried(true);
    setFailure(null);
    const next = reset ? null : correction();
    if (rangeInvalid || (!reset && !next)) return;
    setBusy(reset ? "reset" : "save");
    try {
      const noteChanged = note.trim() !== (input.note ?? "");
      const referenceChanged = reference.trim() !== (input.reference ?? "");
      const result = await backend.agenda.setQuarters({
        date: input.date,
        from,
        to,
        correction: next,
        ...(noteChanged ? { note: note.trim() || null } : {}),
        ...(referenceChanged ? { reference: reference.trim() || null } : {}),
      });
      props.onDone({ undoId: result.undoId, message: reset ? copy.agenda.resetDone : input.mode === "add" ? copy.agenda.added : copy.agenda.changed });
    } catch (error) {
      setFailure(errorText(error));
    } finally {
      setBusy(null);
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save(false);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-label={input.mode === "add" ? copy.agenda.editor.addTitle : copy.agenda.editor.editTitle} data-testid="agenda-editor">
      <div className="grid grid-cols-2 gap-3">
        <Field label={copy.agenda.editor.from}>
          {(id) => <Select id={id} label={copy.agenda.editor.from} value={from} onValueChange={setFrom} items={options.from} />}
        </Field>
        <Field label={copy.agenda.editor.to} error={tried && rangeInvalid ? copy.agenda.editor.rangeInvalid : null}>
          {(id) => <Select id={id} label={copy.agenda.editor.to} value={to} onValueChange={setTo} items={options.to} />}
        </Field>
      </div>

      <Field label={copy.agenda.editor.kind}>
        {(id) => (
          <Select
            id={id}
            label={copy.agenda.editor.kind}
            value={kind}
            onValueChange={(value) => setKind(value === "project" || value === "other" ? value : "away")}
            items={(["project", "other", "away"] as const).map((value) => ({ value, label: copy.agenda.editor.kinds[value] }))}
          />
        )}
      </Field>

      {kind === "project" ? (
        <Field label={copy.agenda.editor.project} error={tried && !workspaceId ? copy.agenda.editor.projectMissing : null}>
          {(id) => (
            <div className="flex flex-col gap-1.5">
              <Select id={id} label={copy.agenda.editor.project} value={workspaceId} placeholder={copy.agenda.editor.chooseProject} onValueChange={setWorkspaceId} items={choices.map((project) => ({ value: project.id, label: project.name }))} />
              {workspaceId ? (
                <span className="flex min-w-0 gap-1.5 px-1 text-xs">
                  <span className="shrink-0 text-muted-foreground">{copy.agenda.bridgePost}:</span>
                  <PostLine post={projectPost} />
                </span>
              ) : null}
            </div>
          )}
        </Field>
      ) : null}

      {kind === "other" ? (
        <>
          <Field label={copy.agenda.editor.label} error={tried && !label.trim() ? copy.agenda.editor.labelMissing : null}>
            {(id, describedBy) => (
              <Input id={id} aria-describedby={describedBy} value={label} maxLength={OTHER_LABEL_MAX} onChange={(event) => setLabel(event.target.value)} placeholder={copy.agenda.editor.labelPlaceholder} data-testid="agenda-editor-label" />
            )}
          </Field>
          <BridgePostField value={post} onChange={setPost} recent={settings.data?.recentPosts ?? []} showError={tried} />
        </>
      ) : null}

      {kind === "away" ? <p className="text-xs text-muted-foreground">{copy.agenda.editor.awayHint}</p> : null}

      <Field label={copy.agenda.editor.note} optional>
        {(id) => <Textarea id={id} value={note} maxLength={NOTE_MAX} onChange={(event) => setNote(event.target.value)} className="min-h-16" />}
      </Field>
      <Field label={copy.agenda.editor.reference} optional>
        {(id) => <Input id={id} value={reference} maxLength={REFERENCE_MAX} onChange={(event) => setReference(event.target.value)} placeholder={copy.agenda.editor.referencePlaceholder} />}
      </Field>

      {failure ? (
        <p role="alert" className="text-xs text-destructive-foreground">
          {failure}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={props.readOnly || busy !== null} data-testid="agenda-editor-save">
          {copy.agenda.editor.save}
        </Button>
        <Button variant="secondary" onClick={props.onCancel} disabled={busy !== null}>
          {copy.common.cancel}
        </Button>
        {input.mode === "edit" && input.canReset ? (
          <Button variant="quiet" className="ms-auto" onClick={() => void save(true)} disabled={props.readOnly || busy !== null}>
            {copy.agenda.editor.reset}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
