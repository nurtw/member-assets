## Item
48 — collector-commission

## Source
The owner's direction of 18 October 2026 (`QUESTIONS.md` PAY-22): collectors are paid "a
commission on every payment", so that "they gain from the system instead of fighting it".
PAY-24 is answered: a percentage, out of NURTW's share, paid as float, and nothing on a
collector's own dues. Needs items 46 and 47.

## Goal
Every collection earns its collector a commission at the rate in force, recorded with it.
The Union sees what each collector has earned, all of it credited to their float.

## Approach
1. **The rate is a percentage, held as a setting** (PAY-24), changed with a reason and
   audited, like every amount (Requirement 27.2). It starts unset, and nothing is earned
   until the Union names the figure. Each commission records the rate it used, so a change
   never reprices the past.
2. **Earned in the collection's own transaction** (`collector_commission`, append-only),
   and reversed with the collection if that is corrected.
3. **Paid as float** (PAY-24), credited to the collector's float in the same transaction,
   out of NURTW's share: no money moves, and the Union receives that much less in dues.
   Nothing goes through Paystack Transfers. Nothing in the System sends money out, and this
   does not start it.
4. **Statements** by collector and period: what was collected, and the commission
   credited, derived and never stored. On the collector's own screen and on
   Union → Collectors.
5. **Nothing on a collector's own dues** (PAY-24). A collection for the membership recorded
   on the collector's account (item 46) earns no commission, and the statement shows it as
   their own.

## Files likely touched
`apps/api/src/collection/`, `packages/domain/src/` (the commission rule, as a pure
function), `apps/api/prisma/schema.prisma` and a migration, the collector screens, `PRD.md`.

## Out of scope
Paystack Transfers. Tax. Commission on dedicated-account transfers, which no collector
touches.

## Before going live
- The Union names the percentage. Until it does, collecting works and earns nothing.

## Definition of done
- [ ] Each collection records its commission at the rate in force; a correction reverses it.
- [ ] A change of rate is audited with a reason, and reprices nothing earlier.
- [ ] A collector's statement agrees with their collections to the kobo.
- [ ] Commission is credited as float in the collection's own transaction. Nothing is
      earned while the rate is unset, or on a collector's own dues.
