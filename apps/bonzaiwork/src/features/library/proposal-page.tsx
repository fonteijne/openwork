import { useState } from "react";
import { FileText, Users } from "lucide-react";

import { useCockpit, useCockpitMutation, useLibraryPages, useLibraryProposal, useShelves } from "~/backend/cockpit-queries";
import { Accent, CheckLine, Container, Eyebrow, LinkArrow, PageHero } from "~/components/io";
import { Button } from "~/components/ui/button";
import { EmptyState, Skeleton } from "~/components/ui/misc";
import { toast } from "~/components/ui/toast";
import { libraryCopy as t } from "~/copy/library";
import { cn } from "~/lib/cn";
import { href, navigate } from "~/lib/router";

import { ButtonLink } from "./button-link";
import { DiffLines, diffCounts } from "./diff";
import { LibraryLocked, readersOf } from "./shared";

/**
 * A change to review before it reaches a shared shelf (design: Proposal): who proposes it, who will
 * see it, why, the change line by line, the checks, and Publiceren or Afwijzen.
 */
export function ProposalPage(props: { proposalId: string }) {
  const cockpit = useCockpit();
  if (cockpit.capabilities.library !== null) return <LibraryLocked reason={cockpit.capabilities.library} />;
  return <Proposal proposalId={props.proposalId} />;
}

