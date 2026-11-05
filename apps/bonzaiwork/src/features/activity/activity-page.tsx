import { PageHero } from "~/components/io";
import type { ActivityView } from "~/lib/router";

/** Activity log and the sent log (design: Activity). Placeholder until the screen lands. */
export function ActivityPage(props: { view: ActivityView }) {
  return <PageHero documentTitle="Activiteit" title="Activiteit" lead={props.view} />;
}
