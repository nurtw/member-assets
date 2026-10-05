## Item
32 — app-shell-and-themes

## Source
The owner's direction of 5 October 2026: "structure the UI professionally so it is
intuitive. Like the entire thing. Vercel style sidebar … the M.A.N.G.O. standard … include
dark theme also." `DESIGN.md` §3–§6, which this item revises to 1.1 (§6 deferred dark
mode). PRD §2.2 still holds: nothing here is reachable without signing in.

## Goal
Every officer screen sits in one frame: a sidebar grouped by task, a top bar with
breadcrumbs, and a command menu. Light, Dark, and System themes apply before the first
paint. All colour comes from tokens, so every existing screen works in both themes, and
every verdict still passes `DESIGN.md` §3 in both.

## Approach
1. **`DESIGN.md` 1.1.** Record the direction. "M.A.N.G.O. standard" is read as the finish
   of the large technology firms' own consoles (Vercel, Linear, Stripe): neutral surfaces,
   one accent, quiet borders, dense type, keyboard first. Brand stays chrome, and green
   stays the primary action. The dark theme has its own token steps, not an inversion.
2. **Tokens** in `globals.css` for both themes: surfaces, text, border, primary, ring,
   destructive, the three verdicts, the chart series. System follows
   `prefers-color-scheme`; an explicit choice sets `data-theme` from an inline script in
   `<head>` (Next 16's "preventing flash" guide) and is remembered on the device. Item 15's
   security headers must allow that script by its hash. The dark chart step is checked
   with the dataviz validator.
3. **Components** in `components/ui/`: shadcn-style source on Radix primitives, with
   `lucide-react` icons, `cmdk`, and `sonner`, recorded in a new "Web interface" section of
   `ARCHITECTURE.md`. Button, Field, Input, Select, Card, Table, StatusChip (the word
   first), Tabs, Dialog, Sheet, Menu, Tooltip, Skeleton, EmptyState, PageHeader,
   Breadcrumbs, Toast. Existing call sites keep working.
4. **The officer shell.** The sidebar holds the emblem and "NURTW Anambra"; "Search or jump
   to…" (Ctrl K); then groups: Verify; Membership (Applications, Cards); Vehicles; Payments
   (Fees, Settlement); Partners (Organisations, Disclosure profiles, Limits);
   Administration (Officers, Roles, Security). The officer's menu sits at the foot
   (account, theme, sign out). It collapses to icons, becomes a drawer on a phone, and has
   a skip link and landmarks. One typed navigation table, filtered by permission as a
   courtesy, never as the control. The command menu reaches screens and actions only; it
   searches no records.
5. **The portal** gets the same kit and a small sidebar of its own. Public pages (sign-in,
   apply, pay) keep no navigation (`DESIGN.md` §5), and are themed.
6. **The sweep.** About 300 raw colour classes (`bg-white`, `text-black/60`) become tokens,
   so no screen is half themed. A check fails on any that come back.
7. **The web's first unit tests:** the navigation table and the theme choice.
8. **Click-through** of every screen, light and dark, desktop and phone.

## Files likely touched
`apps/web/src/app/globals.css`, `app/layout.tsx`, `app/(app)/layout.tsx`,
`app/portal/(account)/layout.tsx`, `components/ui/`, `components/shell/`,
`lib/navigation.ts`, `lib/theme.ts`, every screen (the sweep), `apps/web/package.json`,
`DESIGN.md`, `ARCHITECTURE.md`, `CLAUDE.md`.

## Out of scope
Restructuring each screen's layout (item 34). Organisations and invitations (item 33). Any
new route or data. The PDFs (cards, letters, forms), and the public sticker page (GOV-08).

## Definition of done
- [x] Every officer screen is in the sidebar shell, with a drawer on a phone. Every
      control is reachable by keyboard, and Ctrl K reaches every screen the officer may
      open.
- [x] Light, Dark, and System, with no flash on load and the choice remembered.
- [x] No raw colour class remains, and the check passes.
- [x] Verdicts carry a word, an icon, and colour. Greyscale screenshots read correctly in
      both themes, and axe finds no contrast failure on the main screens in either.
- [x] QR codes and card proofs sit on white in the dark theme.
- [x] Lint, typecheck, build, and the web tests pass; the API suites are unchanged.

**Decided while building (5 October 2026):**

- **The in-page tabs went.** API access and Officers each had a tab bar for their three
  screens. The sidebar now names all six, so the tabs were removed, and each page's heading
  matches its sidebar entry: Organisations, Disclosure profiles, Limits, Officers, Roles,
  Security. Their addresses are unchanged until item 33.
- **Landing is unchanged.** Signing in still lands on Applications, or on Verify for a
  verification officer. That order is kept apart from the sidebar's.
- **A verdict colour has three steps:** ink, surface, and solid (`DESIGN.md` §8).
- **A control's outline reaches 3:1** (`line-strong`), in both themes.
- **The sidebar is 256 pixels**, collapses to a 56-pixel rail, and remembers which on the
  device. The portal's frame has no command menu.
- **A status chip has an icon** for each tone: a tick, a cross, an alert, a clock for
  awaiting a decision, and a dashed circle for closed or neutral.
- **The web's first unit tests:** 25, covering the navigation table, the theme choice and
  its script, and the colour check.
- **One existing fault fixed on the way:** the Limits page put a heading inside a list of
  terms, which axe reported.

**Clicked through (5 October 2026)** against the local stack, on ports of its own because
the owner's development servers held 3000 and 3001. Every officer screen in both themes,
the phone drawer and command menu, the account menu's theme choice (dark from the first
paint, on a light device and the other way round), Verify's verdicts in colour and in
greyscale, the public pages, a pay link, and the portal. No contrast failure, console
error, or failed request. Screens listing real records were captured with those records
masked out.

**Pending:** the page patterns (item 34). The Organisations page and invitations (item 33).
