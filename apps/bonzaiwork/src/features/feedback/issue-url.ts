/**
 * The prefilled GitHub form a feedback report opens (docs/bonzaiwork/feedback.md).
 * Field ids match .github/ISSUE_TEMPLATE/bonzaiwork-bug.yml and
 * bonzaiwork-idee.yml; GitHub fills issue-form fields from same-named query
 * parameters. Logs never travel in the URL: they go in logs.txt.
 */

export type FeedbackCategory = "bug" | "idea";

export const FEEDBACK_REPO = String(import.meta.env.VITE_BONZAIWORK_FEEDBACK_REPO ?? "").trim() || "fonteijne/openwork";

const TEMPLATES: Record<FeedbackCategory, string> = { bug: "bonzaiwork-bug.yml", idea: "bonzaiwork-idee.yml" };
const TITLE_LIMIT = 80;
// GitHub cuts long URLs; the description stays well under that.
const MESSAGE_LIMIT = 2_000;

export function issueTitle(message: string): string {
  const first = message.split("\n").map((line) => line.replace(/\s+/g, " ").trim()).find(Boolean) ?? "";
  if (!first) return "Feedback";
  return first.length > TITLE_LIMIT ? `${first.slice(0, TITLE_LIMIT - 1).trimEnd()}…` : first;
}

export function issueUrl(input: { repo?: string; category: FeedbackCategory; message: string; environment: string }): string {
  const url = new URL(`https://github.com/${input.repo ?? FEEDBACK_REPO}/issues/new`);
  const message = input.message.trim();
  url.searchParams.set("template", TEMPLATES[input.category]);
  url.searchParams.set("title", issueTitle(message));
  url.searchParams.set("beschrijving", message.length > MESSAGE_LIMIT ? `${message.slice(0, MESSAGE_LIMIT)}…` : message);
  url.searchParams.set("omgeving", input.environment);
  return url.toString();
}
