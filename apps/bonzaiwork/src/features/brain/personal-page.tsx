import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, FolderOpen, MessageSquarePlus } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys, useBrains, useHarness, useProjects, useRoutines, useStatus } from "~/backend/queries";
import type { Brain, HarnessInfo, Project, RemoteCheck, RoutineInput } from "~/backend/types";
import { PageTitle, TopBar } from "~/components/top-bar";
import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { StatusChip } from "~/components/ui/chip";
import { Disclosure } from "~/components/ui/disclosure";
import { Input } from "~/components/ui/field";
import { Locked, Row, Section, Skeleton } from "~/components/ui/misc";
import { copy } from "~/copy";
import { href, navigate } from "~/lib/router";
import { localTimezone } from "~/lib/schedule";
import { focusComposer } from "~/lib/shortcuts";

import { ChatRow } from "../chat/project-home";
import { FilePreview } from "../chat/sidecar";
import { ProjectRuntimeProvider, useProjectState } from "../project/runtime";
import { RoutineEditor } from "../routines/routine-editor";
import { useBrainAction } from "./actions";
import { BrainAttentionCard, ProposalCards } from "./cards";
import { HistorySection } from "./history";
import { KnowledgeSection } from "./knowledge";
import { BrainLinkField } from "./link-field";
import { brainChip } from "./model";
import { TypedFolder, usePersonalSetup } from "./personal-setup";
import { SkillsSection } from "./skills-section";
import { useStartChat } from "./start-chat";

const PREFERENCES = "_meta/voorkeuren.md";

/** At most this many chats on the page; the full list lives under "Jouw brein" in the sidebar. */
const MAX_CHATS = 5;

function Shell(props: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar actions={props.actions}>
        <PageTitle>{copy.shell.brain}</PageTitle>
      </TopBar>
      <main className="min-h-0 flex-1 overflow-y-auto" aria-label={copy.brain.personal.label}>
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 pt-5 pb-16 sm:px-6">{props.children}</div>
      </main>
    </div>
  );
}

/** No personal brain yet: one card with the two ways to start (brief §8; the onboarding step is gone). */
function SetupCard(props: { readOnly: boolean; previous: Project | null }) {
  const setup = usePersonalSetup();
  const disabled = props.readOnly || setup.busy !== null;
  return (
    <Callout
      testId="personal-setup"
      label={copy.brain.personal.setupTitle}
      icon={<BookOpen />}
      title={copy.brain.personal.setupTitle}
      state={props.previous ? copy.brain.harness.previousBody(props.previous.name) : copy.brain.personal.setupState}
      link={props.previous ? <a href={href({ name: "project", projectId: props.previous.id, chatId: null })}>{copy.brain.harness.previousOpen}</a> : undefined}
      actions={
        <>
          <Button variant="primary" disabled={disabled} onClick={() => void setup.createNew()}>
            {setup.busy === "new" ? copy.common.loading : copy.brain.personalNew}
          </Button>
          <Button variant="secondary" disabled={disabled || (setup.typing && !setup.path.trim())} onClick={() => void setup.chooseExisting()}>
            <FolderOpen />
            {setup.busy === "existing" ? copy.common.loading : copy.brain.personalExisting}
          </Button>
        </>
      }
    >
      {setup.typing ? <TypedFolder value={setup.path} onChange={setup.setPath} onSubmit={() => void setup.chooseExisting()} /> : null}
    </Callout>
  );
}

