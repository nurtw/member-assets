## Item
57 — sticker-verifies

## Source
The owner's direction of 21 October 2026, reversing `QUESTIONS.md` VEH-22 (adopted by
recommendation on 22 September). PRD §4 principle 2, Requirement 9A.1, §23.19; PRD §13
(the external total) unchanged.

## Goal
A vehicle with an active sticker verifies on every channel (the Verify page, the external
API, the public page when built), declared or not. Declaring only counts it in the
external total. A suspended, retired, disputed, or archived vehicle still does not
verify, and an undeclared vehicle may be suspended or retired.

## Approach
1. **The rule** (`decideVerification`, `packages/domain`): a plate verifies when its
   vehicle carries an attached `ACTIVE` sticker and is not withheld; a sticker or combined
   check as now, without the declaration. `NOT_DECLARED` gives way to `VEHICLE_WITHHELD`
   (suspended, retired, disputed, archived). VEH-28 holds: anyone without
   `vehicle.declare` still reads `RECORD_INCOMPLETE` for it.
2. **The facts** (`VerificationRecordsService`): the plate check learns whether the
   vehicle has an active attached sticker.
3. **Suspending and retiring an undeclared vehicle** (`vehicle/status.ts`):
   `ON_RECORD → SUSPENDED, RETIRED`. Lifting a suspension returns to `ACTIVE` only if
   the vehicle was declared (`declaredAt`), otherwise to `ON_RECORD`, so lifting never
   declares or counts a vehicle. Retiring stops the levy as before.
4. **Unchanged:** the external total (`isCountedAt`), who may declare, what declaring
   requires, disputes, and who sees a declaration status.
5. **Screens:** the Verify page's reasons, the vehicle page's "On record" notice, and
   the suspend and retire actions offered on an undeclared vehicle.
6. **Documents:** PRD 1.19, `QUESTIONS.md` VEH-22, `CLAUDE.md` domain rule 1, API.md
   where it states the rule.

## Files likely touched
`packages/domain/src/verification/`, `packages/domain/src/vehicle/status.ts`,
`apps/api/src/verification/`, `apps/api/src/vehicle/`, their e2e suites,
`apps/web/src/app/(app)/verify/`, `apps/web/src/app/(app)/vehicles/[id]/`, `PRD.md`,
`QUESTIONS.md`, `CLAUDE.md`, `docs/reference/API.md`.

## Out of scope
The external total, the public sticker page (GOV-08), and declaring itself.

## Definition of done
- [x] An undeclared vehicle with an active sticker verifies, internally and externally.
- [x] A suspended, retired, or disputed vehicle does not, whatever its sticker.
- [x] An undeclared vehicle is suspended, lifted back to on record, and retired.
- [x] The external total is unchanged (its code is untouched).
- [ ] Every suite passes; clicked through. Unit suites, typecheck, lint, and the
      verification and vehicle e2e suites passed; the owner had it pushed (21 October)
      before the full e2e run and the click-through finished.
