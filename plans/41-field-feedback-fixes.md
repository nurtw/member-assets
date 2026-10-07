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
- [x] On a slow connection the sign-in button stays busy until the next screen shows, and
      a stalled one ends with a message. Wrong credentials still read as they did.
- [x] Both forms ask in the order given above, and save what they saved before.
- [x] A photograph taken on the registration form shows on the application and prints on
      the card proof. Only an officer who may read the application gets its link.
- [x] Lint, typecheck, build, and the tests pass; clicked through on a phone's width.

**Measured (7 October 2026):**

- The live site's public health check, through the web address: 3.2 seconds for the first
  request, then 1.8, 1.1, and 0.8. Signing in costs more than that, because it checks a
  password and then loads the next screen.
- In the click-through, with the answer held for 3 seconds and the next screen for 15, the
  button read "Signing in…" and then "Opening…", never "Sign in", and the screen opened
  by itself after 18 seconds. With no answer at all, the page gave up at 31 seconds.
- **"Almost five minutes" was not reproduced**, and the recording itself reaches the next
  screen in under a minute. What the code explains is the label vanishing and the second
  attempt. If long waits go on after this is deployed, the place to look is the hosting's
  first request after a quiet spell, which was the slowest thing measured. That is the
  owner's to take up with the providers.

**Decided while building:**

- **The limit is 30 seconds**, and the "you are signed in" note comes after 12. Both are
  in `lib/sign-in.ts`.
- **Only signing in has a time limit.** A limit on every request would cut off a slow
  upload on the same connection.
- **A photograph is sent as a JPEG or a PNG**, never WebP: the API stores WebP, but a card
  cannot draw it. The browser re-draws the picture as a JPEG no longer than 1,200 pixels.
- **The photograph has its own section on the form**, after the member's own details, so
  name, address, and telephone still come first.
- **The application's page shows the photograph by a signed link in its detail.** No list
  carries one. The member's record (item 37) does not show it.
- **The portal's sign-in already kept its button busy.** It gained the time limit only.

**Seen and not changed:** on the phone in the recordings, links are drawn yellow and
green, which this System's themes never use. That is the phone's browser recolouring the
page. It reads correctly in the click-through's own browser, and nothing was changed.

**Not checked:** a real phone's camera; the deployed site after this change.

## Corrected the same day: the API was asleep

The measurements above caught the API awake. Later on 7 October the live health check got
**no answer in 90 seconds**, then one in **37.6 seconds**, then answers in about one second.
Its response names the host: the live API runs on **Render**, whose free tier puts a
service to sleep after a quiet spell. `.github/workflows/keep-api-warm.yml` exists to
prevent that, and evidently does not.

That is the long wait Mr Timothy reported, and the first fix was too impatient for it: a
30-second limit would have told him to try again, several times over.

- **The sign-in pages wake the API as soon as they open**, by asking the public health
  check for a sign of life (`components/api-wake.tsx`). The API starts while the officer
  types.
- **If no answer has come after four seconds, the page says the System is starting up**,
  that it can take a minute or two, and that the button need not be pressed twice.
- **The limit on signing in is 150 seconds**, longer than the wake that was measured.
- **A gateway's 502 or 504 reads as "still starting up"**, not as a fault in what was typed.
- **If it cannot be reached after five tries, the page says so.**

This makes the wait explicable. **It does not make it short.** That is the hosting: an
always-on instance, or a ping that does keep it awake. It is the owner's to decide, and
`CLAUDE.md` and `QUESTIONS.md` GOV-02 still name DigitalOcean as the host.
