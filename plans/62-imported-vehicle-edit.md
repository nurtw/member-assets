# 62 — imported-vehicle-edit

## Item
An officer corrects an imported vehicle's details: administrators at any time, everyone else once.

## Source
PRD revision 1.20, §9 and §16; `QUESTIONS.md` VEH-40 (answered 16 November 2026; the permission and the scope of one edit settled here, in the owner's words "settled when item 62 is planned").

## Goal
An imported vehicle (`isLegacyImport`) can be completed after the import. A branch or unit administrator or the super administrator edits it whenever they need. A field enumerator or a vehicle-record officer gets **one** edit of it, after which it is locked to them. Nothing else about editing a vehicle changes.

## Decisions taken at planning (to be confirmed by the owner)
1. **Senior is a permission, not a role:** a new `vehicle.update_imported` ("Amend an imported vehicle at any time"), in the branch or unit administrator bundle and held by the super administrator. Grantable.
2. **One edit means one save per vehicle**, shared by whoever is not senior. The first save claims `importedEditedAt` by a conditional `updateMany`, as item 61 claims `correctedAt`.
3. **One edit may change** route type, category, make, model, colour, chassis number, notes, and owner details (set what is sent, never blank). **It may not change the plate, the branch or unit, or the linked member.** Seniors keep today's full edit.
4. The limit applies to imported vehicles only. A vehicle recorded through the System edits as it does today.

## Approach
1. Domain `packages/domain/src/vehicle/`: `importedEditRight({imported, senior, editUsed})` returns `ANYTIME`, `ONCE`, `NONE` (a vehicle not imported is `ANYTIME` for a holder of `vehicle.update`); tests.
2. Prisma: `vehicle.imported_edited_at TIMESTAMP(3)` nullable; migration. Add `vehicle.update_imported` to the catalogue and the administrator bundle.
3. `VehicleService.update`: for an imported vehicle without `vehicle.update_imported`, refuse a body naming plate, `organisationId`, or `declaredByMemberId` (403), claim the edit (409 when used), then write; audit `vehicle.update` with `editRight` and fields only.
4. Enumerator route `PATCH /vehicles/:id/imported` under `vehicle.record` (the guard allows one permission per route), sharing the same method; 409 on a vehicle not imported.
5. `VehicleDetail.edit` for the caller; vehicle page offers Edit by it and says "one edit left" or "locked".
6. PRD §9, §16; `CLAUDE.md`; `QUESTIONS.md` VEH-40; `OPERATIONS.md` (run `db:seed` after `db:deploy`); `openapi.json`.

## Files likely touched
`packages/domain/src/vehicle/`, `packages/contracts/src/{vehicle,permissions}.ts`, `apps/api/prisma/`, `apps/api/src/vehicle/`, `vehicle.e2e-spec.ts`, `apps/web` vehicle page and form, docs.

## Out of scope
Bulk declaration (63), a member-edit window, changing a plate.

## Definition of done
- [x] An administrator edits an imported vehicle repeatedly.
- [x] An enumerator and a record officer each succeed once per vehicle, then 409; a second person also gets 409.
- [x] Plate, branch or unit, and linked member are refused to non-seniors.
- [x] Out-of-scope vehicle answers 404; non-imported vehicle unchanged.
- [x] Docs, `openapi.json` updated; typecheck, lint, e2e pass.
