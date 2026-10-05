"use client";

import { Menu, PanelLeft, Search, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { NAV_ICONS } from "@/components/shell/nav-icon";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/layout";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import {
  activeItem,
  breadcrumbs,
  navigationItems,
  type NavGroup,
  type NavItem,
} from "@/lib/navigation";

/**
 * The frame every signed-in screen sits in (item 32): a sidebar grouped by
 * task, a top bar with the breadcrumbs, and a command menu. The officers'
 * dashboard and the organisation portal each give it their own navigation and
 * account menu; nothing of one is mounted in the other.
 *
 * On a phone the sidebar is a drawer behind the menu button, so a screen such
 * as Verify has the whole width.
 */

export interface CommandAction {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Extra words the filter matches, beyond the label. */
  keywords?: string[];
  run: () => void;
}

const COLLAPSE_KEY = "nurtw-sidebar";
const COLLAPSE_CHANGE = "nurtw-sidebar-change";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "collapsed";
  } catch {
    return false;
  }
}

function subscribeCollapsed(onChange: () => void) {
  window.addEventListener(COLLAPSE_CHANGE, onChange);
  return () => window.removeEventListener(COLLAPSE_CHANGE, onChange);
}

function setCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(
      COLLAPSE_KEY,
      collapsed ? "collapsed" : "expanded",
    );
  } catch {
    // A convenience only: the sidebar simply opens expanded next time.
  }
  window.dispatchEvent(new Event(COLLAPSE_CHANGE));
}

