import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, CircleHelp, Eye, Globe, Lock, Undo2, Users, X } from "lucide-react";

import type { Approval, LibraryChange, NeedsYou, OutboundEntry, Shelf, Todo } from "~/backend/cockpit";
import { useApproval, useCockpit, useCockpitMutation, useCockpitRefresh, useLibraryPages, useNeedsYou, useRun, useSent, useShelves, useTodos } from "~/backend/cockpit-queries";
import { useProjects } from "~/backend/queries";
import { Accent, Eyebrow, LinkArrow, LockedNote, PageHero, Rows, RowItem, SheetFooter, SheetHeader, SplitWithSheet, Tag, dot } from "~/components/io";
import { useDocumentTitle } from "~/components/top-bar";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/field";
import { EmptyState, Skeleton } from "~/components/ui/misc";
import { toast } from "~/components/ui/toast";
import { approvalsCopy as t } from "~/copy/approvals";
import { cn } from "~/lib/cn";
import { formatTime } from "~/lib/format";
import { canGoBack, goBack, href, navigate } from "~/lib/router";

import { DiffLines } from "../library/diff";
import { ButtonLink } from "../library/button-link";
import { ConfirmCheck } from "./confirm-check";
import { longDayTime, joinNames, shortDay, weekdayDay } from "./format";
import { MailBody } from "./mail-body";

/**
 * One approval, as a sheet next to the page it interrupts (design: Approval R4, ApprovalR3).
 * R4 (an email leaving the team): the exact Outlook draft, a required choice for any Cc the agent
 * added, then a 20 s hold with Undo in place. R3 (publishing to shelves): per shelf what changes,
 * who will see it, and a confirmation per audience before one "publish" for all of them.
 */
export function ApprovalPage(props: { approvalId: string }) {
  const cockpit = useCockpit();
  const query = useApproval(props.approvalId);
  useDocumentTitle(query.data ? query.data.title : t.documentTitle);

  if (cockpit.capabilities.approvals !== null)
    return (
      <>
        <PageHero documentTitle={t.documentTitle} eyebrow={props.approvalId} title={t.locked} />
        <div className="px-6 pb-16 lg:px-12">
          <LockedNote title={t.locked} className="mx-auto max-w-[1264px]">
            {cockpit.capabilities.approvals}
          </LockedNote>
        </div>
      </>
    );
  if (query.isPending) return <ApprovalSkeleton />;
  const approval = query.data;
  if (!approval)
    return (
      <div className="px-6 py-16 lg:px-12">
        <EmptyState
          icon={<Lock />}
          title={t.notFound.title}
          body={t.notFound.body}
          action={
            <ButtonLink href={href({ name: "home" })} arrow>
              {t.notFound.back}
            </ButtonLink>
          }
        />
      </div>
    );
  return approval.kind === "library" ? <LibraryApproval approval={approval} /> : <EmailApproval approval={approval} />;
}

function close() {
  if (canGoBack()) goBack();
  else navigate({ name: "home" });
}

function ApprovalSkeleton() {
  return (
    <SplitWithSheet
      page={
        <div className="flex flex-col gap-8 px-6 pt-10 lg:px-12 lg:pt-14" aria-label={t.loading}>
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-14 w-4/5" />
          <Skeleton className="h-72 w-full rounded-panel" />
        </div>
      }
      sheet={
        <div className="flex flex-col gap-6 p-8 lg:p-12">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-96 w-full rounded-card" />
        </div>
      }
    />
  );
}

