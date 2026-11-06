import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

import { cn } from "~/lib/cn";

/**
 * A mail body as the recipient will read it: paragraphs, numbered and bulleted lists, bold.
 * `[[let op: …]]` (a sentence the agent is unsure about) becomes a dashed warning chip; the
 * chip is for the person only and never part of what gets sent. Rendered as React text, so
 * nothing in the draft can inject markup.
 */
export function MailBody(props: { body: string; className?: string; warningLabel: string }) {
  const blocks = props.body
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  return (
    <div className={cn("flex max-w-[68ch] flex-col gap-4 text-lg text-ink", props.className)}>
      {blocks.map((block, index) => {
        const lines = block.split("\n");
        if (lines.every((line) => /^\d+\.\s/.test(line)))
          return (
            <ol key={index} className="m-0 flex list-decimal flex-col gap-3 ps-6">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{inline(line.replace(/^\d+\.\s/, ""), props.warningLabel)}</li>
              ))}
            </ol>
          );
        if (lines.every((line) => /^[-*]\s/.test(line)))
          return (
            <ul key={index} className="m-0 flex list-disc flex-col gap-3 ps-6">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{inline(line.replace(/^[-*]\s/, ""), props.warningLabel)}</li>
              ))}
            </ul>
          );
        return (
          <p key={index} className="m-0 whitespace-pre-line">
            {inline(block, props.warningLabel)}
          </p>
        );
      })}
    </div>
  );
}

/** The dashed chip for a sentence the agent is unsure about. */
export function WarningChip(props: { children: ReactNode; label: string }) {
  return (
    <span className="mt-1.5 inline-flex max-w-full items-start gap-1.5 rounded-[14px] border border-dashed border-ink px-3 py-0.5 align-middle text-[13px] font-semibold leading-5">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        <span className="sr-only">{props.label}: </span>
        {props.children}
      </span>
    </span>
  );
}

function inline(text: string, warningLabel: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /\[\[let op:\s*([^\]]+)\]\]|\*\*([^*]+)\*\*|\+\+([^+]+)\+\+/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index;
    if (at > last) out.push(text.slice(last, at));
    if (match[1] !== undefined) {
      const sentence = match[1].trim();
      out.push(
        <WarningChip key={at} label={warningLabel}>
          {sentence.charAt(0).toUpperCase() + sentence.slice(1)}
        </WarningChip>,
      );
    } else if (match[2] !== undefined) out.push(<strong key={at} className="font-semibold">{match[2]}</strong>);
    else if (match[3] !== undefined) out.push(<span key={at}>{match[3]}</span>);
    last = at + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
