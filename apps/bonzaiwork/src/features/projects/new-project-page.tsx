import { PageHero } from "~/components/io";

/** New project, from a chat or blank (design: New project). Placeholder until the screen lands. */
export function NewProjectPage(props: { fromProjectId: string | null; fromChatId: string | null }) {
  return <PageHero documentTitle="Nieuw project" title="Nieuw project" lead={props.fromChatId ?? props.fromProjectId ?? undefined} />;
}
