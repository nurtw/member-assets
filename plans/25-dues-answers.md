## Item
25 — dues-answers

## Source
PRD 1.4 Requirement 27.13, §23.22. `QUESTIONS.md` PAY-18 and PAY-19, answered 3 October
2026. Amends item 22.

## Goal
The dues schedule applies the two answers. A membership fee paid while cover is running
extends the cover instead of overlapping it. The levy stops after the month a vehicle is
retired in. Each levy month is priced at the route type the vehicle had on its 1st, so
changing a vehicle's route type never reprices months already due.

## Approach
1. **Domain** (`packages/domain/src/payments/dues.ts`):
   - `membershipCover` stacks: a fee paid while covered adds 12 months to the end of the
     cover. A fee paid after a lapse starts on the day it is paid. Each whole fee held buys
     a year.
   - `levySchedule` takes `retiredAt`. A month whose 1st is after it never falls due.
   - `routeTypeInForce` reads the route type history for an instant.
2. **Schema:** `vehicle.retired_at`, stamped with the move to `RETIRED`. A new append-only
   `vehicle_route_type_change` table, written in the transaction that sets a route type.
3. **API:** `VehicleService` writes both. `DuesService` reads them.
4. **Tests:** domain units; e2e for the stop, the per-month route type, the retirement date,
   and the history rows.

## Out of scope
Stopping the levy for a lost or cancelled sticker, or on a sale (VEH-08 is open). A
backfill of route type history: none is needed, see below.

## Definition of done
- [x] An early fee extends cover from its end; a lapse owes one fee.
- [x] Nothing falls due after the month of retirement.
- [x] A month keeps the route type of its 1st after the vehicle's route type changes.
- [x] Domain 329; dues and vehicle e2e pass. The migration is additive.

**Decided while building (3 October 2026):**

- **The history records what each change replaced.** It starts with item 25, so a month
  before a vehicle's first row takes the route type that row replaced. A vehicle with no
  rows has never changed, and its current route type is the answer. No backfill was needed.
- **A vehicle already retired** takes its last update as its retirement date. The migration
  sets it for `RETIRED` rows only, which the legacy import never produces.
- **Each whole fee buys a year.** More than one fee in a single payment now stacks, where
  item 23 held the surplus. Links and allocations each pay one fee, so this changes nothing
  in practice.
