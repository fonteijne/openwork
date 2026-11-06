import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, TriangleAlert } from "lucide-react";

import type { ProjectProposal } from "~/backend/cockpit";
import { useAreas, useCockpit, useCockpitRefresh, useProjectProposal, useTodos } from "~/backend/cockpit-queries";
import { useBackend } from "~/backend/context";
import { usePersonalBrain, useProjects, useStatus } from "~/backend/queries";
import type { Message } from "~/backend/types";
import { Accent, Container, Eyebrow, LinkArrow, SheetFooter, SheetHeader, Speaker, Suggestion, Tag } from "~/components/io";
import { ProseHtml } from "~/components/prose-html";
import { useDocumentTitle } from "~/components/top-bar";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input, SecretInput, Textarea } from "~/components/ui/field";
import { Skeleton } from "~/components/ui/misc";
import { Select } from "~/components/ui/select";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { projectsCopy } from "~/copy/projects";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { renderMarkdown } from "~/lib/markdown";
import { navigate } from "~/lib/router";

import { dayLabel, fromDateInput, toDateInput } from "../project/dates";
import { AccentTitle } from "../project/shared";
import { useUi } from "../shell/ui-store";
import { FolderRow, NameField, useProjectDraft } from "./project-form";

const N = projectsCopy.create;

const textOf = (message: Message) => message.parts.map((part) => (part.type === "text" ? part.text : "")).join("").trim();

function Label(props: { children: ReactNode; htmlFor?: string; id?: string }) {
  return (
    <label htmlFor={props.htmlFor} id={props.id} className="text-base font-semibold text-ink">
      {props.children}
    </label>
  );
}

/** The chat the project comes from: its title, the last question and answer, and the suggestion. */
function SourceChat(props: { fromProjectId: string; fromChatId: string; proposal: ProjectProposal | undefined; personal: boolean }) {
  const backend = useBackend();
  const projects = useProjects();
  const chat = useQuery({
    queryKey: ["new-project-chat", props.fromProjectId, props.fromChatId],
    queryFn: async () => {
      const [page, messages] = await Promise.all([backend.chats.list(props.fromProjectId, null), backend.chats.messages(props.fromProjectId, props.fromChatId).catch(() => [])]);
      return { chat: page.items.find((entry) => entry.id === props.fromChatId) ?? null, messages };
    },
    retry: false,
  });
  const title = chat.data?.chat?.title ?? props.proposal?.fromChat?.title ?? "";
  const startedAt = chat.data?.chat?.createdAt ?? props.proposal?.fromChat?.startedAt ?? null;
  const projectName = projects.data?.find((project) => project.id === props.fromProjectId)?.name ?? "";
  const messages = chat.data?.messages ?? [];
  const lastUser = [...messages].reverse().find((message) => message.role === "user" && textOf(message));
  const lastAgent = [...messages].reverse().find((message) => message.role === "assistant" && textOf(message));
  return (
    <div className="flex flex-col gap-8 px-6 pb-16 pt-10 lg:px-12 lg:pt-14">
      <div className="flex flex-col gap-3">
        {startedAt ? <Eyebrow>{props.personal ? N.chatEyebrow(dayLabel(startedAt)) : N.chatEyebrowProject(projectName, dayLabel(startedAt))}</Eyebrow> : null}
        <h1 tabIndex={-1} data-page-title="" className="m-0 max-w-[18ch] text-[40px] font-bold leading-[46px] tracking-[-0.02em] text-ink outline-none lg:text-[48px] lg:leading-[54px]">
          {title ? <AccentTitle text={title} /> : <Skeleton className="h-12 w-80" />}
        </h1>
      </div>
      {chat.isLoading ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="ms-auto h-16 w-2/3 rounded-card" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      ) : (
        <>
          {lastUser ? (
            <div className="flex flex-col items-end gap-2 self-end sm:max-w-[80%]">
              <Speaker who="you">
                {N.you} · {dayLabel(lastUser.createdAt)}
              </Speaker>
              <p className="m-0 rounded-card bg-surface-raised px-5 py-4 text-lg text-ink">{textOf(lastUser)}</p>
            </div>
          ) : null}
          {lastAgent ? (
            <div className="flex flex-col gap-2">
              <Speaker who="agent">
                <strong className="font-semibold text-ink">{N.agent}</strong> · {dayLabel(lastAgent.createdAt)}
              </Speaker>
              <ProseHtml html={renderMarkdown(textOf(lastAgent))} className="line-clamp-6 max-w-[68ch] text-lg text-ink" />
            </div>
          ) : null}
        </>
      )}
      <Suggestion eyebrow={N.suggestedEyebrow} className="max-w-[560px] bg-surface-raised">
        <p className="m-0 text-lg font-semibold text-ink">{N.suggestedText}</p>
      </Suggestion>
    </div>
  );
}

