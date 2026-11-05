import { PageHero } from "~/components/io";

/** One Library shelf. Placeholder until the screen lands. */
export function ShelfPage(props: { shelfId: string }) {
  return <PageHero documentTitle={props.shelfId} title={props.shelfId} />;
}
