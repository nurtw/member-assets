## Item
17 — vehicle-onboarding

## Source
PRD §9A (Requirements 9A.1–9A.5), 10.3, 11.2; §23.19. `QUESTIONS.md` VEH-13–VEH-22,
VEH-26. ARCHITECTURE.md Decision 6.5: onboarded is derived from an attached sticker, never
a `Vehicle` flag.

## Goal
An officer holding `sticker.attach` onboards a vehicle by reattaching a Transpay barcode
from the imported register, or by attaching a new signed sticker. Either way it needs a
confirmed onboarding payment for **that vehicle**. The vehicle page shows on record,
onboarded, and declared separately, each with its actor and time. An internal lookup reads
"Recognised Transpay sticker — not attached" plus the registered plate.

## Approach
1. **Fix `StickerService.attach` (found 26 September 2026).** Today it accepts any
   confirmed payment. It must require the fee type `STICKER_REATTACHMENT` for a legacy
   barcode, or `STICKER_NEW` for a signed sticker, and `subjectType 'vehicle'` with
   `subjectId` equal to the target vehicle. Add `PAYMENT_WRONG_FEE_TYPE` and
   `PAYMENT_WRONG_VEHICLE` to `checkAttachment` in `packages/domain`. Refusals are audited
   like the other refusals.
2. **Schema:** add `Sticker.attachedByUserId` (Requirement 9A.1's actor) and
   `Sticker.legacySecurityCode` (restricted, Requirement 9A.5). No read path selects
   `legacySecurityCode`.
3. **Register import** in `scripts/migrate-legacy`: one unattached `Sticker` per barcoded
   `vehicles_full.csv` row, as follows.
   - `legacyBarcode` and `registeredPlateNormalized` are set from the row.
   - The status is `ISSUED`, and `templateVersion` is `transpay-legacy`.
   - It gets an opaque `stickerQrId` that is never printed.
   - Reruns are idempotent on `legacyBarcode`, and each row is audited under the migration
     actor.
   - The report lists blank or duplicate barcodes.

   **Check the column names against the export before writing any code.** They could not
   be read this session. The run is local first; Neon waits for the owner (MIG-07).
4. **`GET /vehicles/:id`** gains `onboarding` (`attachedAt`, the attaching officer's name,
   `kind`), derived from the attached sticker.
5. **`GET /stickers/legacy/:barcode`** (`verification.perform`, audited as a lookup):
   - It says recognised-not-attached with the registered plate, or attached. It never
     says "genuine".
   - An unknown barcode gets the generic 404.
   - Item 10 reuses the domain function.
6. **Web:** an "Onboard this vehicle" section on the vehicle page. Choose reattach (enter
   a barcode) or new sticker (pick from unattached stock). Take payment through the
   existing link flow for the matching fee type, then attach with a confirmed payment
   for this vehicle. The web explains the 409s.
7. Tests: domain cases for the two new refusals; e2e for each refusal, both onboarding
   paths, and the lookup.

## Files likely touched
`packages/domain/src/sticker/*`, `apps/api/src/sticker/*`, `apps/api/src/vehicle/*`,
`schema.prisma` + migration, `scripts/migrate-legacy/*`, `apps/web/.../vehicles/[id]`,
`apps/api/test/sticker.e2e-spec.ts`, `openapi.json`.

## Out of scope
The letter (item 18). Levy months and dues on scans (item 22). Plate and QR verification
screens (item 10). External responses (item 12).

## Definition of done
- [x] Attachment refused for a payment of the wrong fee type or for another vehicle, and
      audited. Refusals the domain function cannot see are audited too:
      `UNKNOWN_BARCODE` (no register row, with the presented value kept),
      `PAYMENT_NOT_CONFIRMED`, and `VEHICLE_ALREADY_HAS_STICKER`.
- [x] The register is imported locally: 2,408 unattached legacy stickers, 2,395 with a
      security code, every registered plate matching a legacy vehicle, and a rerun
      writing nothing. Checked against the export first (`barcode`, `security_code`: 2,408
      distinct, no duplicates, none without a plate).
- [x] Reattachment and new-sticker onboarding both pass end to end.
- [x] Lookup copy matches Requirement 11.2; unknown barcodes get the generic 404.
- [x] typecheck, unit (domain 230, contracts 31, api 115), and e2e green locally. The one
      e2e failure is the known `DEMO_` designations test.

**Decided while building (26 September 2026):**

- Attach accepts `stickerQrId`, the number printed on a new sticker, as well as
  `stickerId`. A register row reached that way is still checked as a legacy barcode.
- The lookup is `POST /stickers/legacy-lookup`, so the barcode stays out of URLs and logs.
- The onboarding state says *whether* the register holds a barcode for the plate, never
  which one. Otherwise a reattachment would not prove the sticker was on the vehicle.
- Sticker responses use an explicit select. Before this, `attach` returned the whole row,
  which would have carried the security code.

**Register on Neon: loaded 27 September 2026** with the owner's go-ahead. That gave
2,408 unattached barcodes, none failed, and one audit event each. Its fingerprint is
identical to the verified local import. The import now runs five at a time, and each
barcode is one batched transaction that is safe to retry.

**Pending:** the screens have not been clicked through in a browser. Printing new stickers has no template yet: `issue`
mints the record, and the QR payload needs `STICKER_SIGNING_SECRET`.
