import { useState } from "react";
import { Check, FileText, Info, MessageSquare, TriangleAlert } from "lucide-react";

import type { LibraryPage, Shelf } from "~/backend/cockpit";
import { useCockpit, useCockpitMutation, useLibraryPage, useLibraryPages, useLibraryProposals, useLibraryRequests, useShelves } from "~/backend/cockpit-queries";
import { Accent, Container, Eyebrow, LinkArrow, PageHero, Tag, dot } from "~/components/io";
import { ProseHtml } from "~/components/prose-html";
import { Button } from "~/components/ui/button";
import { EmptyState, Skeleton } from "~/components/ui/misc";
import { toast } from "~/components/ui/toast";
import { libraryCopy as t } from "~/copy/library";
import { cn } from "~/lib/cn";
import { relativeTime } from "~/lib/format";
import { renderMarkdown } from "~/lib/markdown";
import { href } from "~/lib/router";

import { shortDay, splitLastWord } from "../approvals/format";
import { ButtonLink } from "./button-link";
import { LibraryLocked, pageState, readersOf } from "./shared";

/**
 * A Library page (design: Library page): where it lives and who keeps it current, the page itself,
 * and on the right who can read it, what it is based on, comments and history.
 */
export function LibraryPageView(props: { pageId: string }) {
  const cockpit = useCockpit();
  if (cockpit.capabilities.library !== null) return <LibraryLocked reason={cockpit.capabilities.library} />;
  return <PageView pageId={props.pageId} />;
}

