## Item
41 — field-feedback-fixes

## Source
Mr Timothy's recorded walk-through of the live System on 6 October 2026, passed on by the
owner on 7 October (`feedback/2026-10-06/`, kept out of git). `QUESTIONS.md` MEM-15,
MEM-18, VEH-33. The owner chose "safe fixes now, plan the rest": this item is the fixes
that change no rule and no stored data. Items 42 and 43 hold the rest.

## Goal
Signing in never looks stuck or lost. The two forms ask in the order the Union asked for.
A member's photograph is taken on the registration form and is the one on their card.

## Approach
1. **Sign-in.** Found in the code:
   - The "Signing in…" label is cleared when navigation *starts*. On a slow connection the
     button reads "Sign in" again while the next screen is still loading, which looks as
     if nothing happened. It now stays until the screen changes.
   - No request has a time limit, so a stalled connection waits for ever. Signing in gets
     one, with a message that says what happened. Nothing retries by itself.
   - The same two faults are fixed on the portal's sign-in.
2. **Membership form:** name, residential address, telephone, then the rest (MEM-15).
3. **Vehicle form:** plate, chassis, type, make, model, colour, route type, then branch or
   unit (VEH-33). The chassis number stays optional until item 43.
4. **The photograph** (MEM-18):
   - On the registration form: take one with the camera, or choose a file. It uploads
     through the existing route, shows a preview, and is attached when the application is
     saved. One that is replaced or abandoned is discarded.
   - The application's detail gains a short-lived signed link, so its page shows the
     photograph, and it can be added or replaced while the application can be amended.
   - The card already prints it.
5. **Tests**, then a click-through with a slowed connection and a drawn photograph.

## Files likely touched
`apps/web/src/app/login/page.tsx`, `apps/web/src/app/portal/(public)/login/`,
`apps/web/src/lib/api.ts`, `apps/web/src/app/(app)/applications/new/page.tsx`,
`apps/web/src/app/(app)/applications/[id]/page.tsx`, `apps/web/src/components/vehicle-form.tsx`,
a new `apps/web/src/components/photograph-field.tsx`, `apps/api/src/membership/`,
`packages/contracts/src/membership.ts`, `docs/reference/`, `CLAUDE.md`.

## Out of scope
- Any change to what is required: the chassis number, the next of kin, the guarantor, Area
  (items 42 and 43).
- Route details (item 43).
- The order of the designations and the word "demo": both are records on the live
  database, not code (ORG-05, ORG-06).
- A photograph for a member who has no application. Nothing attaches one.
- How fast the hosting answers. It is measured and reported here, not changed.

## Definition of done
- [ ] On a slow connection the sign-in button stays busy until the next screen shows, and
      a stalled one ends with a message. Wrong credentials still read as they did.
- [ ] Both forms ask in the order given above, and save what they saved before.
- [ ] A photograph taken on the registration form shows on the application and prints on
      the card proof. Only an officer who may read the application gets its link.
- [ ] Lint, typecheck, build, and the tests pass; clicked through on a phone's width.
