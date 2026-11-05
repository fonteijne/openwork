import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Bot, Globe, Inbox, TriangleAlert, X } from "lucide-react";

import type { InboxDecision, InboxItem, Todo } from "~/backend/cockpit";
import { useCockpit, useCockpitMutation, useInbox, useTodos } from "~/backend/cockpit-queries";
import { useProjects } from "~/backend/queries";
import type { Project } from "~/backend/types";
import { AgentNote, Accent, Band, Eyebrow, HintLine, LinkArrow, LockedNote, PageHero, Tag, dot } from "~/components/io";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Field, Input } from "~/components/ui/field";
import { Menu, MenuItem } from "~/components/ui/menu";
import { Skeleton } from "~/components/ui/misc";
import { Select } from "~/components/ui/select";
import { toast } from "~/components/ui/toast";
import { inboxCopy } from "~/copy/inbox";
import { cn } from "~/lib/cn";
import { href, navigate } from "~/lib/router";
import { isEditable } from "~/lib/shortcuts";

import { useUi } from "../shell/ui-store";
import { formatClock, formatShortDate, formatSince } from "../today/model";
import { SectionHeading } from "../today/parts";

const x = inboxCopy;
const NONE = "none";
const DAY = 24 * 60 * 60_000;

type Decide = (item: InboxItem, decision: InboxDecision, done: string) => void;

/**
 * Inbox (design v2-Inbox): what came in, sorted before anything becomes a to-do. Left the groups
 * (mail suggestions, captures, the agent's suggestions); right the selected item as a suggested
 * to-do with its mail. A, L, H, E and D answer only while the list has focus (DESIGN.md S6).
 */
