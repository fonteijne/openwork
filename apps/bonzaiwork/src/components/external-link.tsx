import { useBackend } from "~/backend/context";
import { openableLink } from "~/backend/types";
import { toast } from "~/components/ui/toast";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";

/**
 * A link that opens in the person's own browser (or the app behind it, like Slack).
 *
 * It is a button that looks like a link, on purpose: the desktop shell takes over every click on
 * an `<a href="https://…">` and hands the page to OpenWork's built-in browser pane, which
 * BonzaiWork does not have, so such a link did nothing. A button never reaches that handler and
 * goes straight to the shell's `openExternal`. Renders nothing for an address that is not a web
 * page (no `slack://`, no made-up text), and says so in a toast when the page does not open.
 */
export function ExternalLink(props: { url: string | null | undefined; label: string; /** What a screen reader hears when `label` alone says too little ("Openen"). */ ariaLabel?: string; className?: string }) {
  const backend = useBackend();
  const url = openableLink(props.url);
  if (!url) return null;
  return (
    <button
      type="button"
      title={url}
      aria-label={props.ariaLabel}
      onClick={() => backend.desktop.openUrl(url).catch((failure: unknown) => toast(errorText(failure), { tone: "error" }))}
      className={cn(
        "cursor-pointer rounded-sm text-start underline-offset-2 hover:underline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        props.className,
      )}
    >
      {props.label}
    </button>
  );
}
