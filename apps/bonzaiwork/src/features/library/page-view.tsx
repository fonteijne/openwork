import { PageHero } from "~/components/io";

/** A Library page (design: Library page). Placeholder until the screen lands. */
export function LibraryPageView(props: { pageId: string }) {
  return <PageHero documentTitle={props.pageId} title={props.pageId} />;
}
