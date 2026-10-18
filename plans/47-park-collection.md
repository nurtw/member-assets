## Item
47 — park-collection

## Source
The owner's direction of 18 October 2026 (`QUESTIONS.md` PAY-22): the member hands over
cash, "any amount, daily or weekly"; the collector types the membership number or telephone
number; "the member's photo comes up to confirm it's the right person"; and the amount
"moves from their wallet to the member's dues". PAY-25 (how small payments are applied) and
PAY-26 (limits, reach, corrections) are answered. Needs items 44, 45, and 46. **A new
requirement under PRD §27.**

## Goal
At the park, a collector finds a member, sees their photograph and name, takes the cash,
and records it in a few taps. The member's dues are credited at once from the collector's
float, and the member gets an SMS. A mistake is put right on the record, never deleted.

## Approach
1. **Finding a member: exact, in scope, one at a time.** By membership number, or by the
   whole telephone number. Only members within the collector's scope, which is their own
   park at first (PAY-26). Anyone else, and anyone who does not exist, gets the same "No
   member found". No partial match, and nothing to browse. Every lookup is audited and
   limited per collector by a setting: a telephone number that returns a name and a
   photograph is what a directory would give away.
   A telephone two members share returns both, by name and number; the photograph follows
   once one is chosen.
2. **The photograph:** one signed link, for the one member chosen, good for minutes, under
   the rule `passportPhotoUrl` follows. This is the only route besides an application's
   detail that returns one, and it is never in a list. A member with no photograph says so
   (item 44 adds one).
3. **Recording**, in one transaction, under locks on the collector's float and the member:
   - the amount, between a smallest and a largest amount, settings the Union fills in
     (PAY-26);
   - a float debit, and a `member_credit` row, the twin of `dedicated_account_transfer`;
   - allocation by the function and setting item 23 uses (`allocateCredit`), so a
     collection pays dues as a transfer does: oldest first, with the rest held for the next
     due to fall and swept as today (PAY-25);
   - one `COLLECTION` payment per due period (a new channel), the SMS (item 45), the
     commission (item 48), and the audit event.

   The screen sends a key with each attempt, so a double tap, or a retry on a weak signal,
   records one collection.
4. **One lock for every member.** Item 23 locks a member's dedicated-account rows, and a
   member without an account has none to lock. Allocation will lock the member's own row
   instead, for transfers and collections alike, so the two can never pay one month twice.
5. **Corrections.** A holder of `collection.manage` reverses a collection, with a reason,
   within seven days (PAY-26): reversing entries for the credit, its payments, and the
   commission; the float restored; and an SMS telling the member.
6. **Screens, for a phone:** Collect (find, confirm by the photograph, the amount, then the
   new balance and "SMS queued"); the collector's day (collected, float left); and
   collections on the member's record.

## Files likely touched
`apps/api/src/collection/`, `apps/api/src/payments/dedicated-account.service.ts` (the
shared lock and allocation), `packages/domain/src/payments/`,
`apps/api/prisma/schema.prisma` and a migration, `packages/contracts/src/`, new screens,
`PRD.md`, `CLAUDE.md`, `OPERATIONS.md`.

## Out of scope
PoS terminals, USSD, and printed receipts. Sticker fees, which are paid by link only
(Requirement 27.7). Paying anyone out.

## Settled (PAY-25, PAY-26, 18 October 2026)
- Oldest due first, as now; what is left waits for the next due to fall.
- A member with no vehicle owes no month: their payments build toward the yearly fee.
- A collector serves their own park, at first. The limits are settings the Union fills in.
- A holder of `collection.manage` reverses a mistake within seven days, with a reason.

## Definition of done
- [ ] A member out of scope and a member who does not exist get the same answer.
- [ ] A collection debits the float, credits the member, pays dues, and queues one SMS, all
      or nothing. A repeated request records one collection.
- [ ] No collection spends more than the float holds, and a transfer and a collection at
      once cannot pay one month twice.
- [ ] A correction, within seven days, reverses without deleting, restores the float, and
      tells the member.
- [ ] No photograph link appears in a list.
- [ ] PRD revised. Every test passes; clicked through at phone size.
