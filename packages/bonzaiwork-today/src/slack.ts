/**
 * What a card needs from Slack that the agent cannot be trusted to write: a sender the person can
 * read and a link that opens the message. Pure, so the UI uses the same checks on cards that were
 * stored before the server checked them.
 */

/** A Slack member id as the API gives it (`U020WN463K3`, `W…`; always with a digit), bare or as a mention (`<@U…>`, `@U…`). */
const MEMBER_ID = /^<?@?[UW](?=[A-Z0-9]*\d)[A-Z0-9]{6,}(?:\|[^>]*)?>?$/;

export function isSlackMemberId(value: string): boolean {
  return MEMBER_ID.test(value.trim());
}

/** A web address the person's browser can open: http(s) only, so no `slack://` that needs the desktop app. */
export function openableLink(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/** True for an address on Slack itself (`slack.com` or a workspace such as `team.slack.com`). */
export function isSlackWebLink(value: string): boolean {
  const link = openableLink(value);
  if (!link) return false;
  const host = new URL(link).hostname.toLowerCase();
  return host === "slack.com" || host.endsWith(".slack.com");
}

/** The workspace host of the first message link in a text (`team.slack.com/archives/…`), lower case. */
const WORKSPACE_LINK = /https:\/\/([a-z0-9][a-z0-9-]*(?:\.enterprise)?\.slack\.com)\/archives\//i;

export function slackWorkspaceIn(text: string): string | null {
  return WORKSPACE_LINK.exec(text)?.[1]?.toLowerCase() ?? null;
}

/** Channel and timestamp from a message id as the agent gives it: `C0123:1700000000.000100` (also `/` or a space). */
export function parseSlackMessageId(id: string): { channel: string; ts: string } | null {
  const found = /^([CDG][A-Z0-9]+)[:/ ](\d+\.\d+)$/.exec(id.trim());
  return found?.[1] && found[2] ? { channel: found[1], ts: found[2] } : null;
}

/**
 * The message's permalink as Slack itself writes it: `https://team.slack.com/archives/C…/p<ts without the dot>`,
 * with the thread when the message is a reply in one.
 */
export function slackPermalink(workspace: string, channel: string, ts: string, threadTs: string | null): string {
  const base = `https://${workspace}/archives/${encodeURIComponent(channel)}/p${ts.replace(".", "")}`;
  return threadTs && threadTs !== ts ? `${base}?thread_ts=${encodeURIComponent(threadTs)}&cid=${encodeURIComponent(channel)}` : base;
}