export function InboxPage() {
  const cockpit = useCockpit();
  const inbox = useInbox();
  const todos = useTodos();
  const projects = useProjects();
  const setCapture = useUi((state) => state.setCapture);
  const mailLocked = cockpit.capabilities.mail;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const hintId = useId();

  const all = inbox.data ?? [];
  const visible = mailLocked === null ? all : all.filter((item) => item.kind !== "mail");
  const groups = {
    // Mail suggestions before the waiting-for ones they sit with.
    mail: [...visible.filter((item) => item.kind === "mail"), ...visible.filter((item) => item.kind === "waiting")],
    captured: visible.filter((item) => item.kind === "captured"),
    agent: visible.filter((item) => item.kind === "agent"),
  };
  const ordered = [...groups.mail, ...groups.captured, ...groups.agent];
  const selected = selectedId === "" ? null : (ordered.find((item) => item.id === selectedId) ?? ordered[0] ?? null);
  const listedProjects = useMemo(() => (projects.data ?? []).filter((project) => project.archivedAt === null), [projects.data]);
  const projectNames = useMemo(() => new Map((projects.data ?? []).map((project) => [project.id, project.name])), [projects.data]);
  const openTodos = (todos.data ?? []).filter((todo) => !todo.done);

  const mutation = useCockpitMutation((backend, input: { itemId: string; decision: InboxDecision }) => backend.inbox.decide(input.itemId, input.decision));
  const decide: Decide = (item, decision, done) => {
    const index = ordered.findIndex((entry) => entry.id === item.id);
    const next = ordered[index + 1] ?? ordered[index - 1] ?? null;
    mutation.mutate(
      { itemId: item.id, decision },
      {
        onSuccess: () => {
          toast(done);
          setSelectedId(next?.id ?? null);
        },
        onError: () => toast(x.toast.failed, { tone: "error" }),
      },
    );
  };

  const quick = (item: InboxItem, key: string) => {
    if (key === "a") decide(item, { kind: "accept", title: item.title, projectId: item.projectId ?? item.suggestedProjectId, deadline: item.deadline, flagMail: false }, x.toast.accepted);
    else if (key === "l" && item.duplicateOf) decide(item, { kind: "link", todoId: item.duplicateOf.todoId }, x.toast.linked(item.duplicateOf.title));
    else if (key === "l") document.getElementById(`${hintId}-link`)?.focus();
    else if (key === "h") decide(item, { kind: "snooze", until: tomorrowAt9() }, x.toast.snoozed);
    else if (key === "e") decide(item, { kind: "dismiss" }, x.toast.dismissed);
    else if (key === "d") navigate({ name: "delegate", todoId: null });
  };

  const onListKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.repeat || isEditable(event.target) || mutation.isPending) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const items = [...(list.current?.querySelectorAll<HTMLButtonElement>("[data-inbox-item]") ?? [])];
      const at = items.findIndex((element) => element === document.activeElement);
      const next = items[Math.max(0, Math.min(items.length - 1, at + (event.key === "ArrowDown" ? 1 : -1)))];
      if (next) {
        event.preventDefault();
        next.focus();
        next.click();
      }
      return;
    }
    const key = event.key.toLowerCase();
    if (!selected || !["a", "l", "h", "e", "d"].includes(key)) return;
    event.preventDefault();
    quick(selected, key);
  };

  const count = visible.length;
  const locked = cockpit.capabilities.inbox;

  return (
    <>
      <PageHero
        documentTitle={x.documentTitle}
        eyebrow={x.eyebrow}
        title={
          inbox.isLoading ? (
            x.documentTitle
          ) : count === 0 ? (
            <>
              {x.heroEmpty}
              <Accent>{x.heroAccent}</Accent>
              {x.heroTail}
            </>
          ) : (
            <>
              {x.heroCount(count)}
              <Accent>{x.heroAccent}</Accent>
              {x.heroTail}
            </>
          )
        }
        lead={x.lead}
        actions={
          <Button variant="secondary" size="xl" onClick={() => setCapture(true)}>
            {x.capture}
          </Button>
        }
      />
      <Band tone="alt">
        {locked !== null ? (
          <LockedNote title={x.locked}>{locked}</LockedNote>
        ) : inbox.isLoading ? (
          <InboxSkeleton />
        ) : inbox.isError ? (
          <div className="flex flex-wrap items-center gap-4">
            <p className="m-0 text-lg text-ink">{x.error}</p>
            <Button variant="secondary" size="xl" onClick={() => void inbox.refetch()}>
              {x.retry}
            </Button>
          </div>
        ) : count === 0 && mailLocked === null ? (
          <div className="flex flex-col items-start gap-4 rounded-panel bg-surface-raised p-8 lg:p-12">
            <Inbox className="size-6 text-ink-muted" aria-hidden="true" />
            <h2 className="m-0 text-[28px] font-bold leading-[34px] text-ink">{x.empty.title}</h2>
            <p className="m-0 max-w-[56ch] text-lg text-ink-muted">{x.empty.body}</p>
            <Button variant="primary" size="xl" onClick={() => setCapture(true)}>
              {x.capture}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-start gap-x-10 gap-y-12">
            <div ref={list} onKeyDown={onListKey} aria-describedby={hintId} className="flex min-w-0 flex-[999_1_440px] flex-col gap-10">
              <Group title={x.groups.mail} count={groups.mail.length} hidden={groups.mail.length === 0 && mailLocked === null}>
                {mailLocked !== null ? <LockedNote title={x.mailLocked}>{mailLocked}</LockedNote> : null}
                {groups.mail.length > 0 ? (
                  <ul className="m-0 flex list-none flex-col gap-3 p-0">
                    {groups.mail.map((item) => (
                      <li key={item.id}>
                        <ItemButton item={item} selected={item.id === selected?.id} onSelect={setSelectedId} className={cn("flex flex-col gap-2 rounded-card bg-surface-raised px-6 py-6 sm:px-8", item.id === selected?.id && "ring-2 ring-inset ring-ink")}>
                          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <span className="min-w-0 flex-[1_1_260px] text-lg font-semibold text-ink">{item.title}</span>
                            {item.kind === "waiting" ? (
                              <span className="text-sm text-ink-muted">{x.waitingFor}</span>
                            ) : item.deadline !== null ? (
                              <span className="text-sm font-semibold text-ink">{x.deadline(formatShortDate(item.deadline))}</span>
                            ) : null}
                          </span>
                          <span className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                            {item.from?.external ? (
                              <Tag className="border-ink px-2.5 py-0.5 normal-case tracking-normal text-[14px] leading-5">{x.external}</Tag>
                            ) : null}
                            {dot(
                              item.kind === "waiting" ? (item.from?.org ?? null) : null,
                              item.sourceLabel,
                              formatReceived(item.receivedAt),
                              item.kind === "waiting" ? null : projectName(item, projectNames),
                            )}
                          </span>
                          {item.why ? <span className="text-sm text-ink-muted">{item.why}</span> : null}
                        </ItemButton>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Group>
              <Group title={x.groups.captured} count={groups.captured.length} hidden={groups.captured.length === 0}>
                <ul className="m-0 list-none border-t border-line-strong p-0">
                  {groups.captured.map((item) => (
                    <li key={item.id} className="border-b border-line-strong">
                      <ItemButton
                        item={item}
                        selected={item.id === selected?.id}
                        onSelect={setSelectedId}
                        className={cn("flex min-h-16 flex-wrap items-center gap-x-3 gap-y-1 py-3", item.id === selected?.id ? "rounded-[10px] bg-surface-raised px-4 ring-2 ring-inset ring-ink" : "hover:bg-hover/60")}
                      >
                        <span className="min-w-0 flex-[1_1_260px] text-lg font-semibold text-ink">{item.title}</span>
                        <span className="text-sm text-ink-muted">{dot(projectName(item, projectNames) ?? x.noProject, formatReceived(item.receivedAt))}</span>
                      </ItemButton>
                    </li>
                  ))}
                </ul>
              </Group>
              <Group title={x.groups.agent} count={groups.agent.length} hidden={groups.agent.length === 0}>
                <ul className="m-0 flex list-none flex-col gap-3 p-0">
                  {groups.agent.map((item) => (
                    <li key={item.id}>
                      <ItemButton
                        item={item}
                        selected={item.id === selected?.id}
                        onSelect={setSelectedId}
                        className={cn("flex flex-col gap-2 rounded-card border border-dashed border-ink px-6 py-6 sm:px-8", item.id === selected?.id && "border-solid bg-surface-raised ring-1 ring-inset ring-ink")}
                      >
                        <span className="text-lg font-semibold text-ink">{item.title}</span>
                        {item.sourceLabel ? (
                          <span className="inline-flex items-center gap-1.5 text-sm text-ink-muted">
                            <Bot className="size-4" aria-hidden="true" />
                            {x.agentFrom(item.sourceLabel)}
                          </span>
                        ) : null}
                      </ItemButton>
                    </li>
                  ))}
                </ul>
              </Group>
              <HintLine className="mt-0 hidden sm:block">
                <span id={hintId}>{x.hint}</span>
              </HintLine>
            </div>
            <aside aria-labelledby={`${hintId}-inspector`} className="flex min-w-0 flex-[1_1_560px] flex-col gap-6 rounded-panel bg-surface-raised p-6 sm:p-10 lg:p-12">
              {selected ? (
                <Inspector
                  key={selected.id}
                  item={selected}
                  titleId={`${hintId}-inspector`}
                  linkId={`${hintId}-link`}
                  projects={listedProjects}
                  todos={openTodos}
                  mailLocked={mailLocked}
                  busy={mutation.isPending}
                  onDecide={decide}
                  onClose={() => setSelectedId("")}
                />
              ) : (
                <p id={`${hintId}-inspector`} className="m-0 text-lg text-ink-muted">
                  {x.inspector.pick}
                </p>
              )}
            </aside>
          </div>
        )}
      </Band>
    </>
  );
}

function Group(props: { title: string; count: number; hidden: boolean; children: ReactNode }) {
  const id = useId();
  if (props.hidden) return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <SectionHeading id={id} count={props.count}>
        {props.title}
      </SectionHeading>
      {props.children}
    </section>
  );
}

function ItemButton(props: { item: InboxItem; selected: boolean; onSelect: (id: string) => void; className?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      data-inbox-item=""
      aria-pressed={props.selected}
      aria-keyshortcuts="A L H E D"
      onClick={() => props.onSelect(props.item.id)}
      onFocus={() => props.onSelect(props.item.id)}
      className={cn("w-full cursor-pointer text-start outline-none transition-[box-shadow,background-color] duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent", props.className)}
    >
      {props.children}
    </button>
  );
}

function Inspector(props: {
  item: InboxItem;
  titleId: string;
  linkId: string;
  projects: readonly Project[];
  todos: readonly Todo[];
  mailLocked: string | null;
  busy: boolean;
  onDecide: Decide;
  onClose: () => void;
}) {
  const item = props.item;
  const [title, setTitle] = useState(item.title);
  const [projectId, setProjectId] = useState(item.projectId ?? item.suggestedProjectId ?? NONE);
  const [deadline, setDeadline] = useState(item.deadline !== null ? toDateInput(item.deadline) : "");
  const [flag, setFlag] = useState(item.kind === "mail");
  const isMail = item.kind === "mail" && item.mail !== null;
  const fromName = item.from?.name.split(" ")[0] ?? "";
  const heading =
    item.kind === "mail" ? x.inspector.fromMail(fromName) : item.kind === "waiting" ? x.inspector.waiting(item.from?.name ?? "") : item.kind === "agent" ? x.inspector.agent : x.inspector.captured(formatReceived(item.receivedAt));

  const accept = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      toast(x.toast.titleMissing, { tone: "error" });
      return;
    }
    props.onDecide(item, { kind: "accept", title: trimmed, projectId: projectId === NONE ? null : projectId, deadline: fromDateInput(deadline), flagMail: isMail && flag && props.mailLocked === null }, x.toast.accepted);
  };
  const link = (todo: { todoId: string; title: string }) => props.onDecide(item, { kind: "link", todoId: todo.todoId }, x.toast.linked(todo.title));

  return (
    <>
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Eyebrow>{x.inspector.eyebrow}</Eyebrow>
          <h2 id={props.titleId} className="m-0 text-[28px] font-bold leading-[34px] tracking-[-0.01em] text-ink">
            {heading}
          </h2>
        </div>
        <button type="button" aria-label={x.inspector.close} onClick={props.onClose} className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line-strong text-ink transition-colors hover:bg-ink hover:text-surface">
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-col gap-4">
        <Field label={x.inspector.title}>{(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={title} onChange={(event) => setTitle(event.target.value)} className="h-12" />}</Field>
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field label={item.suggestedProjectId && isMail ? x.inspector.projectFromDomain : x.inspector.project}>
            {(id) => (
              <Select
                id={id}
                value={projectId}
                onValueChange={setProjectId}
                label={x.inspector.project}
                items={[{ value: NONE, label: x.inspector.noProject }, ...props.projects.map((project) => ({ value: project.id, label: project.name }))]}
                className="h-12 rounded-[6px] bg-surface-raised px-4 text-base"
              />
            )}
          </Field>
          <Field label={isMail && item.deadline !== null ? x.inspector.deadlineFromMail : x.inspector.deadline}>
            {(id, describedBy) => <Input id={id} type="date" aria-describedby={describedBy} value={deadline} onChange={(event) => setDeadline(event.target.value)} className="h-12" />}
          </Field>
        </div>
        {isMail ? <AgentNote>{x.inspector.filled}</AgentNote> : null}
        {isMail && props.mailLocked === null ? (
          <Checkbox checked={flag} onCheckedChange={setFlag} className="whitespace-normal [&>span]:whitespace-normal">
            {x.inspector.flag}
          </Checkbox>
        ) : null}
      </div>

      {item.duplicateOf ? (
        <div role="note" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card bg-surface-alt px-5 py-4 text-base text-ink">
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-[1_1_200px]">
            <strong className="font-semibold">{x.inspector.duplicateStrong}</strong>
            {x.inspector.duplicate(item.duplicateOf.title)}
          </span>
          <LinkArrow onClick={() => item.duplicateOf && link(item.duplicateOf)}>{x.inspector.linkInstead}</LinkArrow>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button variant="primary" size="xl" onClick={accept} disabled={props.busy}>
          {x.inspector.accept}
        </Button>
        <Menu
          trigger={
            <Button id={props.linkId} variant="secondary" size="xl" disabled={props.busy}>
              {x.inspector.link}
            </Button>
          }
        >
          {props.todos.length === 0 ? (
            <MenuItem disabled>{x.inspector.linkNone}</MenuItem>
          ) : (
            props.todos.map((todo) => (
              <MenuItem key={todo.id} onClick={() => link({ todoId: todo.id, title: todo.title })}>
                {todo.title}
              </MenuItem>
            ))
          )}
        </Menu>
        <Button variant="secondary" size="xl" disabled={props.busy} onClick={() => props.onDecide(item, { kind: "snooze", until: tomorrowAt9() }, x.toast.snoozed)}>
          {x.inspector.snooze}
        </Button>
        <Button variant="secondary" size="xl" disabled={props.busy} onClick={() => props.onDecide(item, { kind: "dismiss" }, x.toast.dismissed)}>
          {x.inspector.dismiss}
        </Button>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <LinkArrow href={href({ name: "delegate", todoId: null })}>{x.inspector.delegate}</LinkArrow>
        {isMail ? <LinkArrow href={href({ name: "agent", chatId: null })}>{x.inspector.reply}</LinkArrow> : null}
        <LinkArrow href={href({ name: "project-new", fromProjectId: null, fromChatId: null })}>{x.inspector.convert}</LinkArrow>
      </div>

      {isMail && item.mail ? (
        <>
          <div aria-label={x.inspector.mailLabel} role="group" className="flex flex-col overflow-hidden rounded-card border border-line-strong">
            <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-alt px-5 py-3 text-[13px] font-semibold leading-4 text-ink">
              <Globe className="size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-auto [overflow-wrap:anywhere]">{x.inspector.mailFrom(item.from?.address ?? item.from?.name ?? "", `${formatShortDate(item.receivedAt)} ${formatClock(item.receivedAt)}`)}</span>
              {item.mail.imagesOff ? <span className="font-normal text-ink-muted">{x.inspector.imagesOff}</span> : null}
            </div>
            <div className="flex flex-col gap-3 p-5 text-base text-ink">
              <p className="m-0 font-semibold">{x.inspector.subject(item.mail.subject)}</p>
              {item.mail.body.split(/\n{2,}/).map((paragraph, index) => (
                <p key={index} className="m-0 whitespace-pre-line">
                  {paragraph}
                </p>
              ))}
              <p className="m-0 text-sm text-ink-muted">{x.inspector.thread(item.mail.thread)}</p>
            </div>
          </div>
          <p className="m-0 text-sm text-ink-muted">{x.inspector.stays}</p>
        </>
      ) : null}
    </>
  );
}

function InboxSkeleton() {
  return (
    <div className="flex flex-wrap items-start gap-x-10 gap-y-12" aria-hidden="true">
      <div className="flex min-w-0 flex-[999_1_440px] flex-col gap-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-36 w-full rounded-card" />
        <Skeleton className="h-28 w-full rounded-card" />
      </div>
      <Skeleton className="h-[480px] min-w-0 flex-[1_1_560px] rounded-panel" />
    </div>
  );
}

function projectName(item: InboxItem, names: ReadonlyMap<string, string>): string | null {
  const id = item.projectId ?? item.suggestedProjectId;
  return id ? (names.get(id) ?? null) : null;
}

function formatReceived(at: number): string {
  const now = Date.now();
  return now - at < 7 * DAY ? formatSince(at, now) : `${formatShortDate(at)} ${formatClock(at)}`;
}

function tomorrowAt9(): number {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return date.getTime();
}

function toDateInput(at: number): string {
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A date field's value as 17:00 that day, local time; empty is no deadline. */
function fromDateInput(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 17).getTime();
}
