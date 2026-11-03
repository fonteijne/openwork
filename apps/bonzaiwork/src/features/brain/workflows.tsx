import { useQueryClient } from "@tanstack/react-query";
import { useState, type KeyboardEvent } from "react";
import { ClipboardCheck } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys, useWorkflows } from "~/backend/queries";
import type { Workflow, WorkflowStage } from "~/backend/types";
import { PromptDialog } from "~/components/prompt-dialog";
import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Kbd, Locked } from "~/components/ui/misc";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { errorText } from "~/lib/errors";

import { FilePreview } from "../chat/sidecar";
import { deliverableOf, stageChatTitle, stageTask } from "./model";
import { useStartChat } from "./start-chat";

type Check = { workflow: Workflow; stage: WorkflowStage; index: number };

/** The stage waiting for a check; with a chat title, only the stage that chat ran (brief §8). */
function pendingCheck(workflows: readonly Workflow[], chatTitle: string | null | undefined): Check | null {
  // A chat without a title never ran a stage.
  if (chatTitle === null) return null;
  for (const workflow of workflows) {
    const index = workflow.stages.findIndex((stage) => stage.state === "check");
    const stage = workflow.stages[index];
    if (!stage) continue;
    if (chatTitle !== undefined && chatTitle !== stageChatTitle(workflow.title, stage)) continue;
    return { workflow, stage, index };
  }
  return null;
}

function cardKeys(chords: { enter?: () => void; escape?: () => void }) {
  return (event: KeyboardEvent<HTMLElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.target !== event.currentTarget) return;
    if (event.key === "Enter" && chords.enter) {
      event.preventDefault();
      chords.enter();
    } else if (event.key === "Escape" && chords.escape) {
      event.preventDefault();
      chords.escape();
    }
  };
}

/**
 * The control question of a workflow stage as a Callout above the composer (brief §6, §8; plan
 * §6.5): "Klopt conceptofferte.md?" names the deliverable, not the folder id (assessment P-3).
 * Goedkeuren · Openen · Afkeuren with chords; a model check starts the checking chat; a script
 * check stays visible with a lock (P4). Without `chatTitle` (the Werk tab) the first pending
 * check shows; with one, only the check of the chat that ran the stage.
 */
export function WorkflowCheckCard(props: { projectId: string; chatTitle?: string | null; className?: string }) {
  const backend = useBackend();
  const client = useQueryClient();
  const workflows = useWorkflows(props.projectId);
  const startChat = useStartChat(props.projectId);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const check = pendingCheck(workflows.data ?? [], props.chatTitle);
  if (!check) return null;
  const { workflow, stage, index } = check;
  const deliverable = deliverableOf(stage);
  const output = stage.outputs[0] ? `workflows/${workflow.name}/${stage.id}/${stage.outputs[0]}` : null;

  const act = async (task: () => Promise<void>, done?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await task();
      if (done) toast(done);
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
    } finally {
      setBusy(false);
      await client.invalidateQueries({ queryKey: keys.workflows(props.projectId) });
    }
  };
  const approve = () => void act(() => backend.brains.checkStage(props.projectId, workflow.name, stage.id, "pass", null), copy.brain.workflow.approved);
  const modelCheck = () => void act(async () => startChat(await backend.brains.modelCheck(props.projectId, workflow.name, stage.id)));
  const primary = stage.check.kind === "model" ? modelCheck : stage.check.kind === "person" ? approve : undefined;

  return (
    <>
      <Callout
        className={props.className}
        testId="workflow-check"
        label={copy.brain.workflow.label}
        decision
        tabIndex={0}
        onKeyDown={cardKeys({ enter: primary, escape: stage.check.kind === "person" ? () => setRejecting(true) : undefined })}
        icon={<ClipboardCheck />}
        title={copy.brain.workflow.question(deliverable)}
        state={copy.brain.workflow.stage(workflow.title, index + 1, workflow.stages.length, stageTask(stage))}
        actions={
          stage.check.kind === "script" ? (
            <Locked>{copy.brain.stageScriptLocked}</Locked>
          ) : stage.check.kind === "model" ? (
            <Button variant="primary" disabled={busy} onClick={modelCheck}>
              {copy.brain.stageModelCheck}
              <Kbd>⏎</Kbd>
            </Button>
          ) : (
            <>
              <Button variant="primary" disabled={busy} onClick={approve}>
                {copy.brain.stageApprove}
                <Kbd>⏎</Kbd>
              </Button>
              {output ? (
                <Button variant="secondary" disabled={busy} onClick={() => setPreview(output)}>
                  {copy.brain.stageOpen}
                </Button>
              ) : null}
              <Button variant="quiet" disabled={busy} onClick={() => setRejecting(true)}>
                {copy.brain.stageReject}
                <Kbd>esc</Kbd>
              </Button>
            </>
          )
        }
      />
      <PromptDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title={copy.brain.stageReject}
        label={copy.brain.stageRejectReason}
        submitLabel={copy.brain.stageReject}
        onSubmit={async (reason) => {
          await act(() => backend.brains.checkStage(props.projectId, workflow.name, stage.id, "fail", reason.trim() || null), copy.brain.workflow.rejected);
          setRejecting(false);
        }}
      />
      <FilePreview projectId={props.projectId} chatId={null} path={preview} onClose={() => setPreview(null)} />
    </>
  );
}
