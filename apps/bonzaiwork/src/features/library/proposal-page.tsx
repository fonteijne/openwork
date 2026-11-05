import { PageHero } from "~/components/io";

/** A Library change to review (design: Proposal). Placeholder until the screen lands. */
export function ProposalPage(props: { proposalId: string }) {
  return <PageHero documentTitle={props.proposalId} title={props.proposalId} />;
}
