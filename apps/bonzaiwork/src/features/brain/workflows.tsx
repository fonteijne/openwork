import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Check, Circle, CircleDot, Play, RotateCcw, X } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys, useWorkflows } from "~/backend/queries";
import type { Workflow, WorkflowStage } from "~/backend/types";
import { PromptDialog } from "~/components/prompt-dialog";
import { Button } from "~/components/ui/button";
import { Locked } from "~/components/ui/misc";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";

import { FilePreview } from "../chat/sidecar";
import { useStartChat } from "./start-chat";

const stageName = (stage: WorkflowStage) => stage.id.replace(/^\d{2}_/, "").replace(/[-_]+/g, " ");

function StageMark(props: { stage: WorkflowStage }) {
  const { state } = props.stage;
  const icon = state === "done" ? <Check /> : state === "failed" ? <X /> : state === "check" ? <CircleDot /> : <Circle />;
  return (
    <li
      className={cn(
        "flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ring-inset [&_svg]:size-3.5 [&_svg]:shrink-0",
        state === "done" ? "text-foreground ring-border" : state === "check" || state === "failed" ? "text-foreground ring-amber-9/60" : state === "ready" ? "text-foreground ring-primary/60" : "text-subtle-foreground ring-border",
      )}
      title={`${stageName(props.stage)}: ${copy.brain.stageStates[state]}`}
    >
      {icon}
      <span className="truncate">{stageName(props.stage)}</span>
      <span className="sr-only">{copy.brain.stageStates[state]}</span>
    </li>
  );
}

/**
 * One workflow: the stages as a bar, and the one thing to do next (plan §6.5,
 * DESIGN.md S2). The next stage starts only after the check said pass.
 */
function WorkflowRow(props: { projectId: string; workflow: Workflow }) {
  const backend = useBackend();
  const client = useQueryClient();
  const startChat = useStartChat(props.projectId);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [newRun, setNewRun] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const { workflow } = props;
  const refresh = () => client.invalidateQueries({ queryKey: keys.workflows(props.projectId) });
  const act = async (task: () => Promise<void>, done?: string) => {
    setBusy(true);
    try {
      await task();
      if (done) toast(done);
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const current = workflow.stages.find((stage) => stage.state !== "done") ?? null;
  const base = current ? `workflows/${workflow.name}/${current.id}` : "";
  const output = current?.outputs[0] ? `${base}/${current.outputs[0]}` : null;
  const start = (stage: WorkflowStage) => act(async () => startChat(await backend.brains.startStage(props.projectId, workflow.name, stage.id)));

  let action: ReactNode = null;
  let note: string | null = null;
  if (!current) {
    note = copy.brain.runDone;
    action = <Button variant="secondary" size="sm" disabled={busy} onClick={() => setNewRun(true)}>{copy.brain.runNew}</Button>;
  } else if (current.state === "ready") {
    action = <Button variant="primary" size="sm" disabled={busy} onClick={() => void start(current)}><Play />{copy.brain.stageStart(stageName(current))}</Button>;
  } else if (current.state === "failed") {
    note = current.failure;
    action = <Button variant="secondary" size="sm" disabled={busy} onClick={() => void start(current)}><RotateCcw />{copy.brain.stageAgain}</Button>;
  } else if (current.state === "check") {
    note = copy.brain.stageCheckQuestion(stageName(current));
    action = current.check.kind === "script" ? <Locked>{copy.brain.stageScriptLocked}</Locked>
      : current.check.kind === "model" ? (
        <Button variant="primary" size="sm" disabled={busy} onClick={() => void act(async () => startChat(await backend.brains.modelCheck(props.projectId, workflow.name, current.id)))}>{copy.brain.stageModelCheck}</Button>
      ) : (
        <>
          <Button variant="primary" size="sm" disabled={busy} onClick={() => void act(() => backend.brains.checkStage(props.projectId, workflow.name, current.id, "pass", null), copy.brain.stageStates.done)}>{copy.brain.stageApprove}</Button>
          {output ? <Button variant="secondary" size="sm" disabled={busy} onClick={() => setPreview(output)}>{copy.brain.stageOpen}</Button> : null}
          <Button variant="quiet" size="sm" disabled={busy} onClick={() => setRejecting(true)}>{copy.brain.stageReject}</Button>
        </>
      );
  } else if (current.missing.length) {
    note = copy.brain.stageMissing(current.missing.map((path) => path.split("/").at(-1) ?? path).join(", "));
  }

  return (
    <li className="border-b border-border py-3 last:border-b-0" data-testid="workflow">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-sm font-medium text-foreground">{workflow.title}</p>
        {workflow.task ? <p className="text-xs text-muted-foreground">{workflow.task}</p> : null}
      </div>
      <ol className="mt-2 flex flex-wrap gap-1.5" aria-label={workflow.title}>
        {workflow.stages.map((stage) => <StageMark key={stage.id} stage={stage} />)}
      </ol>
      {note || action ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {note ? <p className="me-auto text-sm text-muted-foreground" role="status">{note}</p> : null}
          {action}
        </div>
      ) : null}
      <PromptDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title={copy.brain.stageReject}
        label={copy.brain.stageRejectReason}
        submitLabel={copy.brain.stageReject}
        onSubmit={async (reason) => {
          if (current) await act(() => backend.brains.checkStage(props.projectId, workflow.name, current.id, "fail", reason.trim() || null));
          setRejecting(false);
        }}
      />
      <PromptDialog
        open={newRun}
        onOpenChange={setNewRun}
        title={copy.brain.runNew}
        label={copy.brain.runSubject}
        submitLabel={copy.brain.runNew}
        onSubmit={async (subject) => {
          await act(() => backend.brains.newRun(props.projectId, workflow.name, subject.trim()), copy.brain.runStarted);
          setNewRun(false);
        }}
      />
      <FilePreview projectId={props.projectId} chatId={null} path={preview} onClose={() => setPreview(null)} />
    </li>
  );
}

/** The project's workflows on its start page; nothing when it has none. */
export function WorkflowsPanel(props: { projectId: string }) {
  const workflows = useWorkflows(props.projectId);
  const list = workflows.data ?? [];
  if (!list.length) return null;
  return (
    <section className="mt-10" aria-label={copy.brain.workflows} data-testid="workflows">
      <h3 className="mb-1 text-xs font-medium text-subtle-foreground">{copy.brain.workflows}</h3>
      <ul className="border-t border-border">
        {list.map((workflow) => <WorkflowRow key={workflow.name} projectId={props.projectId} workflow={workflow} />)}
      </ul>
    </section>
  );
}
