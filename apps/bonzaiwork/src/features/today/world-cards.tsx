import { useMemo, useState } from "react";
import { CalendarClock, Handshake, Mail, MessagesSquare } from "lucide-react";

import { useBackend } from "~/backend/context";
import { useRefreshAttention, useRefreshToday } from "~/backend/queries";
import type { DayItem } from "~/backend/types";
import { ProseHtml } from "~/components/prose-html";
import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Disclosure } from "~/components/ui/disclosure";
import { Textarea } from "~/components/ui/field";
import { Kbd } from "~/components/ui/misc";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { cardKeys } from "~/lib/card-keys";
import { errorText } from "~/lib/errors";
import { relativeTime } from "~/lib/format";
import { renderMarkdown } from "~/lib/markdown";

import { formatDay, meetingTime, minutesUntil } from "./model";

/**
 * The cards of the world in "Voor jou" (docs/bonzaiwork/persoonlijke-agent-plan.md §4): a mail or
 * Slack thread with the agent's draft, an appointment that starts soon with its preparation, and
 * a promise the agent found. They sit on the same Callout shell as the other cards. Nothing is
 * sent before the person presses "Versturen" on the card that shows the exact text (T7, P9).
 */
type CardProps<K extends DayItem["kind"]> = {
  item: Extract<DayItem, { kind: K }>;
  isFocal: boolean;
  onResolved: () => void;
  cardRef: (element: HTMLElement | null) => void;
};

const CARD = "group/card focus:outline-solid focus:outline-2 focus:outline-offset-2 focus:outline-ring";
const FOCUS_PRIMARY = "group-focus-within/card:bg-primary group-focus-within/card:text-primary-foreground group-focus-within/card:ring-0 group-focus-within/card:hover:bg-primary-hover";
const primary = (isFocal: boolean): { variant: "primary" | "secondary"; className?: string } => (isFocal ? { variant: "primary" } : { variant: "secondary", className: FOCUS_PRIMARY });