function Proposal(props: { proposalId: string }) {
  const query = useLibraryProposal(props.proposalId);
  const shelves = useShelves();
  const pages = useLibraryPages(null);
  const [view, setView] = useState<"page" | "plain">("page");
  const decide = useCockpitMutation((cockpit, decision: "accept" | "reject") => cockpit.library.decide(props.proposalId, decision));

  if (query.isPending)
    return (
      <div className="mx-auto flex max-w-[1360px] flex-col gap-6 px-6 py-16 lg:px-12" aria-label={t.loading}>
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-14 w-2/3" />
        <Skeleton className="h-48 w-full rounded-panel" />
      </div>
    );
  const proposal = query.data;
  if (!proposal)
    return (
      <div className="px-6 py-16">
        <EmptyState
          icon={<FileText />}
          title={t.proposalNotFound}
          body={t.proposalNotFoundBody}
          action={
            <ButtonLink href={href({ name: "library" })} arrow>
              {t.backToLibrary}
            </ButtonLink>
          }
        />
      </div>
    );

  const shelf = shelves.data?.find((candidate) => candidate.id === proposal.shelfId) ?? null;
  const firstChange = proposal.changes[0] ?? null;
  const page = firstChange ? (pages.data?.find((candidate) => candidate.title === firstChange.pageTitle) ?? null) : null;
  const counts = diffCounts(proposal.changes);
  const failing = proposal.checks.filter((check) => check.result === "fail").length;
  const open = proposal.status === "open";
  const readers = shelf ? readersOf(shelf).toLowerCase() : proposal.audience;
  const changeCount = proposal.changes.length;

  const run = (decision: "accept" | "reject") =>
    decide.mutate(decision, {
      onSuccess: () => {
        toast(decision === "accept" ? t.published(proposal.title) : t.rejected(proposal.title));
        navigate({ name: "library" });
      },
      onError: (error) => toast(error.message, { tone: "error" }),
    });

  return (
    <>
      <PageHero
        documentTitle={proposal.title}
        eyebrow={
          <>
            <a href={href({ name: "library" })} className="text-inherit no-underline hover:text-ink">
              {t.title}
            </a>
            {shelf ? ` · ${shelf.name}` : ""}
            {" · "}
            {t.proposalEyebrow}
          </>
        }
        title={
          <>
            {t.proposalTitle(changeCount)}
            {page ? (
              <>
                {t.kindLower[page.kind].split(" ")[0]} <Accent>{t.kindLower[page.kind].split(" ")[1]}</Accent>
              </>
            ) : (
              <Accent>{t.proposalTitleFallback}</Accent>
            )}
          </>
        }
        lead={
          <>
            {firstChange ? t.proposalLead(proposal.from, firstChange.section, firstChange.pageTitle) : null} {proposal.reason}{" "}
            {page && page.owner !== "Jij" ? t.proposalOwnerNext(page.owner, readers) : t.proposalReadersNext(readers)}
          </>
        }
      />

      <div className="bg-surface pb-12 lg:pb-16">
        <Container>
          <section aria-labelledby="proposal-approve" className="flex flex-wrap items-center gap-8 rounded-panel border-[1.5px] border-ink bg-surface-alt px-6 py-8 sm:px-12 sm:py-10">
            <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-2">
              <p className="m-0 flex items-center gap-2 text-[13px] font-semibold uppercase leading-4 tracking-[0.08em] text-ink">
                <Users className="size-4" aria-hidden="true" />
                {t.approvalEyebrow}
              </p>
              <h2 id="proposal-approve" className="m-0 text-[28px] font-bold leading-[34px] text-ink">
                {t.willSee(shelf?.name ?? proposal.audience)}
              </h2>
              <p className="m-0 text-lg text-ink">{t.stays}</p>
            </div>
            {open ? (
              <div className="flex flex-col items-start gap-3">
                <div className="flex flex-wrap gap-3">
                  <Button size="xl" variant="primary" onClick={() => run("accept")} disabled={decide.isPending || failing > 0} aria-describedby="proposal-why">
                    {t.publish}
                  </Button>
                  <Button size="xl" variant="secondary" onClick={() => run("reject")} disabled={decide.isPending}>
                    {t.reject}
                  </Button>
                </div>
                <p id="proposal-why" className="m-0 text-sm text-ink-muted">
                  {failing > 0 ? t.blocked(failing) : t.noShortcut}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-start gap-3">
                <p className="m-0 text-lg font-semibold text-ink">{proposal.status === "accepted" ? t.proposalDone.accepted : t.proposalDone.rejected}</p>
                <p className="m-0 text-sm text-ink-muted">{t.proposalDoneBody}</p>
                <LinkArrow href={href({ name: "activity", view: "sent" })}>{t.sentLog}</LinkArrow>
              </div>
            )}
          </section>
        </Container>
      </div>

      <div className="bg-surface-alt py-12 lg:py-16">
        <Container className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section aria-labelledby="what-changes" className="flex min-w-0 flex-col gap-5">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 id="what-changes" className="m-0 flex-auto text-[28px] font-bold leading-[34px] text-ink">
                {t.whatChanges} <span className="font-normal text-ink-muted">· {t.changeCounts(counts.added, counts.removed)}</span>
              </h2>
              <div role="group" aria-label={t.viewLabel} className="flex gap-1 rounded-full bg-surface-raised p-1">
                {(["page", "plain"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={view === value}
                    onClick={() => setView(value)}
                    className={cn("min-h-10 rounded-full px-4 text-sm", view === value ? "bg-surface-inverse font-semibold text-ink-inverse" : "font-medium text-ink hover:bg-surface-alt")}
                  >
                    {value === "page" ? t.viewPage : t.viewPlain}
                  </button>
                ))}
              </div>
            </div>
            {proposal.changes.map((change, index) => (
              <div key={`${change.pageTitle}-${index}`} className="flex flex-col gap-4 rounded-card bg-surface-raised p-6 sm:p-12">
                <h3 className="m-0 text-xl font-bold text-ink">{change.section ?? change.pageTitle}</h3>
                {view === "page" ? (
                  <DiffLines diff={change.diff} labels={{ removed: t.removed, added: t.added }} size="lg" className="max-w-[68ch] gap-3" />
                ) : (
                  <pre className="m-0 overflow-x-auto whitespace-pre-wrap rounded-[10px] bg-surface-alt p-5 font-mono text-sm text-ink">
                    {change.diff.map((line) => `${line.op === "add" ? "+ " : line.op === "remove" ? "- " : "  "}${line.text}`).join("\n")}
                  </pre>
                )}
              </div>
            ))}
          </section>

          <aside aria-labelledby="about-change" className="flex flex-col gap-8">
            <div className="flex flex-col gap-4">
              <Eyebrow>
                <span id="about-change">{t.aboutChange}</span>
              </Eyebrow>
              <dl className="m-0 flex flex-col gap-4 text-base">
                <div>
                  <dt className="font-semibold text-ink">{t.suggestedBy}</dt>
                  <dd className="m-0 text-ink-muted">
                    {proposal.runId ? (
                      <a href={href({ name: "run", runId: proposal.runId })} className="text-ink-muted underline-offset-4 hover:text-ink hover:underline">
                        {proposal.from}
                      </a>
                    ) : (
                      proposal.from
                    )}
                  </dd>
                </div>
                {firstChange ? (
                  <div>
                    <dt className="font-semibold text-ink">{t.pageLabel}</dt>
                    <dd className="m-0 text-ink-muted">
                      {page ? (
                        <a href={href({ name: "library-page", pageId: page.id })} className="text-accent hover:text-accent-hover">
                          {page.title}
                        </a>
                      ) : (
                        firstChange.pageTitle
                      )}
                    </dd>
                  </div>
                ) : null}
                {page ? (
                  <div>
                    <dt className="font-semibold text-ink">{t.ownerLabel}</dt>
                    <dd className="m-0 text-ink-muted">{page.owner === "Jij" ? page.owner : t.ownerChecksAfter(page.owner)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="font-semibold text-ink">{t.visibleTo}</dt>
                  <dd className="m-0 text-ink-muted">{proposal.audience}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink">{t.why}</dt>
                  <dd className="m-0 text-ink-muted">{proposal.reason}</dd>
                </div>
              </dl>
            </div>
            {proposal.checks.length > 0 ? (
              <div className="flex flex-col gap-3">
                <Eyebrow>{t.checks}</Eyebrow>
                <ul className="m-0 flex list-none flex-col gap-3 p-0">
                  {proposal.checks.map((check) => (
                    <CheckLine key={check.text} result={check.result}>
                      {check.text}
                    </CheckLine>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </Container>
      </div>
    </>
  );
}
