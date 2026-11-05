import { createContext, useContext, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PanelRight } from "lucide-react";

import { copy } from "~/copy";
import { useUi } from "~/features/shell/ui-store";
import { cn } from "~/lib/cn";
import { chord } from "~/lib/shortcuts";
import { useMediaQuery, WIDE } from "~/lib/use-media";

import { Button } from "./ui/button";
import { Tooltip } from "./ui/tooltip";

/**
 * A page rendered inside another page's header (a project tab) has no bar of its own: its leading
 * control and actions go into the host's slots instead, so the screen keeps one 48px bar.
 */
export type TopBarHostSlots = { leading: HTMLElement | null; actions: HTMLElement | null };
export const TopBarHost = createContext<TopBarHostSlots | null>(null);

/**
 * The 48px bar on top of every page (brief §4). The title is the focal element (P7); on the right at
 * most two page actions and, on project pages, the labelled "Details" toggle. Phones get the menu
 * button on the left; a collapsed desktop sidebar gets the same button to bring it back.
 */
export function TopBar(props: { children?: ReactNode; actions?: ReactNode; className?: string; leading?: ReactNode; details?: boolean }) {
  const host = useContext(TopBarHost);

  if (host) {
    return (
      <>
        {host.leading && props.leading ? createPortal(props.leading, host.leading) : null}
        {host.actions && props.actions ? createPortal(props.actions, host.actions) : null}
      </>
    );
  }

  // The cockpit's top navigation sits above every page; this is the page's own slim header row.
  return (
    <header className={cn("flex min-h-16 shrink-0 items-center gap-3 border-b border-line bg-surface px-6 lg:px-12", props.className)}>
      {props.leading}
      <div className="flex min-w-0 flex-1 items-center gap-2">{props.children}</div>
      <div className="flex shrink-0 items-center gap-2">
        {props.actions}
        {props.details ? <DetailsToggle /> : null}
      </div>
    </header>
  );
}

/** "Details" (⌘\): the column on a wide screen, the panel or sheet below that (brief §6). */
export function DetailsToggle() {
  const wide = useMediaQuery(WIDE);
  const pinned = useUi((state) => state.sidecarPinned);
  const sheetOpen = useUi((state) => state.sidecarSheetOpen);
  const toggle = useUi((state) => state.toggleDetails);
  const open = wide ? pinned : sheetOpen;
  return (
    <Tooltip label={open ? copy.shell.detailsHide : copy.shell.detailsShow} shortcut={chord("details")} side="bottom">
      <Button variant="quiet" size="sm" aria-pressed={open} aria-label={open ? copy.shell.detailsHide : copy.shell.detailsShow} onClick={() => toggle(wide)} className={cn("gap-1.5", open && "bg-active text-foreground")}>
        <PanelRight />
        <span className="max-sm:sr-only">{copy.shell.details}</span>
      </Button>
    </Tooltip>
  );
}

/** The window title follows the page ("Vandaag · BonzaiWork"), so a screen reader hears where it is. */
export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    document.title = title ? `${title} · ${copy.appName}` : copy.appName;
  }, [title]);
}

/**
 * The page heading a route change moves focus to when nothing else holds it (the drawer's trigger
 * unmounted with the old page): `data-page-title`, focusable by script only (tabIndex -1).
 */
export const PAGE_TITLE = "[data-page-title]";
/** A heading is not a control: focus put there by script draws no ring (it only tells assistive tech where it is). */
export const PAGE_TITLE_FOCUS = "outline-none";

/** 22px/600: the title of a page header row. */
export function PageTitle(props: { children: ReactNode }) {
  useDocumentTitle(typeof props.children === "string" ? props.children : null);
  return (
    <h1 tabIndex={-1} data-page-title="" className={cn("truncate text-xl font-semibold tracking-tight text-foreground", PAGE_TITLE_FOCUS)}>
      {props.children}
    </h1>
  );
}
