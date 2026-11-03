import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { keyStart, NOTE_MAX, OTHER_LABEL_MAX, REFERENCE_MAX } from "@bonzaiwork/agenda/model";

import { useBackend } from "~/backend/context";
import { keys, useAgendaSettings, useProjects } from "~/backend/queries";
import type { BridgePost, Correction, QuarterKind } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Disclosure } from "~/components/ui/disclosure";
import { Field, Input, Textarea } from "~/components/ui/field";
import { KbdRow } from "~/components/ui/misc";
import { SegmentedControl } from "~/components/ui/segmented";
import { Select } from "~/components/ui/select";
import { copy } from "~/copy";
import { errorText } from "~/lib/errors";

import { PostLine } from "./bridge-post-field";
import { quarterOptions } from "./format";
import { PostPicker } from "./post-picker";

/**
 * Add or change quarters (plan §7.3; brief §8): the three things people mean, as one
 * SegmentedControl (Project · Meeting of anders · Niet boeken), one time range, then only the row
 * that choice needs. Note and reference sit behind "Meer" (P3). Esc cancels (S6); the panel's
 * buttons stay where they are while this is open (P11). "Terug naar meting" drops your correction.
 * Saving goes straight through; the panel offers undo (P8).
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

const KINDS: readonly QuarterKind[] = ["project", "other", "away"];

function MissingPost() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning-foreground">
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-amber-9 ring-1 ring-inset ring-amber-11/50" />
      {copy.agenda.withoutPost}
    </span>
  );
}

export function QuarterEditor(props: { input: EditorInput; readOnly: boolean; onDone: (result: EditorResult) => void; onCancel: () => void }) {
  const backend = useBackend();
  const client = useQueryClient();
  const projects = useProjects();
  const settings = useAgendaSettings();
  const { input } = props;
  const [from, setFrom] = useState(input.from);
  const [to, setTo] = useState(input.to);
  const [kind, setKind] = useState<QuarterKind>(input.kind);
  const [workspaceId, setWorkspaceId] = useState(input.workspaceId);
  const [label, setLabel] = useState(input.kind === "other" ? input.label : "");
  const [post, setPost] = useState<BridgePost | null>(input.kind === "other" ? input.post : null);
  const [note, setNote] = useState(input.note ?? "");
  const [reference, setReference] = useState(input.reference ?? "");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState<"save" | "reset" | "post" | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const options = quarterOptions(input.date);
  const order = (key: string) => keyStart(key) ?? 0;
  const rangeInvalid = order(to) < order(from);
  const choices = (projects.data ?? []).filter((project) => !project.archivedAt || project.id === workspaceId);
  const recent = settings.data?.recentPosts ?? [];
  const projectPost = settings.data?.projects.find((project) => project.workspaceId === workspaceId)?.bridgePost ?? null;

  function correction(): Correction | null {
    if (kind === "away") return { kind: "away" };
    if (kind === "project") return workspaceId ? { kind: "project", workspaceId } : null;
    const text = label.replace(/\s+/g, " ").trim();
    if (!text) return null;
    return { kind: "other", label: text, bridgePost: post };
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

  /** The project's post is a setting of the project (H3): set here, in place, and it applies to every day. */
  async function setProjectPost(chosen: BridgePost) {
    if (!workspaceId) return;
    setBusy("post");
    setFailure(null);
    try {
      await backend.agenda.setProjectPost(workspaceId, chosen);
      await client.invalidateQueries({ queryKey: keys.agenda });
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

  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Escape") return;
    // A Select or picker that is open takes esc itself; its popup is portaled out of this form.
    if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    props.onCancel();
  };

  const kindItems = KINDS.map((value) => ({ value, label: copy.agenda.editor.kinds[value] }));

  return (
    <form onSubmit={submit} onKeyDown={onKeyDown} className="flex flex-col gap-4" aria-label={input.mode === "add" ? copy.agenda.editor.addTitle : copy.agenda.editor.editTitle} data-testid="agenda-editor">
      {/* No `fill`: equal thirds would clip "Meeting of anders" in a 320px panel; the items size to their words. */}
      <SegmentedControl value={kind} onValueChange={setKind} items={kindItems} label={copy.agenda.editor.kind} disabled={props.readOnly} />

      <Field label={copy.agenda.editor.time} error={tried && rangeInvalid ? copy.agenda.editor.rangeInvalid : null}>
        {(id) => (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
            <Select id={id} label={copy.agenda.editor.from} value={from} onValueChange={setFrom} items={options.from} />
            <span aria-hidden="true" className="text-muted-foreground">
              –
            </span>
            <Select label={copy.agenda.editor.to} value={to} onValueChange={setTo} items={options.to} />
          </div>
        )}
      </Field>

      {kind === "project" ? (
        <Field label={copy.agenda.editor.project} error={tried && !workspaceId ? copy.agenda.editor.projectMissing : null}>
          {(id) => (
            <div className="flex flex-col gap-1.5">
              <Select id={id} label={copy.agenda.editor.project} value={workspaceId} placeholder={copy.agenda.editor.chooseProject} onValueChange={setWorkspaceId} items={choices.map((project) => ({ value: project.id, label: project.name }))} />
              {workspaceId ? (
                <div className="flex min-h-7 items-center gap-2 px-1 text-xs">
                  <span className="shrink-0 text-muted-foreground">{copy.agenda.editor.post}:</span>
                  {projectPost ? <PostLine post={projectPost} className="text-xs" /> : <MissingPost />}
                  <PostPicker
                    recent={recent}
                    current={projectPost}
                    onChoose={(chosen) => void setProjectPost(chosen)}
                    align="end"
                    trigger={
                      <Button variant="quiet" size="sm" className="ms-auto" disabled={props.readOnly || busy !== null}>
                        {projectPost ? copy.agenda.edit : copy.agenda.choosePost}
                      </Button>
                    }
                  />
                </div>
              ) : null}
            </div>
          )}
        </Field>
      ) : null}

      {kind === "other" ? (
        <>
          <Field label={copy.agenda.editor.label} error={tried && !label.trim() ? copy.agenda.editor.labelMissing : null}>
            {(id, describedBy) => (
              <Input id={id} aria-describedby={describedBy} value={label} maxLength={OTHER_LABEL_MAX} onChange={(event) => setLabel(event.target.value)} placeholder={copy.agenda.editor.labelPlaceholder} autoFocus={input.mode === "edit"} data-testid="agenda-editor-label" />
            )}
          </Field>
          <div className="flex min-h-7 items-center gap-2 px-1 text-xs">
            <span className="shrink-0 text-muted-foreground">{copy.agenda.editor.post}:</span>
            {post ? <PostLine post={post} className="text-xs" /> : <MissingPost />}
            <span className="ms-auto flex shrink-0 items-center gap-0.5">
              <PostPicker
                recent={recent}
                current={post}
                onChoose={setPost}
                align="end"
                trigger={
                  <Button variant="quiet" size="sm" disabled={props.readOnly} data-testid="agenda-editor-post">
                    {post ? copy.agenda.edit : copy.agenda.choosePost}
                  </Button>
                }
              />
              {post ? (
                <Button variant="quiet" size="icon-sm" aria-label={copy.agenda.post.remove} onClick={() => setPost(null)} disabled={props.readOnly}>
                  <X />
                </Button>
              ) : null}
            </span>
          </div>
        </>
      ) : null}

      {kind === "away" ? <p className="px-1 text-xs text-muted-foreground">{copy.agenda.editor.awayState}</p> : null}

      <Disclosure label={copy.agenda.editor.more} size="sm" defaultOpen={Boolean(input.note || input.reference)} keepMounted panelClassName="flex flex-col gap-3 ps-1 pt-2">
        <Field label={copy.agenda.editor.note} optional>
          {(id) => <Textarea id={id} value={note} maxLength={NOTE_MAX} onChange={(event) => setNote(event.target.value)} className="min-h-16" />}
        </Field>
        <Field label={copy.agenda.editor.reference} optional>
          {(id) => <Input id={id} value={reference} maxLength={REFERENCE_MAX} onChange={(event) => setReference(event.target.value)} placeholder={copy.agenda.editor.referencePlaceholder} />}
        </Field>
      </Disclosure>

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
        <KbdRow hints={[{ keys: copy.agenda.editor.cancelChord, label: copy.agenda.editor.cancelLabel }]} className="pointer-coarse:hidden" />
        {input.mode === "edit" && input.canReset ? (
          <Button variant="quiet" className="ms-auto" onClick={() => void save(true)} disabled={props.readOnly || busy !== null}>
            {copy.agenda.editor.reset}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
