# 59 — declare-by-plate

## Item
Declare a vehicle on its plate alone, and keep declared status the super administrator's.

## Source
PRD revision 1.20; `QUESTIONS.md` VEH-38, VEH-43, GOV-06. Supersedes VEH-34 and the route and
owner requirements of revision 1.3. Extends item 57.

## Goal
Recording needs only a plate. Declaring needs no field and no prior status but "not retired
or archived". No edit, driver link, or sticker asks whether a vehicle is declared. Only the
super administrator sees declared status or declares.

## Approach
1. Read `declareRecorded`, `promote`, and `statusChangeTarget`. A suspended or disputed
   vehicle is declared by stamping `declaredAt` while it **keeps its status**: confirm
   nothing reads `ACTIVE` as "declared" for it, and write that rule in `packages/domain`.
2. Contracts: record, declare, and declare-recorded take `routeTypeId`, `owner`, and
   `chassisVinRestricted` as optional. Branch or unit is optional (the recording officer's
   own unit); category is optional. An amendment still never blanks a chassis number.
3. Service: drop the "missing route, owner, chassis" refusals in `promote`; allow `ON_RECORD`,
   `SUSPENDED`, `DISPUTED`; refuse `RETIRED`, `ARCHIVED`. Keep one active declaration per plate.
4. Make the driver link and sticker attach need no declaration; add a test for each.
5. A vehicle with no route type owes the levy's default; its page says the route type is
   missing.
6. `vehicle.declare` cannot be granted (`POST /users/:id/grants`, and roles): the super
   administrator's role alone holds it. Check that no screen offers it.
7. Web: the vehicle form's fields optional; no asterisks.
8. Amend PRD Requirements 9.4, 9.8, 9A.1; replace `CLAUDE.md`'s "required at the API".

## Files likely touched
`packages/contracts/src/vehicle.ts`, `packages/domain`, `apps/api/src/vehicle/`,
`apps/api/src/users/`, `apps/api/src/payments/dues.service.ts`, `apps/web` vehicle form and
page, e2e tests, `PRD.md`, `CLAUDE.md`.

## Out of scope
Undeclare (60), the edit window (62), bulk declaration (63), registration (61).

## Definition of done
- [ ] A vehicle is recorded and declared with a plate alone; tests prove it.
- [ ] A suspended or disputed vehicle is declared and keeps its status; retired and archived refuse.
- [ ] Driver link and sticker attach work on an undeclared vehicle.
- [ ] `vehicle.declare` cannot be granted; nobody but the super administrator sees status.
- [ ] No-route-type vehicle prices at the default and shows it.
- [ ] PRD and `CLAUDE.md` amended; typecheck, lint, and e2e pass.
