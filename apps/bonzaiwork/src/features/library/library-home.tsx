import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Bot, Lock, MessageSquare, TriangleAlert } from "lucide-react";

import type { LibraryPage, LibraryRequest, Shelf } from "~/backend/cockpit";
import { useCockpit, useCockpitMutation, useLibraryPages, useLibraryProposals, useLibraryRequests, useShelves } from "~/backend/cockpit-queries";
import { Accent, Band, Column, Columns, Container, Eyebrow, LinkArrow, PageHero, SectionTitle, Tag, dot } from "~/components/io";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/misc";
import { toast } from "~/components/ui/toast";
import { libraryCopy as t } from "~/copy/library";
import { relativeTime } from "~/lib/format";
import { href } from "~/lib/router";

import { ButtonLink } from "./button-link";
import { LibraryLocked, ShelfIcon } from "./shared";

/**
 * The Library overview (design: Library): ask or search, what waits on you, the three shelves and
 * their audiences, how sharing works, and what needs a check or was added recently.
 */
export function LibraryHome() {
  const cockpit = useCockpit();
  if (cockpit.capabilities.library !== null) return <LibraryLocked reason={cockpit.capabilities.library} />;
  return <LibraryOverview />;
}

function LibraryOverview() {
  const shelves = useShelves();
  const pages = useLibraryPages(null);
  const requests = useLibraryRequests();
  const shelfName = (id: string) => shelves.data?.find((shelf) => shelf.id === id)?.name ?? "";

  return (
    <>
      <PageHero
        documentTitle={t.title}
        eyebrow={t.title}
        title={
          <>
            {t.heroBefore}
            <Accent>{t.heroAccent}</Accent>
            {t.heroAfter}
          </>
        }
        lead={t.lead}
        below={<AskBox pages={pages.data ?? []} shelfName={shelfName} />}
        className="pb-12 lg:pb-14"
      />

      {requests.data && requests.data.length > 0 ? (
        <div className="bg-surface pb-12 lg:pb-16">
          <Container>
            <Waiting requests={requests.data} shelfName={shelfName} />
          </Container>
        </div>
      ) : null}

      <Band tone="alt" label={t.shelvesTitle}>
        <SectionTitle title={t.shelvesTitle} lead={t.shelvesLead} />
        <div className="grid gap-6 md:grid-cols-3">
          {shelves.isPending
            ? [0, 1, 2].map((index) => <Skeleton key={index} className="h-72 rounded-card" />)
            : (shelves.data ?? []).map((shelf) => <ShelfCard key={shelf.id} shelf={shelf} />)}
        </div>
      </Band>

      <Band label={t.howTitle}>
        <SectionTitle title={t.howTitle} lead={t.howLead} className="mb-10" />
        <Columns min={240}>
          {t.how.map((step, index) => (
            <Column key={step.title} index={String(index + 1).padStart(2, "0")} title={step.title}>
              {step.body}
            </Column>
          ))}
        </Columns>
      </Band>

      <Band tone="alt">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <NeedsCheck pages={pages.data} loading={pages.isPending} shelfName={shelfName} />
          <RecentlyAdded pages={pages.data} loading={pages.isPending} shelfName={shelfName} />
        </div>
      </Band>
    </>
  );
}