/** One busy flag per card; a finished action says so in the words of its button (C2) and the card leaves. */
function useWorldAction(onResolved: () => void) {
  const refreshToday = useRefreshToday();
  const refreshAttention = useRefreshAttention();
  const [busy, setBusy] = useState(false);
  const act = async (task: () => Promise<unknown>, done: string | null) => {
    if (busy) return;
    setBusy(true);
    try {
      await task();
      if (done) toast(done);
      onResolved();
      void refreshToday();
      void refreshAttention();
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  return { busy, act };
}

function ExternalLink(props: { url: string; label: string }) {
  const backend = useBackend();
  return (
    <a
      href={props.url}
      onClick={(event) => {
        event.preventDefault();
        void backend.desktop.openUrl(props.url);
      }}
    >
      {props.label}
    </a>
  );
}

function MessageCard(props: CardProps<"message">) {
  const backend = useBackend();
  const { item } = props;
  const { busy, act } = useWorldAction(props.onResolved);
  const [text, setText] = useState(item.draft ?? "");
  // Closed, the card is three lines: who, why, and the start of the draft. The full text and
  // "Versturen" only show together, so nothing is sent unseen (P9).
  const [open, setOpen] = useState(false);
  const source = copy.today.message[item.source];
  const canSend = open && Boolean(item.reply) && text.trim().length > 0;
  const send = () => void act(() => backend.today.send(item.key, text), copy.today.message.sent);
  // Esc sets the card aside for a day; it never throws a message away.
  const later = () => void act(() => backend.today.later(item.key), copy.today.message.laterToast);
  return (
    <Callout
      ref={props.cardRef}
      className={CARD}
      tabIndex={0}
      onKeyDown={cardKeys({ enter: canSend ? send : item.reply && !open ? () => setOpen(true) : undefined, escape: later })}
      keyShortcuts="Enter Escape"
      testId={`attention-world-${item.source}`}
      label={source}
      decision
      icon={item.source === "mail" ? <Mail /> : <MessagesSquare />}
      title={item.title}
      state={
        <>
          {source} {copy.today.message.from(item.from)} · {item.why} <span className="whitespace-nowrap">· {relativeTime(item.at)}</span>
          {item.reply && open ? <span className="block">{item.reply.via === "mail" ? copy.today.message.sendsMail(item.from) : copy.today.message.sendsSlack(item.title)}</span> : null}
          {item.reply && !open && text.trim() ? <span className="block truncate text-foreground">{text.trim().replace(/\s+/g, " ")}</span> : null}
        </>
      }
      actions={
        <>
          {item.reply && open ? (
            <Button {...primary(props.isFocal)} disabled={busy || !canSend} onClick={send} data-testid="world-send">
              {copy.today.message.send}
              <Kbd>⏎</Kbd>
            </Button>
          ) : item.reply ? (
            <Button {...primary(props.isFocal)} disabled={busy} onClick={() => setOpen(true)} data-testid="world-review">
              {copy.today.message.review}
              <Kbd>⏎</Kbd>
            </Button>
          ) : (
            <Button {...primary(props.isFocal)} disabled={busy} onClick={() => void act(() => backend.today.dismiss(item.key), null)}>
              {copy.today.message.seen}
            </Button>
          )}
          <Button variant="ghost" disabled={busy} onClick={later}>
            {copy.today.message.later}
            <Kbd>esc</Kbd>
          </Button>
          {item.reply && open ? (
            <Button variant="ghost" disabled={busy} onClick={() => void act(() => backend.today.dismiss(item.key), null)}>
              {copy.today.message.notMine}
            </Button>
          ) : null}
        </>
      }
      link={item.link ? <ExternalLink url={item.link} label={copy.today.message.open(item.source === "mail" ? "Outlook" : "Slack")} /> : undefined}
    >
      {item.reply && open ? (
        <Textarea
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={Math.min(8, Math.max(3, text.split("\n").length + 1))}
          aria-label={copy.today.message.reply}
          disabled={busy}
          className="mt-3"
          data-testid="world-reply"
        />
      ) : null}
    </Callout>
  );
}

function MeetingCard(props: CardProps<"meeting">) {
  const backend = useBackend();
  const { item } = props;
  const { meeting } = item;
  const { busy, act } = useWorldAction(props.onResolved);
  const html = useMemo(() => (item.prep ? renderMarkdown(item.prep) : null), [item.prep]);
  const seen = () => void act(() => backend.today.dismiss(item.key), null);
  const parts = [meetingTime(meeting) ?? copy.today.allDay, meeting.location, meeting.organizer ? copy.today.meeting.with(meeting.organizer) : null].filter(Boolean);
  return (
    <Callout
      ref={props.cardRef}
      className={CARD}
      tabIndex={0}
      onKeyDown={cardKeys({ enter: seen })}
      keyShortcuts="Enter"
      testId="attention-world-meeting"
      label={copy.today.meeting.label}
      icon={<CalendarClock />}
      title={meeting.title}
      state={
        <>
          {parts.join(" · ")} <span className="whitespace-nowrap">· {copy.today.meeting.startsIn(minutesUntil(meeting.start, Date.now()))}</span>
        </>
      }
      actions={
        <Button {...primary(props.isFocal)} disabled={busy} onClick={seen}>
          {copy.today.meeting.seen}
          <Kbd>⏎</Kbd>
        </Button>
      }
      link={meeting.link ? <ExternalLink url={meeting.link} label={copy.today.meeting.open} /> : undefined}
    >
      {html ? (
        <Disclosure label={copy.today.meeting.prep} size="sm" className="mt-2" panelClassName="ps-6 pt-1">
          <ProseHtml html={html} className="text-sm" />
        </Disclosure>
      ) : null}
    </Callout>
  );
}

function CommitmentCard(props: CardProps<"commitment">) {
  const backend = useBackend();
  const { item } = props;
  const { busy, act } = useWorldAction(props.onResolved);
  const add = () => void act(() => backend.today.accept(item.key), copy.today.commitment.added);
  const ignore = () => void act(() => backend.today.dismiss(item.key), null);
  return (
    <Callout
      ref={props.cardRef}
      className={CARD}
      tabIndex={0}
      onKeyDown={cardKeys({ enter: add, escape: ignore })}
      keyShortcuts="Enter Escape"
      testId="attention-world-commitment"
      label={copy.today.commitment.label}
      decision
      icon={<Handshake />}
      title={item.text}
      state={
        <>
          {item.who === "mine" ? copy.today.commitment.mine(item.person) : copy.today.commitment.theirs(item.person)}
          {item.due ? ` · ${copy.today.due(formatDay(item.due))}` : null} · {copy.today.commitment.source[item.source]}
        </>
      }
      actions={
        <>
          <Button {...primary(props.isFocal)} disabled={busy} onClick={add}>
            {copy.today.commitment.add}
            <Kbd>⏎</Kbd>
          </Button>
          <Button variant="ghost" disabled={busy} onClick={ignore}>
            {copy.today.commitment.ignore}
            <Kbd>esc</Kbd>
          </Button>
        </>
      }
      link={item.link ? <ExternalLink url={item.link} label={copy.today.message.open(item.source === "slack" ? "Slack" : "Outlook")} /> : undefined}
    />
  );
}

export function WorldCard(props: { item: DayItem; isFocal: boolean; onResolved: () => void; cardRef: (element: HTMLElement | null) => void }) {
  const { item, ...rest } = props;
  switch (item.kind) {
    case "message":
      return <MessageCard item={item} {...rest} />;
    case "meeting":
      return <MeetingCard item={item} {...rest} />;
    case "commitment":
      return <CommitmentCard item={item} {...rest} />;
  }
}
