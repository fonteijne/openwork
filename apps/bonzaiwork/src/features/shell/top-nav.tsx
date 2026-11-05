import { useState, type ReactNode } from "react";
import { Activity, CircleHelp, Clock, Info, Keyboard, Megaphone, Menu as MenuIcon, Search, SlidersHorizontal } from "lucide-react";

import { useBackend } from "~/backend/context";
import { useInbox, useNeedsYou } from "~/backend/cockpit-queries";
import { BrandMark } from "~/components/brand";
import { Tag } from "~/components/io";
import { Kbd } from "~/components/ui/misc";
import { Menu, MenuItem, MenuSeparator } from "~/components/ui/menu";
import { Sheet } from "~/components/ui/overlay";
import { Tooltip } from "~/components/ui/tooltip";
import { copy } from "~/copy";
import { shellCopy } from "~/copy/shell";
import { cn } from "~/lib/cn";
import { href, navigate, type Route } from "~/lib/router";
import { chord } from "~/lib/shortcuts";
import { useMediaQuery, WIDE } from "~/lib/use-media";

import { useUi } from "./ui-store";

export type NavSection = "today" | "agent" | "inbox" | "projects" | "runs" | "library" | "activity" | "settings" | null;

/** Which top-level section a route belongs to: the underlined nav item. */
export function navSection(route: Route): NavSection {
  switch (route.name) {
    case "home":
    case "plan":
    case "delegate":
    case "approval":
      return "today";
    case "agent":
    case "brain":
      return "agent";
    case "inbox":
      return "inbox";
    case "runs":
    case "run":
    case "routines":
      return "runs";
    case "library":
    case "library-shelf":
    case "library-page":
    case "library-proposal":
      return "library";
    case "activity":
      return "activity";
    case "settings":
      return "settings";
    case "not-found":
    case "onboarding":
      return null;
    default:
      return "projects";
  }
}

type NavItem = { section: Exclude<NavSection, null | "activity" | "settings">; label: string; route: Route; count?: number; countLabel?: string };

function useNavItems(): NavItem[] {
  const needsYou = useNeedsYou();
  const inbox = useInbox();
  const decisions = needsYou.data?.length ?? 0;
  const toSort = inbox.data?.length ?? 0;
  return [
    { section: "today", label: shellCopy.nav.today, route: { name: "home" }, count: decisions, countLabel: shellCopy.nav.todayBadge(decisions) },
    { section: "agent", label: shellCopy.nav.agent, route: { name: "agent", chatId: null } },
    { section: "inbox", label: shellCopy.nav.inbox, route: { name: "inbox" }, countLabel: toSort > 0 ? shellCopy.nav.inboxBadge(toSort) : undefined },
    { section: "projects", label: shellCopy.nav.projects, route: { name: "projects" } },
    { section: "runs", label: shellCopy.nav.runs, route: { name: "runs" } },
    { section: "library", label: shellCopy.nav.library, route: { name: "library" } },
  ];
}

function Count(props: { value: number }) {
  return (
    <span aria-hidden="true" className="inline-flex size-5 items-center justify-center rounded-full bg-ink text-[11px] font-bold tabular-nums leading-none text-surface">
      {props.value}
    </span>
  );
}

function NavLink(props: { item: NavItem; active: boolean; onNavigate?: () => void; stacked?: boolean }) {
  const { item } = props;
  return (
    <a
      href={href(item.route)}
      onClick={props.onNavigate}
      aria-current={props.active ? "page" : undefined}
      aria-label={item.count ? item.countLabel : undefined}
      className={cn(
        "inline-flex items-center gap-2 text-base font-medium text-ink no-underline transition-[border-color] duration-200",
        props.stacked ? "min-h-12 w-full rounded-[10px] px-4 hover:bg-hover aria-[current=page]:bg-surface-alt aria-[current=page]:font-semibold" : "border-b-2 border-transparent py-2 hover:border-ink aria-[current=page]:border-ink",
      )}
    >
      {item.label}
      {item.count ? <Count value={item.count} /> : null}
    </a>
  );
}