function AskBox(props: { pages: LibraryPage[]; shelfName: (id: string) => string }) {
  const cockpit = useCockpit();
  const [query, setQuery] = useState("");
  const ask = useMutation({ mutationFn: (question: string) => cockpit.library.ask(question) });
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2);
  const matches = words.length > 0 && !ask.data ? props.pages.filter((page) => words.every((word) => page.title.toLowerCase().includes(word))).slice(0, 4) : [];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const question = query.trim();
    if (!question) {
      document.getElementById("library-q")?.focus();
      return;
    }
    ask.mutate(question, { onError: () => toast(t.askError, { tone: "error" }) });
  };

  return (
    <div className="flex max-w-[820px] flex-col gap-5">
      <form role="search" onSubmit={submit} className="flex flex-wrap gap-3">
        <label htmlFor="library-q" className="sr-only">
          {t.searchLabel}
        </label>
        <input
          id="library-q"
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            if (ask.data) ask.reset();
          }}
          placeholder={t.searchPlaceholder}
          className="h-14 min-w-0 flex-[1_1_320px] rounded-full border border-line-strong bg-surface-raised px-5 text-lg text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-sm:text-base"
        />
        <Button type="submit" variant="primary" size="xl" className="h-14 px-7" disabled={ask.isPending}>
          {ask.isPending ? t.asking : t.ask}
        </Button>
      </form>

      <div aria-live="polite">
        {matches.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="m-0 text-sm text-ink-muted">{t.matches(matches.length)}</p>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {matches.map((page) => (
                <li key={page.id}>
                  <LinkArrow href={href({ name: "library-page", pageId: page.id })}>
                    {page.title} <span className="font-normal text-ink-muted">· {props.shelfName(page.shelfId)}</span>
                  </LinkArrow>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {ask.data ? (
          <div className="flex flex-col gap-4 rounded-card bg-surface-alt p-6 lg:p-8">
            <Eyebrow className="flex items-center gap-2">
              <Bot className="size-4" aria-hidden="true" />
              {t.answerEyebrow}
            </Eyebrow>
            <p className="m-0 max-w-[68ch] text-lg text-ink">{ask.data.text}</p>
            {ask.data.citations.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="m-0 text-sm font-semibold text-ink">{t.answerSources}</p>
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {ask.data.citations.map((citation, index) => (
                    <li key={citation.pageId} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm text-ink-muted">[{index + 1}]</span>
                      <LinkArrow href={href({ name: "library-page", pageId: citation.pageId })}>{citation.title}</LinkArrow>
                      <span className="text-sm text-ink-muted">{citation.shelf}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Waiting(props: { requests: LibraryRequest[]; shelfName: (id: string) => string }) {
  const proposals = useLibraryProposals();
  const target = (request: LibraryRequest): string => {
    if (request.kind === "change") {
      const proposal = proposals.data?.find((candidate) => candidate.status === "open" && candidate.shelfId === request.shelfId);
      if (proposal) return href({ name: "library-proposal", proposalId: proposal.id });
      if (request.approvalId) return href({ name: "approval", approvalId: request.approvalId });
    }
    return request.pageId ? href({ name: "library-page", pageId: request.pageId }) : href({ name: "library" });
  };
  return (
    <section aria-labelledby="library-waiting" className="flex flex-col gap-10 rounded-panel bg-surface-inverse p-8 text-ink-inverse lg:p-12">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 id="library-waiting" className="m-0 text-[28px] font-bold leading-[34px]">
          {t.waitingTitle}
        </h2>
        <span className="text-lg">{t.waitingCount(props.requests.length)}</span>
      </div>
      <ol className="m-0 grid list-none gap-10 p-0 md:grid-cols-2">
        {props.requests.map((request, index) => (
          <li key={request.id} className="flex flex-col gap-4 border-t border-ink-inverse pt-5">
            <span className="flex flex-wrap items-center gap-2 text-[13px] font-semibold uppercase leading-4 tracking-[0.08em]">
              {String(index + 1).padStart(2, "0")} ·
              {request.kind === "change" ? <Lock className="size-4" aria-hidden="true" /> : <MessageSquare className="size-4" aria-hidden="true" />}
              {dot(request.kind === "change" ? t.requestChange : t.requestCheck, props.shelfName(request.shelfId))}
            </span>
            <h3 className="m-0 text-xl font-semibold">{request.title}</h3>
            <p className="m-0 flex-1 text-base text-ink-inverse-muted">{request.detail}</p>
            <div className="flex">
              <ButtonLink href={target(request)} variant="inverse" arrow>
                {request.kind === "change" ? t.reviewChange : t.openPage}
              </ButtonLink>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ShelfCard(props: { shelf: Shelf }) {
  const { shelf } = props;
  return (
    <div className="flex flex-col gap-4 rounded-card bg-surface-raised p-8">
      <ShelfIcon audience={shelf.audience} />
      <h3 className="m-0 text-xl font-semibold text-ink">{shelf.name}</h3>
      <div className="flex">
        <Tag>{shelf.tag}</Tag>
      </div>
      <p className="m-0 flex-1 text-base text-ink">{shelf.description}</p>
      {shelf.newest ? <p className="m-0 text-sm text-ink-muted">{shelf.newest}</p> : null}
      <LinkArrow href={href({ name: "library-shelf", shelfId: shelf.id })} aria-label={`${t.openShelf}: ${shelf.name}`}>
        {t.openShelf}
      </LinkArrow>
    </div>
  );
}

function NeedsCheck(props: { pages: LibraryPage[] | undefined; loading: boolean; shelfName: (id: string) => string }) {
  const verify = useCockpitMutation((cockpit, pageId: string) => cockpit.library.verify(pageId));
  const stale = (props.pages ?? []).filter((page) => page.stale !== null);
  return (
    <section aria-labelledby="needs-check" className="flex flex-col">
      <SectionTitle id="needs-check" title={t.checkTitle} count={props.loading ? undefined : stale.length} lead={t.checkLead} className="mb-5" />
      {props.loading ? (
        <Skeleton className="h-40 w-full" />
      ) : stale.length === 0 ? (
        <p className="m-0 border-t border-line-strong pt-5 text-base text-ink-muted">{t.checkNone}</p>
      ) : (
        <ul className="m-0 list-none border-t border-line-strong p-0">
          {stale.map((page) => (
            <li key={page.id} className="flex min-h-[72px] flex-wrap items-center gap-4 border-b border-line-strong py-3">
              <TriangleAlert className="size-5 shrink-0 text-ink" strokeWidth={1.5} aria-hidden="true" />
              <span className="flex min-w-0 flex-[1_1_220px] flex-col">
                <a href={href({ name: "library-page", pageId: page.id })} className="text-lg font-semibold text-ink no-underline hover:underline">
                  {page.title}
                </a>
                <span className="text-sm text-ink-muted">{dot(props.shelfName(page.shelfId), page.stale)}</span>
              </span>
              <LinkArrow
                onClick={() =>
                  verify.mutate(page.id, {
                    onSuccess: () => toast(t.checked(page.title)),
                    onError: (error) => toast(error.message, { tone: "error" }),
                  })
                }
              >
                {t.checkNow}
              </LinkArrow>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentlyAdded(props: { pages: LibraryPage[] | undefined; loading: boolean; shelfName: (id: string) => string }) {
  const recent = [...(props.pages ?? [])].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4);
  return (
    <section aria-labelledby="recently-added" className="flex flex-col">
      <SectionTitle id="recently-added" title={t.recentTitle} lead={t.recentLead} className="mb-5" />
      {props.loading ? (
        <Skeleton className="h-40 w-full" />
      ) : recent.length === 0 ? (
        <p className="m-0 border-t border-line-strong pt-5 text-base text-ink-muted">{t.recentNone}</p>
      ) : (
        <ul className="m-0 list-none border-t border-line-strong p-0">
          {recent.map((page) => (
            <li key={page.id} className="flex min-h-[72px] flex-col justify-center border-b border-line-strong py-3">
              <a href={href({ name: "library-page", pageId: page.id })} className="text-lg font-semibold text-ink no-underline hover:underline">
                {page.title}
              </a>
              <span className="text-sm text-ink-muted">{dot(page.addedBy, props.shelfName(page.shelfId), relativeTime(page.updatedAt))}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
