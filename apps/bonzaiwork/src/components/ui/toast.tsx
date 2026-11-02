import { useEffect, useMemo, useSyncExternalStore } from "react";
import { X } from "lucide-react";

import { copy } from "~/copy";
import { useIdleReady } from "~/lib/idle";
import { lazyModule, useModule } from "~/lib/lazy-module";
import { recordError } from "~/lib/recent-errors";

type ToastApi = typeof import("@base-ui/react/toast").Toast;
type ToastManager = ReturnType<ToastApi["createToastManager"]>;
type ToastInput = Parameters<ToastManager["add"]>[0];

/** Base UI's toasts, off the first load: fetched in idle time, or by the first toast. */
const primitives = lazyModule(() => import("@base-ui/react/toast").then((module) => module.Toast));

/** Set once the toast viewport listens; toasts from before that wait in `queued`. */
let manager: ToastManager | null = null;
const queued: ToastInput[] = [];
const listeners = new Set<() => void>();

/**
 * One toast manager for the app, callable outside React. Toasts confirm an
 * action in the same words as its button (C2) and carry Undo where possible
 * (P8: undo over confirm).
 */
export function toast(title: string, options: { action?: { label: string; onClick: () => void }; tone?: "error" } = {}) {
  if (options.tone === "error") recordError(`toast: ${title}`);
  const input: ToastInput = {
    title,
    type: options.tone,
    timeout: options.action ? 6_000 : 3_500,
    priority: options.tone === "error" ? "high" : "low",
    actionProps: options.action ? { children: options.action.label, onClick: options.action.onClick } : undefined,
  };
  if (manager) return void manager.add(input);
  queued.push(input);
  for (const listener of listeners) listener();
}

function useWaitingToasts(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => queued.length > 0,
  );
}

function ToastList(props: { api: ToastApi }) {
  const ToastPrimitive = props.api;
  const { toasts } = ToastPrimitive.useToastManager();
  return toasts.map((item) => (
    <ToastPrimitive.Root
      key={item.id}
      toast={item}
      className="pointer-events-auto flex w-full items-center gap-3 rounded-2xl bg-ink-12 py-2 ps-4 pe-1.5 text-sm text-ink-1 shadow-shell transition-[opacity,transform] duration-180 ease-soft data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-100 data-[type=error]:bg-red-11 sm:w-auto sm:min-w-72 dark:bg-ink-5 dark:text-ink-12"
    >
      <ToastPrimitive.Title className="min-w-0 flex-1" />
      <ToastPrimitive.Action className="h-7 shrink-0 rounded-full px-3 text-sm font-semibold text-electric-on-ink hover:bg-white/10" />
      <ToastPrimitive.Close className="flex size-7 shrink-0 items-center justify-center rounded-full text-ink-9 hover:bg-white/10 hover:text-ink-1 dark:hover:text-ink-12" aria-label={copy.common.close}>
        <X className="size-4" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  ));
}

function ToastHost() {
  const idle = useIdleReady();
  const waiting = useWaitingToasts();
  const ToastPrimitive = useModule(primitives, idle || waiting);
  const local = useMemo(() => ToastPrimitive?.createToastManager() ?? null, [ToastPrimitive]);

  useEffect(() => {
    // The viewport below subscribed in its own (earlier) effect: from here on toasts go straight in.
    if (!local) return;
    manager = local;
    for (const input of queued.splice(0)) local.add(input);
  }, [local]);

  if (!ToastPrimitive || !local) return null;
  return (
    <ToastPrimitive.Provider toastManager={local} limit={3}>
      <ToastPrimitive.Portal>
        <ToastPrimitive.Viewport className="pointer-events-none fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-[60] flex flex-col items-stretch gap-2 outline-none sm:inset-x-auto sm:right-4 sm:bottom-4 sm:items-end">
          <ToastList api={ToastPrimitive} />
        </ToastPrimitive.Viewport>
      </ToastPrimitive.Portal>
    </ToastPrimitive.Provider>
  );
}

export function ToastProvider(props: { children: React.ReactNode }) {
  return (
    <>
      {props.children}
      <ToastHost />
    </>
  );
}
