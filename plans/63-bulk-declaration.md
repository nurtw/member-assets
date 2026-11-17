# 63 — bulk-declaration

## Item
The super administrator ticks vehicles in the vehicle list and declares them in one act.

## Source
PRD revision 1.20, Requirements 9.5 and 9A.1; `QUESTIONS.md` VEH-38 (the list, not a pasted list of plates), VEH-43 (only the super administrator holds `vehicle.declare`). Needs items 59 and 60.

## Goal
Ticked vehicles are declared as they are, each with its own audit event, and the officer is told which were declared and which were skipped and why. Nothing is declared by a filter alone.

## Decisions taken at planning (the owner may change any)
1. **Declares the ticked ids only.** "Select all" ticks the rows shown, which the list caps at 200; "all matching the filter" is not offered (VEH-44).
2. **Partial, not all-or-nothing.** Each vehicle is declared by `declareRecorded` in its own transaction, so one refusal does not stop the rest. The answer lists each skipped vehicle with a reason: already declared, left the register, plate active elsewhere, or not found (outside scope and missing answer alike).
3. **Declaration only.** Bulk undeclare is not asked for (VEH-44).
4. **At most 50 ids per request**: Neon is far from the API, so a long loop would outlast a gateway. The screen sends a large selection in chunks of 50 and shows progress.

## Approach
1. Contract: `declareManyVehiclesSchema` (`vehicleIds`, 1 to 50 uuids, de-duplicated) and `DeclareManyVehiclesResult` (`declared`, `skipped: {id, reason}[]`).
2. `VehicleService.declareMany`: one by one through `declareRecorded(actor, id, {})`, mapping its refusals to reasons. No new write path, so the audit event, plate rule, and scope-before-status order are the existing ones.
3. Route `POST /vehicles/declare-many` under `vehicle.declare`, `@Documented`; regenerate `openapi.json`.
4. Web, the vehicles list: for a holder of `vehicle.declare`, a tick on each declarable row, a "select all shown" tick, an action bar "Declare N vehicles" through `ConfirmDialog`, chunked sending, and a result notice listing the skipped.
5. PRD Requirement 9.12, `CLAUDE.md`, `QUESTIONS.md` VEH-44.

## Files likely touched
`packages/contracts/src/vehicle.ts`, `apps/api/src/vehicle/`, `vehicle.e2e-spec.ts`, `apps/web/src/app/(app)/vehicles/page.tsx` and a new component, docs.

## Out of scope
Bulk undeclare, declaring "everything matching" past 200, importing a list of plates, the new-vehicles list (65).

## Definition of done
- [x] Ticked vehicles are declared, one `vehicle.declare` audit event each.
- [x] Already declared, retired, archived, active-elsewhere, and out-of-scope vehicles are skipped with a reason; the rest still declare.
- [x] More than 50 ids is a 400; nobody without `vehicle.declare` can call it.
- [x] The screen offers ticks only to a holder of the permission, and chunks a large selection.
- [x] Docs and `openapi.json` updated; typecheck, lint, e2e pass.
