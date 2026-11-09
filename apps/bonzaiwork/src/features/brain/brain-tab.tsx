import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, BookOpen, ExternalLink } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys, useBrainAuthor, useBrainHistory, useBrains, useRoutines, useStatus } from "~/backend/queries";
import type { Brain, BrainMode, Project, RemoteCheck } from "~/backend/types";
import { TopBar } from "~/components/top-bar";
import { Button } from "~/components/ui/button";
import { StatusChip } from "~/components/ui/chip";
import { Disclosure } from "~/components/ui/disclosure";
import { Locked, Row, Section, Skeleton } from "~/components/ui/misc";
import { ConfirmDialog } from "~/components/ui/overlay";
import { Select } from "~/components/ui/select";
import { copy } from "~/copy";
import { formatDateTime } from "~/lib/format";
import { href } from "~/lib/router";
import { localTimezone } from "~/lib/schedule";
import { fileName } from "~/lib/tools";

import { useOpenProjectFile } from "../chat/file-link";
import { useBrainAction } from "./actions";
import { BrainAttentionCard } from "./cards";
import { HarnessCard } from "./harness-card";
import { HistorySection } from "./history";
import { JoinBrainForm } from "./join-brain";
import { KnowledgeSection } from "./knowledge";
import { BrainLinkField } from "./link-field";
import { brainChip, recallTrust, teamOf, useTrustDismissed } from "./model";
import { useStartChat } from "./start-chat";

const MODES: BrainMode[] = ["auto", "proposal", "manual", "read_only"];