/** Preferences the AI follows in every project: the file itself, and the morning digest routine. */
function PreferencesSection(props: { brain: Brain; readOnly: boolean }) {
  const backend = useBackend();
  const brains = useBrains();
  const routines = useRoutines(props.brain.projectId);
  const files = useQuery({ queryKey: keys.files(props.brain.projectId), queryFn: () => backend.config.files(props.brain.projectId), staleTime: 15_000 });
  const [preview, setPreview] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const hasPreferences = (files.data ?? []).some((file) => file.path === PREFERENCES);
  const planned = (routines.data ?? []).find((routine) => routine.name === copy.brain.news && routine.state !== "archived");
  const team = (brains.data ?? []).filter((brain) => brain.status.kind === "project").map((brain) => brain.projectId);
  const teamKey = team.join(",");
  const template = useMemo(
    (): Partial<RoutineInput> => ({
      name: copy.brain.news,
      prompt: copy.brain.newsPrompt,
      brains: teamKey ? teamKey.split(",") : [],
      schedule: { kind: "daily", timezone: localTimezone(), hour: 8, minute: 30 },
    }),
    [teamKey],
  );
  return (
    <Section title={copy.brain.personal.preferences}>
      <Row
        label={hasPreferences ? copy.brain.personal.preferencesRow : <span className="font-normal text-muted-foreground">{copy.brain.personal.preferencesNone}</span>}
        action={
          hasPreferences ? (
            <Button variant="secondary" size="sm" onClick={() => setPreview(PREFERENCES)}>
              {copy.brain.personal.preferencesOpen}
            </Button>
          ) : undefined
        }
      />
      <Row
        label={copy.brain.news}
        action={
          !backend.capabilities.routines ? (
            <Locked>{copy.routines.locked}</Locked>
          ) : planned ? (
            <a className="text-sm text-muted-foreground underline-offset-2 hover:underline" href={href({ name: "project-routines", projectId: props.brain.projectId, routineId: planned.id })}>
              {copy.brain.maintenancePlanned}
            </a>
          ) : (
            <Button variant="secondary" size="sm" disabled={props.readOnly} onClick={() => setPlanning(true)}>
              {copy.brain.maintenancePlan}
            </Button>
          )
        }
      />
      <RoutineEditor open={planning} onOpenChange={setPlanning} routine={null} projectId={props.brain.projectId} template={template} onSaved={() => void routines.refetch()} />
      <FilePreview projectId={props.brain.projectId} chatId={null} path={preview} onClose={() => setPreview(null)} />
    </Section>
  );
}

function ExcludedRow(props: { brain: Brain; readOnly: boolean }) {
  const current = props.brain.status.excluded.join(", ");
  const [value, setValue] = useState(current);
  const { busy, run, brains } = useBrainAction(props.brain.projectId);
  const folders = value.split(",").map((folder) => folder.trim()).filter(Boolean);
  return (
    <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border py-2.5">
      <label className="text-sm font-medium text-foreground" htmlFor="brain-excluded">
        {copy.brain.excluded}
      </label>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:max-w-sm">
        <Input id="brain-excluded" value={value} disabled={props.readOnly} onChange={(event) => setValue(event.target.value)} placeholder={copy.brain.excludedPlaceholder} />
        <Button variant="secondary" size="sm" disabled={props.readOnly || busy !== null || value === current} onClick={() => void run("excluded", () => brains.setExcluded(props.brain.projectId, folders), copy.settings.saved)}>
          {copy.brain.personal.excludedSave}
        </Button>
      </div>
    </div>
  );
}

