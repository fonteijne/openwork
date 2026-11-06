import { useEffect, useState, type ReactNode } from "react";
import { Check, CircleAlert, Clock, Download, OctagonAlert, Undo2, X } from "lucide-react";

import type { ActivityActor, ActivityEntry, OutboundEntry, OutboundStatus } from "~/backend/cockpit";
import { useActivity, useCockpit, useCockpitMutation, useRuns, useSent } from "~/backend/cockpit-queries";
import { useProjects } from "~/backend/queries";
import { Accent, Band, Container, FilterChip, LinkArrow, LockedNote, PageHero, SectionTitle, Tag } from "~/components/io";
import { Button } from "~/components/ui/button";
import { EmptyState, Skeleton } from "~/components/ui/misc";
import { toast } from "~/components/ui/toast";
import { activityCopy as t } from "~/copy/activity";
import { cn } from "~/lib/cn";
import { formatDateTime } from "~/lib/format";
import { href, type ActivityView } from "~/lib/router";

import { timeWithSeconds, weekdayTime } from "../approvals/format";
import { csvFileName, downloadCsv, toCsv } from "./csv";

type Who = "all" | ActivityActor;
const WHO: Who[] = ["all", "you", "agent", "colleague", "app"];

/** Who decided a sent entry: the person ("Jij …"), otherwise a colleague. */
function actorOfSent(entry: OutboundEntry): ActivityActor {
  return /^Jij\b/.test(entry.decidedBy) ? "you" : "colleague";
}

/**
 * Activity (design: Activity): the audit log of who did what and on what basis, and the sent log
 * of everything that left the app, with what happened step by step. An unknown outcome sits on
 * top until the person has checked it; nothing is ever re-sent by itself.
 */