function Shell(props: { children: React.ReactNode }) {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto" aria-label={copy.brain.tab.label}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 pt-5 pb-16 sm:px-6">{props.children}</div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Not a brain yet (brief §6): two rows, each with the one way to become one
// ---------------------------------------------------------------------------

function Publish(props: { project: Project; readOnly: boolean; onDone: () => void }) {
  const { busy, run, brains } = useBrainAction(props.project.id);
  const [check, setCheck] = useState<RemoteCheck | null>(null);
  const notEmpty = check?.ok === true && !check.empty;
  return (
    <div className="rounded-2xl bg-muted/70 p-4" data-testid="brain-publish">
      <BrainLinkField label={copy.brain.notBrain.publishStep} check={check} onCheck={setCheck} disabled={props.readOnly || busy !== null} autoFocus />
      {notEmpty ? (
        <p className="mt-2 text-sm text-destructive-foreground" role="alert">
          {copy.brain.publishNotEmpty}
        </p>
      ) : null}
      <div className="mt-3 flex items-center gap-2">
        <Button
          variant="primary"
          disabled={props.readOnly || busy !== null || !check?.ok || notEmpty}
          onClick={() => {
            if (check?.ok) void run("publish", () => brains.publish(props.project.id, check.sshUrl, props.project.name), copy.brain.published).then(props.onDone);
          }}
        >
          {copy.brain.notBrain.publish}
        </Button>
        <Button variant="quiet" disabled={busy !== null} onClick={props.onDone}>
          {copy.common.cancel}
        </Button>
      </div>
    </div>
  );
}

function NotABrain(props: { project: Project; readOnly: boolean }) {
  const backend = useBackend();
  const candidate = useQuery({ queryKey: keys.brainCandidate(props.project.id), queryFn: () => backend.brains.candidate(props.project.id) });
  const { busy, run, brains } = useBrainAction(props.project.id);
  const [open, setOpen] = useState<"publish" | "join" | null>(null);
  const repository = candidate.data?.repository ?? null;
  return (
    <Section title={copy.brain.sectionTitle}>
      <Row
        label={copy.brain.notBrain.share}
        hint={repository?.remote ?? undefined}
        value={repository && !repository.ssh ? <Locked>{copy.brain.adoptNotSsh}</Locked> : undefined}
        action={
          candidate.isLoading ? (
            <Skeleton className="h-7 w-20" />
          ) : repository ? (
            repository.ssh ? (
              <Button variant="secondary" size="sm" disabled={props.readOnly || busy !== null} onClick={() => void run("adopt", () => brains.adopt(props.project.id), copy.brain.adopted)}>
                {copy.brain.notBrain.adopt}
              </Button>
            ) : undefined
          ) : (
            <Button variant="secondary" size="sm" disabled={props.readOnly} aria-expanded={open === "publish"} onClick={() => setOpen(open === "publish" ? null : "publish")}>
              {copy.brain.notBrain.shareAction}
            </Button>
          )
        }
      />
      {open === "publish" ? (
        <div className="border-b border-border py-3">
          <Publish project={props.project} readOnly={props.readOnly} onDone={() => setOpen(null)} />
        </div>
      ) : null}
      <Row
        label={copy.brain.notBrain.join}
        action={
          <Button variant="secondary" size="sm" disabled={props.readOnly} aria-expanded={open === "join"} onClick={() => setOpen(open === "join" ? null : "join")}>
            {copy.brain.notBrain.joinAction}
          </Button>
        }
      />
      {open === "join" ? (
        <div className="py-3">
          <div className="rounded-2xl bg-muted/70 p-4">
            <JoinBrainForm onDone={() => setOpen(null)} />
          </div>
        </div>
      ) : null}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// A brain: state line, Actie nodig, knowledge, history, care, technical details
// ---------------------------------------------------------------------------

/** One line: the state as icon + word, then who shares it (names from the history; P1). */
function StateLine(props: { brain: Brain }) {
  const history = useBrainHistory(props.brain.projectId);
  const author = useBrainAuthor();
  const me = author.data?.author?.name ?? author.data?.suggested?.name ?? null;
  const team = useMemo(() => teamOf(history.data ?? [], me), [history.data, me]);
  const chip = brainChip(props.brain.status);
  const { status } = props.brain;
  const sharing = status.remote === null ? copy.brain.tab.localOnly : team.length ? copy.brain.tab.sharedWith(team) : copy.brain.tab.sharedAlone;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm" data-testid="brain-state" data-state={status.state}>
      <BookOpen className="size-4 shrink-0 text-subtle-foreground" aria-hidden="true" />
      <StatusChip status={chip.status} label={chip.label} className="text-sm" />
      {/* An idle chip has no glyph after the word, so the two facts need their own separator (P9). */}
      <span aria-hidden="true" className="text-subtle-foreground">·</span>
      <span className="text-muted-foreground">{sharing}</span>
    </div>
  );
}

function TrustLaterRow(props: { brain: Brain; readOnly: boolean }) {
  const { busy, run, brains } = useBrainAction(props.brain.projectId);
  const items = props.brain.status.pendingTrust;
  return (
    <Row
      label={copy.brain.tab.trustLater}
      hint={items.map((item) => copy.brain.trustKinds[item.kind](item.mcpServers)).join(", ")}
      action={
        <Button
          variant="secondary"
          size="sm"
          disabled={props.readOnly || busy !== null}
          onClick={() =>
            void run("trust", () => brains.trust(props.brain.projectId, items.map((item) => item.path)), copy.brain.trusted).then(() => recallTrust(props.brain.projectId))
          }
        >
          {copy.attention.brain.allow}
        </Button>
      }
    />
  );
}

/** Rows the state carries beyond its word: a proposal to open, files that do not share, warnings. */
function StateRows(props: { brain: Brain; readOnly: boolean }) {
  const backend = useBackend();
  const { status } = props.brain;
  const { busy, run, brains } = useBrainAction(props.brain.projectId);
  const dismissed = useTrustDismissed(props.brain.projectId, status);
  const rows: React.ReactNode[] = [];
  if (dismissed) rows.push(<TrustLaterRow key="trust" brain={props.brain} readOnly={props.readOnly} />);
  if (status.proposal) {
    const url = status.proposal.url;
    rows.push(
      <Row
        key="proposal"
        label={status.proposal.manual ? copy.brain.proposalMake : copy.brain.proposalOpen}
        action={
          url ? (
            <Button variant="secondary" size="sm" onClick={() => void backend.desktop.openUrl(url)}>
              <ExternalLink />
              {status.proposal.manual ? copy.brain.proposalCreate : copy.brain.proposalView}
            </Button>
          ) : undefined
        }
      />,
    );
  }
  if (status.state === "read_only" && status.mode !== "read_only" && status.remote) {
    rows.push(
      <Row
        key="read-only"
        label={status.error ?? copy.brain.states.read_only}
        action={
          <Button
            variant="secondary"
            size="sm"
            disabled={props.readOnly || busy !== null}
            onClick={() =>
              void run("proposal", async () => {
                await brains.setMode(props.brain.projectId, "proposal");
                return brains.share(props.brain.projectId);
              }, copy.brain.proposalShared)
            }
          >
            {copy.brain.proposalShare}
          </Button>
        }
      />,
    );
  }
  if (status.unshared.length) {
    rows.push(
      <Row
        key="unshared"
        label={copy.brain.tab.unsharedRow(status.unshared.length)}
        hint={status.unshared.slice(0, 3).map((item) => `${fileName(item.path)} (${copy.brain.unsharedReason[item.reason]})`).join(", ")}
      />,
    );
  }
  for (const warning of status.warnings) rows.push(<Row key={warning} label={<span className="font-normal text-muted-foreground">{warning}</span>} />);
  if (!rows.length) return null;
  return <div className="border-t border-border">{rows}</div>;
}

/** Weekly maintenance as a routine and "Inrichten" with the architect skill (fase 2). */
function CareSection(props: { projectId: string; readOnly: boolean; setUpBusy: boolean; onSetUp: () => void }) {
  const backend = useBackend();
  const routines = useRoutines(props.projectId);
  const { busy, run } = useBrainAction(props.projectId);
  const planned = (routines.data ?? []).find((routine) => routine.name === copy.brain.maintenance && routine.state !== "archived");
  return (
    <Section title={copy.brain.care.title}>
      <Row
        label={copy.brain.maintenance}
        action={
          !backend.capabilities.routines ? (
            <Locked>{copy.routines.locked}</Locked>
          ) : planned ? (
            <a className="text-sm text-muted-foreground underline-offset-2 hover:underline" href={href({ name: "project-routines", projectId: props.projectId, routineId: planned.id })}>
              {copy.brain.maintenancePlanned}
            </a>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled={props.readOnly || busy !== null}
              onClick={() =>
                void run(
                  "maintenance",
                  () =>
                    backend.routines.create({
                      projectId: props.projectId,
                      name: copy.brain.maintenance,
                      prompt: copy.brain.maintenancePrompt,
                      model: null,
                      brains: [],
                      schedule: { kind: "weekly", timezone: localTimezone(), daysOfWeek: [1], hour: 9, minute: 0 },
                    }),
                  copy.brain.maintenancePlanned,
                ).then(() => routines.refetch())
              }
            >
              {copy.brain.maintenancePlan}
            </Button>
          )
        }
      />
      <Row
        label={copy.brain.layoutTitle}
        action={
          <Button variant="secondary" size="sm" disabled={props.readOnly || props.setUpBusy} onClick={props.onSetUp}>
            {copy.brain.setUpChat}
          </Button>
        }
      />
    </Section>
  );
}

/** Git facts and rare decisions behind one labelled row (P3, C3): link, branch, folder, sharing mode, stop. */
function TechnicalDetails(props: { brain: Brain; readOnly: boolean }) {
  const { status } = props.brain;
  const { busy, run, brains } = useBrainAction(props.brain.projectId);
  const [stopping, setStopping] = useState(false);
  return (
    <Disclosure label={copy.brain.technical.title} panelClassName="ps-0" testId="brain-technical">
      <div className="border-t border-border">
        {status.remote ? <Row label={copy.brain.technical.link} value={<code className="font-mono text-xs">{status.remote}</code>} /> : null}
        {status.remote ? <Row label={copy.brain.technical.branch} value={<code className="font-mono text-xs">{status.branch}</code>} /> : null}
        <Row label={copy.brain.technical.folder} value={<code className="font-mono text-xs">{props.brain.path}</code>} />
        <Row label={copy.brain.technical.lastSync} value={status.lastSyncAt ? formatDateTime(status.lastSyncAt) : copy.brain.never} />
        {status.remote ? (
          <Row
            label={copy.brain.technical.mode}
            action={
              <Select
                label={copy.brain.technical.mode}
                value={status.mode}
                disabled={props.readOnly || busy !== null}
                onValueChange={(value) => {
                  const mode = MODES.find((entry) => entry === value);
                  if (mode) void run("mode", () => brains.setMode(props.brain.projectId, mode), copy.settings.saved);
                }}
                items={MODES.map((mode) => ({ value: mode, label: copy.brain.modes[mode] }))}
              />
            }
          />
        ) : null}
        <Row
          label={copy.brain.stopSync}
          action={
            <Button variant="secondary" size="sm" disabled={props.readOnly} onClick={() => setStopping(true)}>
              {copy.brain.stopSync}
            </Button>
          }
        />
      </div>
      <ConfirmDialog
        open={stopping}
        onOpenChange={setStopping}
        title={copy.brain.stopSync}
        body={copy.brain.stopSyncBody}
        confirmLabel={copy.brain.stopSync}
        busy={busy !== null}
        onConfirm={() => void run("stop", () => brains.unregister(props.brain.projectId), copy.brain.stopped).then(() => setStopping(false))}
      />
    </Disclosure>
  );
}

function BrainOverview(props: { project: Project; brain: Brain; readOnly: boolean }) {
  const { brain, project } = props;
  const { status } = brain;
  const { busy, run, brains } = useBrainAction(project.id);
  const startChat = useStartChat(project.id);
  const openFile = useOpenProjectFile(project, null);
  const canShare = status.mode !== "read_only" && status.remote !== null && status.state !== "conflict" && status.state !== "error";
  const pendingShare = status.ahead > 0 || status.state === "offline";
  const setUp = () => void run("setup", () => startChat({ title: copy.brain.setUpChat, prompt: copy.brain.setUpPrompt }));
  return (
    <>
      <TopBar
        actions={
          status.remote ? (
            <>
              <Button variant="quiet" size="sm" disabled={busy !== null || status.state === "conflict"} onClick={() => void run("update", () => brains.prepare(project.id, ""), copy.brain.updated)}>
                <ArrowDownToLine />
                {copy.brain.tab.updateNow}
              </Button>
              {canShare && pendingShare ? (
                <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => void run("share", () => brains.share(project.id), copy.brain.shared)}>
                  <ArrowUpFromLine />
                  {status.state === "offline" || status.state === "read_only" ? copy.brain.retry : copy.brain.tab.shareNow}
                </Button>
              ) : null}
            </>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-4">
        <StateLine brain={brain} />
        <BrainAttentionCard projectId={project.id} link={false} />
        <HarnessCard projectId={project.id} link={false} />
        <StateRows brain={brain} readOnly={props.readOnly} />
      </div>
      <KnowledgeSection projectId={project.id} readOnly={props.readOnly || status.mode === "read_only"} onOpen={openFile} onSetUp={setUp} setUpBusy={busy !== null} />
      <HistorySection projectId={project.id} readOnly={props.readOnly} />
      <CareSection projectId={project.id} readOnly={props.readOnly} setUpBusy={busy !== null} onSetUp={setUp} />
      <TechnicalDetails brain={brain} readOnly={props.readOnly} />
    </>
  );
}

/**
 * Project · Brein (brief §6, §8): the state line with the team, the one "Actie nodig" object on
 * top when the user has to act, the knowledge as rows with "Klopt" inline, the history, and the
 * git facts behind "Technische details" (P3). A project that is not a brain gets two rows: share
 * this project as a brain, or fetch the team's brain, in one step. With brains off, both rows
 * stay visible with a lock and the reason (P4, C5).
 */
export function BrainTab(props: { project: Project }) {
  const backend = useBackend();
  const status = useStatus();
  const brains = useBrains();
  const readOnly = status.data?.readOnly ?? false;
  const brain = (brains.data ?? []).find((entry) => entry.projectId === props.project.id) ?? null;

  if (!backend.capabilities.brains) {
    return (
      <Shell>
        <Section title={copy.brain.sectionTitle}>
          <Row label={copy.brain.notBrain.share} value={<Locked>{copy.brain.locked}</Locked>} />
          <Row label={copy.brain.notBrain.join} value={<Locked>{copy.brain.locked}</Locked>} />
        </Section>
      </Shell>
    );
  }
  if (brains.isLoading) {
    return (
      <Shell>
        <div className="flex flex-col gap-3" aria-hidden="true">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-5/6" />
        </div>
      </Shell>
    );
  }
  return <Shell>{brain ? <BrainOverview project={props.project} brain={brain} readOnly={readOnly} /> : <NotABrain project={props.project} readOnly={readOnly} />}</Shell>;
}
