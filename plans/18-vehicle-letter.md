## Item
18 — vehicle-letter

## Source
PRD Requirement 9A.6, Requirement 11.1. `QUESTIONS.md` VEH-19 (content settled),
CARD-07 (signatory titles). ARCHITECTURE.md Decision 14.1 (`pdf-lib`, no browser).

## Goal
Onboarding a vehicle produces a letter, in the same transaction as the attachment. The
letter has a random reference and a snapshot of what it prints. It renders through
template `v1` and can be downloaded from the vehicle page at any time. It carries no QR
code. The signature lines stay blank until CARD-07's signatures are registered.

## Approach
1. **Schema:** `VehicleLetter` (`vehicle_letter`) holds:
   - `vehicleId` and `stickerId`;
   - a unique `letterReference`;
   - `templateVersion`, `issuedAt`, and `issuedByUserId`;
   - the printed snapshot: plate, category, make, model, colour, sticker number, member
     name, membership number, unit, and branch;
   - the officer signature ids active at issue, as on `card`.
2. **Templates** in `vehicle-letter/templates/`: `template.ts`, `registry.ts`, `v1.ts`,
   and `registry.spec.ts` with a never-remove version list, mirroring the card. The
   emblem is read once, through a shared `pdf/emblem.ts`.
3. **`VehicleLetterService.issueInTransaction(tx, …)`**, called from
   `StickerService.attach`, so a letter exists exactly when an attachment does. The
   reference comes from `generateIdentifier`, and the issue is audited as
   `vehicle_letter.issue`.
4. **`GET /vehicles/:id/letter`** (`vehicle.read` over the vehicle; anything else is
   404) returns the latest letter as a `StreamableFile` with `no-store`. The download
   is audited as an export.
5. **`VehicleDetail.onboarding.letterReference`**, and a "Download letter" button on
   the vehicle page.
6. **Wording.** It confirms that the vehicle is recorded with NURTW Anambra State
   Council, then adds the Requirement 11.1 statement. It must not read as a certificate
   of ownership or registration. Missing values print "Not recorded", never a guess.
7. **Tests:** registry unit tests (the PDF renders, one A4 page, no QR, the statement
   present); e2e for issue-on-attach, the snapshot, the download, and out-of-scope 404.

## Files likely touched
`schema.prisma` + migration, `apps/api/src/vehicle-letter/**`, `pdf/emblem.ts`,
`sticker/sticker.service.ts` + module, `vehicle/vehicle.service.ts`,
`packages/contracts/src/sticker.ts`, the vehicle page, `sticker.e2e-spec.ts`,
`openapi.json`.

## Out of scope
- Reissuing a letter when the driver or unit changes after onboarding. This is open as
  VEH-27. Most legacy vehicles have no driver linked (2,761 of 2,841), so their letters
  print "Not recorded" for the member.
- Looking up a letter reference: item 10 reads `vehicle_letter`.
- Signature artwork: CARD-07.

## Definition of done
- [x] Attaching a sticker creates exactly one letter, snapshotting values and signatures.
      A refused attachment creates none, and a later vehicle edit leaves the letter as
      issued.
- [x] The PDF is one A4 page with the emblem, the reference, the details, the
      Requirement 11.1 statement, and two signature lines; there is no QR code. The
      unit tests decode the page and count its images.
- [x] The download is scoped, audited, `no-store`, and 404 without a letter.
- [x] typecheck, unit (api 125), and e2e green locally (175/176; the failure is the
      known `DEMO_` designations test).

**Decided while building (26 September 2026):**

- The download needs `vehicle.read`, because reading the vehicle includes its letter.
  The letter carries a member's name and number but no contact details.
- `pdf/text.ts` gained `encodable`. The standard fonts encode WinAnsi only, and
  `pdf-lib` throws on anything else, so a name such as "Ọnwụ" printed as "Onwu" rather
  than failing. **The card template has the same gap** and does not use this helper;
  it is left alone, because issued templates are not edited.
- The layout was checked by arithmetic, not by eye: this machine has no PDF renderer.
  Open one letter before the first real issue.
