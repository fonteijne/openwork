import type { MouseEvent } from "react";

import { useBackend } from "~/backend/context";
import { cn } from "~/lib/cn";
import { externalLinkHref } from "~/lib/markdown";

/**
 * Sanitized Markdown HTML (from renderMarkdown) whose web links open in the
 * person's browser. A plain `target="_blank"` click reaches the desktop
 * shell's popup handler, which hands http(s) pages to OpenWork's built-in
 * browser pane; BonzaiWork has no such pane, so the click would do nothing.
 */
export function ProseHtml(props: { html: string; className?: string }) {
  const backend = useBackend();

  const open = (event: MouseEvent<HTMLDivElement>) => {
    // Left and middle button only; the right button keeps its context menu.
    if (event.button !== 0 && event.button !== 1) return;
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest("a[href]");
    if (!link || !event.currentTarget.contains(link)) return;
    const url = externalLinkHref(link.getAttribute("href"));
    if (!url) return;
    event.preventDefault();
    void backend.desktop.openUrl(url);
  };

  return (
    <div
      className={cn("bw-prose", props.className)}
      onClick={open}
      onAuxClick={open}
      // Sanitized by renderMarkdown (DOMPurify): model output is untrusted.
      dangerouslySetInnerHTML={{ __html: props.html }}
    />
  );
}
