# 65 — new-vehicles-list

## Item
A well-detailed list of the vehicles added through the System, apart from the imported ones.

## Source
PRD revision 1.20, §9 and §22; `QUESTIONS.md` VEH-42 (answered 16 November 2026), VEH-28 and VEH-43.

## Goal
Anyone who may read vehicles sees the vehicles added through the System: plate, category, branch or unit, who recorded it, when, its sticker, and (to the super administrator alone) whether it is declared. The owner's name and the chassis number reach only a holder of `vehicle.read_restricted`. A telephone or address never appears in a list.

## Approach
1. `GET /reports/added-vehicles` (`vehicle.read`): vehicles with `isLegacyImport` false inside the caller's scope, newest first, with `from`, `to`, `q`, and `limit` (at most 200) with `offset`.
2. Who recorded it comes from the earliest `vehicle.record` or `vehicle.declare` audit event of the vehicle, read in one query for the page. The sticker is read from the latest attached sticker: attached or not, and its status.
3. Declared state only where the caller holds `vehicle.declare` over the row; the owner's name and chassis only where `vehicle.read_restricted`.
4. Web: `/vehicles/added`, a table, linked from the Vehicles page.
5. PRD Requirement 9.13, `CLAUDE.md`, `openapi.json`.

## Files likely touched
`apps/api/src/report/`, `packages/contracts/src/report.ts`, `apps/web` vehicles pages, docs.

## Out of scope
An export, any phone or address, a change to the main vehicles list.

## Definition of done
- [x] Only System-added vehicles in scope are listed.
- [x] Owner name and chassis only for `vehicle.read_restricted`; no phone or address in any response.
- [x] Declared state absent for anyone without `vehicle.declare`.
- [x] Typecheck, lint, e2e pass.
