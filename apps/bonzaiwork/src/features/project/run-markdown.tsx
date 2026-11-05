import { ProseHtml } from "~/components/prose-html";
import { cn } from "~/lib/cn";
import { renderMarkdown } from "~/lib/markdown";

import { markRunText } from "./run-marks";

/**
 * Run artifacts carry two markers: `[[let op: …]]` for a sentence the agent is unsure about, and
 * `++…++` for what was added since the last version. They become a small dashed warning chip and
 * an underlined addition; everything else is plain Markdown through the sanitizer.
 */

export function RunMarkdown(props: { source: string; className?: string }) {
  return (
    <ProseHtml
      html={renderMarkdown(markRunText(props.source))}
      className={cn(
        "text-base text-ink",
        "[&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-base [&_h3]:font-semibold [&_h3:first-child]:mt-0",
        "[&_table]:w-full [&_table]:border-collapse [&_th]:border-b [&_th]:border-line-strong [&_th]:py-2 [&_th]:text-start [&_th]:font-medium [&_th]:text-ink-muted [&_td]:border-b [&_td]:border-line [&_td]:py-2 [&_th:last-child]:text-end [&_td:last-child]:text-end",
        "[&_mark]:inline-flex [&_mark]:items-center [&_mark]:gap-1 [&_mark]:rounded-full [&_mark]:border [&_mark]:border-dashed [&_mark]:border-ink [&_mark]:bg-transparent [&_mark]:px-2.5 [&_mark]:py-0.5 [&_mark]:text-sm [&_mark]:font-semibold [&_mark]:text-ink [&_mark]:before:content-['⚠']",
        "[&_ins]:underline [&_ins]:decoration-2 [&_ins]:underline-offset-4",
        props.className,
      )}
    />
  );
}
