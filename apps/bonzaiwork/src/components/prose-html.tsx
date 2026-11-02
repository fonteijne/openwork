import type { MouseEvent } from "react";

import { useBackend } from "~/backend/context";
import { cn } from "~/lib/cn";
import { externalLinkHref } from "~/lib/markdown";

/**
 * Sanitized Markdown HTML (from renderMarkdown) with its links handled in the
 * app. `onLink` gets the first say (project files open in the side panel and
 * it returns true); web and mail links then open in the person's browser.
 *
 * Without this, a `target="_blank"` click reaches the desktop shell's popup
 * handler, which hands http(s) pages to OpenWork's built-in browser pane;
 * BonzaiWork has no such pane, so the click would do nothing.
 */
export function ProseHtml(props: { html: string; className?: string; onLink?: ((href: string | null) => boolean) | null }) {
  const backend = useBackend();

  const open = (event: MouseEvent<HTMLDivElement>) => {
    // Left and middle button only; the right button keeps its context menu.
    if (event.defaultPrevented || (event.button !== 0 && event.button !== 1)) return;
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest("a[href]");
    if (!link || !event.currentTarget.contains(link)) return;
    const href = link.getAttribute("href");
    if (props.onLink?.(href)) {
      event.preventDefault();
      return;
    }
    const url = externalLinkHref(href);
    if (!url) return;
    event.preventDefault();
    void backend.desktop.openUrl(url);
  };

  return (
    <div
      className={cn("bw-prose", props.className)}
      onClick={open}
      onAuxClick={open}
      // Sanitized by renderMarkdown (DOMPurify): model and file content is untrusted.
      dangerouslySetInnerHTML={{ __html: props.html }}
    />
  );
}