/** A 44px round icon button; solid ink when its page is open (the design's Activity and Settings). */
function RoundLink(props: { route: Route; label: string; active: boolean; icon: ReactNode }) {
  return (
    <Tooltip label={props.label} side="bottom">
      <a
        href={href(props.route)}
        aria-label={props.label}
        aria-current={props.active ? "page" : undefined}
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-full text-ink transition-colors duration-200 [&_svg]:size-5",
          props.active ? "bg-ink text-surface" : "hover:bg-hover",
        )}
      >
        {props.icon}
      </a>
    </Tooltip>
  );
}

function AccountMenu() {
  const wide = useMediaQuery(WIDE);
  const setShortcuts = useUi((state) => state.setShortcuts);
  const setFeedback = useUi((state) => state.setFeedback);
  const toggleAgenda = useUi((state) => state.toggleAgenda);
  return (
    <Menu
      align="end"
      trigger={
        <button type="button" aria-label={shellCopy.nav.account} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-base font-bold text-surface">
          {shellCopy.nav.you.slice(0, 1)}
        </button>
      }
    >
      <MenuItem icon={<Clock />} shortcut={chord("agenda")} onClick={() => toggleAgenda(wide)}>
        {shellCopy.nav.agenda}
      </MenuItem>
      <MenuItem icon={<SlidersHorizontal />} onClick={() => navigate({ name: "settings", group: "weergave" })}>
        {shellCopy.nav.theme}
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={<Keyboard />} shortcut={chord("shortcuts")} onClick={() => setShortcuts(true)}>
        {copy.shell.shortcutsTitle}
      </MenuItem>
      <MenuItem icon={<Megaphone />} onClick={() => setFeedback(true)}>
        {copy.shell.feedback}
      </MenuItem>
      <MenuItem icon={<Info />} onClick={() => navigate({ name: "settings", group: "technisch" })}>
        {copy.shell.about}
      </MenuItem>
    </Menu>
  );
}

/**
 * The top bar of every page: the mark, six sections, then search (⌘K), Activity, Settings and the
 * account menu. Below 1024px the sections move into a sheet behind a menu button.
 */
export function TopNav(props: { route: Route }) {
  const items = useNavItems();
  const backend = useBackend();
  const setPalette = useUi((state) => state.setPalette);
  const [menuOpen, setMenuOpen] = useState(false);
  const section = navSection(props.route);

  return (
    <header className="shrink-0 border-b border-line bg-surface pt-[env(safe-area-inset-top)]" data-titlebar="page">
      <div className="flex h-[72px] items-center gap-6 px-6 lg:h-[92px] lg:px-12">
        <button type="button" className="flex size-11 items-center justify-center rounded-full hover:bg-hover lg:hidden" aria-label={shellCopy.nav.menu} onClick={() => setMenuOpen(true)}>
          <MenuIcon className="size-5" aria-hidden="true" />
        </button>
        <a href={href({ name: "home" })} className="flex shrink-0 items-center gap-2.5 text-ink no-underline" aria-label={copy.appName}>
          <BrandMark className="size-9" />
          <span className="hidden text-lg font-extrabold tracking-[-0.02em] xl:inline">{copy.appName}</span>
        </a>
        {backend.mode === "demo" ? (
          <span title={shellCopy.nav.demoHint} className="hidden sm:inline-flex">
            <Tag tone="accent">{shellCopy.nav.demo}</Tag>
          </span>
        ) : null}
        <nav aria-label={shellCopy.nav.label} className="hidden min-w-0 lg:block">
          <ul className="m-0 flex list-none items-center gap-8 p-0">
            {items.map((item) => (
              <li key={item.section}>
                <NavLink item={item} active={section === item.section} />
              </li>
            ))}
          </ul>
        </nav>
        <div className="ms-auto flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setPalette(true)}
            aria-label={shellCopy.nav.searchLabel}
            className="flex h-11 items-center gap-3 rounded-full bg-surface-alt px-4 text-base text-ink-muted transition-colors hover:bg-ink-4 sm:min-w-[220px]"
          >
            <Search className="size-4 shrink-0" aria-hidden="true" />
            <span className="hidden flex-1 text-start sm:inline">{shellCopy.nav.search}</span>
            <Kbd className="hidden sm:inline-flex">{chord("search")}</Kbd>
          </button>
          <span className="hidden sm:flex">
            <RoundLink route={{ name: "activity", view: "all" }} label={shellCopy.nav.activity} active={section === "activity"} icon={<Activity />} />
          </span>
          <span className="hidden sm:flex">
            <RoundLink route={{ name: "settings", group: null }} label={shellCopy.nav.settings} active={section === "settings"} icon={<SlidersHorizontal />} />
          </span>
          <AccountMenu />
        </div>
      </div>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen} side="left" label={shellCopy.nav.label}>
        <nav aria-label={shellCopy.nav.label} className="flex flex-col gap-1 p-4">
          <div className="mb-4 flex items-center gap-2.5 px-2">
            <BrandMark className="size-8" />
            <span className="text-lg font-extrabold">{copy.appName}</span>
          </div>
          {items.map((item) => (
            <NavLink key={item.section} item={item} active={section === item.section} stacked onNavigate={() => setMenuOpen(false)} />
          ))}
          <div className="my-3 border-t border-line" />
          <a href={href({ name: "activity", view: "all" })} onClick={() => setMenuOpen(false)} className="flex min-h-12 items-center gap-3 rounded-[10px] px-4 text-base text-ink no-underline hover:bg-hover">
            <Activity className="size-4" aria-hidden="true" />
            {shellCopy.nav.activity}
          </a>
          <a href={href({ name: "settings", group: null })} onClick={() => setMenuOpen(false)} className="flex min-h-12 items-center gap-3 rounded-[10px] px-4 text-base text-ink no-underline hover:bg-hover">
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            {shellCopy.nav.settings}
          </a>
          <a href={href({ name: "settings", group: "technisch" })} onClick={() => setMenuOpen(false)} className="flex min-h-12 items-center gap-3 rounded-[10px] px-4 text-base text-ink no-underline hover:bg-hover">
            <CircleHelp className="size-4" aria-hidden="true" />
            {copy.shell.about}
          </a>
        </nav>
      </Sheet>
    </header>
  );
}