/** "Ctrl K" everywhere but an Apple device, where it is "⌘K". */
function useShortcutLabel(): string {
  return useSyncExternalStore(
    () => () => {},
    () => (/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘K" : "Ctrl K"),
    () => "Ctrl K",
  );
}

function SidebarLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = NAV_ICONS[item.icon];
  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors",
        active
          ? "bg-surface-muted font-medium text-foreground"
          : "text-muted-foreground hover:bg-surface-muted/70 hover:text-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0",
          active ? "text-brand-text" : "text-faint-foreground",
        )}
        aria-hidden
      />
      {collapsed ? (
        <span className="sr-only">{item.label}</span>
      ) : (
        <span className="truncate">{item.label}</span>
      )}
    </Link>
  );
  if (!collapsed) {
    return link;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

function SidebarContents({
  brand,
  groups,
  pathname,
  collapsed,
  onSearch,
  shortcut,
  footer,
}: {
  brand: (collapsed: boolean) => ReactNode;
  groups: NavGroup[];
  pathname: string;
  collapsed: boolean;
  onSearch?: () => void;
  shortcut: string;
  footer: (collapsed: boolean) => ReactNode;
}) {
  const current = activeItem(pathname, navigationItems(groups));
  return (
    <>
      <div
        className={cn(
          "flex h-14 shrink-0 items-center",
          collapsed ? "justify-center px-2" : "px-3",
        )}
      >
        {brand(collapsed)}
      </div>
      {onSearch ? (
        <div className={cn("pb-2", collapsed ? "px-2" : "px-3")}>
          <button
            type="button"
            onClick={onSearch}
            aria-label="Search or jump to a screen"
            className={cn(
              "flex h-8 w-full items-center gap-2 rounded-md border border-line bg-surface text-sm text-faint-foreground transition-colors hover:border-line-strong hover:text-muted-foreground",
              collapsed ? "justify-center px-0" : "px-2",
            )}
          >
            <Search className="size-4 shrink-0" aria-hidden />
            {collapsed ? null : (
              <>
                <span className="flex-1 truncate text-left">
                  Search or jump to…
                </span>
                <Kbd>{shortcut}</Kbd>
              </>
            )}
          </button>
        </div>
      ) : null}
      <nav
        aria-label="Main"
        className="flex-1 overflow-y-auto overscroll-contain px-2 pb-4"
      >
        {groups.map((group, index) => (
          <div
            key={group.label ?? `group-${index}`}
            className={index > 0 ? "mt-4" : "mt-1"}
          >
            {group.label ? (
              collapsed ? (
                <div aria-hidden className="mx-2 mb-2 h-px bg-line" />
              ) : (
                <p className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-faint-foreground">
                  {group.label}
                </p>
              )
            ) : null}
            <ul className="grid gap-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <SidebarLink
                    item={item}
                    active={current?.href === item.href}
                    collapsed={collapsed}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div
        className={cn(
          "shrink-0 border-t border-line",
          collapsed ? "p-2" : "p-2.5",
        )}
      >
        {footer(collapsed)}
      </div>
    </>
  );
}

export function AppFrame({
  brand,
  groups,
  extraItems = [],
  footer,
  actions = [],
  search = true,
  children,
}: {
  /** The emblem and name at the head of the sidebar. */
  brand: (collapsed: boolean) => ReactNode;
  /** The navigation, already filtered to what this person may open. */
  groups: NavGroup[];
  /** Screens outside the sidebar that still get breadcrumbs (the account). */
  extraItems?: NavItem[];
  /** The account menu at the foot of the sidebar. */
  footer: (collapsed: boolean) => ReactNode;
  /** What the command menu offers besides the screens. */
  actions?: CommandAction[];
  /** Whether there is a command menu at all. */
  search?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const collapsed = useSyncExternalStore(
    subscribeCollapsed,
    readCollapsed,
    () => false,
  );
  const shortcut = useShortcutLabel();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  // A route change is a navigation just chosen; leaving the drawer open over
  // the new page would cover it. Adjusted during render, not in an effect, so
  // the drawer never paints open over the page it led to.
  const [drawerClosedFor, setDrawerClosedFor] = useState(pathname);
  if (pathname !== drawerClosedFor) {
    setDrawerClosedFor(pathname);
    setDrawerOpen(false);
  }

  useEffect(() => {
    if (!search) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [search]);

  const trail = breadcrumbs(pathname, groups, extraItems);
  const openSearch = search ? () => setCommandOpen(true) : undefined;
  const choose = (run: () => void) => {
    setCommandOpen(false);
    run();
  };

  return (
    <TooltipProvider delayDuration={250}>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface-raised px-3 py-2 text-sm font-medium shadow-lg focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <div className="flex min-h-dvh flex-1">
        <aside
          className={cn(
            "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-sidebar transition-[width] duration-200 md:flex",
            collapsed ? "w-14" : "w-64",
          )}
        >
          <SidebarContents
            brand={brand}
            groups={groups}
            pathname={pathname}
            collapsed={collapsed}
            onSearch={openSearch}
            shortcut={shortcut}
            footer={footer}
          />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-4">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground md:hidden"
            >
              <Menu className="size-5" aria-hidden />
              <span className="sr-only">Open navigation</span>
            </button>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setCollapsed(!collapsed)}
                  aria-pressed={collapsed}
                  className="hidden size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground md:inline-flex"
                >
                  <PanelLeft className="size-4" aria-hidden />
                  <span className="sr-only">
                    {collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
              </TooltipContent>
            </Tooltip>
            <div
              aria-hidden
              className="mx-1 hidden h-5 w-px bg-line md:block"
            />
            <Breadcrumbs trail={trail} />
            {openSearch ? (
              <button
                type="button"
                onClick={openSearch}
                className="ml-auto inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground md:hidden"
              >
                <Search className="size-5" aria-hidden />
                <span className="sr-only">Search or jump to a screen</span>
              </button>
            ) : null}
          </header>

          <main
            id="main"
            tabIndex={-1}
            className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 outline-none sm:px-6 sm:py-8 lg:px-8"
          >
            {children}
          </main>

          <footer className="px-4 pb-6 sm:px-6 lg:px-8">
            <p className="mx-auto max-w-6xl text-xs text-faint-foreground">
              National Union of Road Transport Workers, Anambra State Council.
              Activity on this System is recorded.
            </p>
          </footer>
        </div>
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent title="Navigation">
          <SidebarContents
            brand={brand}
            groups={groups}
            pathname={pathname}
            collapsed={false}
            onSearch={
              openSearch
                ? () => {
                    setDrawerOpen(false);
                    openSearch();
                  }
                : undefined
            }
            shortcut={shortcut}
            footer={footer}
          />
        </SheetContent>
      </Sheet>

      {search ? (
        <CommandDialog
          open={commandOpen}
          onOpenChange={setCommandOpen}
          title="Search or jump to a screen"
        >
          <CommandInput placeholder="Search screens and actions…" />
          <CommandList>
            <CommandEmpty>Nothing here by that name.</CommandEmpty>
            {groups.map((group, index) => (
              <CommandGroup
                key={group.label ?? `group-${index}`}
                heading={group.label ?? "Go to"}
              >
                {group.items.map((item) => {
                  const Icon = NAV_ICONS[item.icon];
                  return (
                    <CommandItem
                      key={item.href}
                      value={`${group.label ?? ""} ${item.label}`}
                      onSelect={() => choose(() => router.push(item.href))}
                    >
                      <Icon aria-hidden />
                      {item.label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
            {actions.length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup heading="Actions">
                  {actions.map((action) => (
                    <CommandItem
                      key={action.id}
                      value={[action.label, ...(action.keywords ?? [])].join(
                        " ",
                      )}
                      onSelect={() => choose(action.run)}
                    >
                      <action.icon aria-hidden />
                      {action.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </CommandDialog>
      ) : null}
    </TooltipProvider>
  );
}
