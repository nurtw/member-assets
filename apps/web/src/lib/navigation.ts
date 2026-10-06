/**
 * The officer navigation (item 32): one table, read by the sidebar, the command
 * menu, and the breadcrumbs, so the three can never disagree.
 *
 * Filtering by permission is a courtesy, not a control. Every screen is
 * enforced by the API's guard, which denies by default; hiding a link merely
 * avoids offering a screen that would refuse.
 *
 * Icons are named here and drawn by the shell, so this module stays free of
 * React and can be tested on its own.
 */

export type NavIcon =
  | "overview"
  | "verify"
  | "applications"
  | "cards"
  | "vehicles"
  | "stickers"
  | "fees"
  | "settlement"
  | "organisations"
  | "profiles"
  | "limits"
  | "officers"
  | "roles"
  | "security"
  | "account"
  | "usage";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  /** Holding any one of these opens the screen. Empty: any signed-in user. */
  permissions: readonly string[];
}

export interface NavGroup {
  /** `null` for the ungrouped head of the list. */
  label: string | null;
  items: readonly NavItem[];
}

/**
 * Who has a desk to come back to (item 34): an officer who reads any of the
 * lists the Overview counts. An officer who only verifies, even one who may
 * also read vehicles, has no Overview and lands on Verify.
 */
export const OVERVIEW_PERMISSIONS = [
  "application.read",
  "card.read",
  "api_client.read",
  "user.read",
  "payment.read",
] as const;

export const OFFICER_NAVIGATION: readonly NavGroup[] = [
  {
    label: null,
    items: [
      {
        href: "/overview",
        label: "Home",
        icon: "overview",
        permissions: OVERVIEW_PERMISSIONS,
      },
      {
        href: "/verify",
        label: "Verify",
        icon: "verify",
        permissions: ["verification.perform", "verification.membership"],
      },
    ],
  },
  {
    label: "Membership",
    items: [
      {
        href: "/applications",
        label: "Applications",
        icon: "applications",
        permissions: ["application.read"],
      },
      {
        href: "/cards",
        label: "Cards",
        icon: "cards",
        permissions: ["card.read"],
      },
    ],
  },
  {
    label: "Vehicles",
    items: [
      {
        href: "/vehicles",
        label: "Vehicles",
        icon: "vehicles",
        permissions: ["vehicle.read"],
      },
      {
        href: "/stickers/stock",
        label: "Sticker stock",
        icon: "stickers",
        permissions: ["sticker.stock_intake"],
      },
    ],
  },
  {
    label: "Payments",
    items: [
      {
        href: "/settings/fees",
        label: "Fees",
        icon: "fees",
        permissions: ["payment.read"],
      },
      {
        href: "/settings/settlement",
        label: "Settlement",
        icon: "settlement",
        permissions: ["payment.manage_settlement"],
      },
    ],
  },
  {
    label: "Partners",
    items: [
      {
        href: "/organisations",
        label: "Organisations",
        icon: "organisations",
        permissions: ["api_client.read"],
      },
      {
        href: "/organisations/profiles",
        label: "Disclosure profiles",
        icon: "profiles",
        permissions: ["disclosure_profile.read"],
      },
      {
        href: "/organisations/limits",
        label: "Limits",
        icon: "limits",
        permissions: ["api_client.read"],
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        href: "/settings/users",
        label: "Officers",
        icon: "officers",
        permissions: ["user.read"],
      },
      {
        href: "/settings/users/roles",
        label: "Roles",
        icon: "roles",
        permissions: ["role.read"],
      },
      {
        href: "/settings/users/security",
        label: "Security",
        icon: "security",
        permissions: ["system_setting.manage"],
      },
    ],
  },
];

/** Screens reached from the account menu rather than the sidebar. */
export const OFFICER_ACCOUNT_ITEMS: readonly NavItem[] = [
  { href: "/account", label: "Your account", icon: "account", permissions: [] },
];

