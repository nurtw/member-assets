## Item
35 — sticker-prompt

## Source
The owner's direction of 5 October 2026: "where do we assign sticker, I can't seem to find
it. We need to make it very obvious, for example when you view a vehicle that doesn't have
[one], it displays a banner. Default is when you finish adding a vehicle, it should display
the purchase sticker but it can be closed, only to appear when the vehicle is viewed."
`QUESTIONS.md` VEH-30. PRD §9A (Requirement 9A.4); VEH-20 (new stickers paused); VEH-21
(the register is closed). Built after item 32, before item 33.

## Goal
Nobody hunts for sticker assignment. A vehicle without a sticker says so at the top of its
page every time it is opened, with the way to buy and attach one. Adding a vehicle ends on
a prompt to do it now, which can be closed. While new NURTW stickers are paused, a vehicle
the Transpay register holds no barcode for is told so, and nothing is charged.

## Approach
1. **One rule** in `packages/domain`: what a vehicle without a sticker can do now. It can
   reattach its Transpay sticker (the register holds a barcode for its plate), take a new
   NURTW sticker (once VEH-20 lifts), or nothing yet. It reads the onboarding state the API
   already returns. `NEW_STICKERS_IN_USE` moves out of `onboarding-section.tsx` to sit
   beside it, so lifting the pause changes the panel, the banner, and the prompt together.
2. **The banner**, at the top of the vehicle's page while no sticker is attached: what the
   vehicle needs, in words and an icon (`DESIGN.md` §3), and a button to the onboarding
   panel. Shown to anyone who can open the vehicle. An officer without `sticker.attach` is
   told who can do it.
3. **The prompt**, after a vehicle is added and the officer finishes (not after "add
   another"): the same, in a dialog that closes. Closing it lasts for that visit only. The
   banner returns on every view until a sticker is attached.
4. **No charge without a sticker to give.** A vehicle the register holds no barcode for,
   while new stickers are paused, gets the plain statement and no payment.
5. **The onboarding panel** moves up the page, under the banner.
6. **Click-through** in both themes, desktop and phone.

## Files likely touched
`packages/domain/src/sticker/`, `apps/web/src/app/(app)/vehicles/[id]/page.tsx`,
`apps/web/src/app/(app)/vehicles/new/page.tsx`, `apps/web/src/components/onboarding-section.tsx`,
a new `apps/web/src/components/sticker-prompt.tsx`, `DESIGN.md`, `CLAUDE.md`.

## Out of scope
Lifting the pause on new stickers (VEH-20). Printing stickers. Adding Transpay's stock
(item 27, deferred). Charging for a sticker that cannot yet be given. Any change to the four
conditions of a reattachment (Requirement 9A.4), or to who may attach.

## Definition of done
- [ ] A vehicle without a sticker shows the banner on every view. For an officer with
      `sticker.attach`, its button reaches the onboarding panel.
- [ ] Finishing adding a vehicle ends on the prompt, which closes and stays closed for that
      visit.
- [ ] While new stickers are paused, a vehicle without a register barcode is told so, and
      no payment is offered.
- [ ] Attaching a sticker removes the banner.
- [ ] Words and icons carry the state in both themes. Lint, typecheck, build, and the web
      tests pass, and it is clicked through.
