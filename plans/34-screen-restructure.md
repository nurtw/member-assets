## Item
34 — screen-restructure

## Source
The owner's direction of 5 October 2026: "structure the UI professionally so it is
intuitive. Like the entire thing." And, the same day: "we also need to create some sort of
landing page that has the quick actions... something simple, 100dvh, straight to the
point." `DESIGN.md` §5 and §9 to §12. Comes after items 32 and 33.

## Goal
Every screen follows the same few patterns, so an officer who has learnt one knows them
all. Home is one screen of each officer's quick actions, with what is waiting for them. A
front page shows the ways in. No screen loses a field, an action, or a check it has today.

## Approach
1. **Patterns**, written into `DESIGN.md` §10 with an example of each: a page header with
   one primary action; a list with search, filters, and a count; a detail page with a
   summary and tabs; a dangerous act in a confirming dialog that asks for the reason;
   success as a toast; failure inline, with its reference; skeletons while loading; an
   empty state that offers the next step; tables that become stacked rows on a phone.
2. **Home**, the landing page for administrative officers (an officer who can only verify
   still lands on Verify): quick actions by permission, and what waits for them, from the
   lists they may already read. No new route, and nothing beyond their scope.
3. **A front page** at `/`: the ways in, on one screen. It looks nothing up.
4. **Verify:** the verdict dominant, one-handed on a phone, with Pay now as a panel
   beneath it.
5. **Screens in turn:** applications (the list, a stepped new application, the detail in
   tabs); cards; vehicles (the list, recording, the detail in tabs); fees; settlement;
   officers, roles, and security; the officer's account; the portal (overview, usage,
   tokens, account); the public pay page; the sign-in and application pages.
6. **A checklist per screen** of what it shows and does today, ticked against the new one.
7. **Click-through** of every screen, light and dark, desktop and phone; Verify in
   greyscale; axe on each.

## Files likely touched
Every page under `apps/web/src/app/`, the shared panels in `apps/web/src/components/`,
`DESIGN.md`, `CLAUDE.md`.

## Out of scope
Screens for what the API can already do but no screen offers: the Union's structure
(zones, branches, and units, needed for ORG-05), master data, officer signatures
(CARD-07), and a member list. Each is a separate item for the owner to approve. Also the
public sticker page (GOV-08), and any change to an API route.

## Definition of done
- [ ] Every screen uses the shared header, list, detail, dialog, and feedback patterns.
- [x] Home shows only what the officer may do and read, from existing routes, on one screen.
- [x] The front page shows the ways in on one screen, and looks nothing up.
- [ ] Verify reads correctly in greyscale and one-handed on a phone, in both themes.
- [ ] Every screen's checklist is ticked: nothing is lost.
- [ ] Lint, typecheck, and build pass, with screenshots of every screen in both themes.

## Done so far
- **Stage 1** (`a8ff267`): the kit's page pieces, the four lists (applications, cards,
  vehicles, officers), and the settings and organisation headers.
- **Stage 2** (with item 27): Home and the front page, both clicked through in light and
  dark, on a desktop and a phone, with no contrast failure. The patterns are in
  `DESIGN.md` §10. Sticker stock and the assignment panel are built on them.
- **Stage 3**: the five record pages (a vehicle, an application, a card, an officer, an
  organisation). Each has the shared header, tabs kept in the address, and a dialog that
  asks for the reason before a dangerous act. Clicked through on 6 October: 56 checks, no
  contrast failure.

## Still to do
- The forms: a new application in steps, a new vehicle, a registration's vehicles.
- Verify's layout, the portal's two screens, and the public pages (sign-in, the portal's
  sign-in and application, the pay page).
- The per-screen checklist, and the full click-through.

## Decided while building
- **"Landing page" was asked of the owner, who chose both**: a public front page and an
  officer home. The home screen is called Home; its address stays `/overview`.
- **Home fills one screen by sharing out the height** left under the shell's bar, so it
  needs no scrolling on a 390 by 844 phone with all eight tiles.
- **"Assign a sticker" on Home asks for the plate** and opens the vehicle at its panel. It
  reads the list the Vehicles screen reads, so it shows nothing an officer could not open.
- **The front page reads the session cookie's presence** to send a signed-in officer to
  Home. It is a hint only: an expired cookie ends at the sign-in page.
- **What a record is waiting for sits above its tabs**: an application's decision, a
  card's approval or collection. A decision is never a scroll, or a tab, away.
- **A vehicle's tabs are Details, Sticker, Levy, and Manage.** The banner's "Assign
  sticker" and `?assign=1` open the Sticker tab. A payment's return opens it from the
  first render, so the panel is there to notice the payment.
- **The officer page lost its shared "reason for removing" box.** Removing a role,
  withdrawing a grant, and lifting a revocation each ask for their reason in the dialog.
- **An approval takes an optional note; a refusal must give a reason.** `ConfirmDialog`
  takes either.
- **What each record page shows and does was checked against the old page** while it was
  rebuilt: every field, section, and act is kept. The one thing removed is each page's
  shared reason box, replaced by the reason asked in the dialog.
