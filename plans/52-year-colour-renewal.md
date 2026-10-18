## Item
52 — year-colour-renewal

## Source
The owner's direction of 18 October 2026 (`QUESTIONS.md` PAY-22): "On renewal, members get
a new card or sticker in that year's colour, so officers can see at a glance who has paid."
The same day the owner set the sticker aside: "ignore the sticker for now" (VEH-36,
deferred). So this item is the card alone. CARD-10 (the colours, and whether renewal needs
the fee paid) is open. CARD-04 (cards are renewed yearly), PAY-05 (dues do not block
renewal), and `DESIGN.md` §3 apply. Needs item 51.

## Goal
A renewed card prints in the colour the Union set for its year, with the year itself large
enough to read without the colour. Renewing is one step for an officer.

## Approach
1. **Year colours are data:** a short list the Union keeps (year, colour, name), changed
   with a reason and audited. A colour is refused unless the white text printed on it
   passes contrast. A year with no colour set prints the template's own, and the issuing
   screen says so.
2. **The colour is a snapshot** on the card (`printedYearColour`), handed to the template,
   so a later change to the list never changes a printed card.
3. **The year stays printed large**, as it already is (CARD-04). A card then reads
   correctly in greyscale, and to an officer who cannot tell the colours apart
   (`DESIGN.md` §3). The colour is a hint at a distance. The check is still the System's
   (item 24).
4. **Renewing**, from the member's record, prepares the new card through the usual issue and
   approve steps, with its year filled in. Whether the yearly fee must be paid first is
   CARD-10's. Today PAY-05 says it need not be, and the officer sees the dues instead.
5. **The card office's list:** members whose yearly fee is paid and whose card for that
   year is not yet issued.

## Files likely touched
`apps/api/src/card/` and `apps/api/src/card/templates/`, `apps/api/prisma/schema.prisma`
and a migration, `apps/web/src/app/(app)/settings/lists/`,
`apps/web/src/app/(app)/members/[id]/`, `PRD.md`, `DESIGN.md`.

## Out of scope
Any sticker in a year's colour, which the owner has set aside for now (VEH-36). Stickers
are unchanged by this item.

## To settle before building (CARD-10)
- The colour for each year, and which part of the card takes it.
- Whether the yearly fee must be paid before a card is renewed (revising PAY-05).
- Whether a card stays valid until it expires once the next year's is issued.

## Definition of done
- [ ] A renewed card prints its year's colour from its own snapshot. Changing the list
      changes no printed card, and earlier cards render unchanged.
- [ ] The year is legible in greyscale, and every colour in the list passes contrast.
- [ ] Every test passes; a proof is checked by eye.