/** Ticks while active; the hold countdown needs whole seconds that stay honest. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function tomorrowAtNine(): number {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return date.getTime();
}

// ---------------------------------------------------------------------------
// The page on the left of an email approval: what else needs you, and today
// ---------------------------------------------------------------------------

const NEEDS_ICON: Record<NeedsYou["kind"], ReactNode> = { review: <Eye />, question: <CircleHelp />, approval: <Lock /> };

function NeedsYouColumn(props: { currentId: string }) {
  const needsYou = useNeedsYou();
  const todos = useTodos();
  const projects = useProjects();
  const now = useNow(false);
  const items = needsYou.data ?? [];
  const today = (todos.data ?? []).filter((todo) => todo.today && !todo.done);
  const projectName = (id: string | null) => (id ? (projects.data?.find((project) => project.id === id)?.name ?? t.noProject) : t.noProject);
  const dueText = (todo: Todo): string => {
    if (!todo.due) return t.noDate;
    if (todo.due.at < now) return t.overdue(weekdayDay(todo.due.at));
    if (new Date(todo.due.at).toDateString() === new Date(now).toDateString()) return t.dueToday;
    return t.deadline(weekdayDay(todo.due.at));
  };
  const count = needsYou.data ? items.length : null;

  return (
    <div className="flex flex-col gap-10 px-6 pt-10 lg:px-12 lg:pt-14">
      <div className="flex flex-col gap-3">
        <Eyebrow>{t.today(longDayTime(now))}</Eyebrow>
        <h1 className="m-0 max-w-[16ch] text-[40px] font-bold leading-[44px] tracking-[-0.02em] text-ink sm:text-[56px] sm:leading-[60px]">
          {count === null ? (
            <Skeleton className="h-14 w-4/5" />
          ) : (
            <>
              {t.needsBefore(count)} <Accent>{t.needsAccent(count)}</Accent>.
            </>
          )}
        </h1>
      </div>

      <section aria-labelledby="needs-you" className="flex flex-col gap-6 rounded-panel bg-surface-inverse p-8 text-ink-inverse lg:p-10">
        <h2 id="needs-you" className="m-0 text-[28px] font-bold leading-[34px]">
          {t.needsPanel}
        </h2>
        {needsYou.isPending ? (
          <Skeleton className="h-32 w-full bg-inverse-hover" />
        ) : items.length === 0 ? (
          <p className="m-0 text-base text-ink-inverse-muted">{t.needsNone}</p>
        ) : (
          <ol className="m-0 flex list-none flex-col gap-5 p-0">
            {items.map((item, index) => {
              const current = item.id === props.currentId;
              return (
                <li key={item.id} aria-current={current ? "true" : undefined}>
                  <a
                    href={item.href}
                    className={cn(
                      "flex flex-col gap-3 text-ink-inverse no-underline",
                      current ? "rounded-card border-2 border-ink-inverse p-5" : "border-t border-ink-inverse px-1 pt-5 hover:opacity-85",
                    )}
                  >
                    <span className="flex items-center gap-2 text-[13px] font-semibold uppercase leading-4 tracking-[0.08em] [&_svg]:size-4">
                      {String(index + 1).padStart(2, "0")} ·<span aria-hidden="true" className="flex">{NEEDS_ICON[item.kind]}</span>
                      {dot(t.needsKind[item.kind], item.context)}
                    </span>
                    <span className="text-xl font-semibold">{item.title}</span>
                    <span className="text-base text-ink-inverse-muted">{item.detail}</span>
                  </a>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section aria-labelledby="today-todos" className="flex flex-col gap-4">
        <h2 id="today-todos" className="m-0 text-[28px] font-bold leading-[34px] text-ink">
          {t.todayTitle} <span className="font-normal text-ink-muted">· {t.todoCount(today.length)}</span>
        </h2>
        {todos.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : today.length === 0 ? (
          <p className="m-0 text-base text-ink-muted">{t.todosNone}</p>
        ) : (
          <Rows>
            {today.map((todo) => (
              <RowItem key={todo.id} title={todo.title} meta={dot(projectName(todo.projectId), dueText(todo))} className="py-4" />
            ))}
          </Rows>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// R4: an email
// ---------------------------------------------------------------------------

function EmailApproval(props: { approval: Approval }) {
  const { approval } = props;
  const mail = approval.mail;
  const refresh = useCockpitRefresh();
  const sent = useSent();
  const decide = useCockpitMutation((backend, decision: Parameters<typeof backend.approvals.decide>[1]) => backend.approvals.decide(approval.id, decision));
  const undo = useCockpitMutation((backend, outboundId: string) => backend.approvals.undo(outboundId));

  const agentCc = mail?.cc.filter((cc) => cc.addedByAgent) ?? [];
  const [ccChoices, setCcChoices] = useState<Record<string, "keep" | "remove">>(() => {
    const initial: Record<string, "keep" | "remove"> = {};
    for (const cc of agentCc) if (cc.decision) initial[cc.address ?? cc.name] = cc.decision;
    return initial;
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(mail?.body ?? "");
  const [editedBody, setEditedBody] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [declineNote, setDeclineNote] = useState("");
  const [outcome, setOutcome] = useState<{ entry: OutboundEntry; startedAt: number } | null>(null);

  // What happened after approving: from this visit, or (after a reload) from the sent log.
  const trackedId = outcome?.entry.id ?? (approval.status === "approved" ? approval.id : null);
  const liveEntry = trackedId ? sent.data?.find((entry) => entry.id === trackedId) : undefined;
  const status = liveEntry?.status ?? outcome?.entry.status ?? null;
  const startedAt = outcome?.startedAt ?? liveEntry?.at ?? Date.now();
  const now = useNow(status === "held");
  const remaining = Math.max(0, Math.ceil(approval.holdSeconds - (now - startedAt) / 1000));
  const expired = status === "held" && remaining === 0;

  useEffect(() => {
    if (!expired) return;
    const first = setTimeout(() => void sent.refetch(), 700);
    const second = setTimeout(() => void sent.refetch(), 2500);
    return () => {
      clearTimeout(first);
      clearTimeout(second);
    };
  }, [expired, sent]);

  const ccMissing = agentCc.some((cc) => !ccChoices[cc.address ?? cc.name]);
  const decided = status !== null || approval.status === "declined";
  const busy = decide.isPending || undo.isPending;

  const approve = () => {
    decide.mutate(
      { kind: "approve", ccDecisions: ccChoices },
      {
        onSuccess: (entry) => {
          if (entry) setOutcome({ entry, startedAt: Date.now() });
        },
        onError: (error) => toast(error.message, { tone: "error" }),
      },
    );
  };
  const decline = () => {
    decide.mutate(
      { kind: "decline", note: declineNote.trim() || null },
      {
        onSuccess: () => {
          toast(t.declined(approval.id));
          navigate({ name: "home" });
        },
        onError: (error) => toast(error.message, { tone: "error" }),
      },
    );
  };
  const snooze = () => {
    decide.mutate(
      { kind: "snooze", until: tomorrowAtNine() },
      {
        onSuccess: () => {
          toast(t.snoozed);
          navigate({ name: "home" });
        },
        onError: (error) => toast(error.message, { tone: "error" }),
      },
    );
  };
  const undoSend = () => {
    const id = trackedId;
    if (!id) return;
    undo.mutate(id, {
      onSuccess: () => {
        setOutcome(null);
        toast(t.undone);
        void refresh();
      },
      onError: (error) => toast(error.message, { tone: "error" }),
    });
  };

  const body = editedBody ?? mail?.body ?? "";

  const sheet = (
    <div className="flex h-full flex-col">
      <SheetHeader
        tone="inverse"
        eyebrow={
          <>
            <Globe className="size-4" aria-hidden="true" />
            {t.eyebrow(approval.audience)}
          </>
        }
        title={approval.headline}
        lead={approval.consequence}
        closeLabel={t.close}
        onClose={close}
        trailing={<span className="mt-[14px] hidden font-mono text-[13px] leading-4 sm:block">{approval.id}</span>}
      />

      <div className="flex flex-1 flex-col gap-6 px-6 py-10 sm:px-8 lg:px-12">
        <p className="m-0 flex items-center gap-2 text-base text-ink-muted">
          <Lock className="size-4 shrink-0" aria-hidden="true" />
          {t.boundLine}
        </p>

        {mail ? (
          <div className="flex flex-col gap-5 rounded-card bg-surface-alt p-5 sm:p-8">
            <div className="flex flex-wrap items-center gap-3">
              <Eyebrow className="flex-auto">{t.draftEyebrow}</Eyebrow>
              <LinkArrow onClick={() => toast(t.outlookUnavailable)}>{t.openInOutlook}</LinkArrow>
            </div>
            <dl className="m-0 grid grid-cols-[72px_minmax(0,1fr)] gap-x-4 gap-y-4 text-base sm:grid-cols-[80px_minmax(0,1fr)]">
              <dt className="text-ink-muted">{t.from}</dt>
              <dd className="m-0">{mail.from}</dd>
              <dt className="text-ink-muted">{t.to}</dt>
              <dd className="m-0 flex min-w-0 flex-wrap items-center gap-2">
                {mail.to.map((person) => (
                  <span key={person.address ?? person.name} className="inline-flex min-w-0 flex-wrap items-center gap-2">
                    <strong className="font-semibold">{person.name}</strong>
                    {person.address ? <span className="break-all">{person.address}</span> : null}
                    {person.external ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-ink px-2.5 py-0.5 text-[13px] font-semibold leading-4">
                        <Globe className="size-3.5" aria-hidden="true" />
                        {t.external}
                      </span>
                    ) : null}
                  </span>
                ))}
              </dd>
              {mail.cc.length > 0 ? (
                <>
                  <dt className={cn("text-ink-muted", agentCc.length > 0 && "pt-4")}>{t.cc}</dt>
                  <dd className="m-0 flex min-w-0 flex-col gap-3">
                    {mail.cc.map((cc) => {
                      const key = cc.address ?? cc.name;
                      const first = cc.name.split(" ")[0] ?? cc.name;
                      if (!cc.addedByAgent)
                        return (
                          <span key={key}>
                            <strong className="font-semibold">{cc.name}</strong> {cc.address}
                          </span>
                        );
                      const choice = ccChoices[key];
                      return (
                        <div key={key} className="flex flex-col gap-3 rounded-card border-2 border-ink bg-surface p-4 sm:p-5">
                          <span className="flex flex-wrap items-center gap-2">
                            <strong className="font-semibold">{cc.name}</strong>
                            <Tag>{cc.org}</Tag>
                            <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-ink px-2.5 py-0.5 text-[13px] font-semibold leading-4">
                              {t.addedByAgent}
                            </span>
                          </span>
                          {cc.reason ? <span className="text-ink-muted">{cc.reason}</span> : null}
                          <span role="radiogroup" aria-label={t.ccGroup(cc.name)} className="flex flex-wrap gap-2">
                            {(["keep", "remove"] as const).map((value) => (
                              <Button
                                key={value}
                                role="radio"
                                aria-checked={choice === value}
                                size="xl"
                                variant={choice === value ? "solid" : "secondary"}
                                disabled={decided || busy}
                                onClick={() => setCcChoices((current) => ({ ...current, [key]: value }))}
                                className="h-11 px-5"
                              >
                                {choice === value ? <Check aria-hidden="true" /> : null}
                                {value === "keep" ? t.keep(first) : t.remove(first)}
                              </Button>
                            ))}
                          </span>
                        </div>
                      );
                    })}
                  </dd>
                </>
              ) : null}
              <dt className="text-ink-muted">{t.subject}</dt>
              <dd className="m-0">{mail.subject}</dd>
              <dt className="text-ink-muted">{t.attached}</dt>
              <dd className="m-0">{mail.attached ?? t.nothing}</dd>
            </dl>
            <div className="border-t border-line-strong pt-5">
              {editing ? (
                <div className="flex flex-col gap-3">
                  <label htmlFor="mail-edit" className="text-sm font-semibold text-ink">
                    {t.editLabel}
                  </label>
                  <Textarea id="mail-edit" value={draft} onChange={(event) => setDraft(event.target.value)} rows={14} className="text-base" />
                  <p className="m-0 text-sm text-ink-muted">{t.editNote}</p>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      size="xl"
                      variant="solid"
                      onClick={() => {
                        setEditedBody(draft === mail.body ? null : draft);
                        setEditing(false);
                      }}
                    >
                      {t.editSave}
                    </Button>
                    <Button
                      size="xl"
                      onClick={() => {
                        setDraft(editedBody ?? mail.body);
                        setEditing(false);
                      }}
                    >
                      {t.cancel}
                    </Button>
                  </div>
                </div>
              ) : (
                <MailBody body={body} warningLabel={t.warning} />
              )}
            </div>
          </div>
        ) : null}

        {approval.calendar ? (
          <Rows>
            {approval.calendar.events.map((event) => (
              <RowItem key={event.start} title={event.title} meta={`${weekdayDay(event.start)} · ${formatTime(event.start)}–${formatTime(event.end)}`} />
            ))}
          </Rows>
        ) : null}

        {editedBody !== null ? (
          <p className="m-0 rounded-card border border-dashed border-line-strong p-4 text-base font-semibold text-ink">{t.edited}</p>
        ) : null}

        <p className="m-0 text-base text-ink-muted">
          {approval.provenance}
          {editedBody !== null ? ` ${t.editedProvenance}` : ""}
        </p>

        {mail?.replyingTo ? (
          <details className="rounded-card bg-surface-alt px-5 py-4">
            <summary className="cursor-pointer text-base text-ink">{t.replyingTo(mail.replyingTo.from, `${shortDay(mail.replyingTo.at)} ${formatTime(mail.replyingTo.at)}`)}</summary>
            <p className="mb-0 mt-4 whitespace-pre-line text-base text-ink">{mail.replyingTo.body}</p>
          </details>
        ) : null}

        {declining ? (
          <div className="flex flex-col gap-3 rounded-card border border-line-strong p-5">
            <label htmlFor="decline-note" className="text-base font-semibold text-ink">
              {t.declineLabel}
            </label>
            <Textarea id="decline-note" value={declineNote} onChange={(event) => setDeclineNote(event.target.value)} rows={3} />
            <p className="m-0 text-sm text-ink-muted">{t.declineHint}</p>
            <div className="flex flex-wrap gap-3">
              <Button size="xl" variant="solid" onClick={decline} disabled={busy}>
                {t.declineConfirm}
              </Button>
              <Button size="xl" onClick={() => setDeclining(false)}>
                {t.cancel}
              </Button>
            </div>
          </div>
        ) : !decided ? (
          <div className="flex flex-wrap gap-3">
            {mail ? (
              <Button size="xl" onClick={() => setEditing(true)} disabled={editing || busy}>
                {t.edit}
              </Button>
            ) : null}
            <Button size="xl" onClick={() => setDeclining(true)} disabled={busy}>
              {t.decline}
            </Button>
            <Button size="xl" onClick={snooze} disabled={busy}>
              {t.snooze}
            </Button>
          </div>
        ) : null}
      </div>

      <div aria-live="polite" data-approval-outcome="">
        {status === "held" ? (
          <SheetFooter
            tone="inverse"
            note={
              <span className="flex flex-col gap-0.5">
                <span className="text-xl font-semibold text-ink-inverse">{expired ? t.sendingTitle : t.holdTitle(remaining)}</span>
                <span>{expired ? t.sendingBody : t.holdBody}</span>
              </span>
            }
          >
            <Button size="xl" variant="inverse" onClick={undoSend} disabled={busy || expired}>
              <Undo2 aria-hidden="true" />
              {t.undo}
            </Button>
          </SheetFooter>
        ) : status === "sent" || status === "published" || status === "accepted" ? (
          <SheetFooter
            tone="inverse"
            note={
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2 text-xl font-semibold text-ink-inverse">
                  <Check className="size-5" aria-hidden="true" />
                  {t.sentTitle}
                </span>
                <span>{t.sentBody(trackedId ?? approval.id)}</span>
              </span>
            }
          >
            <ButtonLink href={href({ name: "activity", view: "sent" })} variant="inverse" arrow>
              {t.sentLink}
            </ButtonLink>
          </SheetFooter>
        ) : status === "declined" || approval.status === "declined" ? (
          <SheetFooter
            tone="inverse"
            note={
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2 text-xl font-semibold text-ink-inverse">
                  <X className="size-5" aria-hidden="true" />
                  {t.declinedTitle}
                </span>
                <span>{t.declinedBody}</span>
              </span>
            }
          >
            <ButtonLink href={href({ name: "activity", view: "sent" })} variant="inverse" arrow>
              {t.sentLink}
            </ButtonLink>
          </SheetFooter>
        ) : (
          <SheetFooter
            tone="inverse"
            note={
              <span className="flex flex-col gap-0.5">
                <span id="approve-why" className="font-semibold text-ink-inverse">
                  {ccMissing ? t.needCc : t.readyNote}
                </span>
                <span>{approval.holdSeconds > 0 ? t.holdNote(approval.holdSeconds) : null}</span>
              </span>
            }
          >
            <Button size="xl" variant="inverse" onClick={approve} disabled={ccMissing || busy || editing || declining} aria-describedby="approve-why">
              {t.approveSend}
            </Button>
          </SheetFooter>
        )}
      </div>
    </div>
  );

  return <SplitWithSheet className="bg-surface max-lg:flex-col-reverse max-lg:flex-nowrap" page={<NeedsYouColumn currentId={approval.id} />} sheet={sheet} />;
}

// ---------------------------------------------------------------------------
// R3: publishing to Library shelves
// ---------------------------------------------------------------------------

type ShelfGroup = { shelf: Shelf; changes: LibraryChange[]; everyone: boolean };

function audienceText(shelf: Shelf): string {
  return shelf.audience === "personal" ? t.audiencePersonal : shelf.audience === "team" ? t.audienceTeam(shelf.name) : t.audienceEveryone;
}

function changeKey(change: LibraryChange): string {
  return `${change.shelfId}/${change.pageTitle}`;
}

function isFlagged(group: ShelfGroup, change: LibraryChange): boolean {
  return group.everyone && change.diff.some((line) => line.op === "remove");
}

function LibraryApproval(props: { approval: Approval }) {
  const { approval } = props;
  const shelves = useShelves();
  const pages = useLibraryPages(null);
  const decide = useCockpitMutation((backend, decision: Parameters<typeof backend.approvals.decide>[1]) => backend.approvals.decide(approval.id, decision));
  const [confirmed, setConfirmed] = useState<Set<string>>(() => new Set());
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [declining, setDeclining] = useState(false);
  const [declineNote, setDeclineNote] = useState("");
  const [published, setPublished] = useState(false);

  const groups = useMemo<ShelfGroup[]>(() => {
    const out: ShelfGroup[] = [];
    for (const change of approval.library?.changes ?? []) {
      const shelf = shelves.data?.find((candidate) => candidate.id === change.shelfId);
      if (!shelf) continue;
      const group = out.find((candidate) => candidate.shelf.id === shelf.id);
      if (group) group.changes.push(change);
      else out.push({ shelf, changes: [change], everyone: shelf.audience === "everyone" });
    }
    return out;
  }, [approval.library, shelves.data]);

  const flaggedKeys = groups.flatMap((group) => group.changes.filter((change) => isFlagged(group, change)).map(changeKey));
  const audiencesDone = groups.filter((group) => confirmed.has(group.shelf.id)).length;
  const flaggedDone = flaggedKeys.filter((key) => checked.has(key)).length;
  const ready = groups.length > 0 && audiencesDone === groups.length && flaggedDone === flaggedKeys.length;
  const clientShelf = groups.find((group) => group.shelf.audience === "team")?.shelf ?? null;
  const done = published || approval.status === "approved";
  const busy = decide.isPending;

  const toggle = (set: Set<string>, key: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(key);
    else next.delete(key);
    return next;
  };
  const ownerOf = (title: string) => pages.data?.find((page) => page.title === title)?.owner ?? null;

  const approve = () =>
    decide.mutate(
      { kind: "approve" },
      {
        onSuccess: () => {
          setPublished(true);
          toast(t.published);
        },
        onError: (error) => toast(error.message, { tone: "error" }),
      },
    );
  const decline = () =>
    decide.mutate(
      { kind: "decline", note: declineNote.trim() || null },
      {
        onSuccess: () => {
          toast(t.declined(approval.id));
          navigate({ name: "library" });
        },
        onError: (error) => toast(error.message, { tone: "error" }),
      },
    );
  const snooze = () =>
    decide.mutate(
      { kind: "snooze", until: tomorrowAtNine() },
      {
        onSuccess: () => {
          toast(t.snoozed);
          navigate({ name: "home" });
        },
        onError: (error) => toast(error.message, { tone: "error" }),
      },
    );

  const sheet = (
    <div className="flex h-full flex-col">
      <div className="ms-4 mt-4 flex flex-col gap-3 rounded-s-[24px] border-[1.5px] border-e-0 border-ink bg-surface-alt px-6 py-8 sm:ms-6 sm:mt-6 sm:px-10">
        <div className="flex items-center gap-3">
          <Users className="size-4 shrink-0" aria-hidden="true" />
          <Eyebrow tone="ink" className="flex-1">
            {t.libraryEyebrow}
          </Eyebrow>
          <span className="hidden font-mono text-[13px] leading-4 sm:block">{approval.id}</span>
          <button
            type="button"
            aria-label={t.close}
            onClick={close}
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-ink transition-colors hover:bg-ink hover:text-surface"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <h2 className="m-0 text-[28px] font-bold leading-[34px] tracking-[-0.015em] text-ink sm:text-[40px] sm:leading-[46px]">{approval.headline}</h2>
        <p className="m-0 text-lg text-ink">{approval.consequence}</p>
      </div>

      <div className="flex flex-1 flex-col gap-6 px-6 py-10 sm:px-8 lg:px-12">
        {shelves.isPending ? <Skeleton className="h-64 w-full rounded-card" /> : null}
        {groups.map((group) => (
          <section
            key={group.shelf.id}
            aria-labelledby={`shelf-${group.shelf.id}`}
            className={cn("flex flex-col gap-4 rounded-card p-5 sm:p-8", group.everyone ? "border-2 border-ink" : "bg-surface-alt")}
          >
            <div className="flex flex-wrap items-baseline gap-3">
              <h3 id={`shelf-${group.shelf.id}`} className="m-0 flex-auto text-xl font-semibold text-ink">
                {group.shelf.name}
              </h3>
              <Tag>{group.shelf.tag}</Tag>
              <span className="text-sm text-ink-muted">{dot(t.changeCount(group.changes.length), group.everyone && clientShelf ? t.crossesFrom(clientShelf.name) : null)}</span>
            </div>
            <ConfirmCheck checked={confirmed.has(group.shelf.id)} disabled={done || busy} onCheckedChange={(on) => setConfirmed((current) => toggle(current, group.shelf.id, on))}>
              {audienceText(group.shelf)} <strong className="font-semibold">{t.confirmAudience}</strong>
            </ConfirmCheck>
            {group.everyone ? (
              group.changes.map((change) => {
                const key = changeKey(change);
                const flagged = isFlagged(group, change);
                return (
                  <div key={key} className="flex flex-col gap-3 border-t border-line-strong pt-4">
                    <p className="m-0 flex flex-wrap items-center gap-3 text-base font-semibold text-ink">
                      {change.diff.every((line) => line.op === "add") ? t.newPage(change.pageTitle) : t.changedPage(change.pageTitle, change.diff.filter((line) => line.op !== "same").length)}
                      {flagged ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-ink px-2.5 py-0.5 text-[13px] font-semibold leading-4">
                          <TriangleIcon />
                          {t.mustReview}
                        </span>
                      ) : null}
                    </p>
                    {flagged ? <p className="m-0 text-base text-ink-muted">{t.flaggedWhy}</p> : null}
                    <DiffLines diff={change.diff} labels={{ removed: t.removed, added: t.added }} className="rounded-[10px] bg-surface-alt p-5" />
                    {flagged ? (
                      <ConfirmCheck checked={checked.has(key)} disabled={done || busy} onCheckedChange={(on) => setChecked((current) => toggle(current, key, on))} className="font-semibold">
                        {t.flaggedConfirm}
                      </ConfirmCheck>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <ul className="m-0 list-none border-t border-line-strong p-0">
                {group.changes.map((change) => {
                  const key = changeKey(change);
                  const isNew = change.diff.every((line) => line.op === "add");
                  const owner = ownerOf(change.pageTitle);
                  const shown = open.has(key);
                  return (
                    <li key={key} className="border-b border-line-strong py-3">
                      <div className="flex min-h-12 flex-wrap items-center gap-3">
                        <span aria-hidden="true" className="w-5 text-lg font-bold">
                          {isNew ? "+" : "±"}
                        </span>
                        <span className="flex min-w-0 flex-[1_1_220px] flex-col">
                          <span className="text-base font-semibold text-ink">{isNew ? t.newPage(change.pageTitle) : t.changedPage(change.pageTitle, change.diff.filter((line) => line.op !== "same").length)}</span>
                          <span className="text-sm text-ink-muted">{dot(owner && owner !== "Jij" ? t.owner(owner) : t.ownerYou, change.section ? t.section(change.section) : null)}</span>
                        </span>
                        <button
                          type="button"
                          aria-expanded={shown}
                          onClick={() => setOpen((current) => toggle(current, key, !shown))}
                          className="min-h-11 bg-transparent px-1 text-base font-semibold text-accent hover:text-accent-hover"
                        >
                          {shown ? t.hide : t.show}
                        </button>
                      </div>
                      {shown ? <DiffLines diff={change.diff} labels={{ removed: t.removed, added: t.added }} className="mt-3 rounded-[10px] bg-surface p-5" /> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}

        {approval.library && approval.library.reviewers.length > 0 ? <p className="m-0 text-base text-ink-muted">{t.reviewers(joinNames(approval.library.reviewers))}</p> : null}

        {declining ? (
          <div className="flex flex-col gap-3 rounded-card border border-line-strong p-5">
            <label htmlFor="decline-note" className="text-base font-semibold text-ink">
              {t.declineLabel}
            </label>
            <Textarea id="decline-note" value={declineNote} onChange={(event) => setDeclineNote(event.target.value)} rows={3} />
            <div className="flex flex-wrap gap-3">
              <Button size="xl" variant="solid" onClick={decline} disabled={busy}>
                {t.decline}
              </Button>
              <Button size="xl" onClick={() => setDeclining(false)}>
                {t.cancel}
              </Button>
            </div>
          </div>
        ) : !done && approval.status !== "declined" ? (
          <div className="flex flex-wrap gap-3">
            <Button size="xl" onClick={() => setDeclining(true)} disabled={busy}>
              {t.decline}
            </Button>
            <Button size="xl" onClick={snooze} disabled={busy}>
              {t.snooze}
            </Button>
          </div>
        ) : null}
      </div>

      <div aria-live="polite" data-approval-outcome="">
        {done ? (
          <SheetFooter
            tone="alt"
            note={
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2 text-xl font-semibold text-ink">
                  <Check className="size-5 text-success" aria-hidden="true" />
                  {t.publishedTitle}
                </span>
                <span>{t.publishedBody}</span>
              </span>
            }
          >
            <ButtonLink href={href({ name: "activity", view: "sent" })} variant="secondary" arrow>
              {t.sentLink}
            </ButtonLink>
          </SheetFooter>
        ) : approval.status === "declined" ? (
          <SheetFooter tone="alt" note={t.declinedBody}>
            <ButtonLink href={href({ name: "library" })} arrow>
              {t.declinedTitle}
            </ButtonLink>
          </SheetFooter>
        ) : (
          <SheetFooter
            tone="alt"
            note={
              <span className="flex flex-col gap-0.5">
                <span id="publish-why" className="font-semibold text-ink">
                  {ready ? t.readyPublish : t.stillTodo}
                </span>
                <span>{ready ? t.readyPublishNote : t.progress(audiencesDone, groups.length, flaggedDone, flaggedKeys.length)}</span>
              </span>
            }
          >
            <Button size="xl" variant="primary" onClick={approve} disabled={!ready || busy || declining} aria-describedby="publish-why">
              {t.approvePublish(groups.length)}
            </Button>
          </SheetFooter>
        )}
      </div>
    </div>
  );

  return <SplitWithSheet className="bg-surface max-lg:flex-col-reverse max-lg:flex-nowrap" page={<LibraryApprovalContext approval={approval} groups={groups} />} sheet={sheet} />;
}

function TriangleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

/** The page behind an R3 sheet: where the changes come from (a run's stages, or the project being completed). */
function LibraryApprovalContext(props: { approval: Approval; groups: ShelfGroup[] }) {
  const projects = useProjects();
  const project = props.approval.projectId ? (projects.data?.find((candidate) => candidate.id === props.approval.projectId) ?? null) : null;
  return (
    <div className="flex flex-col gap-10 px-6 pt-10 lg:px-12 lg:pt-14">
      <div className="flex flex-col gap-3">
        {project ? (
          <Eyebrow>
            <a href={href({ name: "project-overview", projectId: project.id })} className="text-inherit no-underline hover:text-ink">
              {project.name}
            </a>
            {" · "}
            {t.libraryLeftEyebrow}
          </Eyebrow>
        ) : null}
        <h1 className="m-0 max-w-[16ch] text-[40px] font-bold leading-[44px] tracking-[-0.02em] text-ink sm:text-[56px] sm:leading-[60px]">
          {t.libraryLeftBefore}
          <Accent>{t.libraryLeftAccent}</Accent>.
        </h1>
        <p className="mb-0 mt-2 max-w-[44ch] text-xl text-ink-muted">{props.approval.provenance}</p>
      </div>
      {props.approval.runId ? (
        <RunStages runId={props.approval.runId} />
      ) : (
        <section aria-labelledby="shared-what" className="flex flex-col gap-4">
          <h2 id="shared-what" className="m-0 text-[28px] font-bold leading-[34px] text-ink">
            {t.libraryChanges}
          </h2>
          <Rows>
            {props.groups.flatMap((group) =>
              group.changes.map((change) => (
                <RowItem
                  key={changeKey(change)}
                  className="py-4"
                  leading={group.everyone ? <Globe className="size-5" aria-hidden="true" /> : <Users className="size-5" aria-hidden="true" />}
                  title={change.pageTitle}
                  meta={dot(group.shelf.name, t.lineCount(change.diff.filter((line) => line.op !== "same").length))}
                />
              )),
            )}
          </Rows>
        </section>
      )}
      <p className="m-0 text-base text-ink-muted">{t.libraryLeftNote}</p>
    </div>
  );
}

function RunStages(props: { runId: string }) {
  const run = useRun(props.runId);
  if (!run.data) return run.isPending ? <Skeleton className="h-64 w-full" /> : null;
  return (
    <section aria-labelledby="stages" className="flex flex-col gap-4">
      <h2 id="stages" className="m-0 text-[28px] font-bold leading-[34px] text-ink">
        {t.stagesTitle}
      </h2>
      <ol className="m-0 list-none border-t border-line-strong p-0">
        {run.data.stages.map((stage, index) => (
          <li key={stage.title} className="flex min-h-16 items-center gap-4 border-b border-line-strong">
            <span className="w-8 text-[13px] font-semibold text-ink-muted">{String(index + 1).padStart(2, "0")}</span>
            <span className="flex-1 text-lg font-semibold text-ink">{stage.title}</span>
            {stage.note ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-ink">
                {stage.state === "done" ? <Check className="size-4 text-success" aria-hidden="true" /> : null}
                {stage.note}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
