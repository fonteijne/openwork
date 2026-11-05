import { PageHero } from "~/components/io";

/** Agent: personal chats (design: Assistant). Placeholder until the screen lands. */
export function AgentPage(props: { chatId: string | null }) {
  return <PageHero documentTitle="Agent" title="Agent" lead={props.chatId ?? undefined} />;
}
