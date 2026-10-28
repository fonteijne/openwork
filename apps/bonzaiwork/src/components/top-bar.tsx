import type { ReactNode } from "react";
import { Menu as MenuIcon } from "lucide-react";

import { copy } from "~/copy";
import { useUi } from "~/features/shell/ui-store";
import { cn } from "~/lib/cn";

import { Button } from "./ui/button";

/** The 48px bar on top of every page. On phones it carries the menu button. */
export function TopBar(props: { children?: ReactNode; actions?: ReactNode; className?: string; leading?: ReactNode }) {
  const setDrawer = useUi((state) => state.setDrawer);
  return (
    <header className={cn("flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 pt-[env(safe-area-inset-top)] lg:px-4", props.className)} data-titlebar="page">
      {props.leading ?? (
        <Button variant="quiet" size="icon" className="-ms-1 lg:hidden" aria-label={copy.nav.openMenu} onClick={() => setDrawer(true)}>
          <MenuIcon />
        </Button>
      )}
      <div className="flex min-w-0 flex-1 items-center gap-2">{props.children}</div>
      {props.actions ? <div className="flex shrink-0 items-center gap-1">{props.actions}</div> : null}
    </header>
  );
}

export function PageTitle(props: { children: ReactNode }) {
  return <h1 className="truncate text-sm font-semibold text-foreground">{props.children}</h1>;
}