/**
 * The organisation portal's navigation (item 29). A portal account holds no
 * permission at all (Decision 9.16), so nothing here is filtered.
 */
export const PORTAL_NAVIGATION: readonly NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/portal", label: "Overview", icon: "overview", permissions: [] },
      {
        href: "/portal/account",
        label: "Account",
        icon: "account",
        permissions: [],
      },
    ],
  },
];

/**
 * Where signing in lands an officer: the first of these they may open.
 *
 * Deliberately not the sidebar's order. An officer with an Overview lands on
 * it. Of the rest, an officer who reads applications lands
 * on them, as before the sidebar; a verification officer, who may also read
 * vehicles, lands on Verify.
 */
export const OFFICER_LANDING_ORDER: readonly string[] = [
  "/overview",
  "/applications",
  "/verify",
  "/cards",
  "/vehicles",
  "/stickers/stock",
  "/settings/fees",
  "/settings/settlement",
  "/organisations",
  "/organisations/profiles",
  "/organisations/limits",
  "/settings/users",
  "/settings/users/roles",
  "/settings/users/security",
];

export type Holds = (permission: string) => boolean;

function opens(item: NavItem, holds: Holds): boolean {
  return item.permissions.length === 0 || item.permissions.some(holds);
}

/** The groups as this officer sees them; a group with nothing left is dropped. */
export function visibleNavigation(
  groups: readonly NavGroup[],
  holds: Holds,
): NavGroup[] {
  return groups
    .map((group) => ({
      label: group.label,
      items: group.items.filter((item) => opens(item, holds)),
    }))
    .filter((group) => group.items.length > 0);
}

export function navigationItems(groups: readonly NavGroup[]): NavItem[] {
  return groups.flatMap((group) => group.items);
}

/** The first screen in the landing order this officer may open, if any. */
export function landingHref(
  groups: readonly NavGroup[],
  order: readonly string[],
  holds: Holds,
): string | null {
  const open = new Set(
    navigationItems(visibleNavigation(groups, holds)).map((item) => item.href),
  );
  return order.find((href) => open.has(href)) ?? null;
}

function within(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The item a path belongs to: the longest one containing it, so Roles is
 * marked on its own page rather than Officers, whose address contains it.
 */
export function activeItem(
  pathname: string,
  items: readonly NavItem[],
): NavItem | null {
  let found: NavItem | null = null;
  for (const item of items) {
    if (
      within(pathname, item.href) &&
      (!found || item.href.length > found.href.length)
    ) {
      found = item;
    }
  }
  return found;
}

export interface Crumb {
  label: string;
  href?: string;
}

const ID_LIKE = /^[0-9a-f-]{16,}$|^[A-Za-z0-9_-]{20,}$/i;

function segmentLabel(segment: string): string {
  if (segment === "new") {
    return "New";
  }
  if (ID_LIKE.test(segment)) {
    return "Details";
  }
  const words = decodeURIComponent(segment).replace(/[-_]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The trail above a page: its group, its screen, then what lies beneath it.
 * A record's own name is the page's to show; here it reads "Details".
 */
export function breadcrumbs(
  pathname: string,
  groups: readonly NavGroup[],
  extra: readonly NavItem[] = [],
): Crumb[] {
  const items = [...navigationItems(groups), ...extra];
  const item = activeItem(pathname, items);
  if (!item) {
    return [];
  }
  const group = groups.find((candidate) => candidate.items.includes(item));
  const trail: Crumb[] = [];
  if (group?.label && group.label !== item.label) {
    trail.push({ label: group.label });
  }
  trail.push({ label: item.label, href: item.href });
  const rest = pathname
    .slice(item.href.length)
    .split("/")
    .filter((segment) => segment.length > 0);
  let href = item.href;
  for (const segment of rest) {
    href = `${href}/${segment}`;
    trail.push({ label: segmentLabel(segment), href });
  }
  // The page itself is not a link.
  const last = trail[trail.length - 1];
  trail[trail.length - 1] = { label: last.label };
  return trail;
}
