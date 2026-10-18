## Item
46 — collectors-and-float

## Source
The owner's direction of 18 October 2026 (`QUESTIONS.md` PAY-22): "Make the existing park
officials the collectors", and "before collecting, the collector tops up their platform
wallet, the way an airtime vendor buys stock". PAY-23 (the float) is answered; ORG-08
(parks) is open. **A new requirement under PRD §27, and an addition to §2.1 that §2.3 says
needs an approved revision.** Waits for the owner's approval.

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
   whether active, who made it, and the collector's own membership where they are a
   member). Officers' accounts are not linked to members today; this link is what keeps
   commission off a collector's own dues (PAY-24). Stopping one ends their collecting;
   their float stays on the record.
3. **The float ledger** (`collector_float_entry`, append-only, as Requirement 27.9 has the
   payment ledger): top-ups, collections, corrections, refunds, and commission, which is
   paid as float (item 48, PAY-24). What a collector holds is the sum of their entries,
   derived, never stored. A row lock on the collector's account means two phones cannot
   spend the same float.
4. **Topping up through a dedicated account of the collector's own** (PAY-23), opened as a
   member's is (item 23) and settling straight to the NURTW subaccount, so the contractor
   never holds Union money (PAY-11). A top-up is a transfer or a PoS payment:
   - confirmed with Paystack, as a member's transfer is, and credited with what NURTW
     received, so the collector bears Paystack's charge and the contractor's percentage;
   - told apart from a member's transfer by Paystack's customer code, and never paid into
     dues;
   - refused, as a member's account is, until the settlement account and the percentage are
     set (PAY-11).
5. **Float pays dues only.** When a collector stops, a holder of `collection.manage` may
   record a refund of what is left, with a reason, as a reversing entry (PAY-23). The Union
   pays the money back itself, outside the System.
6. **Screens.** The collector's own, built for a phone: what they hold, how to top up, and
   their recent entries. **Union → Collectors**, for `collection.manage`: collectors by park,
   what each holds and their entries, making or stopping one with a reason, and the totals
   of float sold, spent, and held, by park.
7. Every top-up, stop, refund, and correction is audited.

## Files likely touched
`packages/contracts/src/permissions.ts` and a new collection contract,
`apps/api/src/collection/` (new), `apps/api/src/payments/` (confirming a top-up),
`apps/api/prisma/schema.prisma` and a migration, `apps/api/prisma/seed.ts`,
`apps/web/src/lib/navigation.ts`, new screens, `PRD.md`, `CLAUDE.md`, `OPERATIONS.md`.

## Out of scope
Collecting (item 47). Commission (item 48). Paying out a refund, or anything else: the
System records a refund, and the Union pays it.

## To settle before building (ORG-08)
- Whether a park is a unit, and how many collectors one park has.

PAY-23 was answered on 18 October 2026, as steps 4 and 5 describe.

## Definition of done
- [ ] Only a holder of `collection.manage` makes or stops a collector, within their scope.
- [ ] Float is credited only on Paystack's confirmation, and a replay credits nothing.
- [ ] A transfer into a collector's account becomes float and never dues; a member's
      transfer never becomes float.
- [ ] Two spends at once cannot take more than a collector holds.
- [ ] What a collector holds is the sum of their entries, on their screen and the Union's.
- [ ] PRD revised. Every test passes; clicked through with the Paystack stand-in.
