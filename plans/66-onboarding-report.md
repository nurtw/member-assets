# 66 — onboarding-report

## Item
How many people were onboarded each day, and by which officer.

## Source
PRD revision 1.20, §22; `QUESTIONS.md` GOV-25 (still open: built to its recommendation).

## Goal
For a range of days, counts per day per officer of members registered, vehicles recorded, vehicles declared, and stickers attached, by the officer's name, with totals. Nothing new is collected.

## Decisions taken at planning (GOV-25 stays open; the owner may change any)
1. By the officer's **name**, to a holder of `report.read`, over the records inside that officer's scope. An officer does not read another's count unless they hold it.
2. Days are Lagos days, at most 92 days, default the last 14.
3. Only what the System recorded: members with a registration record (so the imported are not counted), `vehicle.record` and `vehicle.declare` audit events, and stickers' `attachedAt`.

## Approach
1. Domain: `lagosDay(date)` and `tallyOnboarding(events)`: pure, tested.
2. `GET /reports/onboarding?from&to` (`report.read`): reads the four sources inside scope, tallies, resolves officer names.
3. Web: `/reports/onboarding`, a table by day and officer with totals and a date range; a navigation entry for holders of `report.read`.
4. PRD §22, `CLAUDE.md`, `QUESTIONS.md` GOV-25 note, `openapi.json`.

## Files likely touched
`packages/domain/src/report/`, `packages/contracts/src/report.ts`, `apps/api/src/report/`, `apps/web` reports page and navigation, docs.

## Out of scope
An export, per-device or per-location counts, an officer's own scorecard.

## Definition of done
- [x] Counts per day per officer for each of the four, in scope only, Lagos days.
- [x] Imported members and imported vehicles are not counted.
- [x] A range over 92 days, or from after to, is a 400.
- [x] Typecheck, lint, e2e pass.
