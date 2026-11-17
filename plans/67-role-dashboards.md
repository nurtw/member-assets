# 67 — role-dashboards

## Item
Home shows counts for what each officer may read, besides the quick actions.

## Source
`QUESTIONS.md` GOV-25 (open: the Union has not named each role's counts); items 64 to 66.

## Goal
Home carries blocks of counts. A block appears for an officer only by a permission they hold, and counts only what they may already read. A role is a bundle of permissions, so a role's dashboard is the blocks its permissions open. Provisional until the Union names the counts.

## Approach
1. `GET /reports/member-counts` (`member.read`): active, suspended, registered today and in the last 7 days, inside scope.
2. `GET /reports/vehicle-counts` (`vehicle.read`): vehicles in scope, added through the System, added today; and, only for a holder of `vehicle.declare`, on record and declared.
3. Home blocks: Members (`member.read`), Vehicles (`vehicle.read`), Stickers (item 64, `sticker.read`), Onboarding today (item 66, `report.read`). No block appears with nothing it may read.
4. Counts load once, on Home, with no polling.
5. `CLAUDE.md`, `QUESTIONS.md` GOV-25 note, `openapi.json`.

## Files likely touched
`apps/api/src/report/`, `packages/contracts/src/report.ts`, `apps/web` Home, docs.

## Out of scope
Charts, per-role layouts the Union has not named, the onboarding report's own screen (66).

## Definition of done
- [x] Each block is offered only to a holder of its permission, and counts only inside scope.
- [x] The declared count reaches only a holder of `vehicle.declare`.
- [x] No block changes what an existing list shows.
- [x] Typecheck, lint, e2e pass.

## Settled 17 November 2026 (GOV-25 answered)
The owner accepted the per-role table: the super administrator also sees vehicles not yet
declared; the vehicle-record officer has a Home and sees vehicles with no sticker; the field
enumerator sees only their own work; names in the report go only to holders of `report.read`.
Built: `withoutSticker` and `declaration.notDeclared`, `GET /reports/my-work` (`@SignedIn`), the
"Your work" block, the oversight rule for the vehicles block, and `vehicle.update` among the
permissions that open Home.

- [x] The vehicle-record officer has a Home with the vehicles and those with no sticker.
- [x] A field enumerator sees only their own numbers, never another officer's.
- [x] The super administrator sees the vehicles not yet declared; no one else does.
- [x] A count never shows a retired vehicle's status to one who may not see it.