/** The body without its own first heading when that repeats the page title (the hero shows it). */
function bodyWithoutTitle(page: LibraryPage): string {
  const lines = page.body.split("\n");
  const first = lines[0]?.replace(/^#+\s*/, "").trim();
  if (first === page.title.trim()) return lines.slice(1).join("\n").trim();
  return page.body;
}

/** In-app links in a page ("#/bibliotheek/pagina/…") stay in the app. */
function openInApp(target: string | null): boolean {
  if (target?.startsWith("#/")) {
    window.location.hash = target;
    return true;
  }
  return false;
}

function PageView(props: { pageId: string }) {
  const query = useLibraryPage(props.pageId);
  const shelves = useShelves();
  const requests = useLibraryRequests();
  const proposals = useLibraryProposals();
  const verify = useCockpitMutation((cockpit, pageId: string) => cockpit.library.verify(pageId));

  if (query.isPending)
    return (
      <div className="mx-auto flex max-w-[1360px] flex-col gap-6 px-6 py-16 lg:px-12" aria-label={t.loading}>
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-14 w-2/3" />
        <Skeleton className="h-96 w-full rounded-card" />
      </div>
    );
  const page = query.data;
  if (!page)
    return (
      <div className="px-6 py-16">
        <EmptyState
          icon={<FileText />}
          title={t.pageNotFound}
          body={t.pageNotFoundBody}
          action={
            <ButtonLink href={href({ name: "library" })} arrow>
              {t.backToLibrary}
            </ButtonLink>
          }
        />
      </div>
    );

  const shelf = shelves.data?.find((candidate) => candidate.id === page.shelfId) ?? null;
  const state = pageState(page);
  const [before, last] = splitLastWord(page.title);
  const proposal = proposals.data?.find((candidate) => candidate.status === "open" && candidate.changes.some((change) => change.pageTitle === page.title)) ?? null;
  const proposalSection = proposal?.changes.find((change) => change.pageTitle === page.title)?.section ?? null;
  const checkRequest = requests.data?.find((request) => request.kind === "check" && request.pageId === page.id) ?? null;

  const runVerify = () =>
    verify.mutate(page.id, {
      onSuccess: () => toast(t.checked(page.title)),
      onError: (error) => toast(error.message, { tone: "error" }),
    });

  return (
    <>
      <PageHero
        documentTitle={page.title}
        eyebrow={
          <>
            <a href={href({ name: "library" })} className="text-inherit no-underline hover:text-ink">
              {t.title}
            </a>
            {shelf ? (
              <>
                {" · "}
                <a href={href({ name: "library-shelf", shelfId: shelf.id })} className="text-inherit no-underline hover:text-ink">
                  {shelf.name}
                </a>
              </>
            ) : null}
            {" · "}
            {t.kind[page.kind]}
          </>
        }
        title={
          <span lang="nl" className="hyphens-auto [overflow-wrap:anywhere]">
            {before}
            <Accent>{last}</Accent>
          </span>
        }
        meta={
          <>
            {shelf ? <Tag>{shelf.tag}</Tag> : null}
            {state.stale ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
                <TriangleAlert className="size-4" aria-hidden="true" />
                {state.text}
              </span>
            ) : page.verified ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
                <Check className="size-4" aria-hidden="true" />
                {t.verifiedBy(page.verified.by, shortDay(page.verified.at))}
              </span>
            ) : (
              <span className="text-sm text-ink-muted">{t.notVerified}</span>
            )}
            {page.checkDue && !state.stale ? <span className="text-sm text-ink-muted">{t.nextCheck(shortDay(page.checkDue))}</span> : null}
          </>
        }
        actions={
          <>
            <Button size="xl" variant="secondary" onClick={runVerify} disabled={verify.isPending}>
              <Check aria-hidden="true" />
              {t.verify}
            </Button>
            <ButtonLink href={href({ name: "delegate", todoId: null })} variant="primary" arrow>
              {t.useInRun}
            </ButtonLink>
          </>
        }
      />

      {proposal || checkRequest ? (
        <div className="bg-surface pb-12">
          <Container className="flex flex-col gap-4">
            {proposal ? (
              <div className="flex flex-wrap items-center gap-5 rounded-card bg-surface-alt px-6 py-6 lg:px-8">
                <Info className="size-5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                <p className="m-0 flex-[1_1_320px] text-lg text-ink">{t.proposalWaiting(proposalSection)}</p>
                <LinkArrow href={href({ name: "library-proposal", proposalId: proposal.id })}>{t.seeChange}</LinkArrow>
              </div>
            ) : null}
            {checkRequest ? (
              <div className="flex flex-wrap items-center gap-5 rounded-card bg-surface-alt px-6 py-6 lg:px-8">
                <MessageSquare className="size-5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                <p className="m-0 flex-[1_1_320px] text-lg text-ink">
                  <strong className="font-semibold">{checkRequest.title}.</strong> {t.checkRequested(checkRequest.detail)}
                </p>
                <LinkArrow onClick={runVerify}>{t.verify}</LinkArrow>
              </div>
            ) : null}
          </Container>
        </div>
      ) : null}

      <div className="bg-surface-alt py-12 lg:py-16">
        <Container className="grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)_280px] xl:grid-cols-[260px_minmax(0,1fr)_300px]">
          <ShelfNav current={page} shelves={shelves.data ?? []} />
          <article aria-label={page.title} className="min-w-0 self-start rounded-card bg-surface-raised p-6 sm:p-10 lg:p-12">
            <ProseHtml
              html={renderMarkdown(bodyWithoutTitle(page))}
              onLink={openInApp}
              className="max-w-[68ch] text-lg! leading-7! text-ink [&_h2]:mb-3! [&_h2]:mt-10! [&_h2]:text-xl! [&_h2]:font-bold! [&_h3]:mb-3! [&_h3]:mt-10! [&_h3]:text-xl! [&_h3]:font-bold! [&_li]:my-2!"
            />
          </article>
          <About page={page} shelf={shelf} />
        </Container>
      </div>
    </>
  );
}

