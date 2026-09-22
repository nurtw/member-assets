# Plan 16 — Payments

## Item

Payments module (PRD §27): fee types, the processing-fee rule, Paystack
integration (link and DVA), webhook confirmation, ledger, settlement account.

## Source

PRD §27 (Requirements 27.1–27.14), §23.20, `QUESTIONS.md` PAY-01–13.

## Goal

A member or vehicle owner can be charged a fee type at its current settings
amount, pay by Paystack link (and, for NURTW dues, DVA), have the payment
confirmed by webhook + server verification, and see it land in an append-only
ledger — with the processing-fee formula, settlement split, and audit trail
all matching §27 exactly.

## Approach

1. `packages/domain/src/payments/fee-rule.ts` — pure function implementing
   Requirement 27.3 (contractor fee, total-to-charge). Test against the six
   PAY-10 figures first; nothing else depends on Paystack or Prisma.
2. Prisma schema: `FeeType` (code, label, amountKobo, recurrence,
   chargedAgainst, settlement, active, isPlaceholder), `Payment` (feeTypeId,
   subjectType/subjectId, amountDue, contractorFee, totalCharged, channel,
   paystackReference, status, confirmedAt), `LedgerEntry` (append-only,
   paymentId, direction, amountKobo), `SettlementAccount` (bankCode,
   accountNumber, accountName, subaccountCode, history via a linked
   `SettlementAccountChange` table). Migration + `db:generate`.
3. Seed the four launch `FeeType` rows (STICKER_REATTACHMENT, STICKER_NEW,
   LEVY, MEMBERSHIP) at the amounts fixed in PRD 27.2.
4. `apps/api/src/payments/` module: `PaystackClient` (thin wrapper reading
   `PAYSTACK_SECRET_KEY`), `PaymentsService` (initialise, verify, refund),
   `SettlementService` (create/update the one subaccount, in place), webhook
   controller route with raw-body verification (HMAC-SHA512) — needs
   `express.raw()` scoped to that one route in `main.ts`, not global.
5. New permissions in `packages/contracts/src/permissions.ts`:
   `sticker.attach`, `payment.refund`, `payment.settlement.manage`.
6. Audit every mutating action via `AuditService` (settlement changes carry
   mandatory `reason`).

## Files likely touched

`packages/domain/src/payments/*`, `apps/api/prisma/schema.prisma` +
migration, `apps/api/src/payments/*`, `packages/contracts/src/permissions.ts`,
`apps/api/src/main.ts` (raw body for webhook route).

## Out of scope

Sticker attachment logic and the Transpay register (item 17). Vehicle letter
(item 18). Card renewal UI showing dues status.

## Definition of done

- [ ] Fee-rule function reproduces all six PAY-10 figures exactly.
- [ ] Fee types are DB rows; adding one needs no deploy (27.1).
- [ ] Webhook rejects an invalid signature without a DB query; confirmation
      requires webhook + server verification, idempotent by reference (27.5).
- [ ] Settlement account: first save creates the subaccount, every later save
      updates it in place; never a second subaccount (27.12).
- [ ] Settlement change requires its permission + password re-entry, no
      second approver, full before/after audit incl. failed attempts.
- [ ] `pnpm typecheck` and `pnpm --filter api test` pass.
