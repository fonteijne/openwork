import { Check, FileText, Library, ListChecks, Scale, TriangleAlert, Wrench } from "lucide-react";

import type { LibraryPage } from "~/backend/cockpit";
import { useCockpit, useLibraryPages, useShelves } from "~/backend/cockpit-queries";
import { Band, LinkArrow, PageHero, RowItem, Rows, SectionTitle, Tag, dot } from "~/components/io";
import { EmptyState, Skeleton } from "~/components/ui/misc";
import { libraryCopy as t } from "~/copy/library";
import { cn } from "~/lib/cn";
import { href } from "~/lib/router";

import { ButtonLink } from "./button-link";
import { LibraryLocked, ShelfIcon, pageState } from "./shared";

const KIND_ICON = { note: FileText, decision: Scale, checklist: ListChecks, howto: Wrench } as const;

/** One shelf: who sees it, and its pages with their owner and whether they are still current. */
export function ShelfPage(props: { shelfId: string }) {
  const cockpit = useCockpit();
  if (cockpit.capabilities.library !== null) return <LibraryLocked reason={cockpit.capabilities.library} />;
  return <Shelf shelfId={props.shelfId} />;
}

function Shelf(props: { shelfId: string }) {
  const shelves = useShelves();
  const pages = useLibraryPages(props.shelfId);
  const shelf = shelves.data?.find((candidate) => candidate.id === props.shelfId) ?? null;

  if (shelves.isPending)
    return (
      <div className="mx-auto flex max-w-[1360px] flex-col gap-6 px-6 py-16 lg:px-12" aria-label={t.loading}>
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-14 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (!shelf)
    return (
      <div className="px-6 py-16">
        <EmptyState
          icon={<Library />}
          title={t.shelfNotFound}
          body={t.shelfNotFoundBody}
          action={
            <ButtonLink href={href({ name: "library" })} arrow>
              {t.backToLibrary}
            </ButtonLink>
          }
        />
      </div>
    );

  const others = (shelves.data ?? []).filter((candidate) => candidate.id !== shelf.id);
  const list = pages.data ?? [];

  return (
    <>
      <PageHero
        documentTitle={shelf.name}
        tag={<Tag>{shelf.tag}</Tag>}
        eyebrow={
          <>
            <a href={href({ name: "library" })} className="text-inherit no-underline hover:text-ink">
              {t.title}
            </a>
            {" · "}
            {t.shelfEyebrow}
          </>
        }
        title={
          <span className="inline-flex items-center gap-4">
            <ShelfIcon audience={shelf.audience} className="size-10 shrink-0 sm:size-12" />
            {shelf.name}
          </span>
        }
        lead={shelf.description}
      />
      <Band tone="alt" label={shelf.name}>
        <SectionTitle title={t.shelfPages(list.length)} />
        {pages.isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : list.length === 0 ? (
          <EmptyState
            title={t.shelfEmpty}
            body={t.shelfEmptyBody}
            action={
              <ButtonLink href={href({ name: "delegate", todoId: null })} arrow>
                {t.shelfEmptyAction}
              </ButtonLink>
            }
          />
        ) : (
          <Rows>
            {list.map((page) => (
              <PageRow key={page.id} page={page} />
            ))}
          </Rows>
        )}
        {others.length > 0 ? (
          <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-3">
            <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-muted">{t.otherShelves}</span>
            {others.map((other) => (
              <LinkArrow key={other.id} href={href({ name: "library-shelf", shelfId: other.id })}>
                {other.name}
              </LinkArrow>
            ))}
          </div>
        ) : null}
      </Band>
    </>
  );
}

function PageRow(props: { page: LibraryPage }) {
  const { page } = props;
  const Icon = KIND_ICON[page.kind];
  const state = pageState(page);
  return (
    <RowItem
      href={href({ name: "library-page", pageId: page.id })}
      className="flex-wrap px-2"
      leading={<Icon className="size-5 text-ink" strokeWidth={1.5} aria-hidden="true" />}
      title={page.title}
      meta={dot(t.kind[page.kind], t.owner(page.owner))}
      trailing={
        <span className={cn("inline-flex items-center gap-1.5 text-sm font-semibold", state.stale ? "text-ink" : page.verified ? "text-success" : "text-ink-muted")}>
          {state.stale ? <TriangleAlert className="size-4" aria-hidden="true" /> : page.verified ? <Check className="size-4" aria-hidden="true" /> : null}
          {state.text}
        </span>
      }
    />
  );
}
