## Item
53 — onboarding-day

## Source
The project owner's directions of 18 October 2026, the day before onboarding:
`QUESTIONS.md` VEH-37 (free stickers), ORG-06 (the designations), GOV-11 (the go-live date).
PRD revision 1.17: Requirements 9A.4 and 27.2, §23.4, §23.27.

## Goal
Onboarding can begin on 19 October 2026: a sticker is assigned without a payment while its
fee is ₦0, the designations are the Union's own with Driver and Conductor first, and dues
go live that day.

## Approach
1. **Free stickers.** `checkAttachment` takes the fee in force and a nullable payment; no
   payment is needed while the fee is nothing. The attach route takes `paymentId` as
   optional. The onboarding state carries each sticker fee, and the panel skips the payment
   step for a free sticker. A fee amount may be nothing. No payment is started for nothing.
2. **The designations.** A migration takes the `DEMO_` prefix off the eight codes and puts
   Driver and Conductor first. The seed creates the same list; the demo flag goes.
3. **On Neon, with the owner's go-ahead:** the migration; `dues.go_live_date` set to
   2026-10-19; both sticker fees set to ₦0, with their history and an audit event.
4. PRD 1.17, `QUESTIONS.md`, `CLAUDE.md`, `OPERATIONS.md`.

## Files likely touched
`packages/domain/src/sticker/attachment.ts`, `packages/contracts/src/{sticker,payments,master-data}.ts`,
`apps/api/src/sticker/`, `apps/api/src/payments/payments.service.ts`, `apps/api/prisma/`,
`apps/web/src/components/{onboarding-section,sticker-prompt}.tsx`,
`apps/web/src/app/(app)/settings/fees/page.tsx`.

## Out of scope
Items 50 and 51 (dedicated accounts for all, the card with the account number): they wait
on PAY-27's Paystack test, GOV-08, and CARD-09.

## Definition of done
- [x] A sticker whose fee is ₦0 attaches without a payment; every other condition holds; a
      payment presented anyway is checked. Tested in domain and end to end.
- [x] No payment is started for a fee of nothing.
- [x] The designations carry no `DEMO_` code, Driver and Conductor first.
- [x] Lint, typecheck, and every test pass.