function BlankIntro() {
  return (
    <div className="flex flex-col gap-6 px-6 pb-16 pt-10 lg:px-12 lg:pt-14">
      <Eyebrow>{N.blankEyebrow}</Eyebrow>
      <h1 tabIndex={-1} data-page-title="" className="m-0 max-w-[16ch] text-[40px] font-bold leading-[46px] tracking-[-0.02em] text-ink outline-none lg:text-[48px] lg:leading-[54px]">
        {N.blankTitle}
        <Accent>{N.blankAccent}</Accent>
      </h1>
      <p className="m-0 max-w-[56ch] text-xl text-ink-muted">{N.blankLead}</p>
      <ul className="m-0 flex list-none flex-col gap-3 border-t border-ink p-0 pt-6">
        {N.blankPoints.map((point) => (
          <li key={point} className="flex items-start gap-3 text-lg text-ink">
            <Check className="mt-1.5 size-4 shrink-0 text-success" aria-hidden="true" />
            {point}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProposalForm(props: { proposal: ProjectProposal; fromChat: { projectId: string; chatId: string } | null; onClose: () => void }) {
  const backend = useBackend();
  const cockpit = useCockpit();
  const refresh = useCockpitRefresh();
  const status = useStatus();
  const areas = useAreas();
  const todos = useTodos();
  const rememberProject = useUi((state) => state.rememberProject);
  const draft = useProjectDraft();
  const { proposal } = props;
  const [goal, setGoal] = useState(proposal.goal);
  const [goalTouched, setGoalTouched] = useState(false);
  const [doneWhenMode, setDoneWhenMode] = useState<"suggested" | "edit">(props.fromChat && proposal.doneWhen ? "suggested" : "edit");
  const [doneWhen, setDoneWhen] = useState("");
  const [areaId, setAreaId] = useState(proposal.areaId);
  const [target, setTarget] = useState(toDateInput(proposal.target));
  const [pinned, setPinned] = useState<Record<string, boolean>>(() => Object.fromEntries(proposal.sources.map((source) => [source.id, source.pinned])));
  const [included, setIncluded] = useState<Record<string, boolean>>(() => Object.fromEntries(proposal.todos.map((todo) => [todo.id, todo.include])));
  const [linked, setLinked] = useState<Record<string, boolean>>({});
  const [keyPresent, setKeyPresent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const readOnly = status.data?.readOnly ?? false;
  const { setName } = draft;

  // The agent's title fills the field once; the person's own typing always wins.
  useEffect(() => {
    if (proposal.title) setName(proposal.title);
  }, [proposal.title, setName]);

  const area = (areas.data ?? []).find((entry) => entry.id === areaId) ?? null;
  const targetSuggested = Boolean(props.fromChat) && proposal.target !== null && target === toDateInput(proposal.target);
  const todoCount = proposal.todos.filter((todo) => included[todo.id] && !linked[todo.id]).length;
  const sourceCount = proposal.sources.filter((source) => pinned[source.id]).length;
  const existingTodo = (title: string) => (todos.data ?? []).find((todo) => !todo.done && todo.title === title) ?? null;

  const submit = async () => {
    setFormError(null);
    const project = await draft.create({ folderPath: draft.folder?.trim() || null, requireKey: false });
    if (!project) return;
    try {
      const trimmedGoal = goal.trim();
      if (trimmedGoal) await backend.projects.update(project.id, { description: trimmedGoal });
      await cockpit.projects.updateBrief(project.id, {
        goal: trimmedGoal || null,
        doneWhen: (doneWhenMode === "suggested" ? "" : doneWhen).trim() || null,
        target: fromDateInput(target),
        state: "active",
        areaId,
      });
      let failed = false;
      for (const todo of proposal.todos) {
        try {
          if (linked[todo.id] && todo.duplicateOf) {
            const existing = existingTodo(todo.duplicateOf);
            if (existing) await cockpit.todos.update(existing.id, { projectId: project.id });
          } else if (included[todo.id]) {
            await cockpit.todos.create({ title: todo.title, projectId: project.id, due: todo.due ? { kind: "due", at: todo.due } : null });
          }
        } catch {
          failed = true;
        }
      }
      await refresh();
      rememberProject(project.id);
      toast(failed ? N.todosFailed : N.created, failed ? { tone: "error" } : {});
      navigate({ name: "project-overview", projectId: project.id });
    } catch (failure) {
      // The project exists; its details did not all land. Open it so nothing is lost.
      toast(errorText(failure), { tone: "error" });
      navigate({ name: "project-overview", projectId: project.id });
    }
  };

  const keyError = draft.error?.field === "key" ? draft.error.message : null;
  const message = draft.error?.field === "form" ? draft.error.message : formError;
  const dashed = "border-dashed! ring-0! border border-line-strong";

  return (
    <form
      className="flex flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex flex-col gap-7 px-8 py-8 lg:px-12 lg:py-10">
        <NameField draft={draft} label={N.name} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="np-goal">{N.goal}</Label>
          <Textarea
            id="np-goal"
            rows={2}
            value={goal}
            placeholder={N.goalPlaceholder}
            onChange={(event) => {
              setGoal(event.target.value);
              setGoalTouched(true);
            }}
            className={cn("min-h-20 rounded-[8px] text-lg", !goalTouched && props.fromChat && goal && dashed)}
            disabled={draft.busy}
          />
          {goalTouched ? <p className="m-0 text-sm text-ink-muted">{N.goalEdited}</p> : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="np-done" id="np-done-label">
            {N.doneWhen}
          </Label>
          {doneWhenMode === "suggested" ? (
            <div role="group" aria-labelledby="np-done-label">
              <Suggestion eyebrow={N.doneWhenSuggested} className="flex flex-col gap-4">
                <p className="m-0 text-lg text-ink">{proposal.doneWhen}</p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="secondary"
                    size="xl"
                    onClick={() => {
                      setDoneWhen(proposal.doneWhen);
                      setDoneWhenMode("edit");
                    }}
                  >
                    {N.useThis}
                  </Button>
                  <Button
                    variant="secondary"
                    size="xl"
                    onClick={() => {
                      setDoneWhen("");
                      setDoneWhenMode("edit");
                    }}
                  >
                    {N.writeOwn}
                  </Button>
                </div>
              </Suggestion>
            </div>
          ) : (
            <Textarea id="np-done" rows={2} value={doneWhen} placeholder={N.doneWhenPlaceholder} onChange={(event) => setDoneWhen(event.target.value)} className="min-h-20 rounded-[8px] text-lg" disabled={draft.busy} />
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="np-area">{N.area}</Label>
            <Select
              id="np-area"
              value={areaId}
              onValueChange={setAreaId}
              label={N.area}
              items={(areas.data ?? []).map((entry) => ({ value: entry.id, label: entry.name }))}
              disabled={draft.busy}
              className={cn("h-[52px]! rounded-[8px]! px-4! text-lg!", props.fromChat && "ring-0! border border-dashed border-line-strong")}
            />
            {area?.client ? (
              <div className="flex">
                <Tag>{projectsCopy.clientTag(area.client)}</Tag>
              </div>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="np-target">{N.target}</Label>
            <Input id="np-target" type="date" value={target} onChange={(event) => setTarget(event.target.value)} className={cn("h-[52px] rounded-[8px] text-lg", targetSuggested && dashed)} disabled={draft.busy} />
            {targetSuggested ? <p className="m-0 text-sm text-ink-muted">{N.targetSuggested}</p> : null}
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-card bg-surface-alt p-6 lg:p-8">
          {draft.asksKey && draft.keyMode === "workspace" ? (
            <>
              <Label htmlFor="np-key">{N.keyTitle}</Label>
              <SecretInput
                ref={draft.keyField}
                id="np-key"
                describedBy="np-key-hint"
                invalid={Boolean(keyError)}
                placeholder={copy.newProject.keyPlaceholder}
                disabled={draft.busy}
                onPresenceChange={(present) => {
                  setKeyPresent(present);
                  if (keyError) draft.setError(null);
                }}
              />
              {keyError ? (
                <p className="m-0 text-sm font-semibold text-danger" role="alert">
                  {keyError}
                </p>
              ) : null}
              <p id="np-key-hint" className="m-0 text-sm text-ink-muted">
                {N.keyHint} {keyPresent ? N.keyChecked : null}
              </p>
            </>
          ) : draft.asksKey ? (
            <>
              <Label htmlFor="np-key">{N.keyTitle}</Label>
              <SecretInput ref={draft.keyField} id="np-key" describedBy="np-key-hint" invalid={Boolean(keyError)} placeholder={copy.newProject.keyPlaceholder} disabled={draft.busy} onPresenceChange={setKeyPresent} />
              <p id="np-key-hint" className="m-0 text-sm text-ink-muted">
                {keyError ?? N.keyHint}
              </p>
            </>
          ) : (
            <>
              <p className="m-0 text-base font-semibold text-ink">{N.keyTitle}</p>
              <p className="m-0 text-sm text-ink-muted">{N.keyUser}</p>
            </>
          )}
          <div className="border-t border-line pt-2">
            <FolderRow draft={draft} />
          </div>
        </div>

        {proposal.sources.length ? (
          <fieldset className="m-0 flex min-w-0 flex-col border-0 p-0">
            <legend className="mb-2 p-0 text-base font-semibold text-ink">{N.sources}</legend>
            {proposal.sources.map((source) => (
              <Checkbox
                key={source.id}
                checked={pinned[source.id] ?? false}
                onCheckedChange={(checked) => setPinned((current) => ({ ...current, [source.id]: checked }))}
                className="min-h-14 border-b border-line text-lg"
                disabled={draft.busy}
              >
                {source.title} <span className="text-sm text-ink-muted">· {source.meta}</span>
              </Checkbox>
            ))}
          </fieldset>
        ) : null}

        {proposal.todos.length ? (
          <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
            <legend className="mb-2 p-0 text-base font-semibold text-ink">
              {N.todos} <span className="font-normal text-ink-muted">· {N.todosHint}</span>
            </legend>
            {proposal.todos.map((todo) => {
              const row = (
                <Checkbox
                  checked={(included[todo.id] ?? false) && !linked[todo.id]}
                  onCheckedChange={(checked) => setIncluded((current) => ({ ...current, [todo.id]: checked }))}
                  className="min-h-14 text-lg"
                  disabled={draft.busy || linked[todo.id]}
                >
                  {todo.title} <span className="text-sm text-ink-muted">· {todo.due ? dayLabel(todo.due) : N.noDate}</span>
                </Checkbox>
              );
              if (!todo.duplicateOf) return <div key={todo.id} className="border-b border-line">{row}</div>;
              const existing = existingTodo(todo.duplicateOf);
              return (
                <div key={todo.id} className="my-2 flex flex-col gap-2 rounded-card border border-dashed border-ink px-5 py-4">
                  {row}
                  <p className="m-0 ps-8 text-sm text-ink">
                    <TriangleAlert className="me-1.5 inline size-4 align-[-3px]" aria-hidden="true" />
                    <strong className="font-semibold">{N.duplicate}</strong> {N.duplicateOf(todo.duplicateOf)}
                  </p>
                  {existing ? (
                    <div className="ps-8">
                      {linked[todo.id] ? (
                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
                          <Check className="size-4" aria-hidden="true" />
                          {N.linked}
                        </span>
                      ) : (
                        <LinkArrow onClick={() => setLinked((current) => ({ ...current, [todo.id]: true }))} className="text-sm">
                          {N.linkInstead}
                        </LinkArrow>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </fieldset>
        ) : null}

        {message ? (
          <p className="m-0 text-base font-semibold text-danger" role="alert">
            {message}
          </p>
        ) : null}
      </div>
      <SheetFooter note={N.summary(todoCount, sourceCount, keyPresent, Boolean(props.fromChat))}>
        <Button type="submit" variant="primary" size="xl" disabled={draft.busy || readOnly} data-testid="project-create">
          {draft.busy ? N.submitting : N.submit}
        </Button>
        <Button variant="secondary" size="xl" onClick={props.onClose} disabled={draft.busy}>
          {N.discard}
        </Button>
      </SheetFooter>
    </form>
  );
}

/**
 * Nieuw project (design v2-ProjectNew): on the left the chat it comes from (or a short page), on
 * the right the sheet with what the agent suggests. Dashed fields are suggestions; nothing is
 * applied until "Project maken". Creating reuses the project form's logic (look, folder, model,
 * key: create, then link the key), then writes the brief and the ticked to-dos.
 */
export function NewProjectPage(props: { fromProjectId: string | null; fromChatId: string | null }) {
  const fromChat = useMemo(() => (props.fromProjectId && props.fromChatId ? { projectId: props.fromProjectId, chatId: props.fromChatId } : null), [props.fromProjectId, props.fromChatId]);
  const proposal = useProjectProposal(fromChat);
  const personalId = usePersonalBrain()?.projectId ?? "p-mijn-brein";
  useDocumentTitle(N.eyebrow);
  const startedAt = proposal.data?.fromChat?.startedAt ?? null;
  const close = () => {
    if (fromChat) navigate(fromChat.projectId === personalId ? { name: "agent", chatId: fromChat.chatId } : { name: "project", projectId: fromChat.projectId, chatId: fromChat.chatId });
    else navigate({ name: "projects" });
  };
  return (
    <div className="flex flex-1 flex-wrap items-stretch bg-surface-alt">
      <div className="min-w-0 flex-[999_1_420px]">
        <Container className="px-0! lg:px-0!">
          {fromChat ? <SourceChat fromProjectId={fromChat.projectId} fromChatId={fromChat.chatId} proposal={proposal.data} personal={fromChat.projectId === personalId} /> : <BlankIntro />}
        </Container>
      </div>
      <aside aria-label={N.eyebrow} className="flex min-w-0 flex-[1_1_560px] flex-col bg-surface-raised shadow-float lg:max-w-[640px] lg:rounded-s-panel">
        <SheetHeader eyebrow={N.eyebrow} title={fromChat && startedAt ? N.titleFromChat(dayLabel(startedAt)) : N.titleBlank} lead={fromChat ? N.lead : N.leadBlank} onClose={close} closeLabel={N.close} />
        {proposal.isLoading ? (
          <div className="flex flex-col gap-5 p-12" aria-busy="true">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : proposal.isError || !proposal.data ? (
          <div className="flex flex-col items-start gap-4 p-12">
            <p className="m-0 text-lg text-ink">{projectsCopy.loadFailed}</p>
            <Button variant="secondary" size="lg" onClick={() => void proposal.refetch()}>
              {projectsCopy.retry}
            </Button>
          </div>
        ) : (
          <ProposalForm proposal={proposal.data} fromChat={fromChat} onClose={close} />
        )}
      </aside>
    </div>
  );
}
