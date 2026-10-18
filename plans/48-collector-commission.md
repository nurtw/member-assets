## Item
48 — collector-commission

## Source
The owner's direction of 18 October 2026 (`QUESTIONS.md` PAY-22): collectors are paid "a
commission on every payment", so that "they gain from the system instead of fighting it".
PAY-24 (the rate, who funds it, how it is paid) is open. Needs item 47.

## Goal
Every collection earns its collector a commission at the rate in force, recorded with it.
The Union sees what each collector has earned and what they have been paid.

## Approach
1. **The rate is a setting**, changed with a reason and audited, like every amount
   (Requirement 27.2). Its shape (a percentage, a fixed sum, a cap) is PAY-24's. Each
   commission records the rate it used, so a change never reprices the past.
2. **Earned in the collection's own transaction** (`collector_commission`, append-only),
   and reversed with the collection if that is corrected.
3. **Paid as PAY-24 settles:**
   - **as float**, credited at once: no money moves, and the Union receives that much less
     in dues; or
   - **by the Union, from a statement**, outside the System, which records each payment
     (amount, date, reference, who recorded it) against what was earned.

   Paying through Paystack Transfers is not planned. Nothing in the System sends money out
   today, and this would be the first thing that did.
4. **Statements** by collector and period: collected, earned, paid, and still owed, derived
   and never stored. On the collector's own screen and on Union → Collectors.
5. **A collector's own dues.** Whether a collector earns commission on them is PAY-24's.
   Until it is answered, such a collection is marked as their own on the statement, so the
   Union can see it.

## Files likely touched
`apps/api/src/collection/`, `packages/domain/src/` (the commission rule, as a pure
function), `apps/api/prisma/schema.prisma` and a migration, the collector screens, `PRD.md`.

## Out of scope
Paystack Transfers. Tax. Commission on dedicated-account transfers, which no collector
touches.

## To settle before building (PAY-24)
- The rate: a percentage, a fixed sum, or both, and any cap.
- Who funds it: NURTW's share, the contractor's, or both.
- How it is paid, and how often.
- Whether a collector earns commission on their own dues.

## Definition of done
- [ ] Each collection records its commission at the rate in force; a correction reverses it.
- [ ] A change of rate is audited with a reason, and reprices nothing earlier.
- [ ] A collector's statement agrees with their collections to the kobo.
- [ ] Payment is recorded as PAY-24 settles; what is owed is derived, never stored.