/** The phone's tab bar (design: Mobile companion): Vandaag · Agent · Vastleggen · Inbox · Runs, on ink. */
export function MobileTabs(props: { route: Route }) {
  const needsYou = useNeedsYou();
  const setCapture = useUi((state) => state.setCapture);
  const section = navSection(props.route);
  const count = needsYou.data?.length ?? 0;
  const tab = "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[13px] font-medium text-ink-inverse-muted no-underline aria-[current=page]:font-bold aria-[current=page]:text-ink-inverse [&_svg]:size-5";
  return (
    <nav aria-label={shellCopy.nav.label} className="flex h-[84px] shrink-0 items-stretch bg-surface-inverse pb-[env(safe-area-inset-bottom)]">
      <a href={href({ name: "home" })} aria-current={section === "today" ? "page" : undefined} aria-label={count ? shellCopy.nav.todayBadge(count) : undefined} className={tab}>
        <TabIcon.today />
        <span>{count ? `${shellCopy.nav.today} · ${count}` : shellCopy.nav.today}</span>
      </a>
      <a href={href({ name: "agent", chatId: null })} aria-current={section === "agent" ? "page" : undefined} className={tab}>
        <TabIcon.agent />
        <span>{shellCopy.nav.agent}</span>
      </a>
      <button type="button" className={cn(tab, "bg-transparent")} onClick={() => setCapture(true)}>
        <TabIcon.capture />
        <span>{shellCopy.nav.capture}</span>
      </button>
      <a href={href({ name: "inbox" })} aria-current={section === "inbox" ? "page" : undefined} className={tab}>
        <TabIcon.inbox />
        <span>{shellCopy.nav.inbox}</span>
      </a>
      <a href={href({ name: "runs" })} aria-current={section === "runs" ? "page" : undefined} className={tab}>
        <TabIcon.runs />
        <span>{shellCopy.nav.runs}</span>
      </a>
    </nav>
  );
}

const TabIcon = {
  today: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  agent: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M12 8V4M8 14h.01M16 14h.01" />
    </svg>
  ),
  capture: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  inbox: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z" />
    </svg>
  ),
  runs: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="m10 8 6 4-6 4z" />
    </svg>
  ),
};
