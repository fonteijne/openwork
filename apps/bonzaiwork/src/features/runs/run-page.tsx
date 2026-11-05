import { PageHero } from "~/components/io";

/** Run detail, stage review and recovery (design: Run detail, Recovery). Placeholder until the screen lands. */
export function RunPage(props: { runId: string }) {
  return <PageHero documentTitle={props.runId} title={props.runId} />;
}
