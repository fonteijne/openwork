import type { MouseEvent } from "react";

import { useBackend } from "~/backend/context";
import { toast } from "~/components/ui/toast";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { EXTERNAL_HREF_ATTR, externalLinkHref } from "~/lib/markdown";

/**
 * Sanitized Markdown HTML (from renderMarkdown) with its links handled in the
 * app. `onLink` gets the first say (project files open in the side panel and
 * it returns true); web and mail links then open in the person's browser.
 *
 * Web links (`data-external-href`, set by renderMarkdown) never reach the desktop
 * shell: it takes over every click on an `<a href="https://…">` and hands the page
 * to OpenWork's built-in browser pane, which BonzaiWork does not have, so the click
 * would do nothing. They open in the person's own browser instead.
 */
export function ProseHtml(props: { html: string; className?: string; onLink?: ((href: string | null) => boolean) | null }) {
  const backend = useBackend();

  const open = (event: MouseEvent<HTMLDivElement>) => {
    // Left and middle button only; the right button keeps its context menu.
    if (event.defaultPrevented || (event.button !== 0 && event.button !== 1)) return;
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest("a[href]");
    if (!link || !event.currentTarget.contains(link)) return;
    const web = link.getAttribute(EXTERNAL_HREF_ATTR);
    if (web) {
      event.preventDefault();
      backend.desktop.openUrl(web).catch((failure: unknown) => toast(errorText(failure), { tone: "error" }));
      return;
    }
    const href = link.getAttribute("href");
    if (props.onLink?.(href)) {
      event.preventDefault();
      return;
    }
    const url = externalLinkHref(href);
    if (!url) return;
    event.preventDefault();
    backend.desktop.openUrl(url).catch((failure: unknown) => toast(errorText(failure), { tone: "error" }));
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