function ShelfNav(props: { current: LibraryPage; shelves: Shelf[] }) {
  const [shelfId, setShelfId] = useState(props.current.shelfId);
  const pages = useLibraryPages(null);
  const list = (pages.data ?? []).filter((page) => page.shelfId === shelfId);
  return (
    <nav aria-labelledby="on-shelf" className="flex flex-col gap-4 max-lg:order-last">
      <Eyebrow>
        <span id="on-shelf">{t.onShelf}</span>
      </Eyebrow>
      <div role="group" aria-label={t.shelvesNav} className="flex flex-col gap-1">
        {props.shelves.map((shelf) => (
          <button
            key={shelf.id}
            type="button"
            aria-pressed={shelf.id === shelfId}
            onClick={() => setShelfId(shelf.id)}
            className={cn(
              "flex min-h-11 items-center rounded-full px-4 text-start text-base transition-colors",
              shelf.id === shelfId ? "bg-surface-inverse font-semibold text-ink-inverse" : "font-medium text-ink hover:bg-surface-raised",
            )}
          >
            {shelf.name}
          </button>
        ))}
      </div>
      {pages.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <ul className="m-0 list-none border-t border-line-strong p-0">
          {list.map((page) => {
            const state = pageState(page);
            const current = page.id === props.current.id;
            return (
              <li key={page.id} className="border-b border-line-strong py-3">
                <a href={href({ name: "library-page", pageId: page.id })} aria-current={current ? "page" : undefined} className="flex flex-col text-ink no-underline hover:underline">
                  <span className={cn("text-base", current ? "font-bold" : "font-semibold")}>{page.title}</span>
                  {state.stale ? (
                    <span className="inline-flex items-center gap-1 text-sm font-semibold">
                      <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                      {state.text}
                    </span>
                  ) : (
                    <span className="text-sm text-ink-muted">{dot(t.kind[page.kind], state.text)}</span>
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}

function About(props: { page: LibraryPage; shelf: Shelf | null }) {
  const { page, shelf } = props;
  return (
    <aside aria-labelledby="about-page" className="flex flex-col gap-8">
      <div className="flex flex-col gap-5">
        <Eyebrow>
          <span id="about-page">{t.about}</span>
        </Eyebrow>
        <dl className="m-0 flex flex-col gap-4 text-base">
          {shelf ? (
            <div>
              <dt className="font-semibold text-ink">{t.whoCanRead}</dt>
              <dd className="m-0 text-ink-muted">{readersOf(shelf)}</dd>
            </div>
          ) : null}
          <div>
            <dt className="font-semibold text-ink">{t.ownerLabel}</dt>
            <dd className="m-0 text-ink-muted">{page.owner}</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">{t.basedOn}</dt>
            <dd className="m-0 text-ink-muted">
              {page.sources.length === 0 ? (
                t.noSources
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {page.sources.map((source) => (
                    <li key={source.id}>
                      {source.href?.startsWith("#/") ? (
                        <a href={source.href} className="text-accent hover:text-accent-hover">
                          {source.title}
                        </a>
                      ) : (
                        <span className="text-ink">{source.title}</span>
                      )}
                      <span className="block text-sm">{source.meta}</span>
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">{t.addedBy}</dt>
            <dd className="m-0 text-ink-muted">{dot(page.addedBy, `${t.updated.toLowerCase()} ${relativeTime(page.updatedAt)}`)}</dd>
          </div>
        </dl>
        <LinkArrow href={href({ name: "agent", chatId: null })}>{t.askAbout}</LinkArrow>
        <p className="m-0 text-sm text-ink-muted">{t.editNote}</p>
      </div>

      <section aria-labelledby="page-comments" className="flex flex-col gap-4">
        <Eyebrow>
          <span id="page-comments">{t.comments(page.comments.length)}</span>
        </Eyebrow>
        {page.comments.length === 0 ? (
          <p className="m-0 text-sm text-ink-muted">{t.commentsNone}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {page.comments.map((comment) => (
              <li key={comment.id} className="flex flex-col gap-2 rounded-card bg-surface-raised p-5">
                {comment.anchor ? <blockquote className="m-0 border-s-2 border-ink ps-3 text-sm text-ink-muted">“{comment.anchor}”</blockquote> : null}
                <p className="m-0 text-base text-ink">{comment.text}</p>
                <p className="m-0 text-sm text-ink-muted">{dot(comment.author, relativeTime(comment.at))}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="page-history" className="flex flex-col gap-4">
        <Eyebrow>
          <span id="page-history">{t.historyTitle}</span>
        </Eyebrow>
        {page.history.length === 0 ? (
          <p className="m-0 text-sm text-ink-muted">{t.historyNone}</p>
        ) : (
          <ol className="m-0 list-none border-t border-line-strong p-0">
            {page.history.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="flex flex-col border-b border-line-strong py-3">
                <span className="text-base font-semibold text-ink">{entry.text}</span>
                <span className="text-sm text-ink-muted">{dot(entry.who, shortDay(entry.at))}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </aside>
  );
}
