import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "~/lib/cn";

import { Chip } from "./chip";

export type CalloutProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  /** Leading 16px lucide icon; the slot tints with the tone. */
  icon: ReactNode;
  /** The one bold sentence: what will happen, to what (P9). */
  title: ReactNode;
  /** A command or file name, verbatim in mono ("rm -rf dist", "prijslijst-2027.md"). */
  chip?: ReactNode;
  /** One state line naming action · data · risk ("Schrijft prijslijst-2027.md · terug te draaien"). */
  state?: ReactNode;
  /** Buttons with their Kbd chords; the first is the primary. */
  actions?: ReactNode;
  /** A real link at the end of the actions row ("Chat openen"). */
  link?: ReactNode;
  /** A decision is open: amber ring, and the card is the focal element (T4). */
  decision?: boolean;
  /** `failure` draws a red hairline (C5: red is for failures only); `neutral` the plain card ring. */
  tone?: "neutral" | "failure";
  /** Names the card for assistive tech ("Toestemming", "Vraag van de agent"). */
  label: string;
  /** Extra content under the state line (RadioCards, a text field). */
  children?: ReactNode;
  testId?: string;
};

/**
 * The one card shell for permission, question, brain, proposal and routine-attention objects
 * (brief §12; DESIGN.md T4, P9, S1): icon, bold sentence, optional mono chip, one state line,
 * an actions row with chords, an optional link. Only an open decision gets the amber ring; a
 * failure a red hairline; everything else the plain card ring. Key chords belong to the card
 * element: pass `tabIndex` and `onKeyDown` and they apply here, never on `window` (brief §4).
 */
export const Callout = forwardRef<HTMLElement, CalloutProps>(function Callout(
  { icon, title, chip, state, actions, link, decision, tone = "neutral", label, children, testId, className, ...rest },
  ref,
) {
  return (
    <section
      ref={ref}
      aria-label={label}
      data-testid={testId}
      data-decision={decision ? "" : undefined}
      data-tone={tone}
      className={cn(
        "bw-enter rounded-window bg-background p-5 text-foreground ring-1 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        decision ? "ring-amber-9/60" : tone === "failure" ? "ring-red-9/60" : "ring-border",
        className,
      )}
      {...rest}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full [&_svg]:size-4",
            tone === "failure" ? "bg-red-3 text-red-11" : decision ? "bg-electric-3 text-electric-11" : "bg-muted text-muted-foreground",
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug text-foreground">
            {title}
            {chip ? (
              <>
                {" "}
                <Chip mono className="align-[-2px]">
                  {chip}
                </Chip>
              </>
            ) : null}
          </p>
          {state ? <p className="mt-0.5 text-sm text-muted-foreground">{state}</p> : null}
          {children ? <div className="mt-3">{children}</div> : null}
          {actions || link ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {actions}
              {link ? <span className="ms-auto text-sm font-medium text-electric-11 [&_a]:underline-offset-2 [&_a:hover]:underline">{link}</span> : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
});
