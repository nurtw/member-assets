## Item
19 — vehicle-recording

## Source
PRD §9.7–9.9, §16, §23.21 (revision 1.3). `QUESTIONS.md` VEH-23, VEH-25,
VEH-26. `ARCHITECTURE.md` Decisions 6.5, 6.6, 10.1.1.

## Goal
A Field enumerator records a vehicle on record (never declared), with required
route type and owner name/phone. Declaring a vehicle already on record updates
that same row. Owner details sit in their own table and reach no list or
verification path.

## Approach
1. Schema: `RouteType` (coded master data), `Vehicle.routeTypeId` (nullable),
   `VehicleOwner` 1:1 (`ownerName`, `ownerPhone`, `ownerAddress`, all nullable
   in the column for legacy rows). Hand-written migration adds the partial
   index `vehicle_one_on_record_per_plate WHERE status = 'ON_RECORD'`.
2. Contracts: `vehicle.record` permission, `FIELD_ENUMERATOR` role
   (organisation/master-data read, application read, `member.create`,
   `vehicle.read`, `vehicle.record`); `ROUTE_TYPE_SEED`; `recordVehicleSchema`;
   `declareVehicleSchema` gains required `routeTypeId` and `owner`; detail type
   gains `routeType` and `owner`.
3. Seed route types (INTERSTATE, INTERCITY, TOWN_SERVICE). Master data serves
   `route-types` through the existing coded-collection routes.
4. `VehicleService.record()`: scope via `can(record, org.path)`, refuse a live
   duplicate plate (409, no location), create `ON_RECORD` + owner, audit.
5. `declare()` promotes a matching `ON_RECORD` row (both-ends scope, else 409);
   new `POST /vehicles/:id/declare` promotes from the vehicle's page.
6. `update()` amends route type and owner details, audited by field name only.
7. Web: record/declare form gains route type and owner; detail shows them and
   offers "Declare" on an `ON_RECORD` row to `vehicle.declare` holders.
8. Unit + e2e tests; regenerate OpenAPI.

## Files likely touched
`apps/api/prisma/schema.prisma` + migration, `seed.ts`,
`packages/contracts/src/{permissions,vehicle,master-data}.ts`,
`apps/api/src/{vehicle,master-data}/*`, `apps/web/src/app/(app)/vehicles/**`,
`apps/api/test/vehicle.e2e-spec.ts`, `docs/reference/openapi.json`.

## Out of scope
The member-to-vehicle flow (item 20). Levy by route type (item 21). Legacy
owner import (item 09). Requiring a route type at sticker attachment (item 17).

## Definition of done
- [x] Enumerator records a vehicle; it is `ON_RECORD`, `declaredAt` null.
- [x] Missing route type or owner name/phone is refused (400).
- [x] Recording a plate with a live record is refused (409); a retired one is not.
- [x] Declaring an `ON_RECORD` plate updates the same row; out of scope → 409.
      From the vehicle page too; a legacy row's missing route type/owner is
      required first, and its legacy note survives.
- [x] Owner details absent from the list response.
- [x] Field enumerator holds neither `vehicle.declare` nor `sticker.attach`.
- [x] typecheck, unit, vehicle + openapi e2e green (29/29 vehicle).

Also landed here: sticker attachment refuses a vehicle with no route type
(Requirement 9A.2, revision 1.3), since attachment is onboarding.
