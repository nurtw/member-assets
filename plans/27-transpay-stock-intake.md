## Item
27 — transpay-stock-intake

## Status
**Deferred by the project owner on 3 October 2026. Do not build until the owner takes it
up.** Nothing in the code adds to the register.

## Source
`QUESTIONS.md` VEH-29. It revisits VEH-15 and VEH-21, PRD Requirement 9A.4, and §23.19,
which say the Transpay register is closed.

## The direction
Transpay still holds stickers the Union can use, but they are not on the register. The
Union wants to add them to the System by scanning them, and then attach them to vehicles.
New NURTW stickers are paused in the meantime (VEH-20).

## Why this is not a small change
The closed register is what stops a fabricated Transpay barcode today. A barcode is a
millisecond timestamp with no proof of authenticity (PRD §26.4), so anyone who has seen one
can write another. Once barcodes can be added by scanning, that control moves to whoever
may add them.

## To settle before building
1. **Who may add a barcode.** A new permission, held as narrowly as `vehicle.declare`.
   Whether a second officer must confirm each batch.
2. **A list from Transpay.** If Transpay can supply the numbers of its remaining stock, a
   scan can be checked against that list and intake stays a closed set.
3. **Plate binding.** Legacy barcodes are bound to the plate the export recorded. Unrecorded
   stock has no plate, so the plate check of Requirement 9A.4 cannot apply. The binding
   would be made at attachment.
4. **The PRD.** Requirement 9A.4, §23.19, and §26.4 need revising first. `CLAUDE.md` says
   only the legacy import writes `legacyBarcode`; that changes too.

## Out of scope until then
Any route, screen, or script that adds a barcode to the register.
