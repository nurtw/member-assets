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
- [ ] Every officer screen is in the sidebar shell, with a drawer on a phone. Every
      control is reachable by keyboard, and Ctrl K reaches every screen the officer may
      open.
- [ ] Light, Dark, and System, with no flash on load and the choice remembered.
- [ ] No raw colour class remains, and the check passes.
- [ ] Verdicts carry a word, an icon, and colour. Greyscale screenshots read correctly in
      both themes, and axe finds no contrast failure on the main screens in either.
- [ ] QR codes and card proofs sit on white in the dark theme.
- [ ] Lint, typecheck, build, and the web tests pass; the API suites are unchanged.
