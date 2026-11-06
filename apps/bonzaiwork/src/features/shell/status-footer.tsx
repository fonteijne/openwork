import { useCockpitStatus } from "~/backend/cockpit-queries";
import { shellCopy } from "~/copy/shell";
import { cn } from "~/lib/cn";
import { href } from "~/lib/router";

/**
 * The status line under every page (design: the dark footer band): Library, the model keys, mail,
 * running work on the left; what is leaving the app on the right. State only, no explanation (P1).
 * An unknown outbound outcome links to the sent log.
 */
export function StatusFooter() {
  const status = useCockpitStatus();
  const data = status.data;
  return (
    <footer aria-label={shellCopy.status.label} className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-8 gap-y-1 bg-surface-inverse px-6 py-3 text-sm text-ink-inverse lg:px-12">
      {data ? (
        <>
          <span>{data.library}</span>
          <span>{data.keys}</span>
          {data.mail ? <span>{data.mail}</span> : null}
          {data.runs ? <span>{data.runs}</span> : null}
          <a
            href={href({ name: "activity", view: "sent" })}
            className={cn("ms-auto text-ink-inverse no-underline hover:underline", data.outboundAlert && "font-semibold")}
          >
            {data.outbound}
          </a>
        </>
      ) : (
        <span className="h-5" aria-hidden="true" />
      )}
    </footer>
  );
}
