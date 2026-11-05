import { PageHero } from "~/components/io";

/** Approval sheet, R4 and R3 (design: Approval, ApprovalR3). Placeholder until the screen lands. */
export function ApprovalPage(props: { approvalId: string }) {
  return <PageHero documentTitle={props.approvalId} title={props.approvalId} />;
}