/** A private repository for the personal brain, through the same tested link field (I-8). */
function PrivateRepoRow(props: { brain: Brain; readOnly: boolean }) {
  const { busy, run, brains } = useBrainAction(props.brain.projectId);
  const [open, setOpen] = useState(false);
  const [check, setCheck] = useState<RemoteCheck | null>(null);
  const cloud = /\/Library\/(Mobile Documents|CloudStorage)\/|\/(OneDrive|Dropbox|Google Drive)( [^/]*)?\//i.test(props.brain.path);
  if (cloud) return <Row label={copy.brain.privateRepo} value={<Locked>{copy.brain.privateRepoCloud}</Locked>} />;
  if (props.brain.status.remote) return <Row label={copy.brain.privateRepo} value={<code className="font-mono text-xs">{props.brain.status.remote}</code>} />;
  return (
    <>
      <Row
        label={copy.brain.privateRepo}
        value={open ? undefined : copy.brain.privateRepoNone}
        action={
          <Button variant="secondary" size="sm" disabled={props.readOnly} aria-expanded={open} onClick={() => setOpen(!open)}>
            {copy.brain.personal.privateRepoLink}
          </Button>
        }
      />
      {open ? (
        <div className="border-b border-border py-3">
          <div className="rounded-2xl bg-muted/70 p-4">
            <BrainLinkField check={check} onCheck={setCheck} disabled={props.readOnly || busy !== null} autoFocus />
            <div className="mt-3 flex items-center gap-2">
              <Button
                variant="primary"
                disabled={props.readOnly || busy !== null || !check?.ok}
                onClick={() => {
                  if (check?.ok) void run("remote", () => brains.attachRemote(props.brain.projectId, check.sshUrl), copy.brain.shared).then(() => setOpen(false));
                }}
              >
                {copy.brain.personal.privateRepoLink}
              </Button>
              <Button variant="quiet" disabled={busy !== null} onClick={() => setOpen(false)}>
                {copy.common.cancel}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** The brain's own chat home (#/p/:id): the composer with the vault as its folder. */
function startChat(projectId: string) {
  navigate({ name: "project", projectId, chatId: null });
  focusComposer();
}

function NewChatButton(props: { projectId: string }) {
  return (
    <Button variant="primary" size="sm" data-testid="brain-new-chat" onClick={() => startChat(props.projectId)}>
      <MessageSquarePlus />
      {copy.chatList.newChat}
    </Button>
  );
}

/** The chats with the personal brain itself, newest first (decision B1 keeps them out of the project list). */
function ChatsSection(props: { project: Project }) {
  const chats = useProjectState((state) => state.chats);
  const chatsState = useProjectState((state) => state.chatsState);
  const recent = useMemo(
    () =>
      Object.values(chats)
        .filter((chat) => !chat.parentId && !chat.archived)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_CHATS),
    [chats],
  );
  return (
    <Section title={copy.brain.personal.chats}>
      {chatsState === "loading" && !recent.length ? (
        <div className="flex flex-col gap-3 py-3" aria-busy="true">
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-4 w-56" />
        </div>
      ) : recent.length ? (
        <ul className="flex flex-col" data-testid="brain-chats">
          {recent.map((chat) => (
            <ChatRow key={chat.id} project={props.project} chat={chat} />
          ))}
        </ul>
      ) : (
        <Row label={<span className="font-normal text-muted-foreground">{copy.brain.personal.chatsNone}</span>} />
      )}
    </Section>
  );
}

/** Brein-harnas-plan H5: the brain from before the harness is a project now; the agent Brein takes over what still counts. */
function PreviousBrainRow(props: { brain: Brain; previous: Project; readOnly: boolean }) {
  const startChat = useStartChat(props.brain.projectId);
  const [busy, setBusy] = useState(false);
  return (
    <Section title={copy.brain.harness.previousTitle}>
      <Row
        label={copy.brain.harness.takeFromPrevious}
        hint={copy.brain.harness.takeFromPreviousHint}
        action={
          <Button
            variant="secondary"
            size="sm"
            disabled={props.readOnly || busy}
            data-testid="brain-previous-take"
            onClick={() => {
              setBusy(true);
              void startChat({ title: copy.brain.harness.takeFromPreviousChat, prompt: copy.brain.harness.takeFromPreviousPrompt(props.previous.name) }).finally(() => setBusy(false));
            }}
          >
            {copy.brain.harness.takeFromPreviousAction}
          </Button>
        }
      />
      <Row label={props.previous.name} action={<a className="text-sm text-muted-foreground underline-offset-2 hover:underline" href={href({ name: "project", projectId: props.previous.id, chatId: null })}>{copy.brain.harness.previousOpen}</a>} />
    </Section>
  );
}

function PersonalBrain(props: { brain: Brain; project: Project | null; previous: Project | null; readOnly: boolean }) {
  const { brain } = props;
  const backend = useBackend();
  const chip = brainChip(brain.status);
  const [preview, setPreview] = useState<string | null>(null);
  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm" data-testid="brain-state" data-state={brain.status.state}>
          <BookOpen className="size-4 shrink-0 text-subtle-foreground" aria-hidden="true" />
          <StatusChip status={chip.status} label={chip.label} className="text-sm" />
        </div>
        <BrainAttentionCard projectId={brain.projectId} link={false} />
        <ProposalCards all />
      </div>
      {props.project ? (
        <ProjectRuntimeProvider projectId={props.project.id}>
          <ChatsSection project={props.project} />
        </ProjectRuntimeProvider>
      ) : null}
      {props.previous ? <PreviousBrainRow brain={brain} previous={props.previous} readOnly={props.readOnly} /> : null}
      <PreferencesSection brain={brain} readOnly={props.readOnly} />
      {backend.capabilities.harness ? <SkillsSection personalId={brain.projectId} readOnly={props.readOnly} /> : null}
      <KnowledgeSection projectId={brain.projectId} readOnly={props.readOnly} onOpen={setPreview} />
      <HistorySection projectId={brain.projectId} readOnly={props.readOnly} />
      <Section title={copy.brain.personal.privacy}>
        <ExcludedRow key={brain.status.excluded.join(",")} brain={brain} readOnly={props.readOnly} />
        <PrivateRepoRow brain={brain} readOnly={props.readOnly} />
      </Section>
      <Disclosure label={copy.brain.technical.title} panelClassName="ps-0" testId="brain-technical">
        <div className="border-t border-border">
          <Row label={copy.brain.technical.folder} value={<code className="font-mono text-xs">{brain.path}</code>} />
        </div>
      </Disclosure>
      <FilePreview projectId={brain.projectId} chatId={null} path={preview} onClose={() => setPreview(null)} />
    </>
  );
}

/**
 * Jouw brein (`#/brein`, brief §8, decision B1): the personal brain as something that follows the
 * person, not a project row. Its proposals, preferences, knowledge and history; a set-up card when
 * there is none yet; a lock with the reason when brains are off (P4).
 */
export function PersonalPage() {
  const backend = useBackend();
  const status = useStatus();
  const brains = useBrains();
  const projects = useProjects();
  const harness = useHarness();
  const readOnly = status.data?.readOnly ?? false;
  const personal = (brains.data ?? []).find((brain) => brain.status.kind === "personal") ?? null;
  const project = personal ? ((projects.data ?? []).find((candidate) => candidate.id === personal.projectId) ?? null) : null;
  const previous = usePreviousBrain(harness.data ?? null, projects.data ?? [], readOnly);
  if (!backend.capabilities.brains) {
    return (
      <Shell>
        <Section title={copy.brain.personalTitle}>
          <Row label={copy.brain.personalTitle} value={<Locked>{copy.brain.locked}</Locked>} />
        </Section>
      </Shell>
    );
  }
  if (brains.isLoading) {
    return (
      <Shell>
        <div className="flex flex-col gap-3" aria-hidden="true">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Shell>
    );
  }
  return (
    <Shell actions={project ? <NewChatButton projectId={project.id} /> : undefined}>
      {personal ? <PersonalBrain brain={personal} project={project} previous={previous} readOnly={readOnly} /> : <SetupCard readOnly={readOnly} previous={previous} />}
    </Shell>
  );
}

/**
 * The brain from before the harness (H5): its project, renamed once to "<naam> (tot <datum>)" so
 * the list says what it is. The rename happens here, not on the server: names are the app's.
 */
function usePreviousBrain(harness: HarnessInfo | null, projects: readonly Project[], readOnly: boolean): Project | null {
  const backend = useBackend();
  const previousId = harness?.previous?.projectId ?? null;
  const at = harness?.previous?.at ?? null;
  const previous = previousId ? (projects.find((candidate) => candidate.id === previousId) ?? null) : null;
  useEffect(() => {
    if (!previous || readOnly || /\(tot [^)]+\)$/.test(previous.name)) return;
    const date = new Date(at ?? Date.now()).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
    void backend.projects.update(previous.id, { name: copy.brain.harness.previousName(previous.name, date) }).catch(() => undefined);
  }, [backend, previous, at, readOnly]);
  return previous;
}
