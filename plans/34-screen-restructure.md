## Item
34 — screen-restructure

## Source
The owner's direction of 5 October 2026: "structure the UI professionally so it is
intuitive. Like the entire thing." `DESIGN.md` §5, and the patterns item 32 adds to it.
Comes after items 32 and 33.

## Goal
Every screen follows the same few patterns, so an officer who has learnt one knows them
all. An Overview shows each officer what is waiting for them. No screen loses a field, an
action, or a check it has today.

## Approach
1. **Patterns**, written into `DESIGN.md` with an example of each: a page header with one
   primary action; a list with search, filters, and a count; a detail page with a summary
   and tabs; a dangerous act in a confirming dialog that asks for the reason; success as a
   toast; failure inline, with its reference; skeletons while loading; an empty state that
   offers the next step; tables that become stacked rows on a phone.
2. **Overview**, the landing page for administrative officers (an officer who can only
   verify still lands on Verify): what waits for them (applications to decide, cards to
   approve, organisations to decide, tokens expiring), from the lists they may already
   read, and their quick actions. No new route, and nothing beyond their scope.
3. **Verify:** the verdict dominant, one-handed on a phone, with Pay now as a panel
   beneath it.
4. **Screens in turn:** applications (the list, a stepped new application, the detail in
   tabs); cards; vehicles (the list, recording, the detail in tabs); fees; settlement;
   officers, roles, and security; the officer's account; the portal (overview, usage,
   tokens, account); the public pay page; the sign-in and application pages.
5. **A checklist per screen** of what it shows and does today, ticked against the new one.
6. **Click-through** of every screen, light and dark, desktop and phone; Verify in
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
- [ ] The Overview shows only what the officer may read, from existing routes.
- [ ] Verify reads correctly in greyscale and one-handed on a phone, in both themes.
- [ ] Every screen's checklist is ticked: nothing is lost.
- [ ] Lint, typecheck, and build pass, with screenshots of every screen in both themes.
