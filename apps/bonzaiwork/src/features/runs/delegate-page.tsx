import { PageHero } from "~/components/io";

/** Delegate: a brief for a run (design: Delegate). Placeholder until the screen lands. */
export function DelegatePage(props: { todoId: string | null }) {
  return <PageHero documentTitle="Delegeren" title="Delegeren" lead={props.todoId ?? undefined} />;
}
