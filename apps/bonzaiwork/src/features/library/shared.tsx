import { Globe, User, Users } from "lucide-react";

import type { LibraryPage, Shelf } from "~/backend/cockpit";
import { LockedNote, PageHero } from "~/components/io";
import { libraryCopy as t } from "~/copy/library";

import { shortDay } from "../approvals/format";

/** Person, team or everyone: the shelf's audience as an icon (with the shelf name next to it). */
export function ShelfIcon(props: { audience: Shelf["audience"]; className?: string }) {
  const Icon = props.audience === "personal" ? User : props.audience === "team" ? Users : Globe;
  return <Icon className={props.className ?? "size-7"} strokeWidth={1.5} aria-hidden="true" />;
}

/** Who can read a page on this shelf. */
export function readersOf(shelf: Shelf): string {
  return shelf.audience === "personal" ? t.readersPersonal : shelf.audience === "team" ? t.readersTeam(shelf.name) : t.readersEveryone;
}

/** "Checklist · gecontroleerd 4 nov", or the stale reason. */
export function pageState(page: LibraryPage): { stale: boolean; text: string } {
  if (page.stale) return { stale: true, text: page.stale.charAt(0).toUpperCase() + page.stale.slice(1) };
  if (page.verified) return { stale: false, text: t.verifiedShort(shortDay(page.verified.at)) };
  return { stale: false, text: t.notVerified };
}

/** The Library cannot work here (live without the Library routes): what it is, why, who can change it. */
export function LibraryLocked(props: { reason: string }) {
  return (
    <>
      <PageHero documentTitle={t.title} eyebrow={t.title} title={t.locked} lead={t.lead} />
      <div className="mx-auto max-w-[1360px] px-6 pb-16 lg:px-12">
        <LockedNote title={t.locked}>{props.reason}</LockedNote>
      </div>
    </>
  );
}
