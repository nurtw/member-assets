## Item
30 — settlement-screen

## Source
PRD Requirements 27.7 and 27.12; `QUESTIONS.md` PAY-07, PAY-11, PAY-13. Approved by the
owner on 5 October 2026, to come before item 15.

## Goal
A super administrator sets the NURTW settlement account and the dedicated-account
percentage from a Settings page, choosing the bank from Paystack's list and seeing the
account name before anything is saved. Today both are reachable only by calling the API.

## Approach
1. **Contracts:** a ten-digit account-number rule shared by both schemas; a resolve schema;
   the `SettlementState` and bank types.
2. **API, three new routes**, each needing `payment.manage_settlement`:
   - `GET /payments/settlement`: the bank, account name, last four digits, and percentage.
     The full account number is not returned.
   - `GET /payments/banks`: Paystack's active Nigerian banks, cached for an hour.
   - `POST /payments/settlement/resolve`: the name Paystack holds for an account, for
     confirmation (Requirement 27.12). Audited without the name.
3. **Errors the screen can explain:** a wrong password, an account Paystack cannot
   resolve, and a refused percentage answer `400` naming the field, as item 28's password
   checks do. Saving returns `SettlementState`, not the whole row.
4. **The page** (`/settings/settlement`): current state; change the account (bank, number,
   look up, confirm the name, reason, password); set the percentage, explained with the
   PAY-11 rule. Linked from the navigation for holders of the permission.
5. **Tests and docs**: e2e for the new routes and errors; `OPERATIONS.md`; `openapi.json`.

## Files likely touched
`packages/contracts/src/payments.ts`, `apps/api/src/payments/`, `apps/api/test/payments.e2e-spec.ts`,
`apps/web/src/app/(app)/settings/settlement/`, `apps/web/src/app/(app)/layout.tsx`,
`docs/reference/`.

## Out of scope
Opening dedicated accounts (item 23). Choosing the percentage itself (the owner, PAY-11).

## Definition of done
- [x] The bank is chosen from Paystack's list, and the name is shown before saving.
- [x] No response carries the full account number except the save request itself.
- [x] A wrong password, an unresolvable account, and a refused percentage each say so.
- [x] Every attempt is audited, as before; the lookup is audited without the name.
- [x] Only holders of `payment.manage_settlement` reach the page or the routes.
- [x] Tests pass; `openapi.json` is regenerated.

**Pending:** not opened in a browser. The bank list's paging is written to Paystack's
documented cursor and checked against a stub, not against Paystack itself.
