## Item
21 — fee-type-settings

## Source
PRD Requirements 27.1, 27.2, 27.11, §23.20 (revision 1.3). `QUESTIONS.md`
PAY-02 (revised), PAY-14.

## Goal
A holder of `fee_type.manage` changes a fee type's default amount and the
levy's amount per route type, each change audited with a mandatory reason. The
levy stands at ₦7,000 for every route type. A levy payment charges the amount
for the vehicle's route type.

## Approach
1. Schema: `FeeTypePrice` (`feeTypeId`, `routeTypeId`, `amountKobo`, unique on
   the pair). Migration also moves `LEVY` to 700,000 kobo and inserts one
   700,000 row per seeded route type, each with an `audit_event` naming the
   revision (PAY-02, 26 September 2026) — so an environment already seeded at
   ₦5,000 is corrected with a trace, not silently.
2. `LAUNCH_FEE_TYPES` LEVY → 700,000; seed creates route-type prices on first
   run only (`update: {}`), never overwriting a Union change.
3. `FeeTypeService.amountFor(feeType, subject)`: a vehicle-charged fee uses the
   vehicle's route-type price if one exists, else the default amount. A
   vehicle with no route type is charged the default.
4. Routes: `GET /fee-types`, `PATCH /fee-types/:code` (amount, label, active,
   reason), `PUT /fee-types/:code/prices/:routeTypeCode` (amount, reason) — all
   `fee_type.manage`, audited before/after.
5. `PaymentsService.initiate` uses `amountFor`.
6. Web settings page listing fee types and route-type amounts, with edit.
7. Unit tests for `amountFor`; e2e for edit, audit, and priced initiation.

## Files likely touched
`schema.prisma` + migration, `seed.ts`, `apps/api/src/payments/*`,
`packages/contracts/src/payments.ts`, `apps/web/src/app/(app)/settings/**`,
`apps/api/test/payments.e2e-spec.ts`, `docs/reference/openapi.json`.

## Out of scope
Which months are owed (item 22). Dedicated accounts (item 23).

## Definition of done
- [x] LEVY default and each route type read ₦7,000 after migration (applied to
      Neon 26 September 2026, with 4 audit events; migration verified
      drift-free against the schema on the local database).
- [x] Amount change without a reason is refused; with one, audited.
- [x] Levy initiation for an interstate vehicle charges its route-type price.
- [x] typecheck, unit, payments + openapi e2e green.

Settings page at `/settings/fees` (nav "Fees", `payment.read` to view,
`fee_type.manage` to change). Not yet clicked through in a browser.
