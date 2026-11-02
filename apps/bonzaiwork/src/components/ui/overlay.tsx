import { useRef, type ReactNode } from "react";
import { X } from "lucide-react";

import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { whenIdle } from "~/lib/idle";
import { lazyModule, useModule } from "~/lib/lazy-module";
import { useOpenedOnce } from "~/lib/use-opened-once";

import { Button } from "./button";

/**
 * Base UI's dialogs, off the first load. Fetched in idle time so the first
 * open is instant, and on that open at the latest.
 */
const dialogs = lazyModule(() => import("@base-ui/react/dialog").then((module) => module.Dialog));
const alerts = lazyModule(() => import("@base-ui/react/alert-dialog").then((module) => module.AlertDialog));
if (typeof window !== "undefined") {
  whenIdle(() => void dialogs.load());
  whenIdle(() => void alerts.load());
}

const BACKDROP =
  "fixed inset-0 z-50 bg-backdrop transition-opacity duration-150 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-100";

/**
 * Centered on desktop, a bottom sheet on phones. Focus is trapped, esc and an
 * outside press close it, focus returns to the trigger (Base UI).
 */
export function Dialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
  initialFocus?: React.RefObject<HTMLElement | null>;
}) {
  // Lists render a dialog per row; none of them costs anything until opened.
  const DialogPrimitive = useModule(dialogs, useOpenedOnce(props.open));
  if (!DialogPrimitive) return null;
  return (
    <DialogPrimitive.Root open={props.open} onOpenChange={(open) => props.onOpenChange(open)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className={BACKDROP} />
        <DialogPrimitive.Popup
          initialFocus={props.initialFocus}
          className={cn(
            "fixed z-50 flex max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-16px))] flex-col overflow-hidden bg-popover text-popover-foreground shadow-shell outline-none transition-[opacity,transform] duration-180 ease-soft data-[ending-style]:duration-100",
            "inset-x-0 bottom-0 rounded-t-window pb-[env(safe-area-inset-bottom)] data-[starting-style]:translate-y-6 data-[starting-style]:opacity-0 data-[ending-style]:translate-y-4 data-[ending-style]:opacity-0",
            "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[12vh] sm:max-h-[84dvh] sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:rounded-window sm:pb-0 sm:data-[starting-style]:translate-y-1 sm:data-[ending-style]:translate-y-0",
            props.size === "lg" ? "sm:max-w-2xl" : "sm:max-w-md",
          )}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-4 pb-2">
            <DialogPrimitive.Title className="text-base font-semibold text-foreground">{props.title}</DialogPrimitive.Title>
            <DialogPrimitive.Close render={<Button variant="quiet" size="icon-sm" aria-label={copy.common.close} />}>
              <X />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-1 pb-5">{props.children}</div>
          {props.footer ? <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border px-5 py-3 sm:flex-row sm:justify-end">{props.footer}</div> : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Confirmation for destructive or external actions only (DESIGN.md P8, P9). */
export function ConfirmDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  busy?: boolean;
  tone?: "danger" | "primary";
}) {
  const AlertPrimitive = useModule(alerts, useOpenedOnce(props.open));
  if (!AlertPrimitive) return null;
  return (
    <AlertPrimitive.Root open={props.open} onOpenChange={(open) => props.onOpenChange(open)}>
      <AlertPrimitive.Portal>
        <AlertPrimitive.Backdrop className={BACKDROP} />
        <AlertPrimitive.Popup className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-window bg-popover p-5 text-popover-foreground shadow-shell outline-none transition-[opacity,transform] duration-150 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-100">
          <AlertPrimitive.Title className="text-base font-semibold">{props.title}</AlertPrimitive.Title>
          <AlertPrimitive.Description className="mt-2 text-sm text-muted-foreground">{props.body}</AlertPrimitive.Description>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertPrimitive.Close render={<Button variant="secondary" />}>{copy.common.cancel}</AlertPrimitive.Close>
            <Button variant={props.tone === "primary" ? "primary" : "danger"} onClick={props.onConfirm} disabled={props.busy}>
              {props.confirmLabel}
            </Button>
          </div>
        </AlertPrimitive.Popup>
      </AlertPrimitive.Portal>
    </AlertPrimitive.Root>
  );
}

/** A panel that slides in from an edge: navigation on phones, the sidecar on small screens. */
export function Sheet(props: { open: boolean; onOpenChange: (open: boolean) => void; side: "left" | "right"; label: string; children: ReactNode; className?: string }) {
  const DialogPrimitive = useModule(dialogs, useOpenedOnce(props.open));
  if (!DialogPrimitive) return null;
  return (
    <DialogPrimitive.Root open={props.open} onOpenChange={(open) => props.onOpenChange(open)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className={BACKDROP} />
        <DialogPrimitive.Popup
          aria-label={props.label}
          className={cn(
            "fixed inset-y-0 z-50 flex w-[min(88vw,340px)] flex-col bg-background shadow-shell outline-none transition-transform duration-200 ease-soft data-[ending-style]:duration-150",
            props.side === "left"
              ? "left-0 pl-[env(safe-area-inset-left)] data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full"
              : "right-0 pr-[env(safe-area-inset-right)] data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full",
            props.className,
          )}
        >
          {props.children}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * A non-modal panel on the right (agenda plan §7.2): no backdrop, no focus trap, no scroll lock, so the
 * page stays usable and the composer stays typable. Opening moves focus into the panel; Esc inside it
 * closes it and focus returns where it was (Base UI). A press elsewhere, focus moving out, or Esc
 * pressed elsewhere (the composer, a permission card) leave it open and reach the page as usual.
 */
export function Panel(props: { open: boolean; onOpenChange: (open: boolean) => void; label: string; children: ReactNode; className?: string; initialFocus?: React.RefObject<HTMLElement | null> }) {
  const DialogPrimitive = useModule(dialogs, useOpenedOnce(props.open));
  const popup = useRef<HTMLDivElement>(null);
  if (!DialogPrimitive) return null;
  return (
    <DialogPrimitive.Root
      open={props.open}
      modal={false}
      disablePointerDismissal
      onOpenChange={(open, details) => {
        if (!open && details.reason === "escape-key") {
          const target = details.event.target;
          if (!(target instanceof Node) || !popup.current?.contains(target)) {
            details.allowPropagation();
            details.cancel();
            return;
          }
        }
        props.onOpenChange(open);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Popup
          ref={popup}
          aria-label={props.label}
          initialFocus={props.initialFocus}
          onKeyDown={(event) => {
            // Window shortcuts of the page (Enter approves a permission card) are not for the panel.
            if (event.key === "Enter") event.stopPropagation();
          }}
          className={cn(
            "fixed inset-y-2 right-2 z-40 flex w-[min(calc(100vw-1rem),360px)] flex-col overflow-hidden rounded-window bg-popover text-popover-foreground shadow-shell outline-none transition-[opacity,transform] duration-180 ease-soft data-[ending-style]:duration-120",
            "data-[starting-style]:translate-x-3 data-[starting-style]:opacity-0 data-[ending-style]:translate-x-2 data-[ending-style]:opacity-0",
            props.className,
          )}
        >
          {props.children}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
