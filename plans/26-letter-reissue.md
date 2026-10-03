## Item
26 — letter-reissue

## Source
PRD 1.4 Requirement 9A.6, §23.22. `QUESTIONS.md` VEH-27, answered 3 October 2026. Amends
item 18.

## Goal
When a vehicle's details change after onboarding (a driver is linked, or it moves unit), an
officer can reissue its letter. The new letter is a fresh snapshot under a new reference.
The one it replaces is kept exactly as printed, marked superseded, and no longer downloads.

## Approach
1. **Schema:** `vehicle_letter` gains `superseded_at`, `replaces_letter_id`, and
   `reissue_reason`.
2. **API:** `POST /vehicles/:id/letter/reissue` takes `{ reason }` and needs
   `sticker.attach` over the vehicle. The download route serves only the current letter.
3. **Web:** a reason field and a Reissue button in the vehicle page's letter section.
4. **Tests:** e2e in the sticker suite.

## Out of scope
Listing or downloading superseded letters. Reissuing automatically when details change.

## Definition of done
- [x] A reissue creates a new letter with a new reference and the current details.
- [x] The old letter keeps its printed values and is marked superseded.
- [x] Only the current letter downloads. The reissue is audited with its reason.
- [x] A reason is required. Without `sticker.attach` the request is refused; with no letter
      it answers 404.
- [x] Sticker e2e 35/35. The migration is additive.

**Decided while building (3 October 2026):**

- **The reissued letter prints the sticker on the vehicle now**, which a later attachment
  may have changed since the first letter.
- **Two reissues at once cannot both succeed.** The second finds the letter already
  superseded and answers 409.
- **The self-reference uses `NoAction`**, so a test cleanup can remove a letter and its
  replacement together. The application never deletes a letter.
