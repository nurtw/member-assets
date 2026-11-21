# 68 — onboarded-dashboards

## Item
The dashboards count vehicles onboarded, and the field enumerator's is made simple.

## Source
The owner's voice notes of 18 November 2026, recorded as `QUESTIONS.md` GOV-26; PRD revision
1.21, Requirement 9.14. Amends GOV-25 and items 66 and 67.

## Goal
A vehicle is onboarded once a sticker is attached, legacy or new. Every dashboard leads with
the vehicles onboarded, total first and the legacy and new split beneath. The enumerator sees
only their own totals since their account was made and for a day they choose, and nothing
about declaring.

## Approach
1. Domain: `firstAttachments` (the officer who attached a vehicle's first sticker onboarded
   it; a replacement is not a second onboarding) and `countOnboarded`. The tally's kinds
   become members registered, vehicles recorded, and imported and added vehicles onboarded.
2. `GET /reports/my-work?day=`: totals since the account was made, the day asked for (today
   by default), and the vehicles the officer added that have no sticker yet.
3. `GET /reports/vehicle-counts`: onboarded and onboarded today (each split), onboarded with
   no member linked, no sticker yet; declared figures still only for `vehicle.declare`.
4. `GET /reports/member-counts`: registered in all and today, active, suspended.
5. `GET /reports/onboarding`: vehicles onboarded (split), members registered, vehicles
   recorded. No declaring.
6. Web: the "Your work" block with a date picker; the area sticker counts only for an
   officer who oversees; today's block lists each officer; the report's columns.
7. Docs: PRD 1.21, GOV-26, `CLAUDE.md`, `openapi.json`.

## Out of scope
A per-day history list for the enumerator (the date picker covers a day); further
administrator figures the owner did not finish naming.

## Definition of done
- [x] A vehicle counts as onboarded once, for the officer who attached its first sticker.
- [x] The enumerator's counts carry nothing about declaring, and no one else's numbers.
- [x] The declared figures still reach only a holder of `vehicle.declare`.
- [x] Domain, web, typecheck, lint, and the report e2e suite pass.
