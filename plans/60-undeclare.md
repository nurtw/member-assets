# 60 — undeclare

## Item
Undeclare a vehicle: uncount it, change nothing else, and allow declaring it again.

## Source
PRD revision 1.20, Requirement 9A.1; `QUESTIONS.md` VEH-39, VEH-43. Extends item 59.

## Goal
The super administrator (`vehicle.declare`, VEH-43) undeclares a declared vehicle with a
reason. It stops counting in the external total and loses nothing else: it still verifies
on its sticker, its history stays, and it may be declared again. Never a delete.

## Approach
1. Domain (`packages/domain/src/vehicle/status.ts`): add `ON_RECORD` to `ACTIVE`'s
   transitions, and `statusOnUndeclaring(from)`: `ACTIVE` goes to `ON_RECORD`; `SUSPENDED`
   and `DISPUTED` keep their status (VEH-39 follow-up, answered 16 November). Retired and
   archived are refused. Update the independent transition table in `status.test.ts`.
2. Contract: `undeclareVehicleSchema` (`reason`, at least 4 characters), as
   `setDeclarationStatusSchema` does.
3. Service `VehicleService.undeclare`: `loadVisible`, then `require(DECLARE, path)` before
   anything about status (VEH-28). Refuse a vehicle with no `declaredAt` (409). In one
   transaction set `declaredAt` to null and the new status; audit `vehicle.undeclare` with
   `before`/`after` and the reason. Handle `P2002` on `vehicle_one_on_record_per_plate` as a
   409.
4. Route `POST /vehicles/:id/undeclare` under `@RequirePermission('vehicle.declare')` and
   `@Documented`; regenerate `docs/reference/openapi.json`.
5. Web (`vehicles/[id]/page.tsx`): an "Undeclare" danger act through `ConfirmDialog` with
   its reason, offered only where the status is present and `declaredAt` is set.
6. Past totals: **no schema change.** Declaring again stamps a new `declaredAt`, so a
   vehicle counts only from then (answered 16 November). Say so in the confirm text.
7. PRD Requirement 9A.1 and `CLAUDE.md` amended.

## Files likely touched
`packages/domain/src/vehicle/`, `packages/contracts/src/vehicle.ts`,
`apps/api/src/vehicle/` (service, controller), the vehicle e2e spec, the vehicle page,
`openapi.json`, `PRD.md`, `CLAUDE.md`.

## Out of scope
Bulk declaration and undeclaration (63), the edit window (62), the dashboard counts (64).

## Definition of done
- [x] An active vehicle is undeclared to on record, uncounted, and still verifies on its sticker.
- [x] A suspended vehicle stays suspended; retired and archived refuse; an undeclared vehicle refuses.
- [x] A reason is required; the audit event records it; nothing is deleted.
- [x] Only a holder of `vehicle.declare` can; an out-of-scope vehicle answers 404.
- [x] Declaring again works and counts from the new date; the external total moves both ways.
- [x] PRD, `CLAUDE.md`, `openapi.json` updated; typecheck, lint, e2e pass.
