## Item
46 — collectors-and-float

## Source
The owner's direction of 18 October 2026 (`QUESTIONS.md` PAY-22): "Make the existing park
officials the collectors", and "before collecting, the collector tops up their platform
wallet, the way an airtime vendor buys stock". PAY-23 (the float) and ORG-08 (parks) are
open. **A new requirement under PRD §27, and an addition to §2.1 that §2.3 says needs an
approved revision.** Waits for the owner's approval.

## Goal
A park official can be made a collector for their park. A collector buys float through
Paystack, and an append-only ledger shows what each collector holds and why.

## Approach
1. **Two permissions, a role, a scope.** `collection.record` (collect at the park) and
   `collection.manage` (look after collectors and their float). A seeded **Collector** role
   holds `collection.record` alone, assigned at the collector's park, so a collector reaches
   that park's members and no others. Reaching further is an assignment at a higher node,
   not code (Requirement 6.2).
2. **A collector account** for each collector (`collector_account`: the officer, the park,
   whether active, who made it). Stopping one ends their collecting; their float stays on
   the record.
3. **The float ledger** (`collector_float_entry`, append-only, as Requirement 27.9 has the
   payment ledger): top-ups, collections, corrections, and commission if it is paid as float
   (item 48). What a collector holds is the sum of their entries, derived, never stored. A
   row lock on the collector's account means two phones cannot spend the same float.
4. **Topping up**, in the shape PAY-23 settles. Either fits the ledger:
   - a dedicated account of the collector's own, so a top-up is a transfer or a PoS
     payment, confirmed as a member's transfer is (item 23); or
   - a Paystack payment of the amount the collector chooses, confirmed as a link payment is.

   Either way, float is credited only once Paystack confirms it, and only for what settled.
   Where the money settles is PAY-23's. PAY-11's rule, that the contractor never holds Union
   money, is the starting point.
5. **Screens.** The collector's own, built for a phone: what they hold, how to top up, and
   their recent entries. **Union → Collectors**, for `collection.manage`: collectors by park,
   what each holds and their entries, making or stopping one with a reason, and the totals
   of float sold, spent, and held, by park.
6. Every top-up, stop, and correction is audited.

## Files likely touched
`packages/contracts/src/permissions.ts` and a new collection contract,
`apps/api/src/collection/` (new), `apps/api/src/payments/` (confirming a top-up),
`apps/api/prisma/schema.prisma` and a migration, `apps/api/prisma/seed.ts`,
`apps/web/src/lib/navigation.ts`, new screens, `PRD.md`, `CLAUDE.md`, `OPERATIONS.md`.

## Out of scope
Collecting (item 47). Commission (item 48). Refunding float, and paying a collector out.

## To settle before building (PAY-23, ORG-08)
- How a collector tops up, where the money settles, and who bears Paystack's charge.
- Whether unused float is ever refunded, and what becomes of it when a collector stops.
- Whether a park is a unit, and how many collectors one park has.

## Definition of done
- [ ] Only a holder of `collection.manage` makes or stops a collector, within their scope.
- [ ] Float is credited only on Paystack's confirmation, and a replay credits nothing.
- [ ] Two spends at once cannot take more than a collector holds.
- [ ] What a collector holds is the sum of their entries, on their screen and the Union's.
- [ ] PRD revised. Every test passes; clicked through with the Paystack stand-in.