export function ActivityPage(props: { view: ActivityView }) {
  const cockpit = useCockpit();
  const [who, setWho] = useState<Who>("all");
  const activity = useActivity();
  const sent = useSent();
  const projects = useProjects();
  const locked = cockpit.capabilities.activity;
  const projectName = (id: string | null) => (id ? (projects.data?.find((project) => project.id === id)?.name ?? t.noProject) : t.noProject);

  const visibleAll = (activity.data ?? []).filter((entry) => who === "all" || entry.actor === who);
  const visibleSent = (sent.data ?? []).filter((entry) => who === "all" || actorOfSent(entry) === who);
  const unknown = (sent.data ?? []).find((entry) => entry.status === "unknown") ?? null;

  const exportCsv = () => {
    const rows: string[][] =
      props.view === "sent"
        ? [[...t.csv.sentHeader], ...visibleSent.map((entry) => [entry.id, entry.title, t.kind[entry.kind], entry.target[0], entry.target[1] ?? "", entry.statusText, entry.decidedBy, new Date(entry.at).toISOString()])]
        : [[...t.csv.allHeader], ...visibleAll.map((entry) => [new Date(entry.at).toISOString(), entry.actorName, entry.text, entry.basis ?? "", projectName(entry.projectId), entry.runId ?? ""])];
    if (rows.length <= 1) {
      toast(t.exportEmpty);
      return;
    }
    downloadCsv(csvFileName(props.view === "sent" ? t.csv.fileSent : t.csv.fileAll), toCsv(rows));
    toast(t.exported(rows.length - 1));
  };

  const title = (
    <>
      {t.heroBefore}
      <Accent>{t.heroAccent}</Accent>
      {t.heroAfter}
    </>
  );

  if (locked !== null)
    return (
      <>
        <PageHero documentTitle={t.title} eyebrow={t.title} title={title} lead={t.lead} />
        <Container className="pb-16">
          <LockedNote title={t.locked}>{locked}</LockedNote>
        </Container>
      </>
    );

  return (
    <>
      <PageHero
        documentTitle={props.view === "sent" ? `${t.viewSent} · ${t.title}` : t.title}
        eyebrow={t.title}
        title={title}
        lead={t.lead}
        actions={
          <Button size="xl" variant="secondary" onClick={exportCsv}>
            <Download aria-hidden="true" />
            {t.exportCsv}
          </Button>
        }
        below={
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            <nav aria-label={t.viewLabel} className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-surface-alt p-1 [scrollbar-width:none]">
              {(["all", "sent"] as const).map((value) => (
                <a
                  key={value}
                  href={href({ name: "activity", view: value })}
                  aria-current={props.view === value ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 shrink-0 items-center rounded-full px-5 text-base no-underline transition-colors",
                    props.view === value ? "bg-surface-inverse font-semibold text-ink-inverse" : "font-medium text-ink hover:bg-surface-raised",
                  )}
                >
                  {value === "all" ? t.viewAll : t.viewSent}
                </a>
              ))}
            </nav>
            <div role="group" aria-label={t.whoLabel} className="flex flex-wrap items-center gap-2">
              <span className="me-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-muted" aria-hidden="true">
                {t.whoLabel}
              </span>
              {WHO.map((value) => (
                <FilterChip key={value} active={who === value} onClick={() => setWho(value)} className="h-11 text-sm">
                  {t.who[value]}
                </FilterChip>
              ))}
            </div>
          </div>
        }
        className="pb-12 lg:pb-16"
      />

      {unknown ? (
        <div className="bg-surface pb-12 lg:pb-16">
          <Container>
            <UnknownBanner entry={unknown} />
          </Container>
        </div>
      ) : null}

      {props.view === "sent" ? (
        <Band tone="alt" label={t.sentTitle}>
          <SectionTitle title={t.sentTitle} count={t.sentCount} lead={t.sentLead} />
          {sent.isPending ? (
            <Skeleton className="h-80 w-full" />
          ) : visibleSent.length === 0 ? (
            <EmptyState
              icon={<Check />}
              title={(sent.data ?? []).length === 0 ? t.sentEmpty : t.sentEmptyFiltered}
              body={(sent.data ?? []).length === 0 ? t.sentEmptyBody : t.allEmptyFilteredBody}
            />
          ) : (
            <SentLog entries={visibleSent} />
          )}
        </Band>
      ) : (
        <Band tone="alt" label={t.allTitle}>
          <SectionTitle title={t.allTitle} count={activity.data ? t.allCount(visibleAll.length) : undefined} />
          {activity.isPending ? (
            <Skeleton className="h-80 w-full" />
          ) : visibleAll.length === 0 ? (
            <EmptyState
              title={(activity.data ?? []).length === 0 ? t.allEmpty : t.allEmptyFiltered}
              body={(activity.data ?? []).length === 0 ? t.allEmptyBody : t.allEmptyFilteredBody}
            />
          ) : (
            <AllLog entries={visibleAll} projectName={projectName} />
          )}
        </Band>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// The unknown outcome
// ---------------------------------------------------------------------------

function UnknownBanner(props: { entry: OutboundEntry }) {
  const { entry } = props;
  const runs = useRuns();
  const [checking, setChecking] = useState(false);
  const resolve = useCockpitMutation((cockpit, outcome: "sent" | "not_sent" | "later") => cockpit.approvals.resolve(entry.id, outcome));
  const run = runs.data?.find((candidate) => candidate.interruption?.outbound?.id === entry.id) ?? null;
  const target = entry.target[0].charAt(0).toLowerCase() + entry.target[0].slice(1);
  const lastStep = entry.steps[entry.steps.length - 1];

  const choose = (outcome: "sent" | "not_sent" | "later") => {
    if (outcome === "later") {
      setChecking(false);
      return;
    }
    resolve.mutate(outcome, {
      onSuccess: () => toast(outcome === "sent" ? t.resolvedSent : t.resolvedNotSent),
      onError: (error) => toast(error.message, { tone: "error" }),
    });
  };

  return (
    <section aria-labelledby="outcome-unknown" className="flex flex-wrap items-center gap-8 rounded-panel bg-surface-inverse p-8 text-ink-inverse lg:p-12">
      <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-3">
        <p className="m-0 flex items-center gap-2 text-[13px] font-semibold uppercase leading-4 tracking-[0.08em]">
          <OctagonAlert className="size-4" aria-hidden="true" />
          {t.unknownEyebrow(entry.id)}
        </p>
        <h2 id="outcome-unknown" className="m-0 text-[28px] font-bold leading-[34px]">
          {t.unknownTitle(target)}
        </h2>
        <p className="m-0 max-w-[60ch] text-lg text-ink-inverse-muted">{t.unknownBody(formatDateTime(lastStep?.at ?? entry.at))}</p>
        {run ? (
          <LinkArrow href={href({ name: "run", runId: run.id })} tone="inverse" className="mt-1 w-fit">
            {t.openRun(run.id)}
          </LinkArrow>
        ) : null}
      </div>
      {checking ? (
        <div className="flex flex-col gap-3" aria-live="polite">
          <p className="m-0 text-base font-semibold">{t.resolveQuestion}</p>
          <div className="flex flex-wrap gap-3">
            <Button size="xl" variant="inverse" onClick={() => choose("sent")} disabled={resolve.isPending}>
              <Check aria-hidden="true" />
              {t.resolveSent}
            </Button>
            <Button size="xl" variant="inverse" onClick={() => choose("not_sent")} disabled={resolve.isPending}>
              <X aria-hidden="true" />
              {t.resolveNotSent}
            </Button>
            <Button size="xl" variant="ghost" className="text-ink-inverse ring-1 ring-inset ring-line-inverse hover:bg-inverse-hover" onClick={() => choose("later")} disabled={resolve.isPending}>
              {t.resolveLater}
            </Button>
          </div>
        </div>
      ) : (
        <Button size="xl" variant="inverse" onClick={() => setChecking(true)}>
          {t.checkOutlook}
        </Button>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// The sent log
// ---------------------------------------------------------------------------

const STATUS_ICON: Record<OutboundStatus, ReactNode> = {
  held: <Clock />,
  sent: <Check />,
  published: <Check />,
  accepted: <Check />,
  unknown: <CircleAlert />,
  undone: <Undo2 />,
  declined: <X />,
};

function useTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function SentLog(props: { entries: OutboundEntry[] }) {
  const firstSent = props.entries.find((entry) => entry.status === "sent" && entry.steps.length > 0)?.id ?? null;
  const [expanded, setExpanded] = useState<Set<string> | null>(null);
  const open = expanded ?? new Set(firstSent ? [firstSent] : []);
  const now = useTick(props.entries.some((entry) => entry.status === "held"));

  const toggle = (id: string) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  return (
    <ul aria-label={t.sentTitle} className="m-0 list-none border-t border-line-strong p-0">
      {props.entries.map((entry) => {
        const isOpen = open.has(entry.id);
        const holdSeconds = Number(/(\d+)\s*s/.exec(entry.statusText)?.[1] ?? "20");
        const remaining = Math.max(0, Math.ceil(holdSeconds - (now - entry.at) / 1000));
        return (
          <li key={entry.id} className="flex flex-col gap-5 border-b border-line-strong py-5">
            <div className="grid items-start gap-x-5 gap-y-2 md:grid-cols-4">
              <span className="flex flex-col">
                <span className="text-lg font-semibold text-ink">{entry.title}</span>
                <span className="text-sm text-ink-muted"><span className="font-mono">{entry.id}</span> · {t.kind[entry.kind]}</span>
              </span>
              <span className="flex flex-col text-base text-ink">
                <span>{entry.target[0]}</span>
                {entry.target[1] ? <span className="text-ink-muted">{entry.target[1]}</span> : null}
              </span>
              <span
                className={cn(
                  "inline-flex items-start gap-1.5 text-base font-semibold [&_svg]:mt-1 [&_svg]:size-4 [&_svg]:shrink-0",
                  entry.status === "sent" || entry.status === "published" || entry.status === "accepted" ? "text-success" : entry.status === "unknown" ? "text-danger" : "text-ink",
                )}
              >
                <span aria-hidden="true" className="flex">
                  {STATUS_ICON[entry.status]}
                </span>
                {entry.status === "held" ? t.heldIn(remaining) : entry.statusText || t.status[entry.status]}
              </span>
              <span className="flex flex-col text-base text-ink">
                <span>{entry.decidedBy}</span>
                <span className="text-ink-muted">{weekdayTime(entry.at)}</span>
                {entry.steps.length > 0 ? (
                  <button type="button" aria-expanded={isOpen} onClick={() => toggle(entry.id)} className="mt-1 min-h-11 w-fit bg-transparent p-0 text-start text-sm font-semibold text-accent hover:text-accent-hover md:min-h-8">
                    {isOpen ? t.hideSteps : t.showSteps}
                  </button>
                ) : null}
              </span>
            </div>
            {isOpen && entry.steps.length > 0 ? (
              <div className="flex flex-col gap-4 rounded-card bg-surface-raised p-6 lg:p-8">
                <h3 className="m-0 text-[13px] font-semibold uppercase leading-4 tracking-[0.08em] text-ink-muted">{t.whatHappened}</h3>
                <ol className="m-0 grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-5">
                  {entry.steps.map((step, index) => (
                    <li key={`${step.at}-${index}`} className="flex flex-col gap-1 border-t border-ink pt-3">
                      <span className="text-sm text-ink-muted">{timeWithSeconds(step.at)}</span>
                      <span className="text-base font-semibold text-ink">{step.title}</span>
                      <span className="text-sm text-ink-muted">{step.detail}</span>
                    </li>
                  ))}
                </ol>
                {entry.kind === "email" && entry.status === "sent" ? (
                  <div className="flex flex-wrap items-center gap-4">
                    <p className="m-0 text-base text-ink-muted">{t.cannotUnsend}</p>
                    <LinkArrow href={href({ name: "delegate", todoId: null })}>{t.sendCorrection}</LinkArrow>
                  </div>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// All activity
// ---------------------------------------------------------------------------

function AllLog(props: { entries: ActivityEntry[]; projectName: (id: string | null) => string }) {
  return (
    <ul aria-label={t.allTitle} className="m-0 list-none border-t border-line-strong p-0">
      {props.entries.map((entry) => (
        <li key={entry.id} className="grid items-start gap-x-6 gap-y-2 border-b border-line-strong py-5 md:grid-cols-[110px_150px_minmax(0,1fr)] lg:grid-cols-[110px_150px_minmax(0,1fr)_170px_100px]">
          <span className="text-sm text-ink-muted md:pt-1">{weekdayTime(entry.at)}</span>
          <span className="md:pt-0.5">
            <Tag tone={entry.actor === "agent" ? "accent" : "outline"}>{entry.actorName}</Tag>
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-lg text-ink">{entry.text}</span>
            {entry.basis ? <span className="text-sm text-ink-muted">{t.basis(entry.basis)}</span> : null}
          </span>
          <span className="text-sm text-ink-muted md:col-start-3 lg:col-start-auto lg:pt-1">
            {entry.projectId ? (
              <a href={href({ name: "project-overview", projectId: entry.projectId })} className="text-ink-muted no-underline hover:text-ink hover:underline">
                {props.projectName(entry.projectId)}
              </a>
            ) : (
              props.projectName(null)
            )}
          </span>
          <span className="md:col-start-3 lg:col-start-auto lg:pt-0.5">
            {entry.runId ? (
              <a href={href({ name: "run", runId: entry.runId })} className="font-mono text-sm font-semibold text-accent no-underline hover:text-accent-hover">
                {entry.runId}
              </a>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

