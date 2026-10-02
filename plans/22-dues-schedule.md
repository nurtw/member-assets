## Item
22 — dues-schedule

## Source
PRD Requirements 27.13, 27.8, 27.9, 11.3. `QUESTIONS.md` PAY-03, PAY-04, PAY-05, PAY-12,
GOV-11 (go-live date, open).

## Goal
The System can say what a vehicle owes in levy and whether a member's membership fee is
paid. It derives both from the schedule and the ledger, never from a stored flag. Dues
status shows on internal screens only.

## Approach
1. **Price history.** `fee_amount_history` is append-only: fee type, route type or none,
   amount, `effectiveFrom`. `FeeTypeService.update` and `setPrice` write to it in their own
   transaction. The first change to a price also writes the old amount as the baseline.
   Without history, raising the levy would re-price months already paid.
2. **Domain, pure** (`packages/domain/src/payments/`):
   - `resolveFeeAmountAtKobo` gives the amount in force on a date.
   - `levySchedule` covers one month per calendar month (Africa/Lagos), from the month
     **after** onboarding, with no proration. Net ledger credit is applied oldest month
     first, and any remainder is held as credit (PAY-12).
   - `membershipCover` gives 12 months from each payment date. The first due is on
     approval, or on the go-live date for a migrated member.
   - Statuses are `NOT_DUE`, `PAID`, `OWED`, and `IN_ARREARS`. Owed means only the current
     period is unpaid; in arrears means an earlier one is.
3. **`DuesService`** in the payments module:
   - Onboarding date is the vehicle's earliest `attachedAt`.
   - Credit is ledger credits less debits on confirmed payments for that subject and fee.
   - The go-live date is the `dues.go_live_date` setting. It is unset until GOV-11, so a
     migrated member's fee is not yet due.
4. **Routes:** `GET /vehicles/:id/dues` (`vehicle.read`, scoped) and
   `GET /members/:id/dues` (`member.read`, scoped). An out-of-scope record answers 404.
5. **Web:** a dues panel on the vehicle page, the application page, and the card screen
   (PAY-05), with a payment-link button for `payment.initiate` holders. The status is
   given in words, never colour alone (DESIGN §3).
6. **Tests:** domain unit tests for every rule above; e2e for history on a price change,
   both routes, scope, and a paid month staying paid after a price rise.

## Files likely touched
`schema.prisma` + migration, `packages/domain/src/payments/*`,
`apps/api/src/payments/{dues.service,dues.controller,fee-type.service}.ts`,
`settings.service.ts`, `packages/contracts/src/payments.ts`, web vehicle, application and
card pages, `payments.e2e-spec.ts`, `openapi.json`.

## Out of scope
Dedicated accounts and allocating one transfer across several dues (item 23). Dues beside
a scan result (item 10 calls `DuesService`). Any external response: dues never leave the
System.

## Open, built around
- **PAY-18:** an early membership payment, and whether missed years accumulate. Built
  literally: cover runs from the payment date, and one fee is outstanding at most.
- **PAY-19:** when a levy stops, and re-pricing on a change of route type. Built: it never
  stops, and months are priced at the vehicle's current route type.

## Definition of done
- [x] A month paid at ₦7,000 stays paid after the levy rises. Unit-tested, and e2e
      through a real price change via `/fee-types`, which writes the history and a
      baseline.
- [x] The levy starts the month after onboarding, on Lagos time; arrears accumulate.
      Credit goes to the oldest month first; a refund reverses it.
- [x] Membership is paid for 12 months from payment, and is owed again after a refund. A
      migrated member is not due until `dues.go_live_date` is set.
- [x] Both routes are scoped (404 outside, 403 without the permission). The vehicle
      record carries no dues fields.
- [x] typecheck (api, web), lint, and e2e green locally: dues 14/14, payments and openapi.

**Decided while building (27 September – 2 October 2026):**

- A refunded payment counts for nothing, because a reversing debit nets it to zero.
- A route type priced separately for the first time has no baseline row. Before that
  date, the default applied, which is how it would have been charged.
- A fee type's history is read whether or not the fee is still active: a retired fee
  still has a past to price.
- Test residue: a spec that changes a real fee removes its own history rows. A baseline
  row it caused stays, and it is accurate: the price really was that amount until then.
