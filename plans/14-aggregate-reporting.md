## Item
14 — aggregate-reporting

## Source
PRD §13 (Requirements 13.1–13.5), §12.7, §23.12; proposal §13. `ARCHITECTURE.md` Decisions
8.1 and 9.10. Acceptance criteria 9 and 14. Builds on items 11–13. Owner decisions of
4 October 2026: totals by zone or branch only, filtered totals rounded to the nearest 10,
and month, quarter, and year periods.

## Goal
An approved organisation reads the number of NURTW vehicles, overall or by an approved
filter, without learning anything about one vehicle. A small filtered total is suppressed,
and no total can be subtracted from another to uncover one.

## Approach
1. **Domain:** reporting periods (`2026-09`, `2026-Q3`, `2026`) and when each ends in
   Lagos; suppression below the floor, then rounding; the count rule as at an instant.
2. **Contracts:** strict query schemas (an unknown filter is refused, Requirement 13.1),
   and the response shapes.
3. **API:** `GET /aggregates/vehicles/total` under `aggregate:vehicles:total`, refusing
   any parameter; `GET /aggregates/vehicles` under `aggregate:vehicles:read`, by zone or
   branch, vehicle category, and period; `GET /metadata/organisation` under
   `organization:metadata:read`, so an organisation can name a zone, branch, or category.
4. **Counting:** vehicles both declared and onboarded as at the period's end, never retired
   by then (Requirement 13.5). The query always runs; suppression is applied to its result
   (Requirement 13.4). Each request is audited and logged.
5. **Settings:** the floor (25) and the rounding base (10) are runtime settings.
6. **Tests and docs.**

## Files likely touched
`packages/domain/src/aggregate/`, `packages/contracts/src/aggregate.ts`,
`apps/api/src/aggregate/`, `apps/api/prisma/` (the setting row),
`apps/api/test/aggregate.e2e-spec.ts`, `docs/reference/`.

## Out of scope
Internal reporting that breaks out on record, onboarded, and declared (the reporting
module). Totals of members. Totals by unit or LGA. Go-live work (item 15).

## Definition of done
- [x] The grand total refuses any parameter as a request error (Requirement 13.2).
- [x] A filtered total below 25 answers `SUPPRESSED`, by the same route, status, and shape
      (criterion 9, Requirement 13.4).
- [x] A filtered total is rounded to the nearest 10; the grand total is exact.
- [x] A migrated vehicle counts only once onboarded and declared (criterion 14).
- [x] No answer names a vehicle, a declaration status, or dues (criterion 15).
- [x] Each request is audited, logged, and held to the aggregate rate.
- [x] Tests pass; `openapi.json` is regenerated.

**Decided while building (4 October 2026):**

- **Two routes, not one.** A route names one scope, so the grand total is at
  `/aggregates/vehicles/total` (PRD Requirement 13.8 amends 13.5's single endpoint).
- **A metadata route** under `organization:metadata:read`, so an organisation can name a
  zone, branch, or category. It lists the Union's structure, never a member or vehicle.
- **Suppression is decided on the exact count, then the rest is rounded**, so 24 reads
  `SUPPRESSED`, not 20.
- **The statement does not say "declared"** (Requirement 12.7). It says "vehicles held in
  NURTW records under the requested criteria".
- **Today's status applies to past periods**, since suspensions are not kept as history.
  Recorded at PRD §23.25.
- **A filter naming nothing in the metadata is a `400`.** The structure is published, so
  this tells the caller nothing about the record set.

**Pending:** not opened in a browser (no screen). Internal reporting is the reporting
module's.
